"""Zerodha login hand-off for two accounts on one redirect URL.

Auto-login lets Kite redirect to /callback, which does the only request_token
exchange. Both accounts share that redirect URL, so the login URL must name
the account (or /callback would exchange Account B's token with A's secret),
and the exchange must reconnect only that account's socket.

Hindenburg runs a single uvicorn worker, so /callback always lands in the feed
process — no cross-worker reconnect hand-off is needed here.

    cd backend && .venv/bin/python -m pytest -q tests/test_zerodha_login_handoff.py
"""

from __future__ import annotations

import asyncio

import pytest

from app.services import zerodha_service as zs


class _AccountB:
    apiKey = "key_b"
    apiSecret = "secret_b"
    accessToken = None
    refreshToken = None
    tokenExpiry = None
    isConnected = False
    lastConnected = None

    async def save(self):
        pass


class _Kite:
    def generate_session(self, request_token, api_secret):
        assert api_secret == "secret_b"
        return {"access_token": "fresh", "refresh_token": None}


@pytest.fixture
def svc():
    s = type(zs.zerodha)()
    kicked: list = []

    async def get_settings(account_index=0):
        assert account_index == 1
        return _AccountB()

    async def no_instruments(exchange):
        return []

    async def kick_a():
        kicked.append("A")

    async def kick_b(api_key, access_token):
        kicked.append(("B", api_key, access_token))

    s._get_settings = get_settings
    s._kite = lambda api_key, access_token=None: _Kite()
    s.fetch_instruments = no_instruments
    s._login_auto_connect = kick_a
    s._account_b_ws_connect = kick_b
    return s, kicked


def test_login_url_tells_callback_which_account(svc):
    s, _ = svc
    assert "redirect_params=account%3D1" in asyncio.run(s.get_login_url(1))


def test_callback_reconnects_only_that_account(svc):
    s, kicked = svc

    async def run():
        out = await s.generate_session("rt", 1)
        await asyncio.sleep(0)  # let the fire-and-forget reconnect run
        return out

    assert asyncio.run(run())["accessToken"] == "fresh"
    assert kicked == [("B", "key_b", "fresh")]
