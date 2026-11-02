"""OkPay (okpay.co SCI) — "Gateway 2" for the super admin's own users.

Flow, per OkPay's merchant doc:

1. The payer's browser POSTs an HTML form to ``OKPAY_FORM_URL`` with
   ``merchant, item_name, amount, currency, custom``; OkPay hosts the payment
   page. An app can't POST a form, so we hand out a link to a tiny page we
   serve (``/finance/deposit/okpay/pay/{ref}``) that auto-submits it.
2. On payment OkPay POSTs an IPN to ``/finance/deposit/okpay/ipn`` (set that
   URL in the OkPay store). It is the ONLY confirmation — OkPay has no status
   API — so nothing moves until it verifies:

     hash == upper(md5("{total}:{merchant_password}:{date}:{id_transfer}"))

   OkPay's PHP sample compares ``$hash_string == $user_hash``, which is never
   true; the posted ``hash`` is what must match. Then merchant_id, status
   "Confirmed", currency, and the SIGNED ``total`` ≥ the deposit amount. The
   hash does not cover ``custom`` or ``amount``, so a captured IPN must not be
   replayable onto another deposit: each ``id_transfer`` credits at most once.
"""
from __future__ import annotations

import hashlib
import hmac
import html
import logging
import secrets
from decimal import Decimal, InvalidOperation
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)

KEY_PREFIX = "okpay"
MIN_AMOUNT = Decimal("10")
MAX_AMOUNT = Decimal("200000")


class OkPayError(Exception):
    pass


def _password() -> str:
    try:
        return settings.OKPAY_MERCHANT_PASSWORD.get_secret_value()
    except Exception:
        return ""


def is_configured() -> bool:
    return bool(str(settings.OKPAY_MERCHANT_ID or "").strip() and _password())


def new_ref() -> str:
    """Our reference for one pay-in: OkPay echoes it back as ``custom``.
    128 random bits, so the public pay-page link can't be guessed."""
    return secrets.token_hex(16)


def pay_url(ref: str) -> str:
    base = str(settings.OKPAY_PUBLIC_API_BASE).rstrip("/")
    return f"{base}/api/v1/finance/deposit/okpay/pay/{ref}"


def check_amount(amount: Decimal) -> None:
    if amount < MIN_AMOUNT:
        raise OkPayError(f"Online payment needs at least ₹{MIN_AMOUNT:,.0f}.")
    if amount > MAX_AMOUNT:
        raise OkPayError(f"Online payment allows up to ₹{MAX_AMOUNT:,.0f} per transaction.")


def pay_page_html(ref: str, amount: Decimal, item_name: str) -> str:
    """Auto-submitting form to OkPay's hosted payment page."""
    fields = {
        "merchant": str(settings.OKPAY_MERCHANT_ID).strip(),
        "item_name": item_name[:100],
        "amount": f"{amount:.2f}",
        "currency": settings.OKPAY_CURRENCY,
        "custom": ref,
    }
    inputs = "\n".join(
        f'<input type="hidden" name="{html.escape(k)}" value="{html.escape(v)}">' for k, v in fields.items()
    )
    action = html.escape(settings.OKPAY_FORM_URL)
    return (
        "<!doctype html><html><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<title>Redirecting to payment…</title></head>"
        "<body style='font-family:system-ui,sans-serif;text-align:center;padding:48px 16px'>"
        f"<form id='pay' method='POST' action='{action}'>{inputs}"
        f"<p>Taking you to the payment page for ₹{html.escape(f'{amount:,.2f}')}…</p>"
        "<button type='submit' style='padding:12px 24px;font-size:16px'>Pay now</button></form>"
        "<script>document.getElementById('pay').submit()</script></body></html>"
    )


def _expected_hash(form: dict[str, Any]) -> str:
    raw = f"{form.get('total', '')}:{_password()}:{form.get('date', '')}:{form.get('id_transfer', '')}"
    return hashlib.md5(raw.encode()).hexdigest().upper()


def ipn_problem(form: dict[str, Any]) -> str | None:
    """Why this IPN must NOT move money, or None when it checks out
    (signature, merchant, status, currency). Amount + replay are checked
    against the deposit in ``handle_ipn``."""
    if not is_configured():
        return "okpay not configured"
    posted = str(form.get("hash") or "").strip().upper()
    if not posted or not hmac.compare_digest(posted, _expected_hash(form)):
        return "bad hash"
    if str(form.get("merchant_id") or "").strip() != str(settings.OKPAY_MERCHANT_ID).strip():
        return "wrong merchant"
    if str(form.get("status") or "") != "Confirmed":
        return f"status {form.get('status')!r}"
    if str(form.get("currency") or "") != settings.OKPAY_CURRENCY:
        return f"currency {form.get('currency')!r}"
    if not str(form.get("id_transfer") or "").strip():
        return "no id_transfer"
    return None


async def handle_ipn(form: dict[str, Any]) -> str:
    """Verify an IPN and credit its deposit exactly once. Returns a short
    outcome for the log; never raises (OkPay just needs a 200)."""
    from app.models.transaction import DepositRequest, DepositStatus
    from app.services import divinepay_service

    problem = ipn_problem(form)
    ref = str(form.get("custom") or "").strip()
    id_transfer = str(form.get("id_transfer") or "").strip()
    if problem:
        logger.warning("okpay_ipn_rejected ref=%s id_transfer=%s: %s", ref, id_transfer, problem)
        return problem

    req = await DepositRequest.find_one(DepositRequest.idempotency_key == f"{KEY_PREFIX}:{ref}")
    if req is None:
        logger.warning("okpay_ipn_unknown_ref ref=%s id_transfer=%s", ref, id_transfer)
        return "unknown ref"
    utr = f"OKPAY-{id_transfer}"
    if req.status == DepositStatus.APPROVED:
        return "already credited"
    # ponytail: check-then-claim, not a unique index — two replays racing in
    # the same instant could slip past; a unique sparse index on utr_number
    # closes it if that ever matters.
    used = await DepositRequest.find_one(
        {"utr_number": utr, "status": DepositStatus.APPROVED.value, "_id": {"$ne": req.id}}
    )
    if used is not None:
        logger.warning("okpay_ipn_replayed id_transfer=%s ref=%s already on %s", id_transfer, ref, used.id)
        return "id_transfer already used"
    try:
        total = Decimal(str(form.get("total")))
    except (InvalidOperation, TypeError):
        return "bad total"
    want = Decimal(str(req.amount))
    if total + Decimal("0.01") < want:
        logger.warning("okpay_ipn_short ref=%s total=%s want=%s", ref, total, want)
        return "paid less than the deposit"
    if req.status != DepositStatus.PENDING:
        logger.warning("okpay_ipn_not_pending ref=%s status=%s", ref, req.status)
        return f"deposit {req.status}"
    credited = await divinepay_service.credit_deposit(
        req, utr, narration=f"Deposit via OkPay (txn {id_transfer})"
    )
    logger.info("okpay_ipn_credited ref=%s id_transfer=%s credited=%s", ref, id_transfer, credited)
    return "credited" if credited else "already credited"
