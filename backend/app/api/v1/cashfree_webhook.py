"""Cashfree webhook (public, no auth) — see services/cashfree_service.py.

  POST /finance/deposit/cashfree/notify

Sent as each payment link's notify_url, and the same URL can be added in the
Cashfree dashboard (Developers -> Webhooks):
    https://api.hindenburgindia.live/api/v1/finance/deposit/cashfree/notify
The body only names the link; the credit decision comes from Cashfree's API.
"""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/finance/deposit/cashfree", tags=["cashfree"])


@router.post("/notify")
async def cashfree_notify(request: Request) -> JSONResponse:
    from app.services import cashfree_service

    raw = await request.body()
    try:
        body = json.loads(raw)
    except ValueError:
        body = None
    if not isinstance(body, dict):  # older link webhooks come as a form
        try:
            body = {k: str(v) for k, v in (await request.form()).items()}
        except Exception:
            body = {}
    link_id = cashfree_service.link_id_of(body)
    if not link_id:
        # Dashboard "Test" pings and events we don't use: acknowledge.
        logger.info("cashfree_notify no link_id type=%s", body.get("type"))
        return JSONResponse({"ok": True})
    try:
        outcome = await cashfree_service.confirm(link_id)
    except Exception:
        # Gateway / DB hiccup, not a verdict: 500 so Cashfree retries.
        logger.exception("cashfree_notify_failed link=%s", link_id)
        return JSONResponse({"ok": False}, status_code=500)
    logger.info("cashfree_notify link=%s -> %s", link_id, outcome)
    return JSONResponse({"ok": True})
