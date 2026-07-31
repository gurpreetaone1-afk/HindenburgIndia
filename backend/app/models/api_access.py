"""API-access requests — a client pastes their broker/algo API key in the
app's "API Access" section; it lands here as a PENDING row that an admin
approves or rejects from the admin panel. On approval we also flip the
existing `User.permissions.api_access` capability flag ON so the rest of the
platform's gating (which already reads that boolean) stays authoritative.

One row per user (upserted on resubmit) so the app shows a single, current
status. Mirrors the WithdrawalRequest submit → PENDING → admin review flow.
"""

from __future__ import annotations

from datetime import datetime

from beanie import PydanticObjectId
from pymongo import ASCENDING, DESCENDING, IndexModel

from app.models._base import StrEnum, TimestampMixin


class ApiAccessStatus(StrEnum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class ApiAccessRequest(TimestampMixin):
    user_id: PydanticObjectId
    api_key: str
    status: ApiAccessStatus = ApiAccessStatus.PENDING
    reviewed_by: PydanticObjectId | None = None   # admin who approved / rejected
    reviewed_at: datetime | None = None
    rejection_reason: str | None = None

    class Settings:
        name = "api_access_requests"
        indexes = [
            IndexModel([("status", ASCENDING), ("created_at", DESCENDING)]),
            # One current request per user — the submit endpoint upserts on it.
            IndexModel([("user_id", ASCENDING)], unique=True),
        ]
