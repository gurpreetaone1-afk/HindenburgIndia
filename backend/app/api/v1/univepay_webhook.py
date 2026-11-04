"""Univepay pay-in callback (public, no auth) — see services/univepay_service.py.

  POST /finance/deposit/univepay/notify   result → verify → credit

Sent automatically as the order's NotifyUrl:
    https://api.hindenburgindia.live/api/v1/finance/deposit/univepay/notify
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Request
from fastapi.responses import PlainTextResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/finance/deposit/univepay", tags=["univepay"])


@router.post("/notify", response_class=PlainTextResponse)
async def univepay_notify(request: Request) -> PlainTextResponse:
    from app.services import univepay_service

    try:
        form = {k: str(v) for k, v in (await request.form()).items()}
    except Exception:
        form = {}
    try:
        outcome = await univepay_service.handle_notify(form)
    except Exception:
        # DB / wallet hiccup, not a verdict: 500 so Univepay retries.
        logger.exception("univepay_notify_failed traceno=%s", form.get("Traceno"))
        return PlainTextResponse("ERROR", status_code=500)
    logger.info("univepay_notify traceno=%s -> %s", form.get("Traceno"), outcome)
    # "SUCCESS" stops Univepay retrying. A bad signature is not acknowledged,
    # so the callback is retried (and can still credit once the rule is fixed).
    return PlainTextResponse("FAIL" if outcome == "bad signature" else "SUCCESS")
