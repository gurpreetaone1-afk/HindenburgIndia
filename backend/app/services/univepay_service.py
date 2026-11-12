"""Univepay — per-admin online UPI deposits (deposit-only), like PayFromUPI.

Wired for admins carrying ``univepay_merchno`` + ``univepay_key`` on their
User doc (first: ADM94904072, sharemarket). Flow, taken from the merchant's
own working PHP integration (no official Univepay doc seen yet):

1. POST a form to ``GLOBALPAY_URL`` (Merchno, Traceno, Amount, PayCode=UPI,
   NotifyUrl, CallbackUrl, ..., Signature) -> JSON ``{status: "00", payUrl}``.
   The user pays on that hosted page.
2. Univepay POSTs the result to NotifyUrl (form: Merchno, Traceno, Status,
   Amount, Signature, ...) and wants plain ``SUCCESS`` back. That callback is
   the ONLY confirmation (no status API known), like OkPay's IPN.

Signature, both directions: ``upper(md5("k1=v1&k2=v2...&{key}"))`` over every
non-empty field except Signature, keys in ASCII order. Nothing is credited
unless the callback verifies with the admin's key, Merchno is that admin's,
Status is SUCCESS and the signed Amount covers the deposit. Traceno is our
own random order id and is covered by the signature, so a captured callback
can't be replayed onto another deposit.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import re
import secrets
import time
from decimal import Decimal, InvalidOperation
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

GLOBALPAY_URL = "https://ydpay.univepay.com/Payment/GlobalPay"
KEY_PREFIX = "univepay"  # DepositRequest.idempotency_key = "univepay:<Traceno>"
MIN_AMOUNT = Decimal("100")
MAX_AMOUNT = Decimal("100000")


class UnivepayError(Exception):
    pass


def creds_of(admin) -> tuple[str, str] | None:
    """(merchno, key) when this ADMIN has Univepay wired, else None."""
    merchno = str(getattr(admin, "univepay_merchno", None) or "").strip()
    key = str(getattr(admin, "univepay_key", None) or "").strip()
    return (merchno, key) if merchno and key else None


def sign(fields: dict[str, Any], key: str) -> str:
    body = "&".join(
        f"{k}={fields[k]}" for k in sorted(fields) if k != "Signature" and str(fields[k]) != ""
    )
    return hashlib.md5(f"{body}&{key}".encode()).hexdigest().upper()


def _amount_str(amount: Decimal) -> str:
    # "500" for whole rupees, "500.50" otherwise (as the merchant's code sends).
    return str(int(amount)) if amount == amount.to_integral_value() else f"{amount:.2f}"


def notify_url() -> str:
    # The platform's public API host (same one OkPay's IPN uses).
    return f"{settings.OKPAY_PUBLIC_API_BASE.rstrip('/')}/api/v1/finance/deposit/univepay/notify"


async def create_payin(
    amount: Decimal,
    *,
    merchno: str,
    key: str,
    user_code: str,
    email: str,
    mobile: str,
    return_url: str,
) -> dict[str, str]:
    if amount < MIN_AMOUNT:
        raise UnivepayError(f"Online payment needs at least ₹{MIN_AMOUNT:,.0f}.")
    if amount > MAX_AMOUNT:
        raise UnivepayError(f"Online payment allows up to ₹{MAX_AMOUNT:,.0f} per transaction.")
    traceno = f"HB{int(time.time())}{secrets.randbelow(10**6):06d}"
    phone = (re.sub(r"\D", "", mobile or "")[-10:]) or "9999999999"
    fields: dict[str, str] = {
        "Merchno": merchno,
        "Traceno": traceno,
        "Pname": user_code,
        "Pemail": email or "user@example.com",
        "Phone": phone,
        "Amount": _amount_str(amount),
        "CountryCode": "india",
        "Currency": "INR",
        "Timeout": "",
        "PayCode": "UPI",
        "GoodsName": f"Wallet deposit {user_code}",
        "NotifyUrl": notify_url(),
        "AccNo": phone,
        "BankCode": "INR",
        "CallbackUrl": return_url,
        "TradeIp": "",
        "Remark": user_code,
    }
    fields["Signature"] = sign(fields, key)
    try:
        async with httpx.AsyncClient(timeout=30.0) as c:
            res = await c.post(GLOBALPAY_URL, data=fields)
        data = res.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("univepay_create_failed traceno=%s: %s", traceno, exc)
        raise UnivepayError("Payment gateway is not responding. Please try again.") from exc
    if str(data.get("status")) != "00" or not data.get("payUrl"):
        logger.warning("univepay_create_rejected traceno=%s resp=%s", traceno, data)
        raise UnivepayError(f"Payment gateway: {data.get('msg') or 'could not create the payment'}")
    return {"order_id": traceno, "payment_url": str(data["payUrl"])}


def notify_problem(form: dict[str, str], merchno: str, key: str, *, want: Decimal) -> str | None:
    """Why this callback must NOT credit a ``want``-rupee deposit, or None."""
    posted = str(form.get("Signature") or "").strip().upper()
    if not posted or not hmac.compare_digest(posted, sign(form, key)):
        return "bad signature"
    if str(form.get("Merchno") or "").strip() != merchno:
        return "wrong merchant"
    status = str(form.get("Status") or "").strip().upper()
    if status != "SUCCESS":
        return f"status {status or '?'}"
    try:
        paid = Decimal(str(form.get("Amount")))
    except (InvalidOperation, TypeError):
        return "bad amount"
    if paid + Decimal("0.01") < want:
        return "paid less than the deposit"
    return None


async def handle_notify(form: dict[str, str]) -> str:
    """Verify a pay-in callback and credit its deposit exactly once. Returns a
    short outcome for the log; never raises on a bad callback."""
    from app.models.transaction import DepositRequest
    from app.models.user import User

    traceno = str(form.get("Traceno") or "").strip()
    req = await DepositRequest.find_one(DepositRequest.idempotency_key == f"{KEY_PREFIX}:{traceno}")
    if req is None:
        return "unknown Traceno"
    user = await User.get(req.user_id)
    admin_id = getattr(user, "assigned_admin_id", None) if user else None
    creds = creds_of(await User.get(admin_id)) if admin_id else None
    if creds is None:
        return "admin has no univepay credentials"
    problem = notify_problem(form, *creds, want=Decimal(str(req.amount)))
    if problem in ("status FAIL", "status FAILED"):
        # Signed + right merchant (checked before status): the payment really
        # failed, so the deposit shows as failed instead of pending forever.
        return await reject_failed(req, "Payment failed at Univepay")
    if problem:
        # Field names only (never the key), so the signing rule can be checked
        # against a real callback.
        logger.warning("univepay_notify_rejected traceno=%s: %s fields=%s", traceno, problem, sorted(form))
        return problem
    ref = str(form.get("SerialNo") or "").strip() or traceno
    return await credit_paid(
        req, f"UNIVEPAY-{ref}", narration=f"Deposit via Univepay (order {traceno})", tag="univepay"
    )


async def reject_failed(req, reason: str) -> str:
    """The gateway itself reported the payment FAILED: show the deposit as
    failed instead of pending forever (also used by Monepay)."""
    from app.services.payfromupi_service import _reject_deposit

    rejected = await _reject_deposit(req, reason)
    return "marked failed" if rejected else f"deposit {req.status}"


async def credit_paid(req, utr: str, *, narration: str, tag: str) -> str:
    """Credit a deposit the gateway has confirmed PAID, exactly once (also
    used by Monepay)."""
    from app.models.transaction import DepositRequest, DepositStatus
    from app.services import divinepay_service

    if req.status == DepositStatus.APPROVED:
        return "already credited"
    if req.status == DepositStatus.REJECTED:
        # The admin rejected it from the pay-in queue, but the gateway has now
        # confirmed it PAID: the user's money arrived, so it must still be
        # credited. Atomic REJECTED -> PENDING, then the usual credit claim.
        revived = await DepositRequest.get_motor_collection().find_one_and_update(
            {"_id": req.id, "status": DepositStatus.REJECTED.value},
            {"$set": {"status": DepositStatus.PENDING.value}},
        )
        if revived is None:
            return "deposit changed meanwhile"
        logger.warning("%s_paid_after_reject key=%s", tag, req.idempotency_key)
        req.status = DepositStatus.PENDING
    if req.status != DepositStatus.PENDING:
        return f"deposit {req.status}"
    credited = await divinepay_service.credit_deposit(req, utr, narration=narration)
    return "credited" if credited else "already credited"
