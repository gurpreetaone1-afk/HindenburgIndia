"use client";

// Order logic for the phone UI. The pricing / lot / margin maths and
// submit() are a copy of components/trading/OrderPanel.tsx (same queries +
// keys, same validation, market-closed gate, optimistic merge into
// ["positions","open"] / ["positions","active-trades"] / ["orders","recent"],
// same toasts, same POST /user/orders payload). The APK TradeSheet and the
// chart BuySellBar both fire through `submit`.

import { useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { InstrumentAPI, OrderAPI, SegmentSettingsAPI, WalletAPI } from "@/lib/api";
import { useMarketStream } from "@/lib/useMarketStream";
import { isInstrumentMarketOpen, marketLabel } from "@/lib/marketHours";
import { playBuyTone, playSellTone } from "@/lib/trade-audio";
import { formatINR } from "@/lib/utils";

export type Side = "BUY" | "SELL";
export type OrderKind = "MARKET" | "LIMIT";

export interface OrderInput {
  orderType: OrderKind;
  lots: number;
  /** LIMIT price (string as typed). */
  price?: string;
  stopLoss?: string;
  target?: string;
}

const INDIAN_EXCH = ["NSE", "BSE", "MCX", "NFO", "BFO"];

/** Indian (Zerodha) instruments have an option chain; Infoway feeds don't. */
export function isOptionable(instrument: any): boolean {
  return INDIAN_EXCH.includes(String(instrument?.exchange ?? "").toUpperCase());
}

// apk OptionChainScreen: seeded MCX tradingsymbols → the Kite underlying the
// backend's option-chain resolver indexes by.
const MCX_OPTION_UNDERLYING: Record<string, string> = {
  MCXGOLD: "GOLD",
  MCXGOLDM: "GOLDM",
  MCXSILVER: "SILVER",
  MCXSILVERM: "SILVERM",
  MCXCRUDE: "CRUDEOIL",
  MCXCRUDEOIL: "CRUDEOIL",
  MCXNATGAS: "NATURALGAS",
  MCXNATURALGAS: "NATURALGAS",
  MCXCOPPER: "COPPER",
};

/** Strips TradingView suffixes ("NIFTY1!", "NIFTY_50") and maps seeded MCX symbols. */
export function normaliseUnderlying(raw: string): string {
  const base = raw.toUpperCase().replace(/\s+/g, "").replace(/1!$/, "").replace(/_50$/, "").trim();
  return MCX_OPTION_UNDERLYING[base] ?? base;
}

/** Underlying for the option chain: a FUT/OPT contract → its `name` (NIFTY). */
export function chainUnderlying(instrument: any): string {
  const seg = String(instrument?.segment ?? "").toUpperCase();
  const deriv = seg.includes("FUTURE") || seg.includes("OPTION");
  return normaliseUnderlying(String((deriv && instrument?.name) || instrument?.symbol || ""));
}

export function useOrderTicket(token: string | null, side: Side) {
  const qc = useQueryClient();
  const lastFireAt = useRef(0);

  const { data: instrument } = useQuery<any>({
    queryKey: ["instrument", token],
    queryFn: () => InstrumentAPI.detail(token!),
    enabled: !!token,
    staleTime: 5 * 60_000,
  });
  const { data: quote } = useQuery<any>({
    queryKey: ["quote", token],
    queryFn: () => InstrumentAPI.quote(token!),
    enabled: !!token,
    refetchInterval: 2500,
    staleTime: 1500,
    refetchOnWindowFocus: false,
  });
  const live = useMarketStream(token ? [token] : []);
  const tick = token ? live.get(token) : undefined;

  const { data: wallet } = useQuery<any>({
    queryKey: ["wallet", "summary"],
    queryFn: () => WalletAPI.summary(),
    staleTime: 2_000,
  });

  const seg = String(instrument?.segment ?? "").toUpperCase();
  const exch = String(instrument?.exchange ?? "").toUpperCase();
  const isCrypto = seg.includes("CRYPTO") || exch === "CRYPTO";
  const isForex = seg.includes("FOREX") || seg.includes("FX") || exch === "CDS";
  const isFno = seg.includes("FUTURE") || seg.includes("OPTION");
  const productType: "MIS" | "NRML" | "CNC" = isCrypto || isForex ? "NRML" : "MIS";

  const { data: eff } = useQuery<any>({
    queryKey: ["segment-settings", token, side, productType],
    queryFn: () => SegmentSettingsAPI.effective(token!, side, productType),
    enabled: !!token,
    staleTime: 5_000,
    refetchInterval: 8_000,
  });

  // ── Prices: live WS tick first, REST quote as fallback (terminal page) ──
  const liveLtp = Number(tick?.ltp ?? 0);
  const ltp = liveLtp > 0 ? liveLtp : Number(quote?.ltp ?? 0);
  const liveBid = Number(tick?.bid ?? 0);
  const liveAsk = Number(tick?.ask ?? 0);
  const rawBid = Number((liveBid > 0 ? liveBid : (quote?.bid ?? quote?.depth?.bids?.[0]?.price)) ?? 0) || 0;
  const rawAsk = Number((liveAsk > 0 ? liveAsk : (quote?.ask ?? quote?.depth?.asks?.[0]?.price)) ?? 0) || 0;

  // Broker spread (OrderPanel): fixed → ltp ± pips/2; floating → keep the
  // live book unless it is tighter than the minimum.
  const spreadPips = Number(eff?.spread_pips ?? 0) || 0;
  const spreadType = String(eff?.spread_type ?? "fixed").toLowerCase();
  let sellPrice = rawBid;
  let buyPrice = rawAsk;
  if (spreadPips > 0 && ltp > 0) {
    const liveSpread = rawBid > 0 && rawAsk > 0 ? rawAsk - rawBid : 0;
    if (spreadType !== "floating" || liveSpread < spreadPips) {
      buyPrice = ltp + spreadPips / 2;
      sellPrice = ltp - spreadPips / 2;
    }
  }

  const change = Number(tick?.change ?? quote?.change ?? 0) || 0;
  const changePct = Number(tick?.change_pct ?? quote?.change_pct ?? 0) || 0;
  const open = Number(tick?.open ?? quote?.open ?? 0) || 0;
  const high = Number(tick?.high ?? quote?.high ?? 0) || 0;
  const low = Number(tick?.low ?? quote?.low ?? 0) || 0;
  const prevClose = Number(tick?.close ?? quote?.prev_close ?? 0) || 0;
  const volume = tick?.volume ?? quote?.volume ?? null;

  // ── Lots (server-resolved, OrderPanel) ──
  const minLot = Number(eff?.min_lot ?? 1) || 1;
  const maxLotPerOrder = Number(eff?.order_lot ?? 0) || 0;
  const maxLotsPerScript = Number(eff?.max_each_lot ?? 0) || 0;
  const lotStep = minLot < 1 ? +minLot.toFixed(3) : 1;
  const defaultLot = INDIAN_EXCH.includes(exch) ? Math.max(1, minLot) : minLot;
  const lotSize = Number(eff?.lot_size ?? instrument?.lot_size ?? 1) || 1;

  // ── Margin (OrderPanel) ──
  const marginCalcMode = String(eff?.margin_calc_mode || "").toLowerCase();
  const fixedMarginPerLot = Number(eff?.fixed_margin_per_lot ?? 0);
  const marginPct =
    eff?.margin_percentage != null
      ? Number(eff.margin_percentage) / 100
      : isFno ? 0.13 : isCrypto ? 0.2 : isForex ? 0.05 : 1.0;
  const leverage = Number(eff?.leverage ?? 1) || 1;
  const ovnFixedPerLot = Number(eff?.overnight_fixed_margin_per_lot ?? 0);
  const ovnLeverage = Number(eff?.overnight_leverage ?? 1) || 1;
  const ovnMarginPct =
    eff?.overnight_margin_percentage != null ? Number(eff.overnight_margin_percentage) / 100 : 1;

  function margin(lots: number, refPrice: number) {
    const px = refPrice || ltp || 0;
    const perLot =
      marginCalcMode === "fixed" && fixedMarginPerLot > 0
        ? +fixedMarginPerLot.toFixed(2)
        : +((lotSize * px * marginPct) / leverage).toFixed(2);
    const carry =
      marginCalcMode === "fixed" && ovnFixedPerLot > 0
        ? +(ovnFixedPerLot * lots).toFixed(2)
        : +(((lotSize * px * ovnMarginPct) / ovnLeverage) * lots).toFixed(2);
    return { perLot, intraday: +(perLot * lots).toFixed(2), carry };
  }

  /** "50×" / "20%" / "500/lot" — what the margin tile is charging. */
  function marginHint(tier: "intraday" | "overnight"): string {
    if (!eff) return "";
    const fpm = tier === "intraday" ? fixedMarginPerLot : ovnFixedPerLot;
    const lev = tier === "intraday" ? leverage : ovnLeverage;
    const pct = tier === "intraday" ? marginPct : ovnMarginPct;
    if (marginCalcMode === "fixed" && fpm > 0) return `${Math.round(fpm)}/lot`;
    if (marginCalcMode === "times" || lev > 1) return `${+lev.toFixed(lev < 10 ? 1 : 0)}×`;
    return `${+(pct * 100).toFixed(2)}%`;
  }

  const priceDecimals = isCrypto ? 2 : isForex ? 4 : 2;
  const fmtPrice = (n: number | null | undefined) => {
    const v = Number(n ?? 0);
    return v > 0 && Number.isFinite(v) ? v.toFixed(priceDecimals) : "—";
  };
  const fmtLots = (n: number) => (isCrypto || isForex ? n.toFixed(2) : String(n));
  const roundPx = (n: number) => +n.toFixed(priceDecimals);

  /** Place an order exactly as OrderPanel.submit() does. Returns true when fired. */
  function submit(action: Side, input: OrderInput): boolean {
    const now = Date.now();
    if (now - lastFireAt.current < 350) return false; // double-tap guard (APK)
    lastFireAt.current = now;

    const { orderType, lots } = input;
    const price = input.price ?? "";
    const stopLoss = input.stopLoss ?? "";
    const target = input.target ?? "";

    if (!instrument) {
      toast.error("Instrument not loaded — try selecting it again");
      return false;
    }
    if (eff && eff.allow === false) {
      toast.error("Trading is disabled for this segment right now.");
      return false;
    }
    const sidePrice = action === "BUY" ? buyPrice : sellPrice;
    if (sidePrice <= 0) {
      toast.error(
        `Cannot ${action === "BUY" ? "buy" : "sell"} — no live ${action === "BUY" ? "ask" : "bid"} price for this instrument. Try a different contract.`,
      );
      return false;
    }
    if (!lots || lots < minLot) {
      toast.error(`Lots must be at least ${minLot}`);
      return false;
    }
    if (maxLotPerOrder > 0 && lots > maxLotPerOrder) {
      toast.error(`Maximum ${maxLotPerOrder} lot(s) per order`);
      return false;
    }
    if (orderType === "LIMIT" && !Number(price)) {
      toast.error("Enter a limit price");
      return false;
    }

    // Marketable-LIMIT guard.
    if (orderType === "LIMIT") {
      const limit = Number(price);
      const marketRef = sidePrice;
      if (marketRef > 0 && limit > 0) {
        const marketable = action === "BUY" ? limit >= marketRef : limit <= marketRef;
        if (marketable) {
          const dir = action === "BUY" ? "above" : "below";
          toast.error(
            `${action} LIMIT ${fmtPrice(limit)} is ${dir} the current price ${fmtPrice(marketRef)} — this order will fill immediately at market. To wait for price to reach ${fmtPrice(limit)} before ${action === "BUY" ? "buying" : "selling"}, use an SL-M order with trigger ${fmtPrice(limit)}.`,
            { duration: 6000 },
          );
          return false;
        }
      }
    }

    // Limit-away directional pre-check (LIMIT → must sit beyond the band).
    const limitAwayPct = Number(eff?.limit_percentage ?? 0) || 0;
    if (limitAwayPct > 0 && sidePrice > 0 && orderType === "LIMIT") {
      const candidate = Number(price);
      if (candidate > 0) {
        const upperCap = roundPx(sidePrice * (1 + limitAwayPct / 100));
        const lowerCap = roundPx(sidePrice * (1 - limitAwayPct / 100));
        const wantUpper = action !== "BUY"; // (side === BUY) XOR (LIMIT)
        if (wantUpper && candidate < upperCap) {
          toast.error(
            `Limit price ${fmtPrice(candidate)} is too close to market ${fmtPrice(sidePrice)}. Must be at least ${limitAwayPct}% away — minimum ${fmtPrice(upperCap)}.`,
            { duration: 6000 },
          );
          return false;
        }
        if (!wantUpper && candidate > lowerCap) {
          toast.error(
            `Limit price ${fmtPrice(candidate)} is too close to market ${fmtPrice(sidePrice)}. Must be at least ${limitAwayPct}% away — maximum ${fmtPrice(lowerCap)}.`,
            { duration: 6000 },
          );
          return false;
        }
      }
    }

    // SL / TP validation (ref = limit price for LIMIT, live side price for MARKET).
    const slTpRef = orderType === "LIMIT" && Number(price) > 0 ? Number(price) : sidePrice;
    if (slTpRef > 0) {
      const slNum = stopLoss ? Number(stopLoss) : 0;
      const tpNum = target ? Number(target) : 0;
      if (slNum > 0) {
        if (action === "BUY" && slNum >= slTpRef) {
          toast.error(`Stop Loss ₹${slNum} must be BELOW entry ₹${fmtPrice(slTpRef)} for a BUY order.`, { duration: 5000 });
          return false;
        }
        if (action === "SELL" && slNum <= slTpRef) {
          toast.error(`Stop Loss ₹${slNum} must be ABOVE entry ₹${fmtPrice(slTpRef)} for a SELL order.`, { duration: 5000 });
          return false;
        }
      }
      if (tpNum > 0) {
        if (action === "BUY" && tpNum <= slTpRef) {
          toast.error(`Target ₹${tpNum} must be ABOVE entry ₹${fmtPrice(slTpRef)} for a BUY order.`, { duration: 5000 });
          return false;
        }
        if (action === "SELL" && tpNum >= slTpRef) {
          toast.error(`Target ₹${tpNum} must be BELOW entry ₹${fmtPrice(slTpRef)} for a SELL order.`, { duration: 5000 });
          return false;
        }
      }
      if (limitAwayPct > 0) {
        const upper = roundPx(slTpRef * (1 + limitAwayPct / 100));
        const lower = roundPx(slTpRef * (1 - limitAwayPct / 100));
        if (slNum > 0 && slNum > lower && slNum < upper) {
          toast.error(
            `Stop Loss ₹${slNum} is too close to entry ₹${fmtPrice(slTpRef)}. Must be at least ${limitAwayPct}% away (≤ ₹${fmtPrice(lower)}).`,
            { duration: 6000 },
          );
          return false;
        }
        if (tpNum > 0 && tpNum > lower && tpNum < upper) {
          toast.error(
            `Target ₹${tpNum} is too close to entry ₹${fmtPrice(slTpRef)}. Must be at least ${limitAwayPct}% away (≥ ₹${fmtPrice(upper)}).`,
            { duration: 6000 },
          );
          return false;
        }
      }
    }

    // Market-closed gate.
    if (!isInstrumentMarketOpen(instrument.segment, instrument.exchange)) {
      const label = marketLabel(instrument.segment, instrument.exchange);
      toast.error(`${label} market is closed. Try placing an AMO instead.`, { duration: 5000 });
      return false;
    }

    const refPrice = orderType === "MARKET" ? sidePrice || ltp : Number(price || ltp);
    const m = margin(lots, refPrice);

    // Insufficient-balance pre-check (free + credit vs intraday margin).
    if (wallet) {
      const free = Number(wallet.free ?? wallet.available_balance ?? 0);
      const credit = Number(wallet.credit_limit ?? 0);
      const total = free + credit;
      if (m.intraday > 0 && total < m.intraday) {
        toast.error(`Insufficient balance — need ${formatINR(m.intraday)}, have ${formatINR(total)}`);
        return false;
      }
    }

    // Per-instrument cap (MAX_EACH_EXCEEDED).
    if (maxLotsPerScript > 0) {
      const openPositions = (qc.getQueryData<any[]>(["positions", "open"]) as any[] | undefined) || [];
      const existing = openPositions.find(
        (p) => p && p.instrument_token === instrument.token && p.product_type === productType,
      );
      const heldQty = Number(existing?.quantity ?? 0);
      const heldLots = lotSize > 0 ? heldQty / lotSize : 0;
      const projectedNet = heldLots + (action === "BUY" ? lots : -lots);
      const isReducing = Math.abs(projectedNet) < Math.abs(heldLots);
      if (!isReducing && Math.abs(projectedNet) > maxLotsPerScript) {
        toast.error(`Per-instrument cap reached: would hold ${Math.abs(projectedNet)} > ${maxLotsPerScript} lot(s)`);
        return false;
      }
    }

    if (action === "BUY") playBuyTone();
    else playSellTone();

    // ── Optimistic cache updates (OrderPanel) ──
    const optimisticId = `optimistic_${Date.now()}`;
    const signedQty = (action === "BUY" ? 1 : -1) * lots * lotSize;
    const fillPrice = refPrice || ltp || 0;
    const isImmediate = orderType === "MARKET";
    const sl = stopLoss ? Number(stopLoss) : null;
    const tp = target ? Number(target) : null;

    if (isImmediate) {
      qc.cancelQueries({ queryKey: ["positions", "open"] });
      qc.setQueryData<any[]>(["positions", "open"], (old) => {
        const prev = Array.isArray(old) ? old : [];
        const matchIdx = prev.findIndex(
          (p) => p && p.instrument_token === instrument.token && p.product_type === productType,
        );
        if (matchIdx < 0) {
          return [
            {
              id: optimisticId,
              _optimistic: true,
              symbol: instrument.symbol,
              exchange: instrument.exchange,
              segment_type: instrument.segment,
              product_type: productType,
              quantity: signedQty,
              lots: (action === "BUY" ? 1 : -1) * lots,
              lot_size: lotSize,
              avg_price: fillPrice,
              ltp: ltp || fillPrice,
              stop_loss: sl,
              target: tp,
              charges: 0,
              unrealized_pnl: 0,
              realized_pnl: 0,
              margin_used: m.perLot * lots,
              status: "OPEN",
              opened_at: new Date().toISOString(),
              instrument_token: instrument.token,
            },
            ...prev,
          ];
        }
        const existing = prev[matchIdx];
        const curQty = Number(existing.quantity) || 0;
        const curAvg = Number(existing.avg_price) || 0;
        const newQty = curQty + signedQty;
        let nextAvg = curAvg;
        if (newQty !== 0 && Math.sign(newQty) === Math.sign(curQty || signedQty)) {
          const totalAbs = Math.abs(curQty) + Math.abs(signedQty);
          nextAvg = totalAbs > 0 ? (curAvg * Math.abs(curQty) + fillPrice * Math.abs(signedQty)) / totalAbs : fillPrice;
        }
        const next = prev.slice();
        if (newQty === 0) next.splice(matchIdx, 1);
        else
          next[matchIdx] = {
            ...existing,
            quantity: newQty,
            avg_price: nextAvg,
            ltp: ltp || existing.ltp,
            margin_used: (Number(existing.margin_used) || 0) + m.perLot * lots,
          };
        return next;
      });

      qc.cancelQueries({ queryKey: ["positions", "active-trades"] });
      qc.setQueryData<any[]>(["positions", "active-trades"], (old) => {
        const prev = Array.isArray(old) ? old : [];
        return [
          {
            id: optimisticId,
            _optimistic: true,
            symbol: instrument.symbol,
            exchange: instrument.exchange,
            segment: instrument.segment,
            currency_quote: instrument.currency_quote,
            action,
            side: action,
            product_type: productType,
            quantity: Math.abs(signedQty),
            lots,
            lot_size: lotSize,
            price: fillPrice,
            avg_price: fillPrice,
            ltp: ltp || fillPrice,
            margin: m.perLot * lots,
            used_margin: m.perLot * lots,
            margin_used: m.perLot * lots,
            stop_loss: sl,
            target: tp,
            token: instrument.token,
            instrument_token: instrument.token,
            status: "OPEN",
            opened_at: new Date().toISOString(),
          },
          ...prev,
        ];
      });
    } else {
      const limitPrice = Number(price || 0);
      const totalQty = lots * lotSize;
      qc.setQueryData<any[]>(["orders", "recent"], (old) => {
        const prev = Array.isArray(old) ? old : [];
        return [
          {
            id: optimisticId,
            _optimistic: true,
            order_number: "—",
            symbol: instrument.symbol,
            exchange: instrument.exchange,
            segment: instrument.segment,
            token: instrument.token,
            instrument_token: instrument.token,
            action,
            order_type: orderType,
            product_type: productType,
            validity: "DAY",
            lots,
            quantity: totalQty,
            filled_quantity: 0,
            pending_quantity: totalQty,
            price: String(limitPrice),
            trigger_price: "0",
            average_price: "0",
            status: "OPEN",
            rejection_reason: null,
            is_amo: false,
            margin_blocked: String(m.perLot * lots),
            brokerage: "0",
            other_charges: "0",
            bracket_stop_loss: sl != null ? String(sl) : null,
            bracket_target: tp != null ? String(tp) : null,
            created_at: new Date().toISOString(),
            executed_at: null,
          },
          ...prev,
        ];
      });
    }

    let pendingToastId: string | number | undefined;
    if (isImmediate) {
      pendingToastId = toast.success(`${action} ${fmtLots(lots)} ${instrument.symbol} placed`, { duration: 1500 });
    }

    OrderAPI.place({
      token: instrument.token,
      action,
      order_type: orderType,
      product_type: productType,
      lots,
      price: isImmediate ? 0 : Number(price || 0),
      trigger_price: 0,
      validity: "DAY",
      is_amo: false,
      stop_loss: sl,
      target: tp,
      expected_price: isImmediate ? sidePrice || null : null,
    })
      .then(() => {
        if (!isImmediate) {
          toast.success(`${action} ${fmtLots(lots)} ${instrument.symbol} order placed`, { duration: 2000 });
        }
        qc.invalidateQueries({ queryKey: ["orders"] });
        qc.invalidateQueries({ queryKey: ["wallet"] });
        if (isImmediate) {
          setTimeout(() => qc.invalidateQueries({ queryKey: ["positions", "active-trades"] }), 1800);
        }
      })
      .catch((e: any) => {
        if (isImmediate) {
          qc.setQueryData<any[]>(["positions", "open"], (old) =>
            Array.isArray(old) ? old.filter((p) => p.id !== optimisticId) : [],
          );
          qc.setQueryData<any[]>(["positions", "active-trades"], (old) =>
            Array.isArray(old) ? old.filter((p) => p.id !== optimisticId) : [],
          );
        } else {
          qc.setQueryData<any[]>(["orders", "recent"], (old) =>
            Array.isArray(old) ? old.filter((o) => o.id !== optimisticId) : [],
          );
        }
        toast.error(e?.message || "Order rejected", { id: pendingToastId, duration: 6000 });
      });
    return true;
  }

  return {
    instrument,
    quote,
    tick,
    wallet,
    eff,
    settingsReady: !!eff && !!instrument,
    productType,
    ltp,
    buyPrice,
    sellPrice,
    change,
    changePct,
    open,
    high,
    low,
    prevClose,
    volume,
    minLot,
    maxLotPerOrder,
    maxLotsPerScript,
    lotStep,
    defaultLot,
    lotSize,
    isCrypto,
    isForex,
    margin,
    marginHint,
    fmtPrice,
    fmtLots,
    submit,
  };
}

export type OrderTicket = ReturnType<typeof useOrderTicket>;
