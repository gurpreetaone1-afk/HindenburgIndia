"""Position + Holding maintenance.

Called by the matching engine on each fill: updates the user's open Position
(or closes one out), maintains the per-(user,segment,instrument) tracker,
and for CNC trades writes/updates the long-term Holding record.
"""

from __future__ import annotations

from decimal import Decimal
from datetime import datetime, timedelta, timezone
from typing import Any

from beanie import PydanticObjectId
from bson import Decimal128
from pymongo.errors import DuplicateKeyError

from app.models._base import OrderAction, ProductType
from app.models.holding import Holding
from app.models.order import InstrumentRef
from app.models.position import Position, PositionStatus, UserPositionTracker
from app.utils.decimal_utils import (
    ZERO,
    add,
    quantize_money,
    sub,
    to_decimal,
    to_decimal128,
)
from app.utils.time_utils import now_utc

import logging

logger = logging.getLogger(__name__)


# ── Lot-basis realization ───────────────────────────────────────────────
# A position is netted per (user, token, product) at a weighted-average price,
# but users close individual LOTS: Active Trades lists every fill with its own
# entry and its Exit tags the closing order with that lot's price
# (`cost_basis_override`); the Closed blotter shows each close against the lot
# it removed (that lot, else FIFO). Booking the wallet at the AVERAGE made a
# close's money differ from what the trade showed (totals matched, the split
# didn't) — e.g. lots 130@118.80 + 65@111.55, exit the 111.55 lot at 89.30:
# the average booked −1,760.20 while the trade showed −1,446.25. Realizing at
# the basis of the lots actually removed makes wallet == blotter per close,
# and the surviving lots keep their own prices (remaining avg = theirs).

_LOT_EPS = Decimal("0.000001")


def _take_lots(lots: list[list[Decimal]], qty: Decimal, pick: Decimal | None) -> Decimal:
    """Remove `qty` from `lots` ([[price, qty], …] oldest first, mutated in
    place, order kept): the lot priced at `pick` first (specific-lot exit),
    then FIFO. Returns the removed cost Σ price × qty; ValueError if short."""
    cost = Decimal(0)
    left = qty
    if pick is not None and lots:
        i = min(range(len(lots)), key=lambda k: abs(lots[k][0] - pick))
        if abs(lots[i][0] - pick) <= max(Decimal("0.01"), abs(pick) * Decimal("0.0001")):
            take = min(lots[i][1], left)
            cost += lots[i][0] * take
            lots[i][1] -= take
            left -= take
            if lots[i][1] <= _LOT_EPS:
                lots.pop(i)
    while left > _LOT_EPS and lots:
        take = min(lots[0][1], left)
        cost += lots[0][0] * take
        lots[0][1] -= take
        left -= take
        if lots[0][1] <= _LOT_EPS:
            lots.pop(0)
    if left > _LOT_EPS:
        raise ValueError("close exceeds open lots")
    return cost


def _lots_from_fills(fills: list[Any], held: Decimal, avg: Decimal) -> list[list[Decimal]] | None:
    """Open lots left after replaying a position cycle's fills (oldest first).
    None when they don't reconcile with the position's qty / average — e.g. a
    price edited by an admin, a weekly settlement, a flip, or a position opened
    before lot-basis booking existed — so callers fall back to the average."""
    if held == 0:
        return None
    open_side = OrderAction.BUY if held > 0 else OrderAction.SELL
    lots: list[list[Decimal]] = []
    try:
        for t in fills:
            q = abs(to_decimal(t.quantity))
            px = to_decimal(t.price)
            if q <= 0 or px <= 0:
                continue
            if t.action == open_side and t.pnl_inr is None:
                lots.append([px, q])
            else:
                cbo = getattr(t, "cost_basis_override", None)
                _take_lots(lots, q, to_decimal(cbo) if cbo is not None else None)
    except ValueError:
        return None
    total = sum((q for _, q in lots), Decimal(0))
    if total <= 0 or abs(total - abs(held)) > abs(held) * _LOT_EPS + _LOT_EPS:
        return None
    lots_avg = sum((p * q for p, q in lots), Decimal(0)) / total
    # The stored average is 2-dp rounded on every pyramid fill; anything beyond
    # that rounding means the price changed outside these fills.
    if abs(lots_avg - avg) > Decimal("0.01") * (len(lots) + 1):
        return None
    return lots


async def close_basis(
    pos: Position, closed_qty: Decimal, cost_basis_override: Any = None
) -> tuple[Decimal, Decimal | None]:
    """(per-unit cost basis of the lots this close removes, avg price of the
    lots left — None if none). Falls back to (avg_price, None), the old
    average-cost booking, whenever the fills don't reconcile."""
    from datetime import timedelta
    from app.models.trade import Trade

    avg = to_decimal(pos.avg_price)
    try:
        start = getattr(pos, "reopened_at", None) or pos.opened_at
        if start is None or closed_qty <= 0:
            return avg, None
        fills = (
            await Trade.find(
                {
                    "user_id": pos.user_id,
                    "instrument.token": pos.instrument.token,
                    "product_type": pos.product_type.value,
                    "executed_at": {"$gte": start - timedelta(seconds=5)},
                }
            )
            .sort("+executed_at")
            .to_list()
        )
        lots = _lots_from_fills(fills, to_decimal(pos.quantity), avg)
        if not lots:
            return avg, None
        pick = to_decimal(cost_basis_override) if cost_basis_override is not None else None
        basis = _take_lots(lots, closed_qty, pick) / closed_qty
        left = sum((q for _, q in lots), Decimal(0))
        rem_avg = sum((p * q for p, q in lots), Decimal(0)) / left if left > _LOT_EPS else None
        if abs(basis - avg) > Decimal("0.005"):
            logger.info(
                "lot_basis_close",
                extra={"pos_id": str(pos.id), "avg": str(avg), "basis": str(basis), "qty": str(closed_qty)},
            )
        return basis, rem_avg
    except Exception:
        logger.exception("close_basis_failed pos=%s", getattr(pos, "id", None))
        return avg, None


async def apply_fill(
    *,
    user_id: PydanticObjectId,
    instrument: InstrumentRef,
    segment_type: str,
    action: OrderAction,
    product_type: ProductType,
    quantity: float,
    price: Decimal,
    margin_used: Decimal,
    stop_loss: Decimal | None = None,
    target: Decimal | None = None,
    is_demo: bool = False,
    close_basis: Decimal | None = None,
    remaining_avg: Decimal | None = None,
    _retry: int = 0,
) -> Position:
    """Idempotent-ish: looks up an open position for this instrument+product
    and merges. For opposite-side fills it reduces and may close out."""
    pos = await Position.find_one(
        Position.user_id == user_id,
        Position.instrument.token == instrument.token,  # type: ignore[union-attr]
        Position.product_type == product_type,
        Position.status == PositionStatus.OPEN,
    )

    signed_qty = quantity if action == OrderAction.BUY else -quantity

    # Capture the prevailing USD/INR rate at the moment of fill — used later
    # to convert P&L on USD-quoted instruments (BTCUSD, EURUSD, …) into INR.
    # ``None`` for instruments already priced in INR.
    from app.services.market_data_service import get_usd_inr_rate, is_usd_quoted_segment

    open_fx_rate = (
        Decimal128(str(round(get_usd_inr_rate(), 4)))
        if is_usd_quoted_segment(segment_type) or is_usd_quoted_segment(instrument.segment)
        else None
    )

    if pos is None:
        pos = Position(
            user_id=user_id,
            instrument=instrument,
            segment_type=segment_type,
            product_type=product_type,
            quantity=signed_qty,
            # Stamp the side at open so the Closed-tab card knows whether
            # the user originally went long or short, even after quantity
            # is reduced to 0 by the closing leg.
            opened_side=action,
            opening_quantity=abs(signed_qty),
            avg_price=Decimal128(str(price)),
            ltp=Decimal128(str(price)),
            margin_used=Decimal128(str(margin_used)),
            stop_loss=Decimal128(str(stop_loss)) if stop_loss is not None else None,
            target=Decimal128(str(target)) if target is not None else None,
            open_usd_inr_rate=open_fx_rate,
            opened_at=now_utc(),
            status=PositionStatus.OPEN,
            is_demo=is_demo,
        )
        try:
            await pos.insert()
        except DuplicateKeyError:
            # RACE: a concurrent fill for the same (user, token, product)
            # created the OPEN position between our find_one above and this
            # insert. The partial-unique index on OPEN positions rejects the
            # second row — this is the root cause of same-stock fragmentation
            # across order types (e.g. a MARKET fill racing a pending LIMIT /
            # SL-M fire in the 1.5 s poller). Retry the whole fill: find_one
            # now sees the winning row and MERGES this leg into it (weighted
            # avg / reduce / flip) instead of leaving two rows with a stale
            # average. Bounded so a pathological repeat can't recurse forever.
            if _retry >= 3:
                raise
            return await apply_fill(
                user_id=user_id,
                instrument=instrument,
                segment_type=segment_type,
                action=action,
                product_type=product_type,
                quantity=quantity,
                price=price,
                margin_used=margin_used,
                stop_loss=stop_loss,
                target=target,
                is_demo=is_demo,
                close_basis=close_basis,
                remaining_avg=remaining_avg,
                _retry=_retry + 1,
            )
    else:
        cur_qty = pos.quantity
        new_qty = cur_qty + signed_qty
        cur_avg = to_decimal(pos.avg_price)

        # The position's `margin_used` represents how much wallet margin is
        # currently locked against this position. It must scale with
        # |quantity|, NOT just accumulate on every fill — otherwise SELL
        # legs that close a long add margin on top of the BUY margin instead
        # of releasing it, and the field grows by ~2× per round-trip cycle.
        # We compute the new margin_used below based on what kind of fill
        # this is, then assign it in one place.
        new_margin_used: Decimal | None = None

        # Whether the new order's bracket SL/TP should overwrite what's on
        # the position. Only the SAME-direction paths (fresh re-open after
        # close, same-side pyramid, or the new-direction half of a flip)
        # carry SL/TP that make sense for the surviving position. A
        # closing leg's bracket is for THAT closing trade — applying it
        # to the (still-open) original-direction position puts the SL/TP
        # on the wrong side of avg_price, which the risk-enforcer's
        # self-heal then clears the next tick. That's the
        # "SL/TP set kiya par position se gayab ho gaya" symptom.
        apply_brackets = False
        if cur_qty == 0:
            # Previously closed position being reopened on this fill.
            pos.avg_price = Decimal128(str(price))
            pos.quantity = signed_qty
            # Reopen — reset the recorded opening side to the new direction.
            pos.opened_side = action
            pos.opening_quantity = abs(signed_qty)
            new_margin_used = to_decimal(margin_used)
            apply_brackets = True
        elif (cur_qty > 0 and signed_qty > 0) or (cur_qty < 0 and signed_qty < 0):
            # Same side (pyramiding): weighted avg, ADD the new leg's margin.
            total = to_decimal(abs(cur_qty) + abs(signed_qty))
            pos.avg_price = Decimal128(
                str(quantize_money((cur_avg * to_decimal(abs(cur_qty)) + price * to_decimal(abs(signed_qty))) / total))
            )
            pos.quantity = new_qty
            pos.opening_quantity = max(float(pos.opening_quantity or 0), abs(new_qty))
            new_margin_used = to_decimal(pos.margin_used) + to_decimal(margin_used)
            apply_brackets = True
        else:
            # Opposite side: realize PnL on the closed portion + release
            # margin proportional to how much of the original was closed.
            closed_qty = min(abs(cur_qty), abs(signed_qty))
            sign = 1 if cur_qty > 0 else -1
            # Realize at the basis of the lots this close removes (passed in
            # by the matching engine — see close_basis); else the average.
            basis = close_basis if close_basis is not None else cur_avg
            realized = (price - basis) * to_decimal(closed_qty) * sign
            pos.realized_pnl = Decimal128(str(quantize_money(to_decimal(pos.realized_pnl) + realized)))
            pos.quantity = new_qty
            if new_qty == 0:
                # Fully closed: all locked margin against this position is freed.
                pos.status = PositionStatus.CLOSED
                pos.closed_at = now_utc()
                if pos.open_usd_inr_rate is not None and pos.close_usd_inr_rate is None:
                    pos.close_usd_inr_rate = Decimal128(str(round(get_usd_inr_rate(), 4)))
                new_margin_used = to_decimal(0)
                # Snapshot the live SL / TP BEFORE we clear them, so the
                # Closed-tab card on the user side can still surface
                # "Trade had SL ₹X, TP ₹Y" — even though the live fields
                # are about to be wiped to keep reopens clean. Operator's
                # 22-May spec: user ko close trade me bhi visible rahe
                # ki SL/TP kitna laga tha.
                if pos.stop_loss is not None and pos.close_stop_loss is None:
                    pos.close_stop_loss = pos.stop_loss
                if pos.target is not None and pos.close_target is None:
                    pos.close_target = pos.target
                # Position is closing — clear any SL/TP that were on it so a
                # later re-open on the same instrument doesn't inherit stale
                # brackets from a long-gone direction. `apply_brackets` stays
                # False; the closing order's own bracket is meaningless here.
                pos.stop_loss = None
                pos.target = None
            elif (cur_qty > 0 and new_qty < 0) or (cur_qty < 0 and new_qty > 0):
                # Flipped sides — the closing leg fully cleared the original
                # direction; whatever of `signed_qty` remained opened a new
                # opposite position. Margin = the portion of the new order
                # margin that backs the remaining qty.
                pos.avg_price = Decimal128(str(price))
                # Flip — record the new active direction so the Closed-tab
                # card (and anyone else reading `opened_side`) reflects the
                # surviving leg, not the one that was just flattened.
                pos.opened_side = action
                pos.opening_quantity = abs(new_qty)
                if open_fx_rate is not None:
                    pos.open_usd_inr_rate = open_fx_rate
                flip_ratio = to_decimal(abs(new_qty)) / to_decimal(abs(signed_qty))
                new_margin_used = to_decimal(margin_used) * flip_ratio
                # Direction flipped — old SL/TP were positioned for the OLD
                # direction (e.g. SL above entry for a SHORT). On the new
                # opposite-side position they'd be on the wrong side of the
                # new avg and self-heal would clear them anyway. Wipe up
                # front so the bracket from THIS order (if any) cleanly
                # replaces them via apply_brackets below.
                pos.stop_loss = None
                pos.target = None
                apply_brackets = True
            else:
                # Partial close on same side: scale the existing margin down
                # to the remaining quantity ratio. (The SELL order itself
                # doesn't add new locked margin — it releases existing.)
                scale = to_decimal(abs(new_qty)) / to_decimal(abs(cur_qty))
                new_margin_used = to_decimal(pos.margin_used) * scale
                # The surviving lots keep their own prices, so the average is
                # theirs (lot-basis booking); unchanged when it's unknown.
                if remaining_avg is not None:
                    pos.avg_price = Decimal128(str(remaining_avg.quantize(Decimal("0.000001"))))
                # apply_brackets stays False — the surviving position is in
                # its original direction with its original avg, so existing
                # SL/TP remain valid (if any). The closing order's bracket
                # was sized for the closing direction and would land on the
                # wrong side if we wrote it onto the surviving position.

        pos.ltp = Decimal128(str(price))
        if new_margin_used is not None:
            # Floor at 0 so accumulated rounding can't drive it negative.
            if new_margin_used < 0:
                new_margin_used = to_decimal(0)
            pos.margin_used = Decimal128(str(quantize_money(new_margin_used)))
        # Carry over SL/TP from the originating Order ONLY on paths where
        # the new order opens / extends exposure in the surviving
        # position's direction (see apply_brackets logic above). Latest
        # bracket wins over the existing one — matches Zerodha's behaviour
        # so the user can update bracket SL/TP by placing a fresh order.
        if apply_brackets:
            if stop_loss is not None:
                pos.stop_loss = Decimal128(str(stop_loss))
            if target is not None:
                pos.target = Decimal128(str(target))
        await pos.save()

    # Tracker — RECOMPUTE from the live Position rows for this
    # (user, instrument) rather than incrementally adjusting by delta_lots.
    # Delta-based updates drift over time (partial fills retried by the
    # network, position flips where signed_qty crosses zero, mid-fill
    # backend restarts, etc.) — symptom: `holding_lots=47` on an
    # instrument with NO open position, which then blocks every future
    # buy/sell because the validator reads stale lots.
    # Recomputing from the authoritative Position docs after each fill
    # turns the tracker into a derived cache that can never drift past
    # one fill. Self-heal job (see periodic reconciler) catches any
    # historical drift.
    await _recompute_tracker(
        user_id=user_id, segment_type=segment_type, token=instrument.token
    )

    # CNC also updates long-term Holding
    if product_type == ProductType.CNC:
        await _apply_holding(
            user_id=user_id,
            instrument=instrument,
            action=action,
            quantity=quantity,
            price=price,
        )

    # Notify admin dashboards — every fill (matching-engine market fill,
    # SL/TP hit, user squareoff, admin force-close) routes through here
    # so one publish at the bottom of `apply_fill` covers all of them.
    # Fire-and-forget; failures are swallowed inside `publish_admin_event`.
    try:
        from app.services.admin_events import publish_admin_event

        await publish_admin_event(
            "position_update",
            {
                "event": "fill",
                "user_id": str(user_id),
                "position_id": str(pos.id),
                "status": pos.status.value,
            },
        )
    except Exception:  # pragma: no cover
        pass

    return pos


async def settle_expired_position(
    pos: Position,
    *,
    settlement_price: Decimal | None = None,
    reason: str = "EXPIRY_SETTLED",
) -> str:
    """Force-close ONE open position whose underlying contract has expired.

    Why this exists: ``expiry_cleanup`` unsubscribes an expired contract's
    token from the live feed and marks the instrument inactive — but it
    never closed open positions in that contract. The result was *zombie*
    positions: the risk-enforcer can never price a dead/unsubscribed token,
    so it silently SKIPS SL/TP/stop-out for them every tick
    (``risk_ltp_fetch_failed`` flood), the position sits OPEN forever and
    the user's margin stays locked. This settles the position once at the
    last-known price and releases that margin.

    Unlike ``weekly_settlement`` (which carries the exposure forward by
    re-opening a fresh row), this does NOT re-open — the contract is dead —
    and it DOES release the locked margin.

    Settlement-price selection (never books at 0):
      1. explicit ``settlement_price`` arg, else
      2. live LTP if the token still ticks (first day-after sweep), else
      3. the position's own frozen ``ltp`` (last-good tick before expiry).
    Returns ``"skipped"`` if no usable (>0) price exists so a later run can
    retry; ``"settled"`` on success; ``"failed"`` on error.

    Idempotent at the caller level: operates only on OPEN rows and flips
    status→CLOSED, so a repeat sweep won't double-book.
    """
    import logging as _logging

    from app.core.exceptions import InsufficientFundsError
    from app.models.transaction import TransactionType
    from app.services import market_data_service, wallet_service
    from app.services.market_data_service import (
        get_usd_inr_rate,
        is_usd_quoted_segment,
    )

    log = _logging.getLogger(__name__)

    if pos.status != PositionStatus.OPEN:
        return "skipped"
    qty_signed = float(pos.quantity or 0)
    if abs(qty_signed) < 1e-9:
        return "skipped"

    token = pos.instrument.token

    # ── Resolve a non-zero settlement price ──────────────────────────
    settle = (
        quantize_money(to_decimal(settlement_price))
        if settlement_price is not None
        else ZERO
    )
    if settle <= ZERO:
        try:
            settle = quantize_money(to_decimal(await market_data_service.get_ltp(token)))
        except Exception:  # noqa: BLE001
            settle = ZERO
    if settle <= ZERO:
        settle = quantize_money(to_decimal(pos.ltp))
    if settle <= ZERO:
        # No usable price anywhere — never settle at 0. Leave OPEN so a
        # later run (with an admin-supplied price) can settle it.
        log.info(
            "expiry_settlement_skip_no_price pos=%s token=%s symbol=%s",
            pos.id,
            token,
            pos.instrument.symbol,
        )
        return "skipped"

    # ── Realized P&L — identical formula to matching_engine / weekly ──
    avg = to_decimal(pos.avg_price)
    closed_qty = to_decimal(abs(qty_signed))
    sign = Decimal(1) if qty_signed > 0 else Decimal(-1)
    realized = (settle - avg) * closed_qty * sign

    is_usd = is_usd_quoted_segment(pos.segment_type) or is_usd_quoted_segment(
        pos.instrument.segment
    )
    fx_rate: Decimal | None = None
    if is_usd:
        fx_rate = to_decimal(round(get_usd_inr_rate(), 4))
        realized = realized * fx_rate
    realized = quantize_money(realized)

    try:
        # 1) Release the full margin locked against this (now-dead) position.
        margin = to_decimal(pos.margin_used)
        if margin > ZERO:
            await wallet_service.release_margin(pos.user_id, margin)

        # 2) Book realized P&L. Losses past available balance fall back to
        #    force_debit → settlement_outstanding (same as the stop-out path);
        #    this is a forced close so it must complete.
        if realized != ZERO:
            narration = (
                f"Expiry settlement: {'profit' if realized > 0 else 'loss'} "
                f"on {pos.instrument.symbol}"
            )
            try:
                await wallet_service.adjust(
                    pos.user_id,
                    realized,
                    transaction_type=TransactionType.PNL,
                    narration=narration,
                    reference_type="EXPIRY_SETTLEMENT",
                    reference_id=str(pos.id),
                )
            except InsufficientFundsError:
                if realized < ZERO:
                    await wallet_service.force_debit(
                        pos.user_id,
                        -realized,
                        transaction_type=TransactionType.PNL,
                        narration=f"{narration} (shortfall booked to outstanding)",
                        reference_type="EXPIRY_SETTLEMENT",
                        reference_id=str(pos.id),
                    )
                else:
                    raise

        # 3) Close the position for good (no re-open — contract is dead).
        now = now_utc()
        pos.status = PositionStatus.CLOSED
        pos.closed_at = now
        pos.close_reason = reason
        pos.ltp = Decimal128(str(settle))
        pos.realized_pnl = Decimal128(
            str(quantize_money(to_decimal(pos.realized_pnl) + realized))
        )
        pos.unrealized_pnl = Decimal128("0")
        pos.quantity = 0.0
        pos.margin_used = Decimal128("0")
        if (
            is_usd
            and fx_rate is not None
            and pos.open_usd_inr_rate is not None
            and pos.close_usd_inr_rate is None
        ):
            pos.close_usd_inr_rate = Decimal128(str(fx_rate))
        if pos.stop_loss is not None and pos.close_stop_loss is None:
            pos.close_stop_loss = pos.stop_loss
        if pos.target is not None and pos.close_target is None:
            pos.close_target = pos.target
        pos.stop_loss = None
        pos.target = None
        await pos.save()

        # 4) Tracker recompute — drift-immune (old OPEN row is now CLOSED).
        try:
            await _recompute_tracker(
                user_id=pos.user_id,
                segment_type=pos.segment_type,
                token=token,
            )
        except Exception:  # noqa: BLE001
            log.exception("expiry_settlement_tracker_recompute_failed pos=%s", pos.id)

        # 5) Best-effort UI refresh — never fail the settlement on Redis.
        try:
            from app.core.redis_client import publish

            await publish(
                f"user:{pos.user_id}:positions",
                {"type": "positions", "payload": {"reason": "expiry_settlement"}},
            )
        except Exception:  # noqa: BLE001
            pass

        log.info(
            "expiry_settlement_settled",
            extra={
                "user_id": str(pos.user_id),
                "position_id": str(pos.id),
                "symbol": pos.instrument.symbol,
                "settle_price": str(settle),
                "realized_pnl": str(realized),
                "margin_released": str(margin),
            },
        )
        return "settled"
    except Exception:  # noqa: BLE001
        log.exception(
            "expiry_settlement_failed pos=%s user=%s symbol=%s",
            pos.id,
            pos.user_id,
            pos.instrument.symbol,
        )
        return "failed"


async def _recompute_tracker(
    *,
    user_id: PydanticObjectId,
    segment_type: str,
    token: str,
) -> None:
    """Source-of-truth tracker rebuild.

    Sums the open `Position` rows for this (user, instrument) and writes
    the result into `UserPositionTracker`. Replaces the older
    `_bump_tracker` delta-increment path which drifted whenever a fill
    retry / position flip / mid-flow restart skewed the running counter
    (production symptom: BTCUSD `holding_lots=47` with zero open
    positions, blocking every subsequent order via the validator's
    holding-limit check).

    Idempotent — running it twice with the same DB state produces the
    same tracker row.
    """
    open_positions = await Position.find(
        Position.user_id == user_id,
        Position.instrument.token == token,  # type: ignore[union-attr]
        Position.status == PositionStatus.OPEN,
    ).to_list()

    intraday_lots = 0.0
    holding_lots = 0.0
    margin_blocked: Decimal = ZERO

    for p in open_positions:
        # Lot size 0 / missing on legacy rows → treat as 1 so |qty| ÷ 1
        # = qty (matches the pre-fix behaviour for those rows).
        lot_size = max(1, int(p.instrument.lot_size or 1))
        lots = abs(float(p.quantity or 0)) / lot_size
        if p.product_type == ProductType.MIS:
            intraday_lots += lots
        else:
            holding_lots += lots
        margin_blocked = add(margin_blocked, to_decimal(p.margin_used or 0))

    t = await UserPositionTracker.find_one(
        UserPositionTracker.user_id == user_id,
        UserPositionTracker.segment_type == segment_type,
        UserPositionTracker.instrument_token == token,
    )
    if t is None:
        t = UserPositionTracker(
            user_id=user_id, segment_type=segment_type, instrument_token=token
        )
    t.intraday_lots = intraday_lots
    t.holding_lots = holding_lots
    t.total_lots = intraday_lots + holding_lots
    t.margin_blocked = to_decimal128(margin_blocked)
    await t.save()


async def reconcile_all_trackers() -> dict[str, int]:
    """Platform-wide tracker reconciliation. Walks every tracker row in
    the system and rebuilds it from the live Position docs.

    Cheap because the unique index on `user_position_tracker` is
    (user_id, segment_type, instrument_token) — each recompute is one
    indexed Position query. On a system with N users and avg M tracker
    rows per user, total work is O(N·M) but each unit is sub-millisecond.

    Designed to be called by a slow background loop (15-30 min cadence)
    so any drift introduced by a bug or unexpected restart self-heals
    without operator intervention. Returns a summary the loop logs.
    """
    import logging

    log = logging.getLogger(__name__)
    trackers = await UserPositionTracker.find_all().to_list()
    scanned = 0
    repaired = 0
    deleted = 0
    for t in trackers:
        scanned += 1
        before = (t.intraday_lots, t.holding_lots)
        try:
            await _recompute_tracker(
                user_id=t.user_id,
                segment_type=t.segment_type,
                token=t.instrument_token,
            )
        except Exception:
            log.warning(
                "tracker_reconcile_failed user=%s token=%s",
                t.user_id,
                t.instrument_token,
                exc_info=True,
            )
            continue
        fresh = await UserPositionTracker.find_one(
            UserPositionTracker.user_id == t.user_id,
            UserPositionTracker.segment_type == t.segment_type,
            UserPositionTracker.instrument_token == t.instrument_token,
        )
        if fresh is None:
            continue
        if (fresh.intraday_lots, fresh.holding_lots) != before:
            repaired += 1
        if (
            fresh.intraday_lots == 0
            and fresh.holding_lots == 0
            and to_decimal(fresh.margin_blocked or 0) == ZERO
        ):
            still_open = await Position.find_one(
                Position.user_id == t.user_id,
                Position.instrument.token == fresh.instrument_token,  # type: ignore[union-attr]
                Position.status == PositionStatus.OPEN,
            )
            if still_open is None:
                await fresh.delete()
                deleted += 1
    if repaired or deleted:
        log.info(
            "tracker_reconcile scanned=%s repaired=%s deleted=%s",
            scanned,
            repaired,
            deleted,
        )
    return {"scanned": scanned, "repaired": repaired, "deleted": deleted}


_tracker_loop_stop = False


def stop_tracker_reconcile_loop() -> None:
    global _tracker_loop_stop
    _tracker_loop_stop = True


async def tracker_reconcile_loop(interval_sec: float = 900.0) -> None:
    """Background self-heal — recomputes every tracker row from positions
    every `interval_sec` (default 15 min). Catches any historical drift
    that would otherwise block users via the order validator's
    holding/intraday limit checks.

    Safe to run alongside live fills: `_recompute_tracker` is idempotent
    and races resolve to the latest Position state on its next pass.
    """
    import asyncio as _asyncio
    import logging

    log = logging.getLogger(__name__)
    log.info("tracker_reconcile_loop starting interval_sec=%s", interval_sec)
    # Initial 60-second delay so we don't fight boot-time tasks for the
    # connection pool.
    try:
        await _asyncio.sleep(60.0)
    except Exception:
        return
    while not _tracker_loop_stop:
        try:
            await reconcile_all_trackers()
            # Wallet used_margin reconcile runs alongside the tracker
            # reconcile so any drift introduced by an unexpected
            # restart / admin hard-delete / partial-close math
            # mismatch heals automatically within one cycle.
            try:
                from app.services import wallet_service as _ws

                await _ws.reconcile_all_used_margins()
            except Exception:
                log.warning(
                    "wallet_used_margin_reconcile_iteration_failed",
                    exc_info=True,
                )
        except Exception:
            log.warning("tracker_reconcile_loop_iteration_failed", exc_info=True)
        try:
            await _asyncio.sleep(interval_sec)
        except Exception:
            break


async def reconcile_trackers_for_user(user_id: PydanticObjectId) -> dict[str, int]:
    """Walk every tracker row this user owns and recompute it from the
    live Position docs. Returns a small summary so an admin endpoint /
    cron can log what was repaired.

    Two passes:
      1. Recompute existing tracker rows.
      2. Delete tracker rows that aren't referenced by any open position
         AND now show all-zeros — they're harmless but clutter the
         collection. We only delete the all-zero, no-position case to
         avoid racing with an in-flight fill that's just about to
         create the position.
    """
    trackers = await UserPositionTracker.find(
        UserPositionTracker.user_id == user_id
    ).to_list()
    repaired = 0
    deleted = 0
    for t in trackers:
        before = (t.intraday_lots, t.holding_lots)
        await _recompute_tracker(
            user_id=user_id, segment_type=t.segment_type, token=t.instrument_token
        )
        # Re-read (the helper may have flipped fields)
        fresh = await UserPositionTracker.find_one(
            UserPositionTracker.user_id == user_id,
            UserPositionTracker.segment_type == t.segment_type,
            UserPositionTracker.instrument_token == t.instrument_token,
        )
        if fresh is None:
            continue
        if (fresh.intraday_lots, fresh.holding_lots) != before:
            repaired += 1
        if (
            fresh.intraday_lots == 0
            and fresh.holding_lots == 0
            and to_decimal(fresh.margin_blocked or 0) == ZERO
        ):
            still_open = await Position.find_one(
                Position.user_id == user_id,
                Position.instrument.token == fresh.instrument_token,  # type: ignore[union-attr]
                Position.status == PositionStatus.OPEN,
            )
            if still_open is None:
                await fresh.delete()
                deleted += 1
    return {"scanned": len(trackers), "repaired": repaired, "deleted": deleted}


async def _apply_holding(
    *,
    user_id: PydanticObjectId,
    instrument: InstrumentRef,
    action: OrderAction,
    quantity: float,
    price: Decimal,
) -> None:
    h = await Holding.find_one(
        Holding.user_id == user_id, Holding.instrument.token == instrument.token  # type: ignore[union-attr]
    )
    qty_dec = to_decimal(quantity)
    if h is None:
        if action == OrderAction.BUY:
            h = Holding(
                user_id=user_id,
                instrument=instrument,
                quantity=quantity,
                avg_price=Decimal128(str(price)),
                ltp=Decimal128(str(price)),
                invested_value=Decimal128(str(quantize_money(price * qty_dec))),
                current_value=Decimal128(str(quantize_money(price * qty_dec))),
            )
            await h.insert()
        return

    if action == OrderAction.BUY:
        new_qty = h.quantity + quantity
        denom = to_decimal(max(1.0, new_qty))
        new_avg = quantize_money(
            (to_decimal(h.avg_price) * to_decimal(h.quantity) + price * qty_dec) / denom
        )
        h.quantity = new_qty
        h.avg_price = Decimal128(str(new_avg))
    else:
        # SELL — reduce
        h.quantity = max(0.0, h.quantity - quantity)

    h.ltp = Decimal128(str(price))
    h.invested_value = Decimal128(
        str(quantize_money(to_decimal(h.avg_price) * to_decimal(h.quantity)))
    )
    h.current_value = Decimal128(
        str(quantize_money(to_decimal(h.ltp) * to_decimal(h.quantity)))
    )
    pnl = sub(h.current_value, h.invested_value)
    h.pnl = Decimal128(str(pnl))
    invested = to_decimal(h.invested_value)
    h.pnl_percentage = float((pnl / invested) * 100) if invested > ZERO else 0.0
    if h.quantity == 0:
        await h.delete()
    else:
        await h.save()


async def list_open(user_id: str | PydanticObjectId) -> list[Position]:
    # Newest-opened position FIRST so the just-entered trade lands at
    # the top of the user's Positions tab instead of the bottom.
    # User-flagged: "abhi latest position last me ja raha hai, turat
    # vale ko sabse upar rakho aur jo sabse pehle liya hoga ve last
    # me jaye". Sorting on the server (rather than re-sorting in the
    # frontend on every render) also keeps the active-trades drilldown
    # consistent with the row order shown above it.
    return await (
        Position.find(
            Position.user_id == PydanticObjectId(user_id),
            Position.status == PositionStatus.OPEN,
        )
        .sort("-opened_at")
        .to_list()
    )


async def list_closed_today(user_id: str | PydanticObjectId) -> list[Position]:
    """Closed positions blotter — returns the most recent 200 closes,
    newest first. Previously filtered by `closed_at >= IST midnight`
    which silently hid positions closed yesterday or earlier, so the
    Closed tab rendered empty for traders who hadn't closed anything
    today. We keep the legacy name to avoid touching every caller,
    but the implementation is now date-agnostic.

    A trader who actively wants only "today" already has the dashboard
    Today's P&L cards + the realized window on /reports/pnl, so
    surfacing ALL closes here is the more useful default.
    """
    return await (
        Position.find(
            Position.user_id == PydanticObjectId(user_id),
            Position.status == PositionStatus.CLOSED,
        )
        .sort("-closed_at")
        .limit(200)
        .to_list()
    )


async def list_closed_trade_events(
    user_id: str | PydanticObjectId,
    *,
    limit: int = 200,
) -> list[dict]:
    """Per-close blotter rows reconstructed from the trade tape.

    The Closed tab used to list CLOSED *positions* only, so a PARTIAL
    close (sell 2 of 5 lots) never showed — the position stayed OPEN and
    only surfaced once it hit qty 0. This walks the user's trades in
    chronological order, mirroring ``apply_fill``'s avg / pyramid / flip
    accounting, and emits ONE event per closing fill (partial OR full).

    The money numbers (realized P&L, brokerage) are taken DIRECTLY from
    the stored ``Trade.pnl_inr`` / ``total_charges`` so they stay frozen
    exactly as booked at fill time — we never recompute P&L here. The
    FIFO walk is only used to recover each close's entry ``avg_price`` and
    the lifecycle ``opened_at`` for display.

    Returns newest-first, capped at ``limit``. Each element is a
    self-contained dict the API layer formats into its row shape.
    """
    from app.models.trade import Trade

    # Fetch the most-recent 3 000 trades (newest-first) then reverse for the
    # chronological FIFO walk below. 3 000 covers ~200 closed events even for
    # heavy traders (avg 5–15 fills per lifecycle). Loading the entire tape is
    # O(T) and blocks for 1–2 s on accounts with 10 000+ trades.
    trades = await (
        Trade.find(Trade.user_id == PydanticObjectId(user_id))
        .sort("-executed_at")
        .limit(3000)
        .to_list()
    )
    trades.reverse()  # chronological order for FIFO walk
    if not trades:
        return []

    # Per (token, product_type) running lifecycle state.
    state: dict[tuple[str, str], dict[str, Any]] = {}
    events: list[dict] = []

    def _trade_charge(tr: Any) -> float:
        """Total brokerage stamped on a trade (close + other charges),
        falling back to the raw brokerage field for very old rows."""
        try:
            return float(
                str(getattr(tr, "total_charges", None) or getattr(tr, "brokerage", None) or 0)
            )
        except (TypeError, ValueError):
            return 0.0

    for t in trades:
        key = (t.instrument.token, t.product_type.value)
        qty = abs(float(t.quantity))
        if qty <= 0:
            continue
        price = float(str(t.price))
        signed = qty if t.action == OrderAction.BUY else -qty
        st = state.get(key)

        if st is None or abs(st["qty"]) < 1e-9:
            # Fresh open (or re-open on a flat lifecycle).
            state[key] = {
                "qty": signed,
                "avg": price,
                "opened_at": t.executed_at,
                # Opening-leg brokerage pool — accumulated on open / pyramid
                # fills and allocated proportionally to each closing fill so
                # the user's Closed-tab P&L nets the FULL lifecycle brokerage
                # (open + close), matching the admin Positions view exactly.
                "open_brk": _trade_charge(t),
                "open_qty": qty,
            }
            continue

        cur = st["qty"]
        same_side = (cur > 0 and signed > 0) or (cur < 0 and signed < 0)
        if same_side:
            # Pyramiding — weighted-average the entry, keep opened_at.
            denom = abs(cur) + abs(signed)
            st["avg"] = (
                (st["avg"] * abs(cur) + price * abs(signed)) / denom
                if denom
                else price
            )
            st["qty"] = cur + signed
            st["open_brk"] = float(st.get("open_brk", 0.0)) + _trade_charge(t)
            st["open_qty"] = float(st.get("open_qty", abs(cur))) + qty
            continue

        # Opposite side → this fill closes (this trade carries pnl_inr for
        # exactly the closed portion).
        closed_qty = min(abs(cur), qty)
        # Allocate a proportional slice of the still-unconsumed opening
        # brokerage to THIS closing fill. Summed across every closing fill
        # of a fully-closed lifecycle this equals the total opening
        # brokerage, so user_net = gross − (open + close brokerage) ==
        # admin Net P&L. Partial closes carry only their pro-rata slice.
        open_qty_pool = float(st.get("open_qty", abs(cur))) or abs(cur)
        open_brk_pool = float(st.get("open_brk", 0.0))
        open_brk_alloc = (
            open_brk_pool * (closed_qty / open_qty_pool) if open_qty_pool > 0 else 0.0
        )
        events.append(
            {
                "trade": t,
                "entry_avg": st["avg"],
                "opened_at": st["opened_at"],
                "closed_qty": closed_qty,
                "close_price": price,
                # Direction the user originally held (BUY = long, SELL = short).
                "opened_side": OrderAction.BUY.value if cur > 0 else OrderAction.SELL.value,
                # Pro-rata opening-leg brokerage for the closed quantity.
                "open_brokerage_alloc": open_brk_alloc,
            }
        )
        # Drain the consumed slice from the opening pool.
        st["open_brk"] = max(0.0, open_brk_pool - open_brk_alloc)
        st["open_qty"] = max(0.0, open_qty_pool - closed_qty)
        new_qty = cur + signed
        if abs(new_qty) < 1e-9:
            st["qty"] = 0.0
        elif (cur > 0) != (new_qty > 0):
            # Flipped — leftover opens a fresh opposite-direction lifecycle.
            # The flip fill's brokerage was booked as a CLOSE charge above,
            # so the new leg starts with an empty opening-brokerage pool.
            st["qty"] = new_qty
            st["avg"] = price
            st["opened_at"] = t.executed_at
            st["open_brk"] = 0.0
            st["open_qty"] = abs(new_qty)
        else:
            # Partial close — surviving leg keeps its avg + opened_at.
            st["qty"] = new_qty

    events.reverse()  # newest-first
    return events[:limit]


async def resync_closed_position_fills(position: Position) -> int:
    """Push an admin-edited CLOSED position's prices/P&L back onto its
    underlying Trade fills so the user-facing Closed blotter reflects it.

    WHY: the user "Closed" tab is rebuilt FIFO from `Trade` documents
    (entry = opening fill price, close = closing fill price, realised =
    (close-entry)*qty). `admin_edit_position` only rewrites the `Position`
    doc + a wallet REVERSAL — it never touched the fills, so an admin's
    open/close-price correction showed on the admin Position view but the
    user's history kept the OLD price/P&L. This syncs the fills.

    Targeting (no Position→Trade FK exists): fills for the same
    (user, token, product_type) executed inside the position's
    [opened_at, closed_at] window (±10s slack). Opening fills (pnl_inr is
    None) take the new avg_price; closing fills (pnl_inr set) take the new
    close price and a recomputed pnl_inr so P&L-based consumers (reports,
    reopen unwind) stay aligned. Best-effort — returns the number of fills
    updated; the caller logs and never lets a miss fail the edit.
    """
    from datetime import timedelta
    from app.models.trade import Trade
    from app.services import market_data_service as _mds

    if position.opened_at is None or position.closed_at is None:
        return 0

    lo = position.opened_at - timedelta(seconds=10)
    hi = position.closed_at + timedelta(seconds=10)
    trades = await Trade.find(
        {
            "user_id": position.user_id,
            "instrument.token": position.instrument.token,
            "product_type": position.product_type.value,
            "executed_at": {"$gte": lo, "$lte": hi},
        }
    ).to_list()
    if not trades:
        return 0

    new_avg = to_decimal(position.avg_price)
    new_close = to_decimal(position.ltp)
    opened_side = str(getattr(position, "opened_side", None) or "BUY").upper()
    sign = Decimal(1) if opened_side == "BUY" else Decimal(-1)

    # Mirror the admin recalc's FX basis: USD-quoted segments book P&L in
    # INR using the rate snapshotted at open (fallback to the live rate).
    is_usd = _mds.is_usd_quoted_segment(position.segment_type) or _mds.is_usd_quoted_segment(
        position.instrument.segment
    )
    fx = to_decimal(position.open_usd_inr_rate or _mds.get_usd_inr_rate()) if is_usd else Decimal(1)

    updated = 0
    for t in trades:
        qty = abs(to_decimal(t.quantity))
        if t.pnl_inr is None:
            # Opening fill → new entry price.
            t.price = to_decimal128(new_avg)
            t.value = to_decimal128(new_avg * to_decimal(t.quantity))
        else:
            # Closing fill → new close price + recomputed realised. Keep the
            # fill's own brokerage; pnl_inr stays net of the close leg to
            # match the matching-engine convention.
            gross = (new_close - new_avg) * qty * sign * fx
            close_brk = to_decimal(t.total_charges or t.brokerage or 0)
            t.price = to_decimal128(new_close)
            t.value = to_decimal128(new_close * to_decimal(t.quantity))
            t.pnl_inr = to_decimal128(quantize_money(gross - close_brk))
        await t.save()
        updated += 1
    return updated


async def resync_open_position_fills(position: Position) -> int:
    """Push an admin-edited OPEN position's avg_price onto its underlying
    OPENING Trade fills so the user-facing Active-trades tab reflects it.

    WHY: /active-trades shows each open fill's OWN execution price
    (``Trade.price``), not ``Position.avg_price`` — so an admin open-price
    correction updated the Position doc + Orders but the Active tab kept the
    old fill price. Closing fills don't exist yet for an open cycle, so we only
    touch opening fills (``pnl_inr is None``) on the position's side.

    ponytail: takes the most-recent same-side opening fills that sum to the
    position qty — correct for the common single-fill / same-side-add open; a
    position reopened across interleaved closed cycles could pick an older
    cycle's opening fill. Upgrade to per-cycle FIFO (as /active-trades does)
    if that surfaces. Best-effort; returns fills updated.
    """
    from app.models.trade import Trade
    from app.models.order import OrderAction

    trades = await Trade.find(
        {
            "user_id": position.user_id,
            "instrument.token": position.instrument.token,
            "product_type": position.product_type.value,
            "pnl_inr": None,
        }
    ).sort("-executed_at").to_list()
    if not trades:
        return 0

    long = position.quantity >= 0
    trades = [t for t in trades if (t.action == OrderAction.BUY) == long]
    if not trades:
        return 0

    new_avg = to_decimal(position.avg_price)
    need = abs(to_decimal(position.quantity))
    updated = 0
    accum = Decimal(0)
    for t in trades:
        if need > 0 and accum >= need:
            break
        t.price = to_decimal128(new_avg)
        t.value = to_decimal128(new_avg * to_decimal(t.quantity))
        await t.save()
        accum += abs(to_decimal(t.quantity))
        updated += 1
    return updated


async def resync_position_orders(position: Position) -> int:
    """Push an admin-edited position's open/close prices (and times) back onto
    its underlying EXECUTED Order records so the user-facing Orders -> Executed
    list shows the corrected fill.

    There is no Position->Order FK, so we pair by structure rather than a fixed
    time window (the old window broke when opened_at was edited past closed_at,
    and grabbed unrelated orders for long-held positions):

    * exit  = the squareoff order whose executed_at is CLOSEST to closed_at
      (closed_at is the real close time, reliable even after an open-time edit).
    * entry = the most recent NON-squareoff order at/before that exit — the fill
      this exit closed. For an OPEN position, entry = the most recent open fill.

    Entry takes the new avg_price + opened_at; exit takes the new close price +
    closed_at, and its cost_basis_override entry-hint takes the new avg_price.
    Best-effort; returns the number of orders updated. ponytail: single
    entry/exit only — a partial-fill position (multiple entry orders) updates
    just the latest entry; add per-fill FIFO reconstruction if that shows up.
    """
    from app.models.order import Order, OrderStatus

    orders = await Order.find(
        {
            "user_id": position.user_id,
            "instrument.token": position.instrument.token,
            "product_type": position.product_type.value,
            "status": {"$in": [OrderStatus.EXECUTED.value, OrderStatus.PARTIAL.value]},
            "executed_at": {"$ne": None},
        }
    ).sort("executed_at").to_list()
    if not orders:
        return 0

    new_avg = to_decimal(position.avg_price)
    new_close = to_decimal(position.ltp) if position.ltp is not None else None

    entry_o = None
    exit_o = None
    if position.status == PositionStatus.CLOSED and position.closed_at is not None:
        exits = [o for o in orders if o.is_squareoff]
        if exits:
            exit_o = min(
                exits,
                key=lambda o: abs((o.executed_at - position.closed_at).total_seconds()),
            )
            entries = [
                o for o in orders
                if not o.is_squareoff and o.executed_at <= exit_o.executed_at
            ]
            entry_o = entries[-1] if entries else None
    else:
        entries = [o for o in orders if not o.is_squareoff]
        entry_o = entries[-1] if entries else None

    updated = 0
    if entry_o is not None:
        entry_o.average_price = to_decimal128(new_avg)
        if to_decimal(entry_o.price) > 0:
            entry_o.price = to_decimal128(new_avg)
        if position.opened_at is not None:
            entry_o.executed_at = position.opened_at
        await entry_o.save()
        updated += 1
    if exit_o is not None and new_close is not None:
        exit_o.average_price = to_decimal128(new_close)
        if to_decimal(exit_o.price) > 0:
            exit_o.price = to_decimal128(new_close)
        if exit_o.cost_basis_override is not None:
            exit_o.cost_basis_override = to_decimal128(new_avg)
        if position.closed_at is not None:
            exit_o.executed_at = position.closed_at
        await exit_o.save()
        updated += 1
    return updated


def _as_utc(dt: datetime | None) -> datetime | None:
    """Mongo may hand back naive UTC; make it comparable with aware times."""
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _ist_label(dt: datetime) -> str:
    return (dt + timedelta(minutes=330)).strftime("%d %b %Y %H:%M:%S IST")


async def plan_closed_position_retime(
    position: Position, new_opened_at: datetime, new_closed_at: datetime
) -> dict[str, Any] | None:
    """Work out — writing nothing — how an admin open/close-time correction
    on a CLOSED position moves everything the user sees that time on.

    The Closed tab, tradebook and reports read ``Trade.executed_at``; the
    Orders tab reads the order's times; the ledger reads its CHARGES / PNL
    rows' ``created_at``. Opening fills (``pnl_inr`` None) move by the
    open-time change and closing fills by the close-time change; each order
    and its ledger rows move with their fills (``Trade.order_id`` is an exact
    link). Fills are found with the ORIGINAL times — every trading cycle is
    its own Position doc, so its fills sit inside [opened_at, closed_at].

    Returns None when neither time changes by a second or more. Raises
    ValueError (→ 400) when the move would corrupt the history the FIFO
    blotter replays: a closing fill landing before its opening fill, or the
    cycle crossing the previous / next trade on the same instrument.
    """
    from app.models.order import Order
    from app.models.trade import Trade
    from app.models.transaction import TransactionType, WalletTransaction

    old_open, old_close = _as_utc(position.opened_at), _as_utc(position.closed_at)
    if old_open is None or old_close is None:
        raise ValueError("This position has no open/close time to correct.")
    new_open, new_close = _as_utc(new_opened_at), _as_utc(new_closed_at)
    d_open, d_close = new_open - old_open, new_close - old_close
    one_sec = timedelta(seconds=1)
    if abs(d_open) < one_sec:
        d_open, new_open = timedelta(0), old_open
    if abs(d_close) < one_sec:
        d_close, new_close = timedelta(0), old_close
    if not d_open and not d_close:
        return None
    if getattr(position, "reopened_at", None):
        raise ValueError(
            "This position was reopened by an admin, so it holds more than one "
            "trade cycle — its times can't be moved safely."
        )
    if new_open >= new_close:
        raise ValueError("Open time must be before the close time.")
    if new_close > now_utc():
        raise ValueError("Close time can't be in the future.")
    if d_close and position.close_reason == "WEEKLY_SETTLEMENT":
        raise ValueError(
            "This trade was closed by the weekly settlement, which runs at a "
            "fixed time — its close time can't be moved."
        )

    key = {
        "user_id": position.user_id,
        "instrument.token": position.instrument.token,
        "product_type": position.product_type.value,
    }
    slack = timedelta(seconds=10)
    fills = (
        await Trade.find({**key, "executed_at": {"$gte": old_open - slack, "$lte": old_close + slack}})
        .sort("+executed_at")
        .to_list()
    )
    if not fills:
        raise ValueError("No fills found for this position — times not changed.")
    moved = [
        (t, _as_utc(t.executed_at) + (d_open if t.pnl_inr is None else d_close)) for t in fills
    ]
    new_times = [n for _t, n in moved]
    if any(b < a for a, b in zip(new_times, new_times[1:])):
        raise ValueError(
            "These times would put a close before its own open fill — keep the "
            "open time before every close of this trade."
        )
    prev = (
        await Trade.find({**key, "executed_at": {"$lt": old_open - slack}})
        .sort("-executed_at")
        .limit(1)
        .to_list()
    )
    if prev and _as_utc(prev[0].executed_at) >= new_times[0]:
        raise ValueError(
            "Open time can't go before the previous trade on this instrument "
            f"({_ist_label(_as_utc(prev[0].executed_at))})."
        )
    nxt = (
        await Trade.find({**key, "executed_at": {"$gt": old_close + slack}})
        .sort("+executed_at")
        .limit(1)
        .to_list()
    )
    if nxt and _as_utc(nxt[0].executed_at) <= new_times[-1]:
        raise ValueError(
            "Close time can't go past the next trade on this instrument "
            f"({_ist_label(_as_utc(nxt[0].executed_at))})."
        )

    # A cycle carried over a weekly settlement opens with NO fill (the
    # engine re-opens the position at the settlement price), so the fill
    # checks above can't see its start — keep it between the neighbouring
    # Position docs as well.
    prev_pos = (
        await Position.find(
            {**key, "_id": {"$ne": position.id}, "closed_at": {"$lte": old_open + slack}}
        )
        .sort("-closed_at")
        .limit(1)
        .to_list()
    )
    if prev_pos and new_open < _as_utc(prev_pos[0].closed_at):
        raise ValueError(
            "Open time can't go before the previous trade on this instrument "
            f"closed ({_ist_label(_as_utc(prev_pos[0].closed_at))})."
        )
    next_pos = (
        await Position.find(
            {**key, "_id": {"$ne": position.id}, "opened_at": {"$gte": old_close - slack}}
        )
        .sort("+opened_at")
        .limit(1)
        .to_list()
    )
    if next_pos and new_close > _as_utc(next_pos[0].opened_at):
        raise ValueError(
            "Close time can't go past the next trade on this instrument "
            f"({_ist_label(_as_utc(next_pos[0].opened_at))})."
        )

    order_delta: dict[Any, timedelta] = {}
    for t in fills:
        order_delta.setdefault(t.order_id, d_open if t.pnl_inr is None else d_close)
    orders = await Order.find({"_id": {"$in": list(order_delta)}}).to_list()
    txs = await WalletTransaction.find(
        {
            "user_id": position.user_id,
            "reference_type": "ORDER",
            "reference_id": {"$in": [str(oid) for oid in order_delta]},
            "transaction_type": {"$in": [TransactionType.CHARGES.value, TransactionType.PNL.value]},
        }
    ).to_list()
    by_ref = {str(oid): d for oid, d in order_delta.items()}
    return {
        "opened_at": new_open,
        "closed_at": new_close,
        "fills": moved,
        "orders": [(o, order_delta[o.id]) for o in orders],
        "txs": [(tx, by_ref[tx.reference_id]) for tx in txs],
    }


async def apply_closed_position_retime(plan: dict[str, Any]) -> dict[str, int]:
    """Write a plan from ``plan_closed_position_retime``. Each fill takes its
    new time; each order and ledger row shifts every time it carries by the
    same amount, so placed→executed gaps and ordering inside them survive."""
    for t, new_time in plan["fills"]:
        shift = new_time - _as_utc(t.executed_at)
        t.executed_at = new_time
        t.created_at = _as_utc(t.created_at) + shift
        await t.save()
    for o, shift in plan["orders"]:
        if not shift:
            continue
        for field in ("created_at", "executed_at", "updated_at"):
            v = getattr(o, field, None)
            if v is not None:
                setattr(o, field, _as_utc(v) + shift)
        await o.save()
    for tx, shift in plan["txs"]:
        if not shift:
            continue
        tx.created_at = _as_utc(tx.created_at) + shift
        tx.updated_at = _as_utc(tx.updated_at) + shift
        await tx.save()
    return {"fills": len(plan["fills"]), "orders": len(plan["orders"]), "ledger": len(plan["txs"])}


async def list_closed_trade_events_fifo(
    user_id: str | PydanticObjectId,
    *,
    skip: int = 0,
    limit: int = 25,
) -> tuple[list[dict], int]:
    """FIFO per-opening-fill closed blotter.

    Unlike ``list_closed_trade_events`` (which uses a running weighted-avg),
    this function tracks a QUEUE of individual opening fills per instrument.
    When a closing trade fires, it is matched FIFO against the queue and
    produces ONE output row per (opening-fill × closing-fill) pairing.

    Example — user holds:
        Fill A: BUY 100 @ 4339.89
        Fill B: BUY 100 @ 4339.99
    User sells 150 qty → two rows:
        Row 1: 100 @ entry 4339.89 → close px
        Row 2:  50 @ entry 4339.99 → close px

    P&L per row = (close_price - entry_price) × qty  (for BUY positions).
    Brokerage is split proportionally across the sub-rows that a single
    closing trade produces.

    Returns (page_events, total_count) — newest-close-first, paginated.
    """
    from collections import deque
    from app.models.trade import Trade

    trades = await (
        Trade.find(Trade.user_id == PydanticObjectId(user_id))
        .sort("-executed_at")
        .limit(3000)
        .to_list()
    )
    trades.reverse()  # chronological for FIFO walk
    if not trades:
        return [], 0

    # Load this user's CLOSED Position docs ONCE — used to (a) interleave
    # WEEKLY_SETTLEMENT boundaries into the FIFO walk below and (b) enrich
    # the trade-derived events with close_reason. The Saturday mark-to-market
    # engine closes each open Position and re-opens an identical one at the
    # settlement price but writes NO Trade rows, so the FIFO walk can't see
    # those closes on its own.
    from datetime import datetime as _datetime
    from app.models.position import Position, PositionStatus

    closed_pos = await Position.find(
        Position.user_id == PydanticObjectId(user_id),
        Position.status == PositionStatus.CLOSED,
    ).to_list()

    def _naive(dt: Any) -> Any:
        return dt.replace(tzinfo=None) if dt else _datetime.min

    # One boundary per WEEKLY_SETTLEMENT close, to be merged into the walk.
    _settle_boundaries: list[dict] = []
    for _p in closed_pos:
        if _p.close_reason != "WEEKLY_SETTLEMENT" or not _p.closed_at:
            continue
        # quantity is left intact on a settlement close; fall back to
        # opening_quantity for any legacy/edited row that zeroed it.
        _sq = abs(float(_p.quantity or 0)) or abs(
            float(getattr(_p, "opening_quantity", 0) or 0)
        )
        if _sq <= 0:
            continue
        _sside = (
            _p.opened_side.value
            if getattr(_p, "opened_side", None) is not None
            else ("BUY" if float(_p.quantity or 0) >= 0 else "SELL")
        )
        _settle_boundaries.append({
            "ts": _p.closed_at,
            "key": (_p.instrument.token, _p.product_type.value),
            "entry_price": float(str(_p.avg_price)),  # this cycle's entry
            "settle_price": float(str(_p.ltp)),       # settlement LTP = new avg
            "qty": _sq,
            "side": _sside,
            "instrument": _p.instrument,
            "product_type": _p.product_type,
            "pid": _p.id,
            "opened_at": _p.opened_at,
        })

    def _charge(tr: Any) -> float:
        try:
            return float(
                str(getattr(tr, "total_charges", None) or getattr(tr, "brokerage", None) or 0)
            )
        except Exception:
            return 0.0

    # Per (token, product_type): deque of open fills (front = oldest = next to close).
    # Each fill: {"price": float, "qty": float, "opened_at": datetime, "side": "BUY"|"SELL"}
    open_queues: dict[tuple[str, str], deque] = {}
    events: list[dict] = []

    # Merge real trades with settlement boundaries into ONE chronological
    # stream. A weekly settlement = "close the whole position at the
    # settlement price, then re-open it there", so when the walk reaches one
    # we (1) emit its closed-blotter row and (2) reset that token's FIFO
    # basis to the settlement price. Without the reset, a later manual close
    # would pair against the now-stale ORIGINAL entry and report inflated,
    # double-counted P&L (the settlement row + an over-stated close row).
    # The (ts, kind-order, index) sort key avoids ever comparing the raw
    # Trade objects (which aren't orderable).
    _timeline: list[tuple] = []
    for _i, t in enumerate(trades):
        _timeline.append((_naive(t.executed_at), 0, _i, "trade", t))
    for _i, b in enumerate(_settle_boundaries):
        _timeline.append((_naive(b["ts"]), 1, _i, "settle", b))
    _timeline.sort(key=lambda x: (x[0], x[1], x[2]))

    for _ts, _ord, _idx, _kind, _obj in _timeline:
        if _kind == "settle":
            b = _obj
            sign = 1.0 if b["side"] == "BUY" else -1.0
            # Same gross formula the trade-FIFO path uses (no FX — closed
            # rows render P&L raw, matching the rest of this blotter).
            gross = (b["settle_price"] - b["entry_price"]) * b["qty"] * sign
            events.append({
                "_row_id": f"wsettle_{b['pid']}",
                "_closed_at": b["ts"],
                "_superseded": False,
                "instrument": b["instrument"],
                "product_type": b["product_type"],
                "opened_side": b["side"],
                "entry_price": b["entry_price"],
                "close_price": b["settle_price"],
                "qty": b["qty"],
                "gross_pnl": gross,
                "brokerage": 0.0,  # weekly settlement charges no brokerage
                # The cycle this settlement closed began at the position's
                # own opened_at (an admin may have corrected it).
                "opened_at": b["opened_at"] or b["ts"],
                "closed_at": b["ts"],
                "instrument_token": b["key"][0],
                "close_reason": "WEEKLY_SETTLEMENT",
            })
            # Reset the FIFO basis: the original opening fills are now closed
            # out by this settlement; the position carries on from the
            # settlement price. Clear the queue and reseed one fill there so
            # the next close prices off the settlement price.
            _sq = open_queues.setdefault(b["key"], deque())
            _sq.clear()
            _sq.append({
                "price": b["settle_price"],
                "qty": b["qty"],
                "opened_at": b["ts"],
                "side": b["side"],
                "open_brk": 0.0,
                "original_qty": b["qty"],
                "from_settle": True,
            })
            continue

        t = _obj
        key = (t.instrument.token, t.product_type.value)
        qty = abs(float(t.quantity))
        if qty <= 0:
            continue
        price = float(str(t.price))
        is_buy = t.action == OrderAction.BUY
        side_str = "BUY" if is_buy else "SELL"

        q = open_queues.setdefault(key, deque())

        # Cross-product-type fallback: admin force-closes sometimes record
        # the closing fill with a different product_type than the opening fill
        # (e.g. MIS open closed as NRML). The exact (token, product_type) queue
        # is empty, but another queue for the same token has the open position.
        # Only kick in when pnl_inr is set (definitive closing signal).
        if not q and t.pnl_inr is not None:
            alt_key = next(
                (k for k in open_queues if k[0] == t.instrument.token and open_queues[k]),
                None,
            )
            if alt_key:
                q = open_queues[alt_key]

        # Primary signal: pnl_inr set = closing fill; None = opening fill.
        # Fallback: if pnl_inr is None but queue has the OPPOSITE side,
        # treat as a closing fill whose pnl_inr the matching engine missed
        # (e.g. partial close recorded without pnl_inr due to an engine bug).
        queue_side = q[0]["side"] if q else None
        is_closing = t.pnl_inr is not None or (
            queue_side is not None and queue_side != side_str
        )

        if not is_closing:
            q.append({
                "price": price,
                "qty": qty,
                "opened_at": t.executed_at,
                "side": side_str,
                "open_brk": _charge(t),  # stored for pro-rata allocation on close
                "original_qty": qty,     # original fill qty for correct pro-rata on partial closes
            })
            continue

        # ── Closing fill: consume from queue ─────────────────────────────
        if not q:
            # Queue is empty — no opening fill to pair against. This is the
            # EXPECTED state after an admin REOPEN: reopen flips the position
            # back to OPEN reusing the original entry but writes NO new
            # opening Trade, so the earlier stop-out / square-off closes
            # already drained the FIFO queue. When the user then closes the
            # reopened position the closing fill lands here with an empty
            # queue. The old code `continue`d — silently dropping the
            # re-close — so a profitable reopen→close (operator: "wallet me
            # +profit aaya par history me nahi dikha") never appeared in the
            # Closed blotter even though the wallet booked it.
            #
            # Recover the entry price ALGEBRAICALLY from the trade itself —
            # no Position lookup needed and it's exact: the matching engine
            # stores pnl_inr = raw_gross - brokerage, and
            #   raw_gross = (close - entry) * qty   for a long  (closed by SELL)
            #   raw_gross = (entry - close) * qty   for a short (closed by BUY)
            # so `entry` falls straight out. price>0 guards the phantom
            # zero-priced fills the matching engine sometimes writes.
            if t.pnl_inr is not None and qty > 0 and price > 0:
                close_brk = _charge(t)
                gross = float(str(t.pnl_inr)) + close_brk  # back out brokerage → raw gross
                # The closing action is the OPPOSITE of the opening side.
                opened_side = "SELL" if is_buy else "BUY"
                if opened_side == "BUY":
                    entry_price = price - (gross / qty)
                else:
                    entry_price = price + (gross / qty)
                events.append({
                    "_row_id": f"fifo_{t.id}_0",
                    "_closed_at": t.executed_at,
                    "_superseded": getattr(t, "superseded_by_reopen", False),
                    "instrument": t.instrument,
                    "product_type": t.product_type,
                    "opened_side": opened_side,
                    "entry_price": entry_price,
                    "close_price": price,
                    "qty": qty,
                    "gross_pnl": gross,
                    "brokerage": close_brk,
                    # No surviving opening-fill timestamp for a reopened cycle
                    # — fall back to the close time so the row still renders.
                    "opened_at": t.executed_at,
                    "closed_at": t.executed_at,
                    "instrument_token": t.instrument.token,
                })
            continue

        close_brk = _charge(t)
        remaining = qty
        sub_idx = 0

        # Specific-lot Exit: when the closing fill carries a cost_basis_override
        # the user tapped ONE lot to close — show THAT lot's entry price and
        # price the gross off it, instead of the FIFO-front queue price they'd
        # otherwise fall back to (the wrong-basis / wrong-P&L symptom). Qty is
        # still consumed FIFO from `q` below, so the queue accounting is
        # unchanged; only the displayed basis + gross change.
        _basis = None
        _cbo = getattr(t, "cost_basis_override", None)
        if _cbo is not None:
            try:
                _basis = float(str(_cbo))
            except Exception:
                _basis = None

        # Lot-basis era: the engine stamped the exact per-unit basis it
        # booked (`close_basis`) — show THAT, so this close's P&L here equals
        # its wallet P&L line. It removed the exited lot first (then FIFO):
        # do the same with the queue so later closes pair with the same lots.
        # Fills booked before lot-basis (no close_basis) display as before.
        _lb_pick = None
        _cb = getattr(t, "close_basis", None)
        if _cb is not None:
            try:
                _lb = float(str(_cb))
            except Exception:
                _lb = None
            if _lb is not None:
                if _basis is not None and q:
                    _bi = min(range(len(q)), key=lambda i: abs(q[i]["price"] - _basis))
                    if _bi > 0 and abs(q[_bi]["price"] - _basis) <= max(0.01, abs(_basis) * 1e-4):
                        _lb_pick = (q[_bi], _bi)
                        del q[_bi]
                        q.appendleft(_lb_pick[0])  # keeps the others' FIFO order
                _basis = _lb

        # Engine-truth lot selection (multi-lot disambiguation). With several
        # OPEN lots for the same instrument, the matching engine may close a
        # lot that is NOT the FIFO-front — e.g. an older lot stays open while a
        # newer same-instrument round-trip is closed. Pure FIFO would eat the
        # still-open older (cheaper) lot and report a wildly wrong gross
        # (operator: "real ~600 loss, blotter showed 18,000+"). The engine
        # already booked the exact P&L in `pnl_inr`, so derive the entry the
        # engine priced against and rotate THAT lot to the queue front so it
        # is the one consumed. Only when no explicit cost_basis_override was
        # given, and only when a deeper lot matches better than the front —
        # the normal single-lot / FIFO-front case is a no-op rotate.
        if _basis is None and t.pnl_inr is not None and qty > 0 and price > 0 and q:
            _raw_gross = float(str(t.pnl_inr)) + close_brk
            # closing SELL (is_buy False) → long close  → entry = price - gross/qty
            # closing BUY  (is_buy True)  → short close → entry = price + gross/qty
            _derived = (price + _raw_gross / qty) if is_buy else (price - _raw_gross / qty)
            _bi = min(range(len(q)), key=lambda i: abs(q[i]["price"] - _derived))
            if abs(q[_bi]["price"] - _derived) <= max(0.01, price * 1e-4):
                q.rotate(-_bi)  # bring the engine-closed lot to the FIFO front

        while remaining > 1e-9 and q:
            front = q[0]
            consume = min(front["qty"], remaining)
            eff_basis = _basis if _basis is not None else front["price"]

            # Gross P&L for this (opening-fill × closing-fill) pairing
            if front["side"] == "BUY":
                gross = (price - eff_basis) * consume   # long close
            else:
                gross = (eff_basis - price) * consume   # short close

            # Total brokerage = pro-rata open-leg + pro-rata close-leg
            orig_qty = front.get("original_qty") or consume
            open_brk_alloc = front.get("open_brk", 0.0) * (consume / orig_qty) if orig_qty > 0 else 0.0
            close_brk_alloc = close_brk * (consume / qty) if qty > 0 else 0.0
            brk_alloc = open_brk_alloc + close_brk_alloc

            events.append({
                "_row_id": f"fifo_{t.id}_{sub_idx}",
                "_closed_at": t.executed_at,
                "_superseded": getattr(t, "superseded_by_reopen", False),
                "instrument": t.instrument,
                "product_type": t.product_type,
                "opened_side": front["side"],
                "entry_price": eff_basis,
                "close_price": price,
                "qty": consume,
                "gross_pnl": gross,
                "brokerage": brk_alloc,
                "opened_at": front["opened_at"],
                "_open_from_settle": front.get("from_settle", False),
                "closed_at": t.executed_at,
                "instrument_token": t.instrument.token,
            })

            front["qty"] -= consume
            remaining -= consume
            sub_idx += 1

            if front["qty"] < 1e-9:
                q.popleft()

        if _lb_pick is not None and q and q[0] is _lb_pick[0] and _lb_pick[0]["qty"] > 1e-9:
            q.popleft()
            q.insert(min(_lb_pick[1], len(q)), _lb_pick[0])

    # Drop closing fills an admin REOPEN/DELETE later undid. They stay in the
    # collection (audit) and were processed above so the FIFO pairing of the
    # SURVIVING fills stayed correct (each undone close still consumed its
    # opening fill in order) — but they must not render, otherwise a
    # reopened-then-reclosed position shows every intermediate close instead
    # of just its final one. This makes the user Closed blotter match the
    # admin Position-doc view.
    events = [e for e in events if not e.get("_superseded")]

    # Enrich events with close_reason from Position documents so the user
    # panel can distinguish STOP_OUT / SL_HIT / TP_HIT from USER closes.
    # The FIFO loop only touches Trade records; close_reason lives on Position.
    # (Settlement events were already stamped WEEKLY_SETTLEMENT inline above;
    # the 30s match below leaves them untouched.)
    if events:
        # (token, product_type) → [(closed_at, close_reason), ...]
        _pos_map: dict[tuple, list] = {}
        for _p in closed_pos:
            _k = (_p.instrument.token, _p.product_type.value)
            if _p.closed_at:
                _pos_map.setdefault(_k, []).append(
                    (_p.closed_at, _p.close_reason or "USER", _p.opened_at)
                )
        for ev in events:
            if ev.get("close_reason"):
                continue  # already set (e.g. inline settlement rows)
            _k = (ev["instrument_token"], ev["product_type"].value)
            _entries = _pos_map.get(_k)
            if _entries:
                _cat = ev["closed_at"]
                _best = min(
                    _entries,
                    key=lambda x: abs((x[0].replace(tzinfo=None) - _cat.replace(tzinfo=None)).total_seconds()),
                )
                if abs((_best[0].replace(tzinfo=None) - _cat.replace(tzinfo=None)).total_seconds()) < 30:
                    ev["close_reason"] = _best[1]
                    # A cycle carried over a weekly settlement has no opening
                    # fill: its open is the settlement time, unless an admin
                    # corrected the position's opened_at — show the position's.
                    if ev.get("_open_from_settle") and _best[2] is not None:
                        ev["opened_at"] = _best[2]

    # Newest-close first. Sort explicitly because the list mixes trade-derived
    # events with inline settlement events that were emitted at their own
    # timestamps — the old `events.reverse()` only worked for a purely
    # chronological list.
    def _close_sort_key(e: dict) -> Any:
        c = e.get("_closed_at")
        return c.replace(tzinfo=None) if c else _datetime.min

    events.sort(key=_close_sort_key, reverse=True)
    total = len(events)
    return events[skip : skip + limit], total


async def refresh_unrealized_pnl(
    position: Position,
    ltp: Decimal,
    *,
    prefetched_quote: dict | None = None,
) -> Position:
    """Mark unrealised P&L against the CLOSE-side price.

    A long is closed by SELLING (hits the bid); a short by BUYING (hits the
    ask). So mark-to-market must use the bid for longs and the ask for
    shorts — the price the user would actually realise right now. The
    last-traded LTP can lag the live quote on thin contracts (MCX silver /
    crude) and overstate the move; that mismatch made a SILVERM long show
    ₹-11,621 (against a lagging LTP) when the live bid implied only ₹-4,535
    (CL62329114 / PANKAJ).

    The quote is cached (700 ms TTL) and the caller's get_ltp fan-out
    already populated it this tick, so the extra get_quote is ~free. Falls
    back to `ltp` when the close side isn't published (illiquid / equity
    feeds with no depth).

    NOTE: there is NO USD→INR conversion. `is_usd_quoted_segment` returns
    False platform-wide (operator spec: Infoway prices are treated as INR
    directly), so the old `× usd_inr_rate` branch was already dead and is
    removed.

    ── Zero-mark guard ── A missing tick / stale cache / failed fetch can
    hand us `ltp == 0`. `(0 - avg) × qty` would then equal the WHOLE
    notional and the risk enforcer would read a colossal phantom drawdown
    (21-May COPPER incident, loss_pct 9124 %). On a non-positive mark we
    leave the last good values and let the next valid tick refresh them.
    """
    if ltp is None or to_decimal(ltp) <= 0:
        return position

    qty = to_decimal(position.quantity)
    mark = to_decimal(ltp)
    # Prefer the close-side price: bid for a long, ask for a short.
    # `prefetched_quote` lets the risk enforcer pass in the WS-state dict
    # directly (zero network), bypassing get_quote / _overlay_all / REST.
    try:
        if prefetched_quote is not None:
            q = prefetched_quote
        else:
            from app.services.market_data_service import get_quote
            q = await get_quote(position.instrument.token)
        side_raw = q.get("bid") if qty > 0 else q.get("ask")
        side = to_decimal(side_raw) if side_raw not in (None, 0, "0") else None
        if side is not None and side > 0:
            mark = side
    except Exception:
        pass

    position.ltp = Decimal128(str(mark))
    pnl = (mark - to_decimal(position.avg_price)) * qty
    position.unrealized_pnl = Decimal128(str(quantize_money(pnl)))
    return position


async def list_holdings(user_id: str | PydanticObjectId) -> list[Holding]:
    return await Holding.find(Holding.user_id == PydanticObjectId(user_id)).to_list()


# ── Intraday → carryforward auto-rollover ───────────────────────────
async def convert_intraday_to_carry(segment_set: frozenset[str] | set[str]) -> dict[str, int]:
    """At market close for a segment group, flip every open MIS position in
    that group to NRML. For each position we re-resolve the NRML margin
    against the user's effective segment settings; if the wallet can't
    afford the overnight delta, the position is force-squareoff'd before
    the type flip (so we never leave it in NRML while under-margined).

    Also sweeps already-open NRML positions in the group: any whose wallet
    can't cover the (correctly-resolved) carry margin is force-closed too.
    This catches carry positions that slipped through under-funded earlier
    (e.g. the option_type=None margin bug) and flattens them at the next EOD.
    Affordable NRML positions are left untouched.

    Returns a small summary dict for logging / audit:
        {"converted": N, "force_closed": M, "skipped": K}

    Used by the `intraday_to_carry_loop` lifespan task. The loop calls this
    once per IST day per segment group, right after the exchange's close
    minute.
    """
    from app.core.redis_client import cache_delete_pattern
    from app.models._base import ProductType as _PT
    from app.models.audit_log import AuditAction
    from app.services import (
        audit_service,
        netting_service,
        order_service,
        wallet_service,
    )
    from app.services.market_data_service import is_usd_quoted_segment

    if not segment_set:
        return {"converted": 0, "force_closed": 0, "skipped": 0}

    # Fetch BOTH MIS and NRML positions in this segment group. MIS rows
    # get the normal rollover treatment; NRML rows are only touched when
    # admin has set `allowOvernight=false` on the segment, in which case
    # we force-close them too (the segment-spec says nothing can carry
    # past close).
    rows = await Position.find(
        {
            "status": PositionStatus.OPEN.value,
            "product_type": {"$in": [_PT.MIS.value, _PT.NRML.value]},
            "instrument.segment": {"$in": list(segment_set)},
        }
    ).to_list()

    # Snapshot each affected user's settlement_outstanding BEFORE closing
    # anything, so the post-batch close-ordering correction nets only the
    # phantom this rollover books — not pre-existing / genuine shortfall.
    phantom_before: dict = {}
    for _uid in {p.user_id for p in rows}:
        try:
            _w0 = await wallet_service.get_or_create(_uid)
            phantom_before[_uid] = to_decimal(_w0.settlement_outstanding)
        except Exception:  # noqa: BLE001
            pass

    converted = 0
    force_closed = 0
    skipped = 0
    # Users whose positions were flipped MIS→NRML in-place below. After the
    # loop we consolidate each one's OPEN book so a freshly-converted NRML
    # position nets/merges into any PRE-EXISTING NRML position on the same
    # (token, product) instead of sitting as a duplicate row.
    converted_user_ids: set = set()

    for pos in rows:
        # Resolve NRML-side margin via the same resolver that runs at
        # order-placement time. Single source of truth — admin's segment
        # override stack is honoured.
        try:
            # Derive CE/PE from the symbol (the Position's InstrumentRef
            # snapshot has no option_type field) so the resolver applies the
            # admin's per-side option overrides (e.g. Opt Sell Mode=Fixed,
            # Opt Sell Overnight=₹15000) instead of silently falling back to
            # the generic segment Times/% margin. Without this the carry
            # margin is massively UNDER-computed (~20% of notional vs the
            # configured ₹15000/lot), so `delta` looks affordable and an
            # under-funded option position is NEVER force-closed at EOD —
            # it rolls into NRML uncovered. Mirrors the positions endpoint.
            _osym = (pos.instrument.symbol or "").upper()
            _otype = (
                ("CE" if _osym.endswith("CE") else "PE" if _osym.endswith("PE") else None)
                if len(_osym) >= 3 and _osym[-3].isdigit()
                else None
            )
            resolved = await netting_service.get_effective_settings(
                pos.user_id,
                pos.instrument.segment,
                action="BUY" if pos.quantity >= 0 else "SELL",
                option_type=_otype,
                product_type="NRML",
                symbol=pos.instrument.symbol,
            )
        except Exception:  # noqa: BLE001
            skipped += 1
            continue
        s = resolved.get("settings") or {}

        # Hard close-out path: admin disabled overnight carrying for this
        # segment (`allowOvernight=false`). Nothing carries past close —
        # squareoff every open position regardless of product type. Runs
        # before the type-flip / margin-recompute below so we don't bother
        # locking new margin on a position we're about to close.
        allow_overnight = bool(s.get("selling_overnight", True))
        if not allow_overnight:
            from app.models._base import OrderAction as _OA, OrderType as _OT
            from app.models.user import User as _User

            try:
                user_doc = await _User.get(pos.user_id)
                if user_doc is None:
                    skipped += 1
                    continue
                qty_open = abs(pos.quantity)
                lots_open = max(0.01, qty_open / max(1, pos.instrument.lot_size or 1))
                action = _OA.SELL if pos.quantity > 0 else _OA.BUY
                await order_service.place_order(
                    user=user_doc,
                    payload={
                        "token": pos.instrument.token,
                        "action": action.value,
                        "order_type": _OT.MARKET.value,
                        "product_type": pos.product_type.value,
                        "lots": lots_open,
                        "force_quantity": qty_open,
                        "is_squareoff": True,
                        "placed_from": "OVERNIGHT_DISABLED_CLOSE",
                    },
                )
                # Stamp a specific close_reason so the user sees WHY the
                # position closed.  "EOD_OVERNIGHT_DISABLED" — segment
                # doesn't allow carry-forward at all (intraday-only
                # product).  More informative than the legacy "AUTO".
                try:
                    refreshed = await Position.get(pos.id)
                    if refreshed and refreshed.status == PositionStatus.CLOSED and not refreshed.close_reason:
                        refreshed.close_reason = "EOD_OVERNIGHT_DISABLED"
                        await refreshed.save()
                except Exception:  # noqa: BLE001
                    pass
                force_closed += 1
            except Exception:  # noqa: BLE001
                skipped += 1
            continue

        # `allowOvernight=true`: compute the overnight requirement for BOTH
        # MIS and already-open NRML positions. A MIS position converts to NRML
        # when affordable; ANY position (MIS or NRML) whose wallet can't cover
        # the carry is force-closed in the branch below. Extending the check to
        # NRML squares off under-funded carry positions that slipped through
        # earlier (e.g. the option_type=None margin bug let them roll in
        # uncovered) at the next EOD instead of leaving them stuck open. An
        # already-NRML position that IS affordable is left exactly as-is (no
        # type flip, no re-lock) — see the MIS-only gate before the flip.

        # Compute the overnight margin requirement against the same
        # notional that's currently locked. Mirrors order_validator's
        # fixed-mode vs percent-vs-times logic — BUT we read the
        # `overnight_*` triple, not the product-aware `leverage` /
        # `margin_percentage` / `fixed_margin_per_lot`. In Times mode the
        # resolver deliberately keeps those product-aware fields on the
        # INTRADAY value (the "symmetric-Times patch"), so reading them
        # here returned 500× for an MCX FUT row whose admin had set
        # 500× intraday / 70× overnight — and the loop computed
        # delta=0 and silently skipped force-close. Reading the
        # explicit overnight fields gives the rollover the right
        # requirement so a wallet that can't cover the carry actually
        # triggers the force-squareoff branch below.
        cur_avg = to_decimal(pos.avg_price)
        cur_qty_abs = to_decimal(abs(pos.quantity))
        notional = cur_avg * cur_qty_abs

        ovn_fixed_per_lot = to_decimal(s.get("overnight_fixed_margin_per_lot") or 0)
        if (s.get("margin_calc_mode") == "fixed") and ovn_fixed_per_lot > 0:
            lot_size = max(1, int(pos.instrument.lot_size or 1))
            lots = cur_qty_abs / to_decimal(lot_size)
            new_margin = ovn_fixed_per_lot * lots
        else:
            ovn_margin_pct = to_decimal(s.get("overnight_margin_percentage") or 100.0) / to_decimal(100)
            ovn_leverage = to_decimal(s.get("overnight_leverage") or 1.0) or to_decimal(1)
            new_margin = notional * ovn_margin_pct / ovn_leverage

        # USD-quoted instruments lock margin in INR; same conversion as
        # order_validator.validate. Skipped for fixed-per-lot (already INR).
        if (
            is_usd_quoted_segment(pos.segment_type)
            or is_usd_quoted_segment(pos.instrument.segment)
        ):
            if not ((s.get("margin_calc_mode") == "fixed") and ovn_fixed_per_lot > 0):
                from app.services.market_data_service import get_usd_inr_rate

                new_margin = new_margin * to_decimal(get_usd_inr_rate())

        new_margin = quantize_money(new_margin)
        old_margin = to_decimal(pos.margin_used)
        delta = new_margin - old_margin

        wallet = await wallet_service.get_or_create(pos.user_id)
        affordable = (to_decimal(wallet.available_balance) + to_decimal(wallet.credit_limit)) >= delta

        if delta > 0 and not affordable:
            # Can't cover the overnight requirement — flatten the position
            # at market before the type flip. Same pattern risk_enforcer
            # uses: opposite-side MARKET order with `force_quantity` and
            # `is_squareoff` so hold-time guards are bypassed and the close
            # moves EXACTLY the open qty (no off-by-one against a stale
            # lot_size).
            from app.models._base import OrderAction as _OA, OrderType as _OT
            from app.models.user import User as _User

            try:
                user_doc = await _User.get(pos.user_id)
                if user_doc is None:
                    skipped += 1
                    continue
                qty_open = abs(pos.quantity)
                lots_open = max(0.01, qty_open / max(1, pos.instrument.lot_size or 1))
                action = _OA.SELL if pos.quantity > 0 else _OA.BUY
                await order_service.place_order(
                    user=user_doc,
                    payload={
                        "token": pos.instrument.token,
                        "action": action.value,
                        "order_type": _OT.MARKET.value,
                        "product_type": pos.product_type.value,
                        "lots": lots_open,
                        "force_quantity": qty_open,
                        "is_squareoff": True,
                        "placed_from": "INTRADAY_ROLLOVER",
                    },
                )
                # Stamp `close_reason="CARRY_FORWARD_FAIL"` so the
                # Closed-tab card on the user side reads "Carry-forward
                # failed (insufficient funds)" instead of a generic
                # "Auto" chip. This is the EXACT reason that matters
                # to the user: their wallet couldn't cover the overnight
                # margin requirement, so the platform flattened the
                # position before EOD rather than letting them roll
                # into NRML.
                try:
                    refreshed = await Position.get(pos.id)
                    if refreshed and refreshed.status == PositionStatus.CLOSED and not refreshed.close_reason:
                        refreshed.close_reason = "CARRY_FORWARD_FAIL"
                        await refreshed.save()
                except Exception:  # noqa: BLE001
                    pass
                force_closed += 1
            except Exception:  # noqa: BLE001
                skipped += 1
            continue

        # Affordable + already NRML → nothing to do (it's already carrying
        # on overnight margin; we don't re-lock the affordable ones to avoid
        # surprise wallet changes). Only MIS positions convert to NRML.
        if pos.product_type != _PT.MIS:
            continue

        # Type flip + margin reconciliation.
        try:
            if delta > 0:
                await wallet_service.block_margin(pos.user_id, delta)
            elif delta < 0:
                await wallet_service.release_margin(pos.user_id, -delta)

            pos.product_type = _PT.NRML
            pos.margin_used = Decimal128(str(new_margin))
            await pos.save()

            # Tracker counters — same magnitude, different bucket.
            # Recompute (don't increment) — same drift-immunity reasoning as
            # apply_fill above. After product_type flips MIS→NRML on the
            # Position doc, _recompute_tracker reads the new state and
            # rewrites the (intraday_lots, holding_lots) split exactly.
            await _recompute_tracker(
                user_id=pos.user_id,
                segment_type=pos.segment_type,
                token=pos.instrument.token,
            )

            try:
                await audit_service.log_event(
                    action=AuditAction.UPDATE,
                    entity_type="Position",
                    entity_id=pos.id,
                    actor_id=None,
                    target_user_id=pos.user_id,
                    metadata={
                        "kind": "INTRADAY_TO_CARRY_CONVERSION",
                        "symbol": pos.instrument.symbol,
                        "old_margin": str(old_margin),
                        "new_margin": str(new_margin),
                        "delta": str(delta),
                    },
                )
            except Exception:  # noqa: BLE001
                pass

            converted += 1
            converted_user_ids.add(pos.user_id)
        except Exception:  # noqa: BLE001
            skipped += 1

    # Per-user effective-settings cache no longer matches reality (the
    # product_type changed); wipe so the next read re-resolves.
    try:
        await cache_delete_pattern("netting_eff:*")
    except Exception:  # noqa: BLE001
        pass

    # Close-ordering correction: net any phantom settlement the force-close
    # branches above booked while a sibling position's margin was still
    # locked (same fix as the risk_enforcer stop-out path). Self-correcting
    # — no-op for users with no phantom; genuine capital-exhausted shortfall
    # is left intact. Only runs when something was actually force-closed.
    if force_closed and phantom_before:
        try:
            await wallet_service.net_phantom_settlement_for_users(phantom_before)
        except Exception:  # noqa: BLE001
            pass

    # Anti-fragmentation: the MIS→NRML flip above changes product_type
    # IN-PLACE, so a freshly-converted NRML position can now collide with a
    # PRE-EXISTING open NRML position for the SAME (user, token) — e.g. a
    # carry-forward leg from a prior settlement PLUS today's intraday leg that
    # just rolled overnight. `apply_fill` correctly kept them separate while
    # one was MIS and the other NRML (different product books), but once both
    # are NRML they must net into ONE row. Without this they sit as two OPEN
    # rows (the "same symbol do baar dikh raha / BUY+SELL dono open" bug).
    # `consolidate_open_positions` folds each user's OPEN book to one per
    # (token, product): same-side lots weighted-average into one; an opposing
    # BUY/SELL nets and realises the offset P&L exactly like a close. Reuses
    # the same helper the weekly-settlement reopen uses. Best-effort per user
    # — one user's failure never blocks the rollover.
    for _uid in converted_user_ids:
        try:
            await consolidate_open_positions(_uid)
        except Exception:  # noqa: BLE001
            logger.exception("intraday_to_carry_consolidate_failed user=%s", _uid)

    return {"converted": converted, "force_closed": force_closed, "skipped": skipped}


# Module-level kill switch + state — same pattern as risk_enforcer_loop.
_intraday_loop_stop = False
_last_rollover_day: dict[str, str] = {}


def stop_intraday_to_carry_loop() -> None:
    global _intraday_loop_stop
    _intraday_loop_stop = True


async def intraday_to_carry_loop(interval_sec: float = 60.0) -> None:
    """Wake every minute; at each segment group's close minute (once per
    IST day), run `convert_intraday_to_carry` against that group.

    Segment groups + close times come from time_utils:
        • Indian equity + F&O → 15:30 IST
        • MCX                 → 23:55 IST
        • Forex (CDS) + crypto → no close, skipped entirely

    Weekends are skipped (Indian exchanges are closed). The per-day
    bookkeeping `_last_rollover_day` ensures we only fire once per group
    even if the loop sleeps drift slightly past the close-minute mark.
    """
    import asyncio as _asyncio
    import logging as _logging

    from app.utils.time_utils import (
        INDIAN_EQUITY_FNO_SEGMENTS,
        MCX_SEGMENTS,
        is_weekend,
        market_close_time_for_segment,
        now_ist,
    )

    _log = _logging.getLogger(__name__)
    global _intraday_loop_stop
    _intraday_loop_stop = False

    groups = (
        ("INDIAN_EQUITY_FNO", INDIAN_EQUITY_FNO_SEGMENTS),
        ("MCX", MCX_SEGMENTS),
    )

    while not _intraday_loop_stop:
        try:
            now = now_ist()
            if not is_weekend(now.date()):
                day_key = now.strftime("%Y%m%d")
                for group_name, group_set in groups:
                    if _last_rollover_day.get(group_name) == day_key:
                        continue
                    close_t = market_close_time_for_segment(next(iter(group_set)))
                    if close_t is None:
                        continue
                    # Fire the minute after close — gives any straggler
                    # orders one tick to settle before we sweep.
                    fire_after = (close_t.hour, close_t.minute + 1)
                    if (now.hour, now.minute) >= fire_after:
                        summary = await convert_intraday_to_carry(group_set)
                        _last_rollover_day[group_name] = day_key
                        _log.info(
                            "intraday_to_carry_rolled",
                            extra={"group": group_name, **summary},
                        )
        except Exception:  # noqa: BLE001
            _log.exception("intraday_to_carry_loop_failed")
        try:
            await _asyncio.sleep(interval_sec)
        except _asyncio.CancelledError:
            return


async def consolidate_open_positions(user_id: PydanticObjectId | str) -> int:
    """Collapse fragmented OPEN positions to at most ONE per (token, product).

    `apply_fill` already merges same-instrument fills into a single position,
    but the weekly-settlement reopen creates a fresh doc per settled position
    (it never nets same-instrument ones), so a user can end up with the same
    stock split across many rows. This folds them back:

      • same-side lots → one weighted-avg position;
      • a BUY+SELL mix on the same instrument → net, and the overlapping qty
        realises P&L to the wallet (same formula a close uses). Right after a
        settlement every lot is at the identical settlement price, so that
        offset P&L is 0 — this stays money-neutral in the settlement path.

    Idempotent: a user with no duplicates is a no-op. Called at the end of the
    weekly-settlement batch so the reopen can never leave positions fragmented.
    Returns the number of (token, product) groups collapsed.
    """
    from collections import defaultdict

    uid = PydanticObjectId(str(user_id))
    opens = await Position.find(
        Position.user_id == uid,
        Position.status == PositionStatus.OPEN,
    ).to_list()

    groups: dict[tuple, list[Position]] = defaultdict(list)
    for p in opens:
        groups[(p.instrument.token, p.product_type.value)].append(p)

    def _wavg(lots: list[Position], qty_abs: float) -> Decimal:
        if qty_abs <= 0:
            return ZERO
        s = ZERO
        for p in lots:
            s += to_decimal(p.avg_price) * to_decimal(abs(float(p.quantity or 0)))
        return s / to_decimal(qty_abs)

    merged = 0
    for _key, lots in groups.items():
        if len(lots) <= 1:
            continue
        buys = [p for p in lots if float(p.quantity or 0) > 0]
        sells = [p for p in lots if float(p.quantity or 0) < 0]
        buy_qty = sum(float(p.quantity or 0) for p in buys)
        sell_qty = sum(-float(p.quantity or 0) for p in sells)
        if buy_qty <= 0 and sell_qty <= 0:
            continue

        buy_avg = quantize_money(_wavg(buys, buy_qty))
        sell_avg = quantize_money(_wavg(sells, sell_qty))
        offset = min(buy_qty, sell_qty)
        realized = (
            quantize_money((sell_avg - buy_avg) * to_decimal(offset)) if offset > 0 else ZERO
        )
        net_signed = buy_qty - sell_qty
        keep = min(lots, key=lambda p: p.opened_at or p.id.generation_time)

        # Book the offset's realised P&L (0 for same-side / same-price groups).
        if realized != ZERO:
            from app.core.exceptions import InsufficientFundsError
            from app.models.transaction import TransactionType
            from app.services import wallet_service

            narr = f"Auto-consolidate {lots[0].instrument.symbol}: netted offset {offset}"
            try:
                await wallet_service.adjust(
                    uid, realized, transaction_type=TransactionType.PNL,
                    narration=narr, reference_type="POSITION_DEFRAG",
                    reference_id=str(keep.id),
                )
            except InsufficientFundsError:
                if realized < ZERO:
                    await wallet_service.force_debit(
                        uid, -realized, transaction_type=TransactionType.PNL,
                        narration=f"{narr} (shortfall → outstanding)",
                        reference_type="POSITION_DEFRAG", reference_id=str(keep.id),
                    )
                else:
                    raise

        if net_signed == 0:
            for p in lots:
                await p.delete()
        else:
            net_side_lots = buys if net_signed > 0 else sells
            net_side_qty = buy_qty if net_signed > 0 else sell_qty
            net_side_margin = sum((to_decimal(p.margin_used or 0) for p in net_side_lots), ZERO)
            net_margin = (
                quantize_money(net_side_margin * to_decimal(abs(net_signed)) / to_decimal(net_side_qty))
                if net_side_qty > 0 else ZERO
            )
            largest = max(net_side_lots, key=lambda p: abs(float(p.quantity or 0)))
            keep.quantity = net_signed
            keep.opened_side = OrderAction.BUY if net_signed > 0 else OrderAction.SELL
            keep.avg_price = Decimal128(str(buy_avg if net_signed > 0 else sell_avg))
            keep.margin_used = Decimal128(str(net_margin))
            keep.realized_pnl = Decimal128("0")
            keep.opening_quantity = abs(net_signed)
            keep.stop_loss = largest.stop_loss
            keep.target = largest.target
            await keep.save()
            for p in lots:
                if p.id != keep.id:
                    await p.delete()
        merged += 1

    if merged:
        try:
            from app.services import wallet_service
            await wallet_service.recompute_used_margin(uid)
        except Exception:  # noqa: BLE001
            logger.exception("consolidate_recompute_margin_failed user=%s", uid)
        logger.info("consolidated_open_positions user=%s groups=%s", uid, merged)
    return merged
