"""Zerodha dual-account feed routing + HA failover config — singleton row.

Decides which Kite account (A = index 0, B = index 1) each exchange's live
tokens subscribe on, and the health/anti-flap knobs the failover controller
(`zerodha_service.feed_failover_loop`) uses.

Operator intent (2026-07): Account A = NSE/BSE (+ their F&O), Account B = MCX.
If EITHER account's WebSocket goes down, its exchanges automatically fail over
to the surviving account so the feed NEVER stops. When the down account
recovers, its exchanges route back (with hysteresis so a flapping socket does
not thrash re-subscriptions).

One document only — resolved via `ZerodhaFeedRouting.find_one()` with a
seed-on-miss default. `exchange_account_map` keys are Kite exchange codes
(NSE, BSE, NFO, BFO, CDS, MCX, ...); values are the account index (0 or 1).
A missing exchange key defaults to Account A (0).
"""

from __future__ import annotations

from app.models._base import TimestampMixin

# Default assignment: everything on Account A except commodities (MCX) on
# Account B. Keys are Kite exchange codes as they appear on
# `Instrument.exchange` / the subscribed-instrument metadata.
DEFAULT_EXCHANGE_ACCOUNT_MAP: dict[str, int] = {
    "NSE": 0,   # NSE equity
    "BSE": 0,   # BSE equity
    "NFO": 0,   # NSE F&O (NIFTY / BANKNIFTY / stock options)
    "BFO": 0,   # BSE F&O (SENSEX / BANKEX)
    "CDS": 0,   # NSE currency
    "BCD": 0,   # BSE currency
    "MCX": 1,   # commodities → Account B
}


class ZerodhaFeedRouting(TimestampMixin):
    # Kite exchange code -> account index (0 = A, 1 = B). Missing key -> 0.
    exchange_account_map: dict[str, int] = DEFAULT_EXCHANGE_ACCOUNT_MAP.copy()

    # Master switch. When False, routing collapses to "everything on the
    # single healthy account" and no cross-account failover moves happen
    # (behaves like the legacy single-account pool). Kept True in production.
    failover_enabled: bool = True

    # Anti-flap hysteresis for the failover controller:
    #  • an account must stay DOWN this long before its exchanges fail over,
    #  • and stay UP this long before they fail back — so a socket that
    #    reconnects/drops every few seconds does not thrash re-subscriptions.
    failover_confirm_down_sec: int = 5
    failback_confirm_up_sec: int = 25

    class Settings:
        name = "zerodha_feed_routing"
