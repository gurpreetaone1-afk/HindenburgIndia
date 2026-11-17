"""The fast tick parser must give exactly what the original field-by-field
port gave, except depth now keeps only the best level (the only one read)."""
import random
import struct
from typing import Any

from app.services.zerodha_service import ZerodhaService


# Original implementation, kept verbatim as the reference.
def reference_parse(packet: bytes) -> dict[str, Any] | None:
    length = len(packet)

    def u32(o: int) -> int:
        return struct.unpack(">I", packet[o:o + 4])[0]

    def u16(o: int) -> int:
        return struct.unpack(">H", packet[o:o + 2])[0]

    token = u32(0)
    # The last byte of the token encodes the exchange segment, which
    # determines the price divisor (currency segments use 10^7 / 10^4,
    # everything else paise → /100). Segment 9 = indices (no depth).
    segment = token & 0xFF
    if segment == 3:  # NSE CDS
        divisor = 10000000.0
    elif segment == 6:  # BSE CDS (BCD)
        divisor = 10000.0
    else:
        divisor = 100.0
    is_index = segment == 9

    tick: dict[str, Any] = {"instrument_token": token}

    # LTP mode (8 bytes)
    if length == 8:
        tick["last_price"] = u32(4) / divisor
        return tick

    # Indices: quote (28 bytes) / full (32 bytes) — no market depth.
    if is_index:
        ltp = u32(4) / divisor
        close = u32(20) / divisor
        tick["last_price"] = ltp
        tick["ohlc"] = {
            "high": u32(8) / divisor,
            "low": u32(12) / divisor,
            "open": u32(16) / divisor,
            "close": close,
        }
        tick["change"] = ((ltp - close) / close * 100) if close else 0.0
        if length >= 32:
            tick["exchange_timestamp"] = u32(28)
        return tick

    # Tradable instruments: quote (44 bytes) / full (184 bytes).
    if length >= 44:
        ltp = u32(4) / divisor
        close = u32(40) / divisor
        tick["last_price"] = ltp
        tick["last_traded_quantity"] = u32(8)
        tick["average_traded_price"] = u32(12) / divisor
        tick["volume_traded"] = u32(16)
        tick["total_buy_quantity"] = u32(20)
        tick["total_sell_quantity"] = u32(24)
        tick["ohlc"] = {
            "open": u32(28) / divisor,
            "high": u32(32) / divisor,
            "low": u32(36) / divisor,
            "close": close,
        }
        tick["change"] = ((ltp - close) / close * 100) if close else 0.0

    if length >= 184:
        tick["last_trade_time"] = u32(44)
        tick["oi"] = u32(48)
        tick["oi_day_high"] = u32(52)
        tick["oi_day_low"] = u32(56)
        tick["exchange_timestamp"] = u32(60)
        depth: dict[str, list[dict[str, Any]]] = {"buy": [], "sell": []}
        o = 64
        for _ in range(5):
            depth["buy"].append(
                {"quantity": u32(o), "price": u32(o + 4) / divisor, "orders": u16(o + 8)}
            )
            o += 12
        for _ in range(5):
            depth["sell"].append(
                {"quantity": u32(o), "price": u32(o + 4) / divisor, "orders": u16(o + 8)}
            )
            o += 12
        tick["depth"] = depth

    return tick



def _packet(segment: int, length: int, rnd: random.Random) -> bytes:
    token = (rnd.randrange(1, 1 << 23) << 8) | segment
    body = bytes(rnd.randrange(256) for _ in range(length - 4))
    return struct.pack(">I", token) + body


def test_fast_parser_matches_reference():
    rnd = random.Random(7)
    for segment in (1, 2, 3, 5, 6, 9):
        lengths = (8, 28, 32) if segment == 9 else (8, 44, 184)
        for length in lengths:
            for _ in range(300):
                pkt = _packet(segment, length, rnd)
                want = reference_parse(pkt)
                got = ZerodhaService._parse_tick_packet(pkt)
                if "depth" in want:
                    want["depth"] = {side: levels[:1] for side, levels in want["depth"].items()}
                assert got == want, (segment, length)
