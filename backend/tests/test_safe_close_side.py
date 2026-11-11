"""Regression: junk depth must never mark or fill a position.

2026-11-10 16:45 IST (MCX evening-only session, nothing traded yet) the depth
of illiquid MCX options carried junk levels. Marking M2M on them stopped out
5 users and filled their closes there: SILVER26NOV240000CE at 25 (LTP 216.5),
CRUDEOIL26NOV12000CE at 0.10 (LTP 6.3), CRUDEOIL26NOV13000CE at 20 (LTP 5.4).

    cd backend && .venv/bin/python -m pytest -q tests/test_safe_close_side.py
"""
from decimal import Decimal

from app.services.market_data_service import safe_close_side

D = Decimal


def test_junk_depth_is_rejected():
    assert safe_close_side(D("216.5"), D("25")) is None  # SILVER 240000CE bid
    assert safe_close_side(D("6.3"), D("0.10")) is None  # CRUDE 12000CE bid
    assert safe_close_side(D("5.4"), D("20")) is None  # CRUDE 13000CE ask


def test_real_spread_is_kept():
    assert safe_close_side(D("182"), D("178")) == D("178")
    assert safe_close_side(D("100"), D("125")) == D("125")  # exactly 25% still ok


def test_missing_values():
    assert safe_close_side(D("100"), None) is None
    assert safe_close_side(D("100"), 0) is None
    assert safe_close_side(None, D("50")) == D("50")  # no LTP: depth is all we have
    assert safe_close_side(D("0"), D("50")) == D("50")


def test_cl03774299_portfolio_would_not_have_stopped_out():
    # (side, qty, avg, ltp, close-side depth) at 16:45 IST on 10 Nov.
    legs = [
        ("BUY", 120, "264.5", "216.5", "25"),     # SILVER 240000CE
        ("SELL", 240, "213.5", "182", "178"),     # SILVER 250000CE
        ("BUY", 50, "217.3", "142.5", "156.5"),   # SILVERM 240000CE
        ("SELL", 100, "163.3", "132.5", "137"),   # SILVERM 250000CE
        ("BUY", 800, "8.9", "6.3", "0.10"),       # CRUDE 12000CE
        ("SELL", 1600, "6.9", "5.4", "20"),       # CRUDE 13000CE
    ]

    def m2m(guarded: bool) -> Decimal:
        total = D(0)
        for side, qty, avg, ltp, depth in legs:
            mark = (safe_close_side(D(ltp), D(depth)) if guarded else D(depth)) or D(ltp)
            q = D(qty) if side == "BUY" else -D(qty)
            total += (mark - D(avg)) * q
        return total

    assert m2m(guarded=False) == D("-48630.0")  # what the risk enforcer saw
    assert m2m(guarded=True) > 0  # with the guard: no drawdown, no stop-out
