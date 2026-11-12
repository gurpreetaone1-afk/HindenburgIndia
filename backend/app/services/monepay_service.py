"""Monepay (india-pay 4.0) — per-admin online UPI deposits ABOVE ``ROUTE_ABOVE``.

Wired for admins carrying ``monepay_api_key`` + ``monepay_api_secret`` on
their User doc (first: ADM94904072, sharemarket). That admin's users still pay
up to ₹3,000 through Univepay; a larger deposit is routed here by
``user/wallet.py`` — the app sees one "Online payment" option either way.

Flow, per the merchant integration guide (v1.0, 2025-10-25):

1. POST JSON to ``{base}/api/payin/desk`` (apiKey, clientId, amount,
   payMode=launch, name, email, phone, skipUrl, callbackUrl, sign) ->
   ``{code: 1000, data: {orderId, payLink, ...}}``. The user pays on payLink.
2. Monepay POSTs the result to callbackUrl (JSON: apiKey, orderId, clientId,
   status, amount, realAmount, fee, utr, sign) and wants plain ``SUCCESS``.
3. ``{base}/api/payin/status`` answers for a clientId at any time — used by
   the app's "I've paid — Check" button.

Signature, both directions: ``md5("k1=v1&k2=v2...&apiSecret={secret}")``
(lowercase hex) over every field except ``sign``, keys in ascending order.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import re
import secrets
import time
from decimal import Decimal, InvalidOperation
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

PROD_URL = "https://pay.monepay.xyz"
KEY_PREFIX = "monepay"  # DepositRequest.idempotency_key = "monepay:<clientId>"
ROUTE_ABOVE = Decimal("3000")  # deposits above this go to Monepay, the rest to Univepay


class MonepayError(Exception):
    pass


def creds_of(admin) -> tuple[str, str] | None:
    """(apiKey, apiSecret) when this ADMIN has Monepay wired, else None."""
    key = str(getattr(admin, "monepay_api_key", None) or "").strip()
    secret = str(getattr(admin, "monepay_api_secret", None) or "").strip()
    return (key, secret) if key and secret else None


def _text(v: Any) -> str:
    # The value exactly as it travels in the JSON body: strings raw, numbers
    # as their JSON literal (Monepay re-reads the body into a TreeMap).
    return v if isinstance(v, str) else json.dumps(v)


def sign(fields: dict[str, Any], secret: str, *, skip_empty: bool = True) -> str:
    parts = [
        f"{k}={_text(fields[k])}"
        for k in sorted(fields)
        if k != "sign" and fields[k] is not None and not (skip_empty and _text(fields[k]) == "")
    ]
    parts.append(f"apiSecret={secret}")
    return hashlib.md5("&".join(parts).encode()).hexdigest()


def sign_ok(fields: dict[str, Any], secret: str) -> bool:
    """The guide says empty values are left out of the signature, but its own
    Java sample keeps them — accept either, both need the secret."""
    posted = str(fields.get("sign") or "").strip().lower()
    return bool(posted) and any(
        hmac.compare_digest(posted, sign(fields, secret, skip_empty=s)) for s in (True, False)
    )


def notify_url() -> str:
    return f"{settings.OKPAY_PUBLIC_API_BASE.rstrip('/')}/api/v1/finance/deposit/monepay/notify"


async def _post(base: str, path: str, body: dict[str, Any], ref: str) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=30.0) as c:
            res = await c.post(f"{base.rstrip('/')}{path}", json=body)
        data = res.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("monepay_call_failed %s ref=%s: %s", path, ref, exc)
        raise MonepayError("Payment gateway is not responding. Please try again.") from exc
    if not isinstance(data, dict) or data.get("code") != 1000 or not isinstance(data.get("data"), dict):
        logger.warning("monepay_call_rejected %s ref=%s resp=%s", path, ref, data)
        msg = data.get("message") if isinstance(data, dict) else None
        raise MonepayError(f"Payment gateway: {msg or 'request failed'}")
    return data["data"]


async def create_payin(
    amount: Decimal,
    *,
    api_key: str,
    secret: str,
    name: str,
    email: str,
    mobile: str,
    return_url: str,
    base: str = PROD_URL,
) -> dict[str, str]:
    client_id = f"HB{int(time.time())}{secrets.randbelow(10**6):06d}"
    body: dict[str, Any] = {
        "apiKey": api_key,
        "clientId": client_id,
        "amount": int(amount) if amount == amount.to_integral_value() else float(amount),
        "payMode": "launch",
        "name": name or "User",
        "email": email or "user@example.com",
        "phone": (re.sub(r"\D", "", mobile or "")[-10:]) or "9999999999",
        "skipUrl": return_url,
        "callbackUrl": notify_url(),
    }
    body["sign"] = sign(body, secret)
    data = await _post(base, "/api/payin/desk", body, client_id)
    if not data.get("payLink"):
        raise MonepayError("Payment gateway: no payment link returned")
    return {"order_id": client_id, "payment_url": str(data["payLink"])}


async def check_status(client_id: str, *, api_key: str, secret: str, base: str = PROD_URL) -> dict[str, Any]:
    body: dict[str, Any] = {"apiKey": api_key, "clientId": client_id}
    body["sign"] = sign(body, secret)
    return await _post(base, "/api/payin/status", body, client_id)


def paid_problem(data: dict[str, Any], *, want: Decimal) -> str | None:
    """Why a (verified) Monepay result must NOT credit a ``want``-rupee
    deposit, or None. Shared by the callback and the status check."""
    status = str(data.get("status") or "").strip().upper()
    if status != "SUCCESS":
        return f"status {status or '?'}"
    raw = data.get("realAmount")
    if raw in (None, ""):
        raw = data.get("amount")
    try:
        paid = Decimal(str(raw))
    except (InvalidOperation, TypeError):
        return "bad amount"
    if paid + Decimal("0.01") < want:
        return "paid less than the deposit"
    return None


async def _deposit_and_creds(client_id: str):
    from app.models.transaction import DepositRequest
    from app.models.user import User

    req = await DepositRequest.find_one(DepositRequest.idempotency_key == f"{KEY_PREFIX}:{client_id}")
    if req is None:
        return None, None
    user = await User.get(req.user_id)
    admin_id = getattr(user, "assigned_admin_id", None) if user else None
    return req, (creds_of(await User.get(admin_id)) if admin_id else None)


async def _settle(req, data: dict[str, Any], client_id: str) -> str:
    """Apply a trusted Monepay result to its deposit."""
    from app.services import univepay_service

    problem = paid_problem(data, want=Decimal(str(req.amount)))
    if problem in ("status FAIL", "status FAILED"):
        return await univepay_service.reject_failed(req, "Payment failed at Monepay")
    if problem:
        return problem
    ref = str(data.get("utr") or "").strip() or str(data.get("orderId") or "").strip() or client_id
    return await univepay_service.credit_paid(
        req, f"MONEPAY-{ref}", narration=f"Deposit via Monepay (order {client_id})", tag="monepay"
    )


async def handle_notify(body: dict[str, Any]) -> str:
    """Verify a pay-in callback and credit its deposit exactly once. Returns a
    short outcome for the log; never raises on a bad callback."""
    client_id = str(body.get("clientId") or "").strip()
    req, creds = await _deposit_and_creds(client_id)
    if req is None:
        # Nothing secret in a callback (sign is a hash): keep the whole body so
        # an unexpected sender or a test order can be checked by hand.
        logger.warning("monepay_notify_unknown body=%s", body)
        return "unknown clientId"
    if creds is None:
        return "admin has no monepay credentials"
    api_key, secret = creds
    if not sign_ok(body, secret):
        logger.warning("monepay_notify_rejected clientId=%s: bad signature fields=%s", client_id, sorted(body))
        return "bad signature"
    if str(body.get("apiKey") or "").strip() != api_key:
        return "wrong merchant"
    return await _settle(req, body, client_id)


async def confirm(client_id: str) -> str:
    """Ask Monepay for this order's status and settle it (the app's "I've
    paid — Check" button). Returns the same outcomes as ``handle_notify``."""
    req, creds = await _deposit_and_creds(client_id)
    if req is None or creds is None:
        return "unknown clientId"
    api_key, secret = creds
    data = await check_status(client_id, api_key=api_key, secret=secret)
    if str(data.get("clientId") or client_id) != client_id:
        return "wrong order"
    return await _settle(req, data, client_id)


async def reconcile_deposits(*, max_age_hours: int = 24) -> int:
    """Ask Monepay about every PENDING Monepay deposit of the last day and
    settle it, so a paid deposit lands even when its callback never arrived
    (Cloudflare 403s a bare Java User-Agent) and the user never taps Check."""
    from datetime import timedelta

    from app.models.transaction import DepositRequest, DepositStatus
    from app.utils.time_utils import now_utc

    pending = await DepositRequest.find({
        "status": DepositStatus.PENDING.value,
        "idempotency_key": {"$regex": f"^{KEY_PREFIX}:"},
        "created_at": {"$gte": now_utc() - timedelta(hours=max_age_hours)},
    }).to_list()
    credited = 0
    for req in pending:
        try:
            if await confirm(req.idempotency_key.split(":", 1)[1]) == "credited":
                credited += 1
        except MonepayError:
            continue  # gateway hiccup: next tick
    return credited


async def deposit_reconcile_loop(interval_sec: float = 60.0) -> None:
    import asyncio

    while True:
        try:
            n = await reconcile_deposits()
            if n:
                logger.info("monepay_reconcile credited=%d", n)
        except Exception:
            logger.exception("monepay_reconcile_loop tick failed")
        await asyncio.sleep(interval_sec)
