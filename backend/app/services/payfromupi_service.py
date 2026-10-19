"""PayFromUPI pay-in gateway — per-admin online UPI deposits (deposit-only).

Wired only for admins carrying a ``payfromupi_token`` (currently ADM55676892).
Mirrors the divinepay_service interface so wallet.py can route by provider:

    create_payin(amount, token=, user=)  -> {order_id, payment_url}
    check_status(txn_id, token=)         -> {status: success|pending|failed}
    reconcile_deposits(user_id=)         -> int   (credits completed pays)

Flow: create a HOSTED payment link, the user pays on PayFromUPI's page, the
txn flips to ``completed``. We poll check-payment-status (reconcile loop + on
the user's wallet refresh) and also expose a webhook for instant credit. There
is NO UTR step. The wallet credit itself reuses divinepay_service.credit_deposit
(provider-agnostic atomic PENDING->APPROVED claim) so money moves exactly once.
"""
from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any

import httpx

logger = logging.getLogger(__name__)

BASE_URL = "https://payfromupi.com"
MIN_AMOUNT = Decimal("10")     # new merchant (token 251, Oct 2026) rejects < ₹10
MAX_AMOUNT = Decimal("200000")
KEY_PREFIX = "payfromupi"      # DepositRequest.idempotency_key = "payfromupi:<txnId>"
EXPIRE_MINUTES = 30            # auto-reject a pay-in the user never completes


class PayFromUpiError(Exception):
    pass


async def _post(path: str, token: str, payload: dict | None = None) -> dict[str, Any]:
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    url = f"{BASE_URL}{path}"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(url, json=payload or {}, headers=headers)
    except httpx.HTTPError as e:
        raise PayFromUpiError(f"Payment gateway unreachable: {e}") from e
    try:
        body = r.json()
    except Exception:
        body = {}
    if r.status_code >= 400 or not body.get("success", False):
        msg = body.get("message") or f"HTTP {r.status_code}"
        logger.warning("payfromupi_rejected path=%s status=%s msg=%s", path, r.status_code, msg)
        raise PayFromUpiError(str(msg))
    return body


def is_configured(token: str | None) -> bool:
    return bool(token)


async def _token_for_user(user_id) -> str | None:
    """Resolve the PayFromUPI token of the admin who owns this user."""
    from beanie import PydanticObjectId
    from app.models.user import User

    uid = user_id if isinstance(user_id, PydanticObjectId) else PydanticObjectId(user_id)
    u = await User.get(uid)
    if u is None:
        return None
    admin_id = getattr(u, "assigned_admin_id", None)
    if not admin_id:
        return None
    admin = await User.get(admin_id)
    return getattr(admin, "payfromupi_token", None) if admin else None


async def create_payin(
    amount: Decimal,
    *,
    token: str,
    user_name: str,
    user_email: str,
    user_mobile: str,
    redirect_url: str,
) -> dict[str, str]:
    if amount < MIN_AMOUNT:
        raise PayFromUpiError(f"Online payment needs at least ₹{MIN_AMOUNT:,.0f}.")
    if amount > MAX_AMOUNT:
        raise PayFromUpiError(
            f"Online payment allows up to ₹{MAX_AMOUNT:,.0f} per transaction."
        )
    body = await _post(
        "/api/transactions/create",
        token,
        {
            "type": "any",
            "user_name": user_name or "User",
            "user_email": user_email or "user@example.com",
            "user_mobile": user_mobile or "9999999999",
            "amount": float(amount),
            "redirect_url": redirect_url,
        },
    )
    data = body.get("data") or {}
    txn_id = data.get("txnId") or data.get("txn_id")
    link = data.get("paymentLink") or data.get("payment_link")
    if not txn_id or not link:
        raise PayFromUpiError("Gateway did not return a payment link.")
    return {"order_id": str(txn_id), "payment_url": str(link)}


def _normalize_status(raw: str | None) -> str:
    s = (raw or "").strip().lower()
    if s in {"completed", "success", "successful", "paid"}:
        return "success"
    if s in {"timeout", "error", "failed", "cancelled", "canceled", "expired"}:
        return "failed"
    return "pending"  # ongoing / unknown → keep polling


async def check_status(txn_id: str, *, token: str) -> dict[str, Any]:
    """Authoritative status for a txn: success / pending / failed."""
    body = await _post("/api/check-payment-status", token, {"txn_id": str(txn_id)})
    txn = ((body.get("data") or {}).get("transaction")) or {}
    return {
        "status": _normalize_status(txn.get("status")),
        "amount": txn.get("amount"),
        "raw": txn.get("status"),
    }


def is_success(data: dict[str, Any]) -> bool:
    return str(data.get("status") or "").strip().lower() == "success"


async def _reject_deposit(req, reason: str) -> bool:
    """Atomically mark a still-PENDING pay-in REJECTED (user never paid / the
    gateway failed the txn). Idempotent — a row already handled is left alone."""
    from app.models.transaction import DepositRequest, DepositStatus
    from app.utils.time_utils import now_utc

    res = await DepositRequest.get_motor_collection().find_one_and_update(
        {"_id": req.id, "status": DepositStatus.PENDING.value},
        {
            "$set": {
                "status": DepositStatus.REJECTED.value,
                "admin_remark": reason,
                "processed_at": now_utc(),
                "updated_at": now_utc(),
            }
        },
    )
    return res is not None


async def reconcile_deposits(*, user_id=None, max_age_hours: int = 24) -> int:
    """Poll PENDING PayFromUPI deposits and credit the ones that completed.

    Resolves each deposit's token from its user's owning admin, so it works
    across any number of PayFromUPI admins. Credits via the shared
    divinepay_service.credit_deposit atomic claim (idempotent).
    """
    from datetime import timedelta
    from beanie import PydanticObjectId
    from app.models.transaction import DepositRequest, DepositStatus
    from app.services import divinepay_service
    from app.utils.time_utils import now_utc

    q: dict[str, Any] = {
        "status": DepositStatus.PENDING.value,
        "idempotency_key": {"$regex": f"^{KEY_PREFIX}:"},
        "created_at": {"$gte": now_utc() - timedelta(hours=max_age_hours)},
    }
    if user_id is not None:
        q["user_id"] = (
            user_id if isinstance(user_id, PydanticObjectId) else PydanticObjectId(user_id)
        )
    pending = await DepositRequest.find(q).to_list()
    credited = 0
    for req in pending:
        order_id = (req.idempotency_key or "").split(":", 1)[-1]
        if not order_id:
            continue
        token = await _token_for_user(req.user_id)
        if not token:
            continue
        try:
            st = await check_status(order_id, token=token)
        except PayFromUpiError as e:
            # Gateway doesn't know this txn (expired / purged) → it can never
            # complete, so reject it. Any other transient error → skip, retry
            # next tick (the age gate below still catches a stuck one).
            if "not found" in str(e).lower():
                await _reject_deposit(req, "Payment not found at gateway — cancelled")
            continue
        if is_success(st):
            try:
                if await divinepay_service.credit_deposit(req, None):
                    credited += 1
            except Exception:
                logger.exception("payfromupi credit failed req=%s", req.id)
        elif st.get("status") == "failed":
            # Gateway says the payment failed / timed out — reject it so it
            # never sits around as approvable.
            await _reject_deposit(req, "Payment failed / timed out at the gateway")
        else:
            # Still "ongoing" — the user opened the link but hasn't paid. Give
            # up after EXPIRE_MINUTES so an abandoned attempt is auto-cancelled
            # instead of lingering (and can never be hand-approved into credit).
            from datetime import timedelta, timezone
            from app.utils.time_utils import now_utc

            created = req.created_at
            if created is not None:
                if created.tzinfo is None:
                    created = created.replace(tzinfo=timezone.utc)
                if now_utc() - created > timedelta(minutes=EXPIRE_MINUTES):
                    await _reject_deposit(
                        req, "Payment not completed in time — auto-cancelled"
                    )
    return credited


async def deposit_reconcile_loop(interval_sec: float = 20.0) -> None:
    """Background sweep — credit completed PayFromUPI pays platform-wide."""
    import asyncio

    while True:
        try:
            n = await reconcile_deposits()
            if n:
                logger.info("payfromupi_reconcile credited=%d", n)
        except Exception:
            logger.exception("payfromupi_reconcile_loop tick failed")
        await asyncio.sleep(interval_sec)
