"""A dead feed serves no price.

2026-10-25 the Infoway key started returning 401. Its last ticks stayed in
memory and the quote path kept serving them as live, so XAUUSD sat at one
price — and could be traded at it — for a day. A feed that is down and silent
must answer "no price" so the order panel disables the trade.

    cd backend && .venv/bin/python -m pytest -q tests/test_dead_feed_quotes.py
"""

from __future__ import annotations

import time

import pytest

from app.services import binance_futures_service as bf
from app.services.infoway_service import InfowayService, _DEAD_CHANNEL_SEC


def _book(feed, bid, ask):
    feed._handle_book({"e": "bookTicker", "s": "XAUUSDT", "b": bid, "a": ask, "E": 1})


def test_binance_quotes_while_frames_arrive():
    f = bf.BinanceFuturesFeed()
    _book(f, "4016.60", "4016.70")
    assert f.get_tick("XAUUSD")["ltp"] == pytest.approx(4016.65)


def test_binance_goes_quiet_then_serves_nothing():
    f = bf.BinanceFuturesFeed()
    _book(f, "4016.60", "4016.70")
    f._last_frame = time.monotonic() - bf._DEAD_FEED_SEC - 1
    assert f.get_tick("XAUUSD") is None
    # …and the next frame brings the price straight back.
    _book(f, "4017.00", "4017.10")
    assert f.get_tick("XAUUSD")["ltp"] == pytest.approx(4017.05)


def _infoway_with_tick():
    svc = InfowayService()
    svc.ticks["EURUSD"] = {"symbol": "EURUSD", "ltp": 1.08, "bid": 1.0799, "ask": 1.0801}
    return svc, svc._channels["common"]


def test_infoway_dead_channel_serves_nothing():
    svc, ch = _infoway_with_tick()
    ch._connected = False
    ch._last_rx = time.monotonic() - _DEAD_CHANNEL_SEC - 1
    assert svc.get_tick("EURUSD") is None


def test_infoway_reconnect_blip_keeps_the_price():
    """A socket that dropped seconds ago is reconnecting, not dead."""
    svc, ch = _infoway_with_tick()
    ch._connected = False
    ch._last_rx = time.monotonic() - 5
    assert svc.get_tick("EURUSD")["ltp"] == 1.08
