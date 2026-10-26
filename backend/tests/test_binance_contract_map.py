"""Which Binance contract feeds which instrument.

One function answers this for the live quote, the fast lane and the chart's
candles, so it gets a test rather than a comment. A wrong guess prices one
instrument off another's contract.

    cd backend && .venv/bin/python -m pytest -q tests/test_binance_contract_map.py
"""

from __future__ import annotations

import pytest

from app.services.binance_futures_service import contract_for

KNOWN = {
    "XAUUSDT", "XAGUSDT", "XPTUSDT", "XPDUSDT", "CLUSDT", "BZUSDT",
    "NATGASUSDT", "COPPERUSDT", "BTCUSDT", "ETHUSDT", "POLUSDT",
    "AAPLUSDT", "QQQUSDT", "LLYUSDT",
}


@pytest.mark.parametrize(
    ("platform", "contract"),
    [
        # Renames — nothing about "USOIL" suggests "CL".
        ("USOIL", "CLUSDT"),
        ("UKOIL", "BZUSDT"),
        ("XAUUSD", "XAUUSDT"),
        ("XAGUSD", "XAGUSDT"),
        ("NATGAS", "NATGASUSDT"),
        # The USD→USDT swap our crypto instruments already rely on.
        ("BTCUSD", "BTCUSDT"),
        ("POLUSD", "POLUSDT"),
        # Plain quote suffix.
        ("AAPL", "AAPLUSDT"),
        ("LLY", "LLYUSDT"),
        # The contract name itself.
        ("QQQUSDT", "QQQUSDT"),
    ],
)
def test_resolution(platform, contract):
    assert contract_for(platform, KNOWN) == contract


def test_an_unlisted_symbol_resolves_to_nothing():
    """Must be None, not a guess — forex and CFD indices stay on Infoway."""
    assert contract_for("NIFTY", KNOWN) is None
    assert contract_for("", KNOWN) is None
    assert contract_for("EURUSD", KNOWN) is None
    assert contract_for("US30", KNOWN) is None
