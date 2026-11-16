from types import SimpleNamespace

import pytest

from app.api.v1.admin import users
from app.core.exceptions import ConflictError
from app.models.user import UserRole
from app.schemas.admin.common import CreateUserRequest

PAYLOAD = CreateUserRequest(full_name="X", email="x@gmail.com", mobile="9765515577", password="Secret@123")
TAKEN = SimpleNamespace(id="u1", user_code="CL1", full_name="Bapu", email="other@gmail.com")


async def _call(monkeypatch, role, in_scope):
    async def find_taken(_e, _m):
        return TAKEN

    async def scope(_admin, _uid):
        if not in_scope:
            raise PermissionError("not yours")
        return TAKEN

    monkeypatch.setattr(users.user_service, "find_taken", find_taken)
    monkeypatch.setattr(users, "assert_user_in_scope", scope)
    with pytest.raises(ConflictError) as exc:
        await users.create_user(PAYLOAD, SimpleNamespace(id="a1", role=role, assigned_admin_id=None), None)
    return str(exc.value.message if hasattr(exc.value, "message") else exc.value)


@pytest.mark.asyncio
async def test_other_admins_account_is_explained_without_its_details(monkeypatch):
    msg = await _call(monkeypatch, UserRole.ADMIN, in_scope=False)
    assert "another admin's account" in msg and "CL1" not in msg


@pytest.mark.asyncio
async def test_own_account_names_the_user_code(monkeypatch):
    assert "CL1" in await _call(monkeypatch, UserRole.ADMIN, in_scope=True)
    assert "CL1" in await _call(monkeypatch, UserRole.SUPER_ADMIN, in_scope=False)
