"""Divinepay UPI pay-in gateway (deposits only).

Three server-side calls, all authenticated with ``x-api-key`` — the key is a
LIVE secret and must never reach the browser, so every call is made from here:

    create_payin(amount)        -> {order_id, payment_url}
    submit_utr(order_id, utr)   -> gateway verifies the 12-digit bank UTR
    check_status(order_id)      -> {status: success|pending|failed, amount}

Gateway limits (per the merchant terminal): pay-in 200 - 25,000 INR.

The gateway is OFF unless ``DIVINEPAY_API_KEY`` is set, so an unconfigured
deploy simply keeps the manual bank-transfer deposit flow.
"""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

MIN_AMOUNT = Decimal("200")
MAX_AMOUNT = Decimal("25000")
_TIMEOUT = 20.0


class DivinepayError(Exception):
    """Gateway said no (or was unreachable). Message is user-safe."""


def is_configured() -> bool:
    """Global kill-switch: no key -> gateway disabled everywhere."""
    return bool(_api_key())


def _api_key() -> str:
    key = getattr(settings, "DIVINEPAY_API_KEY", "")
    return (key.get_secret_value() if hasattr(key, "get_secret_value") else str(key or "")).strip()


def _base_url() -> str:
    return str(getattr(settings, "DIVINEPAY_BASE_URL", "") or "https://divinepay.us.cc").rstrip("/")


async def _post(path: str, payload: dict[str, Any]) -> dict[str, Any]:
    if not is_configured():
        raise DivinepayError("Online payment is not available right now.")
    url = f"{_base_url()}{path}"
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            r = await client.post(
                url,
                json=payload,
                headers={"x-api-key": _api_key(), "Content-Type": "application/json"},
            )
        body = r.json() if r.content else {}
    except Exception as exc:
        # Never leak the key or the raw upstream error to the user.
        logger.exception("divinepay_call_failed path=%s", path)
        raise DivinepayError("Payment gateway is unreachable. Please try again.") from exc

    if r.status_code >= 400 or not body.get("success", False):
        msg = str(body.get("message") or "").strip() or "Payment gateway rejected the request."
        logger.warning("divinepay_rejected path=%s status=%s body=%s", path, r.status_code, body)
        raise DivinepayError(msg)
    return body.get("data") or body


async def create_payin(amount: Decimal) -> dict[str, str]:
    """Open a pay-in order. Returns ``{order_id, payment_url}``.

    Amount is validated against the gateway's own band first so the user gets
    a clean message instead of an upstream rejection.
    """
    if amount < MIN_AMOUNT or amount > MAX_AMOUNT:
        raise DivinepayError(
            f"Amount must be between ₹{MIN_AMOUNT:,.0f} and ₹{MAX_AMOUNT:,.0f} for online payment."
        )
    # The gateway takes a plain number; Decimal is preserved on our side and
    # only flattened here at the wire boundary.
    data = await _post("/api/payin/payin/create", {"amount": float(amount)})
    order_id = str(data.get("order_id") or "").strip()
    pay_url = str(data.get("paymentUrl") or data.get("payment_url") or "").strip()
    if not order_id or not pay_url:
        raise DivinepayError("Payment gateway did not return a payment link.")
    return {"order_id": order_id, "payment_url": pay_url}


async def submit_utr(order_id: str, utr: str) -> dict[str, Any]:
    """Hand the bank UTR to the gateway for verification.

    A ``success`` status here is what authorises the wallet credit — we never
    trust the client for that.
    """
    utr = (utr or "").strip()
    if not utr.isdigit() or len(utr) != 12:
        raise DivinepayError("UTR must be the 12-digit reference number from your bank / UPI app.")
    return await _post("/api/payin/submit-utr", {"order_id": order_id, "utr": utr})


async def check_status(order_id: str) -> dict[str, Any]:
    """Authoritative status for an order: success / pending / failed."""
    return await _post("/api/payin/status", {"order_id": order_id})


def is_success(data: dict[str, Any]) -> bool:
    return str(data.get("status") or "").strip().lower() == "success"
