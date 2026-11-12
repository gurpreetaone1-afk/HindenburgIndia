"""Monepay pay-in callback (public, no auth) — see services/monepay_service.py.

  POST /finance/deposit/monepay/notify   result → verify → credit

Sent automatically as each order's callbackUrl:
    https://api.hindenburgindia.live/api/v1/finance/deposit/monepay/notify
"""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Request
from fastapi.responses import PlainTextResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/finance/deposit/monepay", tags=["monepay"])


@router.post("/notify", response_class=PlainTextResponse)
async def monepay_notify(request: Request) -> PlainTextResponse:
    from app.services import monepay_service

    raw = await request.body()
    try:
        body = json.loads(raw)
    except ValueError:
        body = None
    if not isinstance(body, dict):  # the guide says JSON; take a form too
        try:
            body = {k: str(v) for k, v in (await request.form()).items()}
        except Exception:
            body = {}
    try:
        outcome = await monepay_service.handle_notify(body)
    except Exception:
        # DB / wallet hiccup, not a verdict: 500 so Monepay retries.
        logger.exception("monepay_notify_failed clientId=%s", body.get("clientId"))
        return PlainTextResponse("ERROR", status_code=500)
    logger.info("monepay_notify clientId=%s -> %s", body.get("clientId"), outcome)
    # "SUCCESS" stops Monepay retrying. A bad signature is not acknowledged.
    return PlainTextResponse("FAIL" if outcome == "bad signature" else "SUCCESS")
