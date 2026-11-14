"""Cashfree PG (Orders API) — per-admin online UPI/card/netbanking deposits.

Wired for admins carrying ``cashfree_app_id`` + ``cashfree_secret_key`` on
their User doc (first: ADM11973635). Their users' "Online payment" creates a
Cashfree order (POST /pg/orders) and opens ``PAY_PAGE`` — a static page on the
main site that hands the order's payment_session_id to Cashfree's JS SDK
checkout. That site must be whitelisted in the Cashfree dashboard
(Developers -> Whitelisting). (Payment Links would skip the page, but that API
needs Cashfree's separate approval on the merchant.)

A deposit is credited ONLY when Cashfree's own ``GET /pg/orders/{order_id}``
(called with the admin's secret) says PAID for the full amount — triggered by
the webhook, by the app's "I've paid — Check" button, or by the 60 s
reconcile loop. The webhook body itself is never trusted, so a forged one can
at most cause a status lookup.
"""
from __future__ import annotations

import logging
import re
import secrets
import time
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Any
from urllib.parse import quote

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

BASE_URL = "https://api.cashfree.com/pg"
API_VERSION = "2025-01-01"
PAY_PAGE = "https://hindenburgindia.live/pay/cashfree.html"  # frontend-user/public/pay/cashfree.html
KEY_PREFIX = "cashfree"  # DepositRequest.idempotency_key = "cashfree:<order_id>"
MIN_AMOUNT = Decimal("10")
MAX_AMOUNT = Decimal("200000")
ORDER_TTL = timedelta(hours=2)
_IST = timezone(timedelta(hours=5, minutes=30))


class CashfreeError(Exception):
    pass


def creds_of(admin) -> tuple[str, str] | None:
    """(app_id, secret_key) when this ADMIN has Cashfree wired, else None."""
    app_id = str(getattr(admin, "cashfree_app_id", None) or "").strip()
    secret = str(getattr(admin, "cashfree_secret_key", None) or "").strip()
    return (app_id, secret) if app_id and secret else None


def notify_url() -> str:
    return f"{settings.OKPAY_PUBLIC_API_BASE.rstrip('/')}/api/v1/finance/deposit/cashfree/notify"


async def _call(method: str, path: str, creds: tuple[str, str], ref: str, body: dict | None = None) -> dict[str, Any]:
    headers = {"x-client-id": creds[0], "x-client-secret": creds[1], "x-api-version": API_VERSION}
    try:
        async with httpx.AsyncClient(timeout=30.0) as c:
            res = await c.request(method, f"{BASE_URL}{path}", json=body, headers=headers)
        data = res.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("cashfree_call_failed %s ref=%s: %s", path, ref, exc)
        raise CashfreeError("Payment gateway is not responding. Please try again.") from exc
    if res.status_code >= 400 or not isinstance(data, dict):
        logger.warning("cashfree_call_rejected %s ref=%s http=%s resp=%s", path, ref, res.status_code, data)
        msg = data.get("message") if isinstance(data, dict) else None
        raise CashfreeError(f"Payment gateway: {msg or 'request failed'}")
    return data


async def create_payin(
    amount: Decimal,
    *,
    creds: tuple[str, str],
    customer_id: str,
    name: str,
    email: str,
    mobile: str,
    return_url: str,
) -> dict[str, str]:
    if amount < MIN_AMOUNT:
        raise CashfreeError(f"Online payment needs at least ₹{MIN_AMOUNT:,.0f}.")
    if amount > MAX_AMOUNT:
        raise CashfreeError(f"Online payment allows up to ₹{MAX_AMOUNT:,.0f} per transaction.")
    order_id = f"HB{int(time.time())}{secrets.randbelow(10**6):06d}"
    customer: dict[str, str] = {
        "customer_id": re.sub(r"[^A-Za-z0-9_-]", "", customer_id or "")[:50] or "USER",
        "customer_phone": re.sub(r"\D", "", mobile or "")[-10:] or "9999999999",
        "customer_name": (name or "User")[:100],
    }
    if email and "@" in email:
        customer["customer_email"] = email
    body = {
        "order_id": order_id,
        "order_amount": float(amount),
        "order_currency": "INR",
        "customer_details": customer,
        "order_expiry_time": (datetime.now(_IST) + ORDER_TTL).isoformat(timespec="seconds"),
        "order_meta": {"return_url": return_url, "notify_url": notify_url()},
    }
    data = await _call("POST", "/orders", creds, order_id, body)
    session = str(data.get("payment_session_id") or "")
    if not session:
        raise CashfreeError("Payment gateway: no payment session returned")
    return {"order_id": order_id, "payment_url": f"{PAY_PAGE}?s={quote(session, safe='')}"}


def paid_problem(order: dict[str, Any], *, want: Decimal) -> str | None:
    """Why a Cashfree order entity must NOT credit a ``want``-rupee deposit,
    or None when it is PAID in full."""
    status = str(order.get("order_status") or "").strip().upper()
    if status != "PAID":
        return f"status {status or '?'}"
    try:
        paid = Decimal(str(order.get("order_amount")))
    except (InvalidOperation, TypeError):
        return "bad amount"
    if paid + Decimal("0.01") < want:
        return "paid less than the deposit"
    return None


async def _deposit_and_creds(order_id: str):
    from app.models.transaction import DepositRequest
    from app.models.user import User

    req = await DepositRequest.find_one(DepositRequest.idempotency_key == f"{KEY_PREFIX}:{order_id}")
    if req is None:
        return None, None
    user = await User.get(req.user_id)
    admin_id = getattr(user, "assigned_admin_id", None) if user else None
    return req, (creds_of(await User.get(admin_id)) if admin_id else None)


async def confirm(order_id: str) -> str:
    """Ask Cashfree for this order's status and settle its deposit once."""
    from app.services import univepay_service

    req, creds = await _deposit_and_creds(order_id)
    if req is None or creds is None:
        return "unknown order"
    order = await _call("GET", f"/orders/{order_id}", creds, order_id)
    if str(order.get("order_id") or "") != order_id:
        return "wrong order"
    status = str(order.get("order_status") or "").upper()
    if status in ("EXPIRED", "TERMINATED"):
        return await univepay_service.reject_failed(req, f"Cashfree order {status.lower()}")
    problem = paid_problem(order, want=Decimal(str(req.amount)))
    if problem:
        return problem
    return await univepay_service.credit_paid(
        req, f"CASHFREE-{order_id}", narration=f"Deposit via Cashfree (order {order_id})", tag="cashfree"
    )


def order_id_of(body: dict[str, Any]) -> str:
    """Our order_id in a webhook, whichever shape it arrives in."""
    data = body.get("data")
    data = data if isinstance(data, dict) else {}
    order = data.get("order")
    order = order if isinstance(order, dict) else {}
    return str(order.get("order_id") or data.get("order_id") or body.get("orderId") or body.get("order_id") or "").strip()


async def reconcile_deposits(*, max_age_hours: int = 24) -> int:
    """Settle every PENDING Cashfree deposit of the last day via the status
    API, so a paid deposit lands even if no webhook arrives."""
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
        except CashfreeError:
            continue  # gateway hiccup: next tick
    return credited


async def deposit_reconcile_loop(interval_sec: float = 60.0) -> None:
    import asyncio

    while True:
        try:
            n = await reconcile_deposits()
            if n:
                logger.info("cashfree_reconcile credited=%d", n)
        except Exception:
            logger.exception("cashfree_reconcile_loop tick failed")
        await asyncio.sleep(interval_sec)
