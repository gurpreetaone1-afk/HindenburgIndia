"""In-process SSL provisioning: the helper's exit code decides READY vs
FAILED (with its error text), without a Celery worker.

    cd backend && .venv/bin/python -m pytest -q tests/test_branding_provision.py
"""
from __future__ import annotations

import asyncio
import os
import stat
import sys

import pytest

from app.services import branding_service
from app.workers import branding_tasks as bt


class _User:
    id = "6aeac7f4a64039ee54a2c8fb"
    custom_domain = "broker.example"
    custom_domain_status = branding_service.STATUS_PROVISIONING
    email = "a@b.c"


@pytest.mark.skipif(sys.platform == "win32", reason="needs a POSIX shell script")
@pytest.mark.parametrize("rc,expect", [(0, "ready"), (70, "failed")])
def test_helper_exit_code_decides_status(tmp_path, monkeypatch, rc, expect):
    helper = tmp_path / "helper"
    helper.write_text(f"#!/bin/sh\necho \"args $1 $2\"\necho 'certbot said no' >&2\nexit {rc}\n")
    helper.chmod(helper.stat().st_mode | stat.S_IEXEC)
    seen = {}

    async def get(_id):
        return _User()

    async def ready(uid):
        seen["ready"] = uid

    async def failed(uid, err):
        seen["failed"] = err

    from app.models.user import User

    monkeypatch.setattr(User, "get", get)
    monkeypatch.setattr(bt, "PROVISION_SCRIPT", str(helper))
    monkeypatch.setattr(bt.shutil, "which", lambda _: "/usr/bin/certbot")
    monkeypatch.setattr(bt.os, "geteuid", lambda: 0)
    monkeypatch.setattr(branding_service, "mark_domain_ready", ready)
    monkeypatch.setattr(branding_service, "mark_domain_failed", failed)

    out = asyncio.run(bt.provision_ssl_async(_User.id))
    assert out["ok"] is (rc == 0)
    if expect == "ready":
        assert seen == {"ready": _User.id}
    else:
        assert "certbot said no" in seen["failed"]


def test_cmd_skips_sudo_only_for_root(monkeypatch):
    monkeypatch.setattr(bt.os, "geteuid", lambda: 0)
    assert bt._provision_cmd("d.in", "e@x") == [bt.PROVISION_SCRIPT, "d.in", "e@x"]
    monkeypatch.setattr(bt.os, "geteuid", lambda: 1000)
    assert bt._provision_cmd("d.in", "e@x")[:2] == ["sudo", "-n"]
