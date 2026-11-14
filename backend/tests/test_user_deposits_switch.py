from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.v1.user import wallet
from app.services.branding_service import to_branding_payload


def _admin(**kw):
    base = dict(id="a1", user_code="ADM1", brand_name=None, logo_url=None, custom_domain=None,
                custom_domain_status=None, custom_domain_last_error=None)
    return SimpleNamespace(**{**base, **kw})


@pytest.mark.asyncio
async def test_user_deposits_follow_owning_admin(monkeypatch):
    async def owner(_user):
        return owner.admin

    monkeypatch.setattr(wallet, "_owning_admin", owner)
    user = SimpleNamespace()

    owner.admin = None  # super-admin pool: always allowed
    assert await wallet._user_deposits_on(user) is True
    owner.admin = _admin()  # field missing on old docs -> allowed
    assert await wallet._user_deposits_on(user) is True
    owner.admin = _admin(user_deposits_enabled=False)
    assert await wallet._user_deposits_on(user) is False
    with pytest.raises(HTTPException) as exc:
        await wallet._require_user_deposits(user)
    assert exc.value.status_code == 403


def test_branding_payload_carries_signup_flag():
    assert to_branding_payload(_admin())["signup_enabled"] is True
    assert to_branding_payload(_admin(signup_enabled=False))["signup_enabled"] is False
