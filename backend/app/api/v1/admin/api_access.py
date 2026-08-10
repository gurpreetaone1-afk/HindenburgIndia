"""Admin-side API-access inbox — list pending requests and approve / reject
them. Mirrors the withdrawal review flow (scoped list, per-row scope guard on
mutate, atomic PENDING check, admin + user WS fan-out). On approval we also
flip ``User.permissions.api_access`` ON so the platform's existing capability
gating stays authoritative.
"""

from __future__ import annotations

from typing import Any

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.v1.admin._owner import build_owner_map, owner_fields
from app.core.dependencies import (
    CurrentAdmin,
    assert_user_in_scope,
    require_perm,
    scoped_user_ids,
)
from app.core.redis_client import publish
from app.models.api_access import ApiAccessRequest, ApiAccessStatus
from app.models.audit_log import AuditAction
from app.models.user import User
from app.schemas.common import APIResponse
from app.services.admin_events import publish_admin_event
from app.services.audit_service import log_event
from app.utils.time_utils import now_utc

router = APIRouter(tags=["admin-api-access"])


class RejectApiAccessRequest(BaseModel):
    rejection_reason: str | None = None


async def _notify_user(user_id: PydanticObjectId, status: str, rejection_reason: str | None = None) -> None:
    """Push the new status to the user's app so the API Access card flips
    connected / rejected live (best-effort — a Redis hiccup never rolls back
    the DB write)."""
    try:
        await publish(
            f"user:{user_id}:api_access",
            {"type": "api_access", "payload": {"status": status, "rejection_reason": rejection_reason}},
        )
    except Exception:  # pragma: no cover
        pass


@router.get("/api-access", response_model=APIResponse[dict])
async def list_api_access(
    admin: CurrentAdmin,
    status: str | None = None,
    page: int = 1,
    page_size: int = 15,
    _: None = Depends(require_perm("users", "read")),
):
    """API-access request inbox — scoped to the admin's own user pool."""
    page = max(1, page)
    page_size = max(1, min(200, page_size))
    q: dict[str, Any] = {}
    if status:
        q["status"] = status
    scope = await scoped_user_ids(admin)
    if scope is not None:
        if not scope:
            return APIResponse(
                data={"items": [], "meta": {"page": page, "page_size": page_size, "total": 0, "total_pages": 0}}
            )
        q["user_id"] = {"$in": scope}

    total = await ApiAccessRequest.find(q).count()
    rows = (
        await ApiAccessRequest.find(q)
        .sort("-created_at")
        .skip((page - 1) * page_size)
        .limit(page_size)
        .to_list()
    )
    owner_map = await build_owner_map([r.user_id for r in rows])
    return APIResponse(
        data={
            "items": [
                {
                    "id": str(r.id),
                    "user_id": str(r.user_id),
                    "api_key": r.api_key,
                    "status": r.status.value,
                    "rejection_reason": r.rejection_reason,
                    "created_at": r.created_at,
                    "updated_at": r.updated_at,
                    "reviewed_at": r.reviewed_at,
                    **owner_fields(owner_map.get(str(r.user_id))),
                }
                for r in rows
            ],
            "meta": {
                "page": page,
                "page_size": page_size,
                "total": total,
                "total_pages": (total + page_size - 1) // page_size,
            },
        }
    )


@router.post("/api-access/{request_id}/approve", response_model=APIResponse[dict])
async def approve_api_access(
    request_id: str,
    admin: CurrentAdmin,
    _: None = Depends(require_perm("users", "write")),
):
    r = await ApiAccessRequest.get(PydanticObjectId(request_id))
    if r is None:
        raise HTTPException(status_code=404, detail="Request not found")
    await assert_user_in_scope(admin, r.user_id)
    if r.status != ApiAccessStatus.PENDING:
        raise HTTPException(status_code=400, detail="Already processed")

    now = now_utc()
    r.status = ApiAccessStatus.APPROVED
    r.reviewed_by = admin.id
    r.reviewed_at = now
    r.rejection_reason = None
    r.updated_at = now
    await r.save()

    # Flip the existing capability flag ON — the rest of the platform gates
    # on User.permissions.api_access, so keep it the source of truth.
    try:
        u = await User.get(r.user_id)
        if u is not None:
            u.permissions.api_access = True
            await u.save()
    except Exception:  # pragma: no cover
        pass

    await log_event(
        action=AuditAction.APPROVE,
        entity_type="ApiAccessRequest",
        entity_id=r.id,
        actor_id=admin.id,
        target_user_id=r.user_id,
    )
    await publish_admin_event(
        "api_access_update",
        {"event": "approved", "user_id": str(r.user_id), "request_id": str(r.id)},
    )
    await _notify_user(r.user_id, "APPROVED")
    return APIResponse(data={"id": str(r.id), "status": r.status.value})


@router.post("/api-access/{request_id}/reject", response_model=APIResponse[dict])
async def reject_api_access(
    request_id: str,
    payload: RejectApiAccessRequest,
    admin: CurrentAdmin,
    _: None = Depends(require_perm("users", "write")),
):
    r = await ApiAccessRequest.get(PydanticObjectId(request_id))
    if r is None:
        raise HTTPException(status_code=404, detail="Request not found")
    await assert_user_in_scope(admin, r.user_id)
    if r.status != ApiAccessStatus.PENDING:
        raise HTTPException(status_code=400, detail="Already processed")

    now = now_utc()
    r.status = ApiAccessStatus.REJECTED
    r.rejection_reason = (payload.rejection_reason or "").strip() or None
    r.reviewed_by = admin.id
    r.reviewed_at = now
    r.updated_at = now
    await r.save()

    # Revoke the capability flag on reject so a previously-approved user who
    # resubmits and is then rejected loses access.
    try:
        u = await User.get(r.user_id)
        if u is not None:
            u.permissions.api_access = False
            await u.save()
    except Exception:  # pragma: no cover
        pass

    await log_event(
        action=AuditAction.REJECT,
        entity_type="ApiAccessRequest",
        entity_id=r.id,
        actor_id=admin.id,
        target_user_id=r.user_id,
    )
    await publish_admin_event(
        "api_access_update",
        {"event": "rejected", "user_id": str(r.user_id), "request_id": str(r.id)},
    )
    await _notify_user(r.user_id, "REJECTED", r.rejection_reason)
    return APIResponse(data={"id": str(r.id), "status": r.status.value})


@router.delete("/api-access/{request_id}", response_model=APIResponse[dict])
async def delete_api_access(
    request_id: str,
    admin: CurrentAdmin,
    _: None = Depends(require_perm("users", "write")),
):
    """Delete a request entirely (any status). Revokes the user's API-access
    capability and resets their app to the empty "Connect" form — they must
    re-submit a key to request access again."""
    r = await ApiAccessRequest.get(PydanticObjectId(request_id))
    if r is None:
        raise HTTPException(status_code=404, detail="Request not found")
    await assert_user_in_scope(admin, r.user_id)
    user_id = r.user_id
    await r.delete()

    # Revoke the capability flag so the user loses API access immediately.
    try:
        u = await User.get(user_id)
        if u is not None:
            u.permissions.api_access = False
            await u.save()
    except Exception:  # pragma: no cover
        pass

    await log_event(
        action=AuditAction.DELETE,
        entity_type="ApiAccessRequest",
        entity_id=PydanticObjectId(request_id),
        actor_id=admin.id,
        target_user_id=user_id,
    )
    await publish_admin_event(
        "api_access_update",
        {"event": "deleted", "user_id": str(user_id), "request_id": request_id},
    )
    # "idle" → the user's GET returns no row, so the app re-renders the empty
    # Connect form and the "connected" state disappears live.
    await _notify_user(user_id, "idle")
    return APIResponse(data={"id": request_id, "status": "idle"})
