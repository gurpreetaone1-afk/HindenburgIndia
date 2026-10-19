"""Native-app (Expo) push tokens.

The React-Native APK can't use browser Web Push (no service worker), so it
registers an Expo push token (``ExponentPushToken[...]``) here. The broadcast
sender then also pushes to these via the Expo Push API so the phone shows a
real OS-level pop-up even when the app is closed. One row per device token.
"""

from __future__ import annotations

from beanie import PydanticObjectId
from pymongo import ASCENDING, IndexModel

from app.models._base import StrEnum, TimestampMixin


class ExpoSubjectType(StrEnum):
    USER = "USER"
    ADMIN = "ADMIN"


class ExpoPushToken(TimestampMixin):
    subject_type: ExpoSubjectType = ExpoSubjectType.USER
    subject_id: PydanticObjectId
    token: str                       # ExponentPushToken[xxxxxxxx]
    platform: str | None = None      # "android" / "ios"
    device_label: str | None = None

    class Settings:
        name = "expo_push_tokens"
        indexes = [
            IndexModel([("token", ASCENDING)], unique=True),
            IndexModel([("subject_type", ASCENDING), ("subject_id", ASCENDING)]),
        ]
