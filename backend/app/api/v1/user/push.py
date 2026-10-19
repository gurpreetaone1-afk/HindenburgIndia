"""User Web Push endpoints — mirror of admin/push.py."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Header
from pydantic import BaseModel

from app.core.config import settings
from app.core.dependencies import CurrentUser
from app.models.push_subscription import PushKeys, PushSubjectType, PushSubscription
from app.schemas.common import APIResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/push", tags=["user-push"])


class _SubscribeBody(BaseModel):
    endpoint: str
    keys: PushKeys
    label: str | None = None


@router.get("/vapid-key", response_model=APIResponse[dict])
async def vapid_key(user: CurrentUser):
    return APIResponse(data={"public_key": settings.VAPID_PUBLIC_KEY})


@router.post("/subscribe", response_model=APIResponse[dict])
async def subscribe(
    body: _SubscribeBody,
    user: CurrentUser,
    user_agent: str | None = Header(default=None, alias="User-Agent"),
):
    existing = await PushSubscription.find_one(PushSubscription.endpoint == body.endpoint)
    if existing is not None:
        existing.subject_type = PushSubjectType.USER
        existing.subject_id = user.id
        existing.keys = body.keys
        existing.label = body.label or existing.label
        existing.user_agent = user_agent or existing.user_agent
        await existing.save()
        return APIResponse(data={"id": str(existing.id), "created": False})
    sub = PushSubscription(
        subject_type=PushSubjectType.USER,
        subject_id=user.id,
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
async def unsubscribe(body: _UnsubBody, user: CurrentUser):
    sub = await PushSubscription.find_one(
        PushSubscription.endpoint == body.endpoint,
        PushSubscription.subject_id == user.id,
    )
    if sub is None:
        return APIResponse(data={"ok": True, "found": False})
    await sub.delete()
    return APIResponse(data={"ok": True, "found": True})


class _ExpoBody(BaseModel):
    token: str
    platform: str | None = None


@router.post("/expo-register", response_model=APIResponse[dict])
async def expo_register(body: _ExpoBody, user: CurrentUser):
    """Register the native app's Expo push token so admin broadcasts reach it
    as a real OS-level notification (even when the app is closed)."""
    from app.models.expo_push_token import ExpoPushToken, ExpoSubjectType

    tok = (body.token or "").strip()
    if not tok:
        return APIResponse(data={"ok": False})
    existing = await ExpoPushToken.find_one(ExpoPushToken.token == tok)
    if existing is not None:
        existing.subject_type = ExpoSubjectType.USER
        existing.subject_id = user.id
        existing.platform = body.platform
        await existing.save()
        return APIResponse(data={"ok": True, "updated": True})
    await ExpoPushToken(
        subject_type=ExpoSubjectType.USER,
        subject_id=user.id,
        token=tok,
        platform=body.platform,
    ).insert()
    return APIResponse(data={"ok": True, "created": True})
