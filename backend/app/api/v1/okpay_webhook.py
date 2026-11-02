"""OkPay public endpoints (no auth) — see services/okpay_service.py.

  GET  /finance/deposit/okpay/pay/{ref}  auto-submitting form to OkPay's page
  POST /finance/deposit/okpay/ipn        payment notification → verify → credit

Set this IPN URL in the OkPay store settings:
    https://api.hindenburgindia.live/api/v1/finance/deposit/okpay/ipn
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, PlainTextResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/finance/deposit/okpay", tags=["okpay"])


def _page(msg: str, status: int = 200) -> HTMLResponse:
    return HTMLResponse(
        "<!doctype html><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>"
        f"<p style='font-family:system-ui,sans-serif;text-align:center;padding:48px 16px'>{msg}</p>",
        status_code=status,
    )


@router.get("/pay/{ref}", response_class=HTMLResponse)
async def okpay_pay_page(ref: str) -> HTMLResponse:
    from app.models.transaction import DepositRequest, DepositStatus
    from app.models.user import User
    from app.services import okpay_service

    req = await DepositRequest.find_one(
        DepositRequest.idempotency_key == f"{okpay_service.KEY_PREFIX}:{ref}"
    )
    if req is None:
        return _page("Payment link not found.", 404)
    if req.status != DepositStatus.PENDING:
        return _page("This payment is already complete. You can close this page.")
    if not okpay_service.is_configured():
        return _page("Online payment is not available right now.", 503)
    user = await User.get(req.user_id)
    item = f"Wallet deposit {getattr(user, 'user_code', '') or ''}".strip()
    from decimal import Decimal

    return HTMLResponse(okpay_service.pay_page_html(ref, Decimal(str(req.amount)), item))


@router.post("/ipn", response_class=PlainTextResponse)
async def okpay_ipn(request: Request) -> PlainTextResponse:
    from app.services import okpay_service

    try:
        form = {k: str(v) for k, v in (await request.form()).items()}
    except Exception:
        form = {}
    try:
        outcome = await okpay_service.handle_ipn(form)
    except Exception:
        # Not a verdict on the payment (DB / wallet hiccup): answer 500 so a
        # retrying sender tries again rather than the credit being lost.
        logger.exception("okpay_ipn_failed custom=%s", form.get("custom"))
        return PlainTextResponse("ERROR", status_code=500)
    logger.info("okpay_ipn custom=%s id_transfer=%s -> %s", form.get("custom"), form.get("id_transfer"), outcome)
    return PlainTextResponse("OK")
