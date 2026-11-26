"""MCX trades 09:00–23:55 IST everywhere: close gate (risk / pending orders /
rollover) and the user squareoff gate must agree on the same minute."""
from datetime import datetime

from app.api.v1.user import positions
from app.utils import time_utils
from app.utils.time_utils import IST, is_after_close, is_before_open


def _at(h, m):
    return datetime(2026, 11, 25, h, m, tzinfo=IST)  # a plain Wednesday


def test_mcx_close_is_2355():
    assert not is_after_close("MCX_FUT", _at(23, 54))
    assert is_after_close("MCX_FUT", _at(23, 55))
    assert is_before_open("MCX_FUT", _at(8, 59))
    assert not is_before_open("MCX_FUT", _at(9, 0))


def test_squareoff_gate_matches(monkeypatch):
    for (h, m), want in {(23, 40): True, (23, 54): True, (23, 55): False, (8, 59): False}.items():
        monkeypatch.setattr(time_utils, "now_ist", lambda h=h, m=m: _at(h, m))
        assert positions._is_segment_market_open_now("MCX_FUT") is want, (h, m)
    monkeypatch.setattr(time_utils, "now_ist", lambda: _at(23, 40))
    assert positions._is_segment_market_open_now("NFO_OPT") is False
