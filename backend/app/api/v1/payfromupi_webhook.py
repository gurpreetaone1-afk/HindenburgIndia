"""PayFromUPI pay-in webhook (public, no auth).

PayFromUPI POSTs here when a hosted payment finishes. We NEVER trust the
webhook body to move money — we take only the txn id from it, re-ask the
gateway (check-payment-status, authenticated with the owning admin's token)
whether it actually completed, and credit through the shared idempotent
claim. So a spoofed/forged webhook can't credit anything the gateway hasn't
really settled. Always returns 200 so the gateway doesn't hammer retries.

Configure this URL in the PayFromUPI dashboard:
    https://api.hindenburgindia.live/api/v1/finance/deposit/fiat/payfromupi/webhook
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Request

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/finance/deposit/fiat/payfromupi", tags=["payfromupi-webhook"])


@router.post("/webhook")
async def payfromupi_webhook(request: Request) -> dict[str, Any]:
    try:
        body = await request.json()
    except Exception:
        body = {}

    txn_id = str(
        body.get("txn_id") or body.get("txnId") or body.get("transaction_id") or ""
    ).strip()
    logger.info("payfromupi_webhook txn=%s status=%s", txn_id, body.get("status"))
    if not txn_id:
        return {"success": True, "note": "no txn id"}

    from app.models.transaction import DepositRequest, DepositStatus
    from app.services import divinepay_service, payfromupi_service

    req = await DepositRequest.find_one(
        DepositRequest.idempotency_key == f"{payfromupi_service.KEY_PREFIX}:{txn_id}"
    )
    if req is None:
        return {"success": True, "note": "unknown txn"}
    if req.status != DepositStatus.PENDING:
        return {"success": True, "note": "already handled"}

    token = await payfromupi_service._token_for_user(req.user_id)
    if not token:
        return {"success": True, "note": "no token for user"}

    try:
        st = await payfromupi_service.check_status(txn_id, token=token)
    except payfromupi_service.PayFromUpiError:
        return {"success": True, "note": "status check failed — reconcile loop will retry"}

    if payfromupi_service.is_success(st):
        try:
            credited = await divinepay_service.credit_deposit(req, None)
            logger.info("payfromupi_webhook credited txn=%s ok=%s", txn_id, credited)
        except Exception:
            logger.exception("payfromupi_webhook credit failed txn=%s", txn_id)
    return {"success": True}
