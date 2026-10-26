"""MetaAPI quotes: a live connection serves the broker's price (through the
symbol map), while a dead connection or a symbol the broker stopped quoting
serves nothing — so the order panel can't trade a frozen price.

    cd backend && .venv/bin/python -m pytest -q tests/test_metaapi_quotes.py
"""

from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone

import pytest

from app.services import metaapi_service as ms

NOW = datetime.now(timezone.utc)


class _Terminal:
    def __init__(self, prices):
        self.prices = prices

    def price(self, symbol):
        return self.prices.get(symbol)


class _Conn:
    def __init__(self, prices):
        self.terminal_state = _Terminal(prices)


def _feed(prices, *, alive=True, alias=None):
    f = ms.MetaApiFeed()
    f._conn = _Conn(prices)
    f._alias = alias or {}
    f._alive_at = time.monotonic() - (0 if alive else ms._DEAD_FEED_SEC + 1)
    return f


def test_live_price_is_the_mid():
    f = _feed({"XAUUSD": {"bid": 4015.4, "ask": 4015.6, "time": NOW}})
    t = f.get_tick("XAUUSD")
    assert t["ltp"] == pytest.approx(4015.5)
    assert (t["bid"], t["ask"]) == (4015.4, 4015.6)


def test_broker_name_comes_from_the_symbol_map():
    f = _feed({"DE30": {"bid": 25293.6, "ask": 25294.1, "time": NOW}}, alias={"DE40": "DE30"})
    assert f.get_tick("DE40")["ltp"] == pytest.approx(25293.85)


def test_a_closed_market_keeps_its_last_price():
    """US stocks over a weekend: days old, but a real last price."""
    f = _feed({"AAPL": {"bid": 347.43, "ask": 347.55, "time": NOW - timedelta(days=2.5)}})
    assert f.get_tick("AAPL") is not None


def test_a_dead_connection_serves_nothing():
    f = _feed({"XAUUSD": {"bid": 4015.4, "ask": 4015.6, "time": NOW}}, alive=False)
    assert f.get_tick("XAUUSD") is None


def test_a_symbol_dead_at_the_broker_serves_nothing():
    """Exness still answers for ADAUSD — with a tick from 493 days ago."""
    f = _feed({"ADAUSD": {"bid": 0.59262, "ask": 0.59448, "time": NOW - timedelta(days=493)}})
    assert f.get_tick("ADAUSD") is None
