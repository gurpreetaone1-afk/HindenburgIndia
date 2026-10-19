"""Admin Web Push endpoints — store + remove browser push subscriptions.

The frontend (PwaRegister + AdminWsBridge) calls these once after the
operator grants notification permission. The subscription contains the
browser-vendor push endpoint and the cryptographic material needed to
encrypt the payload; we keep one row per (admin, device) so a single
admin can stay covered on phone + laptop + desktop.
"""

from __future__ import annotations

import logging

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from app.core.config import settings
from app.core.dependencies import CurrentAdmin, require_perm, scoped_user_ids
from app.models.push_subscription import PushKeys, PushSubjectType, PushSubscription
from app.schemas.common import APIResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/push", tags=["admin-push"])


class _SubscribeBody(BaseModel):
    endpoint: str
    keys: PushKeys
    label: str | None = None


@router.get("/vapid-key", response_model=APIResponse[dict])
async def vapid_key(admin: CurrentAdmin):
    """Return the application-server public key the SW needs to
    subscribe. Public — no secret material here."""
    return APIResponse(data={"public_key": settings.VAPID_PUBLIC_KEY})


@router.post("/subscribe", response_model=APIResponse[dict])
async def subscribe(
    body: _SubscribeBody,
    admin: CurrentAdmin,
    user_agent: str | None = Header(default=None, alias="User-Agent"),
):
    """Upsert a subscription. Browsers re-emit the same endpoint for
    the same install, so we key on endpoint to keep the table
    deduped — re-subscribing simply refreshes the row in place."""
    existing = await PushSubscription.find_one(PushSubscription.endpoint == body.endpoint)
    if existing is not None:
        existing.subject_type = PushSubjectType.ADMIN
        existing.subject_id = admin.id
        existing.keys = body.keys
        existing.label = body.label or existing.label
        existing.user_agent = user_agent or existing.user_agent
        await existing.save()
        return APIResponse(data={"id": str(existing.id), "created": False})
    sub = PushSubscription(
        subject_type=PushSubjectType.ADMIN,
        subject_id=admin.id,
        endpoint=body.endpoint,
        keys=body.keys,
        label=body.label,
        user_agent=user_agent,
    )
    await sub.insert()
    return APIResponse(data={"id": str(sub.id), "created": True})


class _UnsubBody(BaseModel):
    endpoint: str


@router.post("/unsubscribe", response_model=APIResponse[dict])
async def unsubscribe(body: _UnsubBody, admin: CurrentAdmin):
    sub = await PushSubscription.find_one(
        PushSubscription.endpoint == body.endpoint,
        PushSubscription.subject_id == admin.id,
    )
    if sub is None:
        return APIResponse(data={"ok": True, "found": False})
    await sub.delete()
    return APIResponse(data={"ok": True, "found": True})


class _BroadcastBody(BaseModel):
    title: str
    body: str
    url: str | None = "/"


@router.post("/broadcast", response_model=APIResponse[dict])
async def broadcast(
    body: _BroadcastBody,
    admin: CurrentAdmin,
    _: None = Depends(require_perm("users", "write")),
):
    """Send a notification to ALL the admin's users at once: a real
    app-closed Web Push pop-up PLUS an in-app bell row. Super-admin reaches
    every trader; a sub-admin only their own scoped pool."""
    title = (body.title or "").strip()
    msg = (body.body or "").strip()
    if not title or not msg:
        raise HTTPException(status_code=400, detail="Title and message are required")

    from app.services import push_service
    from app.models.user import User, UserRole
    from app.models.notification import (
        Notification,
        NotificationLevel,
        NotificationType,
    )

    scope = await scoped_user_ids(admin)  # None -> super-admin (all users)
    url = (body.url or "/").strip() or "/"

    sent = await push_service.send_to_all_users(
        title=title, body=msg, url=url, user_ids=scope
    )

    if scope is None:
        ids = [
            d["_id"]
            async for d in User.get_motor_collection().find(
                {"role": UserRole.CLIENT.value}, {"_id": 1}
            )
        ]
    else:
        ids = list(scope)
    if ids:
        rows = [
            Notification(
                user_id=uid,
                type=NotificationType.SYSTEM,
                level=NotificationLevel.INFO,
                title=title,
                message=msg,
            )
            for uid in ids
        ]
        try:
            await Notification.insert_many(rows)
        except Exception:
            logger.exception("broadcast_inapp_insert_failed")

    logger.info("admin_broadcast sent_push=%d recipients=%d", sent, len(ids))
    return APIResponse(data={"push_sent": sent, "recipients": len(ids)})
