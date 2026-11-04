"""Signup OTP follows the owning admin's register_otp_enabled flag, with the
admin resolved like /register attributes the signup (custom domain included)."""
import asyncio
from types import SimpleNamespace

from app.api.v1.user import auth


def _run(monkeypatch, admin_id, admin, raises=False):
    seen = {}

    async def resolve(*, request_host, referral_code):
        seen.update(host=request_host, ref=referral_code)
        if raises:
            raise RuntimeError("db down")
        return admin_id, None, [], "CUSTOM_DOMAIN"

    async def get(_id):
        return admin

    monkeypatch.setattr(auth.branding_service, "resolve_signup_attribution", resolve)
    monkeypatch.setattr(auth.User, "get", get)
    out = asyncio.run(auth._register_otp_enabled_for("sharemarket.one", None))
    return out, seen


def test_admin_with_register_otp_off_skips_otp(monkeypatch):
    out, seen = _run(monkeypatch, "a1", SimpleNamespace(register_otp_enabled=False))
    assert out is False
    assert seen == {"host": "sharemarket.one", "ref": None}  # custom domain, no ref


def test_admin_with_register_otp_on_requires_otp(monkeypatch):
    assert _run(monkeypatch, "a1", SimpleNamespace(register_otp_enabled=True))[0] is True


def test_super_admin_pool_requires_otp(monkeypatch):
    assert _run(monkeypatch, None, None)[0] is True


def test_lookup_error_requires_otp(monkeypatch):
    assert _run(monkeypatch, "a1", None, raises=True)[0] is True
