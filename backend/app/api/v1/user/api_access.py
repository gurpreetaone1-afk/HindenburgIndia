"""User-facing API-access endpoints.

A client pastes their broker/algo API key in the app's "API Access" section
and submits it. We keep ONE request row per user (upserted on resubmit) so
the app always shows a single current status: PENDING → APPROVED / REJECTED.
An admin reviews it from the admin panel (see api/v1/admin/api_access.py).
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, field_validator

from app.core.dependencies import CurrentUser
from app.models.api_access import ApiAccessRequest, ApiAccessStatus
from app.schemas.common import APIResponse
from app.services.admin_events import publish_admin_event
from app.utils.time_utils import now_utc

router = APIRouter(prefix="/api-access", tags=["user-api-access"])


class ApiAccessSubmit(BaseModel):
    api_key: str

    @field_validator("api_key")
    @classmethod
    def _clean(cls, v: str) -> str:
        v = (v or "").strip()
        if len(v) < 6:
            raise ValueError("API key looks too short")
        if len(v) > 512:
            raise ValueError("API key is too long")
        return v


def _serialize(req: ApiAccessRequest | None) -> dict:
    if req is None:
        # No request on file — the app renders the empty "Connect" state.
        return {"status": "idle", "api_key": "", "rejection_reason": None}
    return {
        "status": str(req.status.value),
        "api_key": req.api_key,
        "rejection_reason": req.rejection_reason,
        "reviewed_at": req.reviewed_at,
        "updated_at": req.updated_at,
    }


@router.get("", response_model=APIResponse[dict])
async def get_my_api_access(user: CurrentUser):
    """Current API-access request state for the calling user."""
    req = await ApiAccessRequest.find_one(ApiAccessRequest.user_id == user.id)
    return APIResponse(data=_serialize(req))


@router.post("", response_model=APIResponse[dict])
async def submit_api_access(payload: ApiAccessSubmit, user: CurrentUser):
    """Submit (or resubmit) an API key. Upserts the user's single request row
    back to PENDING and clears any prior review, then notifies the owning
    admins so it surfaces in the admin panel."""
    req = await ApiAccessRequest.find_one(ApiAccessRequest.user_id == user.id)
    if req is None:
        req = ApiAccessRequest(user_id=user.id, api_key=payload.api_key)
    else:
        req.api_key = payload.api_key
        req.status = ApiAccessStatus.PENDING
        req.reviewed_by = None
        req.reviewed_at = None
        req.rejection_reason = None
        req.updated_at = now_utc()
    await req.save()

    # Surface it live in the admin panel (AdminWsBridge invalidates the
    # ["admin","api-access"] query on this event).
    await publish_admin_event(
        "api_access_update",
        {
            "event": "submitted",
            "user_id": str(user.id),
            "request_id": str(req.id),
            "user_name": getattr(user, "full_name", None),
            "user_code": getattr(user, "user_code", None),
        },
    )
    return APIResponse(data=_serialize(req))
