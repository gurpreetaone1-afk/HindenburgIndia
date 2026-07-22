"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { OrderAPI, PositionAPI, ProfileAPI, SegmentSettingsAPI, WalletAPI } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn, formatINR } from "@/lib/utils";
import { playBuyTone, playSellTone } from "@/lib/trade-audio";
import { isInstrumentMarketOpen, marketLabel } from "@/lib/marketHours";
import { ExpiryBanner } from "./ExpiryBanner";

interface Props {
  instrument: any;
  ltp: number;
  bid?: number | null;
  ask?: number | null;
  /** Day OHLC for the header strip (shown under the "<symbol> order" title,
   *  matching the chart header). Optional — hidden when unavailable. */
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  /** Live USD/INR rate from the quote feed. Used to convert USD-quoted
   *  margin into INR for display — without this the panel shows the USD
   *  number with a ₹ symbol, which makes a $4737 gold lot look like it
   *  needs ₹4,737 when it actually needs ~₹3,93,000. Defaults to 1 so
   *  INR-quoted instruments work as-is. */
  fxRate?: number;
}

const ORDER_TABS = [
  { key: "MARKET", label: "Market" },
  { key: "LIMIT", label: "Limit" },
  { key: "SL-M", label: "SL-M" },
] as const;

type OrderTab = (typeof ORDER_TABS)[number]["key"];

const _OP_EXPIRY_MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"] as const;

/** Friendly `DD-MMM-YYYY` rendering of the instrument's expiry, shown
 *  next to the order title for F&O contracts so the trader sees
 *  exactly which expiry their order will hit. */
function formatOrderPanelExpiry(raw: string | null | undefined): string {
  if (!raw) return "";
  const s = String(raw).slice(0, 10);
  const [y, m, d] = s.split("-");
  if (!y || !m || !d) return s;
  const mi = Number(m) - 1;
  if (mi < 0 || mi > 11) return s;
  return `${d}-${_OP_EXPIRY_MONTHS[mi]}-${y}`;
}

export function OrderPanel({ instrument, ltp, bid, ask, fxRate, open, high, low, close }: Props) {
  const qc = useQueryClient();

  // ── Segment-aware defaults ───────────────────────────────────────
  const seg = (instrument?.segment ?? "").toUpperCase();
  const exch = (instrument?.exchange ?? "").toUpperCase();
  const isCrypto = seg.includes("CRYPTO") || exch === "CRYPTO";
  // AllTick-mirrored forex / metals / energy all sit on virtual exchange CDS.
  // Treat them all as USD-quoted regardless of segment label.
  const isForex = seg.includes("FOREX") || seg.includes("FX") || exch === "CDS";
  const isFno = seg.includes("FUTURE") || seg.includes("OPTION");
  const isEquity = seg.includes("EQUITY") || seg === "" /* treat unknown as equity */;

  // Default product type: NRML for crypto/forex (no MIS auto-squareoff),
  // MIS for Indian intraday. (Lot defaults now come from the server's
  // resolved settings further below — admin is the source of truth.)
  const defaultProduct: "MIS" | "NRML" | "CNC" = isCrypto || isForex ? "NRML" : "MIS";

  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [orderType, setOrderType] = useState<OrderTab>("MARKET");
  const [productType, setProductType] = useState<"MIS" | "NRML" | "CNC">(defaultProduct);
  const [lots, setLots] = useState<number>(1);
  const [price, setPrice] = useState<string>("");
  const [trigger, setTrigger] = useState<string>("");
  const [stopLoss, setStopLoss] = useState<string>("");
  const [target, setTarget] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  // Per-order leverage scaling — 4 fixed chips (20/45/75/100). Default 100 =
  // full admin leverage. Only shown + applied when marginCalcMode === "times".
  const [leveragePct, setLeveragePct] = useState<number>(100);

  // One-Click trading flag (managed by PositionsTabs toolbar). When ON we
  // skip the order-confirm prompt; the user wants immediate execution. Sync
  // from localStorage on mount, then live-update via the broadcast event.
  const [oneClick, setOneClick] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setOneClick(window.localStorage.getItem("stock4x.terminal.oneClick") === "1");
    const onChange = (e: Event) => setOneClick(!!(e as CustomEvent).detail);
    window.addEventListener("oneclick:change", onChange);
    return () => window.removeEventListener("oneclick:change", onChange);
  }, []);

  // Subscribe to the SAME wallet-summary query the terminal layout polls
  // (4 s interval). Sharing the key means we read the freshest balance from
  // the React Query cache instead of issuing our own fetch — and the pre-
  // submit margin check below has live numbers without an extra round-trip.
  const { data: walletSummary } = useQuery<any>({
    queryKey: ["wallet", "summary"],
    queryFn: () => WalletAPI.summary(),
    staleTime: 2_000,
  });

  // Subscribe (not snapshot) to the open-positions cache. The terminal
  // page polls this query every ~2 s and the close-position dialogs
  // optimistically mutate it; subscribing here means the validation
  // memo below recomputes the moment a close lands, instead of getting
  // stuck on the held-lots value at first render. Using the same
  // queryKey React Query already populates avoids a duplicate fetch.
  const { data: openPositionsLive } = useQuery<any[]>({
    queryKey: ["positions", "open"],
    queryFn: () => PositionAPI.open(),
    staleTime: 2_000,
    refetchInterval: 2_000,
  });

  // Re-broker hold check — when the user already has a MARKET order
  // sleeping in the asymmetric-slippage queue, the BUY/SELL button
  // stays disabled until it executes. Server-side gate exists too,
  // but disabling the UI here avoids the user firing back-to-back
  // clicks during the visible delay window.
  const { data: pendingReorderOrders } = useQuery<any[]>({
    queryKey: ["orders", "pending-reorder"],
    queryFn: () => OrderAPI.list("PENDING_REORDER"),
    staleTime: 1_000,
    refetchInterval: 2_000,
  });
  const hasPendingReorder = (pendingReorderOrders?.length ?? 0) > 0;

  // When this user is on the re-order pipeline, the placement toast is
  // DEFERRED until the matching engine actually fires the parked order
  // ~N seconds later. We capture the order_id from the place_order
  // response so we can poll its status and pop the right toast (success
  // OR rejection) on transition out of PENDING_REORDER.
  const [pendingPlacement, setPendingPlacement] = useState<
    { id: string; side: "BUY" | "SELL"; lots: number; symbol: string } | null
  >(null);

  // 100-ms poll the specific parked order's status. Only enabled
  // while we're waiting on one. Backend now supports sub-second
  // delays (0.5 s, 0.3 s, etc.) so the toast latency budget has to
  // be small relative to the delay; 250 ms was 50 % of a 500 ms
  // delay, which felt sluggish. 100 ms keeps the toast within
  // ~100 ms of the actual fill. Per-tab REST traffic is bounded
  // to the re-order window so the higher cadence is fine.
  const { data: pendingOrderDetail } = useQuery<any>({
    queryKey: ["order-detail", pendingPlacement?.id],
    queryFn: () => OrderAPI.detail(pendingPlacement!.id),
    enabled: !!pendingPlacement?.id,
    refetchInterval: 100,
    staleTime: 0,
  });

  useEffect(() => {
    if (!pendingPlacement || !pendingOrderDetail) return;
    const status = String(pendingOrderDetail?.status ?? "").toUpperCase();
    if (status === "PENDING_REORDER") return; // still parked
    // Order has transitioned. REJECTED / CANCELLED → error toast with
    // the backend's rejection_reason so the user knows why their fill
    // didn't go through. Anything else (FILLED, OPEN, COMPLETE …) →
    // success toast.
    if (status === "REJECTED" || status === "CANCELLED") {
      const reason = pendingOrderDetail?.rejection_reason || "no live price";
      toast.error(
        `${pendingPlacement.side} ${pendingPlacement.lots} ${pendingPlacement.symbol} rejected — ${reason}`,
        { duration: 4000 },
      );
    } else {
      toast.success(
        `${pendingPlacement.side} ${pendingPlacement.lots} ${pendingPlacement.symbol} placed`,
        { duration: 1500 },
      );
    }
    setPendingPlacement(null);
    setSubmitting(false);
  }, [pendingOrderDetail, pendingPlacement]);

  // User profile — we only read `reorder_effective_delay_sec` here. When
  // that's > 0 the OrderPanel KNOWS this user is on the re-order pipeline,
  // so we skip the optimistic position insert altogether (the row would
  // otherwise flash in on click, vanish on the next 2-s positions poll
  // because the matching engine hasn't fired yet, and reappear after the
  // delay — exactly the bug the user reported). Long staleTime + slow
  // refetch because the value almost never changes during a session.
  const { data: me } = useQuery<any>({
    queryKey: ["users", "me"],
    queryFn: () => ProfileAPI.me(),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
  const reorderDelayActive =
    Number(me?.reorder_effective_delay_sec ?? 0) > 0;

  // Price field stays empty on LIMIT / SL-M switch — the placeholder shows
  // the limit-away boundary (see entryPlaceholder below) so the trader sees
  // the cap they need to stay within, and types the actual price they want
  // to fill at. Pre-filling with LTP / a small offset was confusing because
  // it looked like a committed value, not a suggestion — and it covered up
  // the limit-away placeholder the user explicitly asked for. If the trader
  // wants an instant-park price they can still type one; the matching
  // engine will park it in Pending whenever it sits outside the spread.

  // Pull effective segment-settings for this exact instrument + side + product
  // so margin, lot limits and brokerage shown here match what the server will
  // actually enforce. Refetch when any of those change.
  // Refetched every 8 s so admin's segment-settings save (margin %, leverage,
  // commission, lot caps) propagates to the live order panel within at most
  // ~8 s — the previous 30 s staleTime meant traders saw stale margin
  // numbers for half a minute after every admin tweak. Window-focus refetch
  // is on by default, so alt-tabbing back also picks up the new values.
  const { data: effSettings } = useQuery<any>({
    queryKey: ["segment-settings", instrument?.token, side, productType],
    queryFn: () => SegmentSettingsAPI.effective(instrument.token, side, productType),
    enabled: !!instrument?.token,
    staleTime: 5_000,
    refetchInterval: 8_000,
  });

  // Risk gate: admin can disable all non-MARKET orders globally.
  const pendingOrdersDisabled = Boolean(effSettings?.disable_pending_orders);

  // When the kill-switch turns ON mid-session, snap the selected tab back to
  // MARKET so the user isn't left staring at a LIMIT form they can't submit.
  useEffect(() => {
    if (pendingOrdersDisabled && orderType !== "MARKET") {
      setOrderType("MARKET");
      setPrice("");
      setTrigger("");
      setStopLoss("");
      setTarget("");
    }
  }, [pendingOrdersDisabled, orderType]);

  // Server-resolved lot defaults — drive the stepper min, max and default.
  // `minLots` = min lots per order, `orderLots` = max lots per order.
  const minLot = Number(effSettings?.min_lot ?? 1) || 1;
  const maxLotPerOrder = Number(effSettings?.order_lot ?? 0) || 0; // 0 = no cap
  // Admin's per-order MARGIN cap from the segment Value tile — checks
  // the order's required margin (NOT notional/total value) against this
  // ceiling. 0 = no cap. The backend mirrors this comparison in
  // order_validator.py:6c-enforce so what the panel shows here is what
  // the validator will reject on.
  const maxMarginPerOrder = Number(effSettings?.max_value ?? 0) || 0;
  // Per-instrument cap on the running net position (= maxLots/script in
  // the admin matrix). Mirrors the validator's MAX_EACH_EXCEEDED check
  // so the optimistic insert below never sees a value the server is
  // about to reject — without this the user briefly saw the position
  // size tick up to N+1 before the rejection rolled it back ~1 s later.
  const maxLotsPerScript = Number(effSettings?.max_each_lot ?? 0) || 0;
  // Server-enforced cap in UNITS (lots × lot_size), distinct from
  // `max_each_lot` which is in LOTS. The screenshot bug was caused by
  // only checking the lots-cap client-side while the server rejected on
  // this qty-cap — the order got optimistically inserted at 110 units,
  // then rolled back to 100 after the server toast. Mirror it here.
  const maxQtyPerScript = Number(effSettings?.max_qty_per_script ?? 0) || 0;
  // Stepper increment: when the segment's minimum is fractional (MCX 0.1,
  // crypto 0.001, forex 0.01) the +/− buttons should walk in the same units.
  // A hard-coded step of 1 made it impossible to go 0.1 → 0.2 → 0.3 from the
  // buttons, and turned an intended 0.1 entry into 0.01 if the user typed
  // through an off-by-one decimal place. Round-up to the next 0.001 to
  // avoid float-precision noise in the input.
  const lotStep = minLot < 1 ? +minLot.toFixed(3) : 1;
  // User-chosen default lot size from profile settings takes precedence
  // over the segment's minimum — clamped UP to min_lot so a user
  // default of 1 on a NIFTY future (min_lot=75) still seeds at 75
  // (the backend would reject anything smaller). When the profile
  // default is 0 / unset, fall back to the instrument minimum.
  const userDefaultLot = Number(me?.default_lot_size ?? 0) || 0;
  const defaultLot = userDefaultLot > 0 ? Math.max(userDefaultLot, minLot) : minLot;

  // Reset lot + product when instrument changes OR when we get a fresh
  // server-resolved minimum (so a crypto market correctly starts at 0.001
  // when admin set it that way).
  useEffect(() => {
    setLots(defaultLot);
    setProductType(defaultProduct);
    setStopLoss("");
    setTarget("");
  }, [instrument?.token, defaultLot, defaultProduct]);

  // Reset leverage back to 100% on symbol change so a leverage chosen for
  // one instrument doesn't bleed into the next selected symbol.
  useEffect(() => {
    setLeveragePct(100);
  }, [instrument?.token]);

  // Lot size — trust the backend across ALL segments.
  //   • Indian F&O (NSE / BSE / NFO / BFO): Zerodha CSV (NIFTY=75, …).
  //   • MCX: canonical commodity table (GOLD=100, …).
  //   • Forex: standard CFD lot — 100,000 base units / lot
  //     (1 EURUSD lot at 1.08 = $108,000 notional).
  //   • Spot metals: XAUUSD=100 troy oz / lot, XAGUSD=5,000, etc.
  //   • Energy: USOIL=1,000 barrels / lot, NATGAS=10,000 mmBtu.
  //   • Indices / Crypto / international stocks: 1 / lot.
  // All these come baked into `instrument.lot_size` from the backend
  // (Infoway mirror + per-order self-heal). effSettings.lot_size is the
  // admin override slot when set.
  const lotSize = effSettings?.lot_size ?? instrument?.lot_size ?? 1;
  const qty = lots * lotSize;
  // For MARKET orders the user will fill at the close-side price they see
  // on the BUY/SELL strip (BUY → ask, SELL → bid). Using that price (rather
  // than the LTP midpoint) for both notional and margin keeps the order
  // panel's Total value / Margin numbers aligned with what's actually
  // booked at execution — otherwise the user sees a number that's off by
  // half-spread × quantity. LIMIT orders use the user-entered price as
  // they always did.
  const sideQuote = side === "BUY" ? (ask ?? ltp ?? 0) : (bid ?? ltp ?? 0);
  const refPrice = orderType === "MARKET" ? (sideQuote || ltp) : Number(price || ltp);
  const notional = qty * refPrice;

  // Server-resolved margin %  (admin's segment-settings → script-override →
  // user-override). Fall back to coarse client constants only while the
  // settings query is still loading, never for the actual order submission.
  const serverMarginPct =
    effSettings?.margin_percentage != null
      ? Number(effSettings.margin_percentage) / 100
      : isFno
        ? 0.13
        : isCrypto
          ? 0.2
          : isForex
            ? 0.05
            : 1.0;
  const serverLeverage = Number(effSettings?.leverage ?? 1) || 1;
  // FX conversion has been disabled platform-wide — Infoway-fed prices
  // (crypto / forex / metals / energy / international equities) are now
  // treated as INR directly, so margin math runs against the raw feed
  // number without a USD→INR multiplier. Keeping the names so downstream
  // formulas don't need to change; both are hard-coded to the no-op
  // values that the previous "native-INR segment" branch produced.
  void fxRate;
  const isUsdSeg = false;
  const fxMultiplier = 1;
  // Admin's margin-mode dropdown — "fixed" means the configured value is
  // a flat ₹/lot, the rest of the price × lot_size math is bypassed.
  const marginCalcMode = String(effSettings?.margin_calc_mode || "").toLowerCase();
  const fixedMarginPerLot = Number(effSettings?.fixed_margin_per_lot ?? 0);

  // Per-order leverage scaling: only active in TIMES mode.
  // effectiveTimes = admin's leverage × (leveragePct / 100).
  // A lower % reduces the effective leverage → more margin required per lot.
  const effectiveTimes = useMemo(() => {
    if (marginCalcMode !== "times") return null;
    const base = Number(effSettings?.leverage ?? serverLeverage);
    return base * (leveragePct / 100);
  }, [marginCalcMode, effSettings, serverLeverage, leveragePct]);

  const marginPerLot = useMemo(() => {
    if (marginCalcMode === "fixed" && fixedMarginPerLot > 0) {
      // Flat ₹/lot — admin's configured number, charged once per lot
      // regardless of price/lot_size. Matches the backend validator's
      // fixed-mode short-circuit in order_validator.py.
      return +fixedMarginPerLot.toFixed(2);
    }
    if (marginCalcMode === "times" && effectiveTimes != null && effectiveTimes > 0) {
      // Times mode with per-order leverage scaling: use the scaled leverage
      // rather than the raw serverLeverage so the live display matches what
      // the backend will actually lock.
      return +(((lotSize * (refPrice || ltp || 0) * serverMarginPct) / effectiveTimes) * fxMultiplier).toFixed(2);
    }
    // Legacy percent / fallback: notional × marginPct ÷ leverage × fx.
    // `refPrice` is the BUY/SELL close-side price (ask for BUY, bid for
    // SELL) so the displayed margin tracks the price the order fills at.
    return +(((lotSize * (refPrice || ltp || 0) * serverMarginPct) / serverLeverage) * fxMultiplier).toFixed(2);
  }, [marginCalcMode, fixedMarginPerLot, effectiveTimes, lotSize, refPrice, ltp, serverMarginPct, serverLeverage, fxMultiplier]);
  const intradayMargin = +(marginPerLot * lots).toFixed(2);

  // Carryforward (overnight) margin tile — must use the SERVER-RESOLVED
  // overnight leverage / margin% / fixed-per-lot, not a hard-coded 1.4×
  // intraday multiplier. The 1.4× shortcut was masking the admin's
  // "Overnight Margin" segment-settings value entirely: admin set
  // NSE_FUT intraday=200× / overnight=400× expecting the carry tile to
  // show a TIGHTER (lower) margin than intraday, but the UI rendered
  // 7,779 × 1.4 = 10,890 (looser than intraday) because the override
  // never reached this calc. Mirrors the intraday formula above using
  // the overnight triple the resolver puts on effSettings; falls back
  // to the intraday number when the overnight fields aren't present
  // (intraday-only segments like FOREX / CRYPTO / spot Commodity).
  const serverOvernightMarginPct =
    effSettings?.overnight_margin_percentage != null
      ? Number(effSettings.overnight_margin_percentage) / 100
      : serverMarginPct;
  const serverOvernightLeverage =
    Number(effSettings?.overnight_leverage ?? 0) || serverLeverage;
  const overnightFixedMarginPerLot = Number(
    effSettings?.overnight_fixed_margin_per_lot ?? 0,
  );
  // Per-order leverage scaling on the carry-forward tile too — same as the
  // intraday `effectiveTimes`. Without this the Carryforward tile ignored
  // the leverage chip (the chip only moved the Intraday tile). Mirrors the
  // mobile TradeDetailSheet.
  const effectiveOvernightTimes = useMemo(() => {
    if (marginCalcMode !== "times") return null;
    const scaled = serverOvernightLeverage * (leveragePct / 100);
    return scaled > 0 ? scaled : serverOvernightLeverage;
  }, [marginCalcMode, serverOvernightLeverage, leveragePct]);
  const overnightMarginPerLot = useMemo(() => {
    if (marginCalcMode === "fixed" && overnightFixedMarginPerLot > 0) {
      return +overnightFixedMarginPerLot.toFixed(2);
    }
    if (marginCalcMode === "fixed" && fixedMarginPerLot > 0) {
      // Fixed-mode segment but admin didn't configure the overnight
      // fixed value — fall back to the intraday flat ₹/lot rather than
      // running the leveraged formula.
      return +fixedMarginPerLot.toFixed(2);
    }
    const ovnLev =
      marginCalcMode === "times" && effectiveOvernightTimes && effectiveOvernightTimes > 0
        ? effectiveOvernightTimes
        : serverOvernightLeverage;
    return +(
      ((lotSize * (refPrice || ltp || 0) * serverOvernightMarginPct) / ovnLev) *
      fxMultiplier
    ).toFixed(2);
  }, [
    marginCalcMode,
    overnightFixedMarginPerLot,
    fixedMarginPerLot,
    effectiveOvernightTimes,
    lotSize,
    refPrice,
    ltp,
    serverOvernightMarginPct,
    serverOvernightLeverage,
    fxMultiplier,
  ]);
  const carryforwardMargin = +(overnightMarginPerLot * lots).toFixed(2);

  // Intraday display tile — ALWAYS the intraday tier, independent of the
  // selected product_type. The active `marginPerLot` / `serverLeverage`
  // switch to the overnight tier for NRML/CNC orders, and Infoway
  // (crypto/forex) panels run in NRML by default — so without a dedicated
  // intraday source the Intraday tile mirrored the Carry-forward tile.
  // Reads the backend's `intraday_*` triple; falls back to the active
  // values when an older API doesn't send them.
  const serverIntradayMarginPct =
    effSettings?.intraday_margin_percentage != null
      ? Number(effSettings.intraday_margin_percentage) / 100
      : serverMarginPct;
  const serverIntradayLeverage =
    Number(effSettings?.intraday_leverage ?? 0) || serverLeverage;
  const intradayFixedMarginPerLot = Number(
    effSettings?.intraday_fixed_margin_per_lot ?? 0,
  );
  const effectiveIntradayTimes = useMemo(() => {
    if (marginCalcMode !== "times") return null;
    const scaled = serverIntradayLeverage * (leveragePct / 100);
    return scaled > 0 ? scaled : serverIntradayLeverage;
  }, [marginCalcMode, serverIntradayLeverage, leveragePct]);
  const intradayTileMarginPerLot = useMemo(() => {
    if (marginCalcMode === "fixed" && intradayFixedMarginPerLot > 0) {
      return +intradayFixedMarginPerLot.toFixed(2);
    }
    if (marginCalcMode === "fixed" && fixedMarginPerLot > 0) {
      return +fixedMarginPerLot.toFixed(2);
    }
    const intraLev =
      marginCalcMode === "times" && effectiveIntradayTimes && effectiveIntradayTimes > 0
        ? effectiveIntradayTimes
        : serverIntradayLeverage;
    return +(
      ((lotSize * (refPrice || ltp || 0) * serverIntradayMarginPct) / intraLev) *
      fxMultiplier
    ).toFixed(2);
  }, [
    marginCalcMode,
    intradayFixedMarginPerLot,
    fixedMarginPerLot,
    effectiveIntradayTimes,
    lotSize,
    refPrice,
    ltp,
    serverIntradayMarginPct,
    serverIntradayLeverage,
    fxMultiplier,
  ]);
  const intradayTileMargin = +(intradayTileMarginPerLot * lots).toFixed(2);
  // `notional` is in the instrument's quote currency. For USD-quoted segments
  // (crypto / forex / spot metals / energy) that's dollars; for Indian segments
  // it's already rupees. The breakdown tile renders everything with ₹, so we
  // convert USD → INR before display. Without this the Total value just shows
  // the USD number with a ₹ symbol — making an $80k BTC notional look like
  // ₹80k when it's actually ~₹66.8 lakh.
  const notionalInr = isUsdSeg ? notional * fxMultiplier : notional;
  const totalValue = notionalInr;

  // Brokerage preview using the same commission_type / commission_value the
  // server will charge. Statutory components (STT, exchange, SEBI, stamp, DP) come from the
  // BrokeragePlan and aren't included here — admin's segment-settings only
  // drives the brokerage portion.
  // PERCENTAGE / PER_CRORE rates are quoted against INR turnover — so we
  // must use the INR-converted notional, not the raw USD one.
  const brokeragePreview = useMemo(() => {
    if (!effSettings) return null;
    const ctype = (effSettings.commission_type || "PER_LOT").toUpperCase();
    const cval = Number(effSettings.commission_value ?? 0);
    if (!cval) return 0;
    let b = 0;
    if (ctype === "FLAT") b = cval;
    else if (ctype === "PERCENTAGE") b = (notionalInr * cval) / 100;
    else if (ctype === "PER_CRORE") b = (notionalInr * cval) / 1e7;
    else b = cval * Math.max(0.01, lots); // PER_LOT
    const minB = Number(effSettings.min_brokerage ?? 0);
    return Math.max(b, minB);
  }, [effSettings, notionalInr, lots]);

  const orderTypeApi: "MARKET" | "LIMIT" | "SL_M" =
    orderType === "SL-M" ? "SL_M" : (orderType as "MARKET" | "LIMIT");

  // Real exchange quotes. Backend now leaves bid/ask at 0 when there's
  // no real depth (illiquid options, dead-instrument feeds) instead of
  // collapsing to LTP — that way the panel can refuse the trade
  // instead of letting the user fire an order against a fake price.
  const sellPrice = bid ?? 0;
  const buyPrice = ask ?? 0;
  // The side we're about to submit on. When 0 the trade is unfillable
  // — illiquid instruments routinely show one side > 0 and the other
  // at 0 (e.g. far-OTM options with only one-sided depth).
  const sidePriceMissing =
    (side === "BUY" && buyPrice <= 0) || (side === "SELL" && sellPrice <= 0);

  // No currency prefix anywhere price is shown — display the bare
  // grouped number. Decimal count still varies by instrument so crypto
  // stays at 2 places and forex keeps 4 places.
  const isUsdQuoted = false;
  const priceCcy = "";
  const priceDecimals = isCrypto ? 2 : isForex ? 4 : 2;
  function fmtPrice(n: number) {
    // Show an em-dash when the feed has no real quote for this side —
    // the actual number `0.00` is misleading (looks like a tradeable
    // ₹0 price), and the SELL/BUY card now visually represents "no
    // quote available".
    if (!n || n <= 0) return "—";
    return `${priceCcy}${Number(n).toFixed(priceDecimals)}`;
  }

  // ── Limit-away hints ────────────────────────────────────────────
  // `limitAwayPercent` is the MINIMUM distance the limit price / SL-M
  // trigger must sit from the live market reference. Anything inside
  // the ±pct band is rejected (`order_validator.py:_check`). The
  // placeholder shown to the trader is the NEAREST allowed boundary —
  // entering exactly that value, or anything further from market in
  // the same direction, passes; values between market and the
  // boundary are rejected as "too close".
  //
  //   LIMIT semantics (better-price intent):
  //     • BUY LIMIT  → placed AT or BELOW market × (1 − pct/100)
  //     • SELL LIMIT → placed AT or ABOVE market × (1 + pct/100)
  //   SL-M semantics (stop / breakout intent):
  //     • BUY SL-M  → trigger AT or ABOVE market × (1 + pct/100)
  //     • SELL SL-M → trigger AT or BELOW market × (1 − pct/100)
  //
  // `wantUpperEntry` XORs side with order kind so each combination
  // points at the correct boundary the trader must reach.
  //
  // Bracket SL / TP placeholders below are unchanged — they describe
  // the close-leg minimum-distance cap, which is always opposite the
  // entry direction regardless of LIMIT vs SL-M.
  const limitAwayPct = Number(effSettings?.limit_percentage ?? 0) || 0;
  const limitEntryRef = side === "BUY" ? buyPrice : sellPrice;
  const limitBracketRef =
    orderType !== "MARKET" && Number(price) > 0
      ? Number(price)
      : side === "BUY"
        ? sellPrice
        : buyPrice;
  const _roundPx = (n: number) => +n.toFixed(priceDecimals);
  // For BUY-side: LIMIT wants the LOWER cap, SL-M wants the UPPER cap.
  // For SELL-side: LIMIT wants the UPPER cap, SL-M wants the LOWER cap.
  // `wantUpper = (side === "BUY") XOR (orderType === "LIMIT")` collapses
  // the 4-case truth table into a single boolean.
  const wantUpperEntry = (side === "BUY") !== (orderType === "LIMIT");
  const entryPlaceholder =
    limitAwayPct > 0 && limitEntryRef > 0
      ? String(
          _roundPx(
            wantUpperEntry
              ? limitEntryRef * (1 + limitAwayPct / 100)
              : limitEntryRef * (1 - limitAwayPct / 100),
          ),
        )
      : "";
  // SL boundary (closes the position).
  //   Long  → SL is below entry → lower bound = ref × (1 − pct/100)
  //   Short → SL is above entry → upper bound = ref × (1 + pct/100)
  const slPlaceholder =
    limitAwayPct > 0 && limitBracketRef > 0
      ? String(
          _roundPx(
            side === "BUY"
              ? limitBracketRef * (1 - limitAwayPct / 100)
              : limitBracketRef * (1 + limitAwayPct / 100),
          ),
        )
      : "";
  // TP boundary — mirror of SL on the opposite direction.
  const tpPlaceholder =
    limitAwayPct > 0 && limitBracketRef > 0
      ? String(
          _roundPx(
            side === "BUY"
              ? limitBracketRef * (1 + limitAwayPct / 100)
              : limitBracketRef * (1 - limitAwayPct / 100),
          ),
        )
      : "";

  function fmtLots(n: number) {
    return isCrypto || isForex ? n.toFixed(2) : String(n);
  }

  // ── Live order-eligibility check ────────────────────────────────────
  // Computes a single reason string when the order, as currently typed,
  // would be rejected by the validator. Returns null when everything is
  // green. The BUY / SELL button is disabled + a persistent warning
  // banner renders while this is non-null, so the trader sees the
  // failing rule continuously instead of having to click + get a toast
  // back from the server.
  //
  // Order of checks mirrors `submit()` below — the first failing rule
  // wins so the banner shows the same reason the click would surface.
  // Network-only checks (matching-engine race conditions, server-side
  // wallet lock at the moment of fill) stay inside submit() — those
  // can't be pre-computed.
  const validationReason = useMemo<string | null>(() => {
    if (!instrument) return "Instrument not loaded";
    // Note: hasPendingReorder no longer surfaces a banner here —
    // user asked to remove the "Previous order pending — executing
    // shortly…" warning and rely on the BUY button's loading
    // spinner instead. The button itself stays disabled via the
    // submitting state set on click, so double-fires are still
    // blocked.
    if (sidePriceMissing) {
      return `No live ${side === "BUY" ? "ask" : "bid"} price — cannot ${side === "BUY" ? "buy" : "sell"} right now`;
    }
    if (!isInstrumentMarketOpen(
      instrument.segment as string | undefined,
      instrument.exchange as string | undefined,
    )) {
      const label = marketLabel(
        instrument.segment as string | undefined,
        instrument.exchange as string | undefined,
      );
      return `${label} market is closed — try AMO instead`;
    }
    if (!lots || lots < minLot) {
      return `Minimum ${minLot} lot${minLot === 1 ? "" : "s"} required`;
    }
    if (maxLotPerOrder > 0 && lots > maxLotPerOrder) {
      return `Maximum ${maxLotPerOrder} lot${maxLotPerOrder === 1 ? "" : "s"} per order`;
    }
    if (maxMarginPerOrder > 0) {
      // Per-segment cumulative cap: sum margin_used of every open
      // position whose segment-or-symbol resolves to the same admin
      // tile as this instrument, add the new order's margin, compare
      // against the cap. Matches the validator's resolve_admin_segment_name
      // bucketing — closing BANKNIFTY doesn't free an NIFTY-only slot
      // and vice-versa; but two NIFTY positions DO share the NSE_FUT
      // cap. Front-end can't perfectly mirror the symbol-aware
      // resolver, so we filter on the position's segment_type
      // (same field the backend resolver routes from) plus exact
      // symbol-token match for instruments not yet in the cache —
      // good enough to surface the warning live; backend is the
      // source of truth for the actual rejection.
      const ownSeg = String(
        (instrument as any)?.segment ?? "",
      ).toUpperCase();
      let segMarginUsed = 0;
      for (const p of openPositionsLive ?? []) {
        const pSeg = String(p?.segment_type ?? p?.segment ?? "").toUpperCase();
        // Group by exact segment_type — coarse but correct for the
        // common case (NSE_FUT positions all share NSE_FUT cap, NSE
        // OPT positions share NSE_OPT cap, etc.). Index-vs-stock
        // distinction is rare to mix on one user's book.
        if (pSeg === ownSeg) {
          segMarginUsed += Number(p?.margin_used ?? 0);
        }
      }
      const projected = segMarginUsed + intradayMargin;
      if (projected > maxMarginPerOrder) {
        return `Per-segment margin cap ${formatINR(maxMarginPerOrder)} would be breached (using ${formatINR(segMarginUsed)} + this order ${formatINR(intradayMargin)} = ${formatINR(projected)})`;
      }
    }
    if (orderType === "LIMIT" && !Number(price)) {
      return "Enter a limit price";
    }
    if (orderType === "SL-M" && !Number(trigger)) {
      return "Enter a trigger price";
    }

    // Net-position cap (admin's max-lots-per-script). Counts the
    // existing open position + delta of this order; closing/reducing
    // orders are exempt. Uses `openPositionsLive` (subscribed via
    // useQuery above) instead of a non-reactive `qc.getQueryData`
    // snapshot — so when the trader closes a lot the held count
    // refreshes here within one poll tick and the warning + button
    // re-enable on their own without needing another panel input
    // to change.
    const openPositionsList: any[] = openPositionsLive ?? [];
    const existingPos = openPositionsList.find(
      (p) =>
        p &&
        p.instrument_token === instrument.token &&
        p.product_type === productType,
    );
    const heldQty = Number(existingPos?.quantity ?? 0);
    const heldLots = lotSize > 0 ? Math.abs(heldQty) / lotSize : 0;
    const signedHeldLots = lotSize > 0 ? heldQty / lotSize : 0;
    const deltaLots = side === "BUY" ? lots : -lots;
    const projectedNet = signedHeldLots + deltaLots;
    const isReducing =
      signedHeldLots !== 0 && Math.abs(projectedNet) < Math.abs(signedHeldLots);

    if (
      maxLotsPerScript > 0 &&
      !isReducing &&
      Math.abs(projectedNet) > maxLotsPerScript
    ) {
      // Wording is symbol-explicit so the trader knows WHICH instrument
      // they need to close — the per-instrument cap doesn't share lots
      // across symbols (closing BANKNIFTY doesn't free a NIFTY slot).
      if (heldLots >= maxLotsPerScript) {
        return `${instrument.symbol} at per-instrument cap (${heldLots}/${maxLotsPerScript} lots) — close a ${instrument.symbol} lot first to buy more`;
      }
      return `${instrument.symbol}: this order would push you to ${Math.abs(projectedNet)} lots (cap ${maxLotsPerScript})`;
    }
    if (maxQtyPerScript > 0 && !isReducing) {
      const projectedQty = Math.abs(projectedNet) * lotSize;
      if (projectedQty > maxQtyPerScript) {
        return `${instrument.symbol} per-script qty cap ${maxQtyPerScript} would be exceeded (holding ${Math.abs(heldQty)} + new ${lots * lotSize})`;
      }
    }

    // Insufficient-balance pre-check — exact same arithmetic the
    // server-side wallet_service.lock_margin uses.
    if (!isReducing && walletSummary) {
      const free = Number(walletSummary.free ?? walletSummary.available_balance ?? 0);
      const credit = Number(walletSummary.credit_limit ?? 0);
      const total = free + credit;
      if (intradayMargin > 0 && total < intradayMargin) {
        return `Insufficient balance — need ${formatINR(intradayMargin)}, have ${formatINR(total)}`;
      }
    }

    // Marketable-LIMIT pre-check (BUY LIMIT ≥ ask = would fill at market).
    if (orderType === "LIMIT") {
      const limit = Number(price);
      const marketRef = side === "BUY" ? buyPrice : sellPrice;
      if (marketRef > 0 && limit > 0) {
        const marketable = side === "BUY" ? limit >= marketRef : limit <= marketRef;
        if (marketable) {
          return `${side} LIMIT would fill immediately at market — use SL-M for a stop-${side === "BUY" ? "buy" : "sell"} above/below market`;
        }
      }
    }

    // Limit-away pre-check (admin's limitAwayPercent — minimum distance
    // the limit price must sit away from market).
    if (limitAwayPct > 0 && limitEntryRef > 0 && (orderType === "LIMIT" || orderType === "SL-M")) {
      const candidate = orderType === "LIMIT" ? Number(price) : Number(trigger);
      if (candidate > 0) {
        const upperCap = _roundPx(limitEntryRef * (1 + limitAwayPct / 100));
        const lowerCap = _roundPx(limitEntryRef * (1 - limitAwayPct / 100));
        const wantUpper = (side === "BUY") !== (orderType === "LIMIT");
        const label = orderType === "LIMIT" ? "Limit" : "Trigger";
        if (wantUpper && candidate < upperCap) {
          return `${label} ${fmtPrice(candidate)} too close to market — must be ≥ ${fmtPrice(upperCap)} (${limitAwayPct}% away)`;
        }
        if (!wantUpper && candidate > lowerCap) {
          return `${label} ${fmtPrice(candidate)} too close to market — must be ≤ ${fmtPrice(lowerCap)} (${limitAwayPct}% away)`;
        }
      }
    }

    // SL / TP directional sanity.
    const slNum = stopLoss ? Number(stopLoss) : 0;
    const tpNum = target ? Number(target) : 0;
    if (slNum > 0 || tpNum > 0) {
      const entryRef =
        orderType === "LIMIT"
          ? Number(price)
          : orderType === "SL-M"
            ? Number(trigger)
            : side === "BUY"
              ? buyPrice
              : sellPrice;
      if (entryRef > 0) {
        if (slNum > 0) {
          if (side === "BUY" && slNum >= entryRef) {
            return `Stop loss must be BELOW entry ${fmtPrice(entryRef)} for a BUY`;
          }
          if (side === "SELL" && slNum <= entryRef) {
            return `Stop loss must be ABOVE entry ${fmtPrice(entryRef)} for a SELL`;
          }
        }
        if (tpNum > 0) {
          if (side === "BUY" && tpNum <= entryRef) {
            return `Target must be ABOVE entry ${fmtPrice(entryRef)} for a BUY`;
          }
          if (side === "SELL" && tpNum >= entryRef) {
            return `Target must be BELOW entry ${fmtPrice(entryRef)} for a SELL`;
          }
        }
      }
    }

    return null;
  }, [
    instrument,
    sidePriceMissing,
    side,
    lots,
    minLot,
    maxLotPerOrder,
    maxMarginPerOrder,
    orderType,
    price,
    trigger,
    productType,
    lotSize,
    maxLotsPerScript,
    maxQtyPerScript,
    walletSummary,
    intradayMargin,
    buyPrice,
    sellPrice,
    limitAwayPct,
    limitEntryRef,
    stopLoss,
    target,
    openPositionsLive,
    hasPendingReorder,
  ]);

  function submit() {
    if (!instrument) {
      toast.error("Instrument not loaded — try selecting it again");
      return;
    }
    if (!lots || lots < minLot) {
      toast.error(`Lots must be at least ${minLot}`);
      return;
    }
    if (maxLotPerOrder > 0 && lots > maxLotPerOrder) {
      toast.error(`Maximum ${maxLotPerOrder} lot(s) per order`);
      return;
    }
    if (orderType === "LIMIT" && !Number(price)) {
      toast.error("Enter a limit price");
      return;
    }
    if (orderType === "SL-M" && !Number(trigger)) {
      toast.error("Enter a trigger price");
      return;
    }

    // ── Marketable-LIMIT guard ────────────────────────────────────────
    // A BUY LIMIT at a price ≥ the current ask (or a SELL LIMIT ≤ bid)
    // mirrors the matching engine's `_should_fill` condition — the order
    // would fire on the very next 1.5 s poller tick. Standard exchange
    // semantics, but traders kept setting a "wait until price reaches 250"
    // BUY LIMIT below market and got confused when it filled in 3 s. That
    // intent is a stop-buy, not a limit. We block here with a clear toast
    // pointing at SL-M so the user picks the right tool — and the order
    // never leaves the panel, no optimistic flicker, no surprise position.
    //
    // Compare against the close-side price the panel is showing live:
    //   BUY  → ask (the price you'd pay if you took the offer right now)
    //   SELL → bid (the price you'd get if you hit the bid right now)
    // Falls through silently when bid/ask haven't loaded (e.g. fresh
    // mount, feed lag) — server-side `_should_fill` still catches it.
    if (orderType === "LIMIT") {
      const limit = Number(price);
      const marketRef = side === "BUY" ? buyPrice : sellPrice;
      if (marketRef > 0 && limit > 0) {
        const marketable =
          side === "BUY" ? limit >= marketRef : limit <= marketRef;
        if (marketable) {
          const dir = side === "BUY" ? "above" : "below";
          // Toast is English-only — the previous wording mixed Hinglish
          // ("yeh order turant fill ho jaayega...") which slipped into
                // shipped UI per the broker spec.
          toast.error(
            `${side} LIMIT ${fmtPrice(limit)} is ${dir} the current price ${fmtPrice(marketRef)} — this order will fill immediately at market. To wait for price to reach ${fmtPrice(limit)} before ${side === "BUY" ? "buying" : "selling"}, use an SL-M order with trigger ${fmtPrice(limit)}.`,
            { duration: 6000 },
          );
          return;
        }
      }
    }

    // ── Limit-away directional pre-check ─────────────────────────────
    // `limitAwayPercent` is the MINIMUM distance the limit price /
    // SL-M trigger must sit away from the live market reference — the
    // band (lower, upper) immediately around market is rejected, the
    // region BEYOND each boundary is allowed. Direction-aware: for a
    // BUY LIMIT the trader is pushing the price below market, so the
    // candidate must be ≤ lower bound; for a SELL LIMIT ≥ upper bound;
    // BUY SL-M ≥ upper bound; SELL SL-M ≤ lower bound. The XOR rule
    // below collapses the 4-case table. Backend re-runs the same check
    // (symmetric, exclusive band) against its own bid/ask snapshot;
    // this just prevents the optimistic insert + rollback flicker when
    // the user types a value too close to market.
    if (limitAwayPct > 0 && limitEntryRef > 0 && (orderType === "LIMIT" || orderType === "SL-M")) {
      const candidate = orderType === "LIMIT" ? Number(price) : Number(trigger);
      if (candidate > 0) {
        const upperCap = _roundPx(limitEntryRef * (1 + limitAwayPct / 100));
        const lowerCap = _roundPx(limitEntryRef * (1 - limitAwayPct / 100));
        const wantUpper = (side === "BUY") !== (orderType === "LIMIT");
        const label = orderType === "LIMIT" ? "Limit price" : "Trigger price";
        // BUY SL-M / SELL LIMIT — must be AT LEAST upperCap (above
        // market by ≥ pct). Anything below the bound is "too close".
        if (wantUpper && candidate < upperCap) {
          toast.error(
            `${label} ${fmtPrice(candidate)} is too close to market ${fmtPrice(limitEntryRef)}. Must be at least ${limitAwayPct}% away — minimum ${fmtPrice(upperCap)}.`,
            { duration: 6000 },
          );
          return;
        }
        // BUY LIMIT / SELL SL-M — must be AT MOST lowerCap (below
        // market by ≥ pct). Anything above the bound is "too close".
        if (!wantUpper && candidate > lowerCap) {
          toast.error(
            `${label} ${fmtPrice(candidate)} is too close to market ${fmtPrice(limitEntryRef)}. Must be at least ${limitAwayPct}% away — maximum ${fmtPrice(lowerCap)}.`,
            { duration: 6000 },
          );
          return;
        }
      }
    }

    // ── SL / TP directional sanity ───────────────────────────────────
    // The backend rejects wrong-side SL/TP with SL_WRONG_SIDE / TP_WRONG_SIDE,
    // but doing the same check client-side avoids the optimistic insert
    // and rollback flicker. Reference price uses the entry the order will
    // actually land at: LIMIT/SL-M → user-typed price/trigger; MARKET →
    // the BUY ask / SELL bid the panel is showing right now.
    //   • BUY  (long) :  SL  <  entry  AND  TP  >  entry
    //   • SELL (short):  SL  >  entry  AND  TP  <  entry
    const slNum = stopLoss ? Number(stopLoss) : 0;
    const tpNum = target ? Number(target) : 0;
    if (slNum > 0 || tpNum > 0) {
      const entryRef =
        orderType === "LIMIT"
          ? Number(price)
          : orderType === "SL-M"
            ? Number(trigger)
            : side === "BUY"
              ? buyPrice
              : sellPrice;
      if (entryRef > 0) {
        if (slNum > 0) {
          if (side === "BUY" && slNum >= entryRef) {
            toast.error(`Stop loss must be BELOW entry ${fmtPrice(entryRef)} for a BUY`);
            return;
          }
          if (side === "SELL" && slNum <= entryRef) {
            toast.error(`Stop loss must be ABOVE entry ${fmtPrice(entryRef)} for a SELL`);
            return;
          }
        }
        if (tpNum > 0) {
          if (side === "BUY" && tpNum <= entryRef) {
            toast.error(`Target must be ABOVE entry ${fmtPrice(entryRef)} for a BUY`);
            return;
          }
          if (side === "SELL" && tpNum >= entryRef) {
            toast.error(`Target must be BELOW entry ${fmtPrice(entryRef)} for a SELL`);
            return;
          }
        }
      }
    }

    // ── Expiry-day cutoff pre-check ───────────────────────────────────
    // Admin can set `expiryCutoffMinutes` per segment — the validator
    // rejects new entries during the last X minutes before market
    // close on the EXPIRY day itself, since Phase-4 auto-squareoff
    // would force-flatten them almost immediately. The exact backend
    // gate is in `order_validator.py`; we mirror it here so the user
    // doesn't fire an order that's guaranteed to be rejected.
    // Skipped for reducing/closing orders (those compute below via
    // `isReducing` — kept the check above the netting computation by
    // doing a quick targeted lookup here).
    {
      const cutoffMin = Number(effSettings?.expiry_cutoff_minutes ?? 0) || 0;
      const expiryRaw = (instrument as any)?.expiry as string | null | undefined;
      if (cutoffMin > 0 && expiryRaw) {
        const exp = String(expiryRaw).slice(0, 10);
        const todayIst = new Date(
          new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
        );
        const todayIso = `${todayIst.getFullYear()}-${String(
          todayIst.getMonth() + 1,
        ).padStart(2, "0")}-${String(todayIst.getDate()).padStart(2, "0")}`;
        if (exp === todayIso) {
          // Same close-time map as the backend's _close_time_for_segment
          // and the ExpiryBanner component — keep them in sync.
          const seg = ((instrument as any)?.segment ?? "").toUpperCase();
          const closeHHMM = seg.startsWith("MCX")
            ? "23:30"
            : seg.startsWith("CDS") || seg === "FOREX"
            ? "17:00"
            : seg.startsWith("CRYPTO")
            ? "23:55"
            : seg === "STOCKS" || seg === "INDICES"
            ? "21:00"
            : "15:30";
          const [hh, mm] = closeHHMM.split(":").map(Number);
          const closeIst = new Date(todayIst);
          closeIst.setHours(hh, mm, 0, 0);
          const gateIst = new Date(closeIst.getTime() - cutoffMin * 60_000);
          // Reducing-orders check is below this block — for the cutoff
          // we need a quick local netting peek so closes always go
          // through. Mirrors the lower `isReducing` computation but
          // limited to what we need here.
          const openPositionsCacheLocal =
            (qc.getQueryData<any[]>(["positions", "open"]) as
              | any[]
              | undefined) || [];
          const existingPosLocal = openPositionsCacheLocal.find(
            (p) =>
              p &&
              p.instrument_token === instrument.token &&
              p.product_type === productType,
          );
          const heldQtyLocal = Number(existingPosLocal?.quantity ?? 0);
          const heldLotsLocal = lotSize > 0 ? heldQtyLocal / lotSize : 0;
          const deltaLotsLocal = side === "BUY" ? lots : -lots;
          const projectedNetLocal = heldLotsLocal + deltaLotsLocal;
          const isReducingLocal =
            heldLotsLocal !== 0 &&
            Math.abs(projectedNetLocal) < Math.abs(heldLotsLocal);
          if (!isReducingLocal && todayIst >= gateIst) {
            toast.error(
              `New entries blocked — this contract auto-closes at ${closeHHMM} IST today, and new orders are not allowed within ${cutoffMin} minutes of close. Closing trades are still allowed.`,
            );
            return;
          }
        }
      }
    }

    // ── No-quote pre-check ────────────────────────────────────────────
    // Illiquid instruments (deep-OTM options like GOLD150000CE, dead
    // feeds, stale tickers) come back from the backend with the
    // trading-side price at 0 — there's no real bid/ask to fill
    // against. Submitting anyway would either reject server-side or
    // fill at a junk price. Block it here with a clear English
    // warning so the user knows why the order didn't go through.
    if (sidePriceMissing) {
      toast.error(
        `Cannot ${side === "BUY" ? "buy" : "sell"} — no live ${
          side === "BUY" ? "ask" : "bid"
        } price for this instrument. Try a different contract.`,
      );
      return;
    }

    // ── Market-closed pre-check ───────────────────────────────────────
    // The backend's order_validator raises MarketClosedError when the
    // instrument's segment is outside its trading window (NSE/BSE 9:15-
    // 15:30 IST, MCX 9:00-23:30 IST, Forex 24/5, Crypto 24/7, etc.). The
    // backend toast says "Market is closed. Place AMO instead." but it
    // only fires AFTER the round-trip — by then the optimistic insert
    // below has already shown the position row in the Positions tab. The
    // user sees the trade appear, then disappear with an error toast.
    // Pre-check here against the same hours the backend uses so the
    // order never leaves the panel and the positions table stays clean.
    if (
      !isInstrumentMarketOpen(
        instrument.segment as string | undefined,
        instrument.exchange as string | undefined,
      )
    ) {
      const label = marketLabel(
        instrument.segment as string | undefined,
        instrument.exchange as string | undefined,
      );
      toast.error(`${label} market is closed. Try placing an AMO instead.`, {
        duration: 5000,
      });
      return;
    }

    // ── Netting pre-flight: detect reducing/closing orders ───────────
    // The same instrument+product can be held long OR short — a SELL
    // against an open long (or BUY against an open short) is REDUCING
    // exposure, not creating new exposure, so it must NOT be gated by
    // margin or per-instrument-cap checks. Without this guard the
    // insufficient-balance toast fired on a sell-to-close when the
    // wallet didn't have headroom for an unrelated fresh short — the
    // user-reported "trade open hai me sell karna chahta hu par margin
    // check kar rha" bug. The validator already does the same check
    // server-side (`order_validator.py:is_reducing`); we mirror it
    // here to keep the panel UX consistent with the server's verdict.
    const openPositionsCache =
      (qc.getQueryData<any[]>(["positions", "open"]) as any[] | undefined) ||
      [];
    const existingPos = openPositionsCache.find(
      (p) =>
        p &&
        p.instrument_token === instrument.token &&
        p.product_type === productType,
    );
    const heldQty = Number(existingPos?.quantity ?? 0);
    const heldLots = lotSize > 0 ? heldQty / lotSize : 0;
    const deltaLots = side === "BUY" ? lots : -lots;
    const projectedNet = heldLots + deltaLots;
    // `signed_held` semantics — positive = net long, negative = net
    // short. Reducing = the absolute exposure shrinks (could even flip
    // through zero on an over-close, in which case the over-portion
    // becomes a fresh opposite leg — but for sub-position closes the
    // check below is exact).
    const isReducing =
      heldLots !== 0 && Math.abs(projectedNet) < Math.abs(heldLots);

    // ── Insufficient-balance pre-check ────────────────────────────────
    // The backend's `wallet_service.lock_margin` rejects the order with
    // INSUFFICIENT_FUNDS when (available_balance + credit_limit) < margin.
    // Without this guard, the optimistic insert below fires anyway — the
    // user sees a phantom position for ~1 s, then the server rejection
    // rolls it back and an error toast appears. Doing the math here mirrors
    // the same check, so the order never leaves the panel and the
    // positions table stays clean. We only block when we *know* the user
    // is short — if the wallet hasn't loaded yet, fall through and let the
    // server decide (safer than blocking a valid trade behind a stale
    // cache). Skipped entirely for reducing orders.
    if (!isReducing && walletSummary) {
      // Dabba / CFD pre-flight: deployable money is `free` (= equity −
      // margin), not just available cash. A wallet with float losses
      // already has those losses subtracted from `free`, so the check
      // matches the server's enforcement post-PnL.
      const free = Number(
        walletSummary.free ?? walletSummary.available_balance ?? 0,
      );
      const credit = Number(walletSummary.credit_limit ?? 0);
      const total = free + credit;
      if (intradayMargin > 0 && total < intradayMargin) {
        toast.error(
          `Insufficient balance — need ${formatINR(intradayMargin)}, have ${formatINR(total)}`,
        );
        return;
      }
    }

    // ── Per-instrument cap pre-check (MAX_EACH_EXCEEDED) ──────────────
    // Mirrors validator.py's `max_each` check. Without this, a follow-up
    // order that would push the position past the admin's
    // `maxLots/script` cap is sent to the server, the optimistic insert
    // briefly tickets the position size up, and ~1 s later the server
    // rejection rolls it back — the user-reported "1 sec ke liye size
    // badh jata hai" flicker. Computing the projected net here keeps
    // the rejected click invisible to the UI.
    if (
      maxLotsPerScript > 0 &&
      !isReducing &&
      Math.abs(projectedNet) > maxLotsPerScript
    ) {
      toast.error(
        `Per-instrument cap reached: would hold ${Math.abs(projectedNet)} > ${maxLotsPerScript} lot(s)`,
      );
      return;
    }

    // ── Per-script qty cap pre-check (MAX_QTY_PER_SCRIPT) ─────────────
    // Mirrors order_validator.py:611. The cap is in UNITS, not lots —
    // e.g. SBIN with lot_size=1 and cap=100 means at most 100 shares
    // total across all entries. Without this guard the server toast
    // fires AFTER the optimistic insert briefly shows 110 units in the
    // Size column, then the rollback snaps it back to 100 — the bug
    // visible in the screenshot.
    if (maxQtyPerScript > 0 && !isReducing) {
      const projectedQty = Math.abs(projectedNet) * lotSize;
      if (projectedQty > maxQtyPerScript) {
        toast.error(
          `Per-script quantity cap ${maxQtyPerScript} would be breached (held ${Math.abs(heldQty)} + new ${lots * lotSize})`,
        );
        return;
      }
    }

    // No confirm dialog — every BUY/SELL fires straight through to the
    // API. Pro-terminal behaviour: you're already looking at the panel,
    // an extra "are you sure?" just adds latency.

    // ── Audio cue: fires the instant the user commits, BEFORE the network
    // round-trip — that's what makes it feel pro-platform tight. The click
    // itself is the user-gesture that unlocks AudioContext on first use.
    if (side === "BUY") playBuyTone();
    else playSellTone();

    // ── Optimistic updates: shape depends on order_type ─────────────
    // MARKET orders execute server-side immediately, so we insert a
    // placeholder Position. LIMIT / SL-M orders sit in OPEN status until
    // the matching engine's 1.5 s poller sees LTP cross the limit — they
    // must NEVER touch the positions cache, otherwise the user sees a
    // "filled" trade and a P&L that doesn't reflect the actual server
    // state. For those, we drop an optimistic row into the orders cache
    // so the pending-orders panel reacts instantly instead.
    const optimisticId = `optimistic_${Date.now()}`;
    const signedQty = (side === "BUY" ? 1 : -1) * lots * lotSize;
    const fillPrice = refPrice || ltp || 0;
    const isImmediate = orderTypeApi === "MARKET";
    // When this user is on the re-order pipeline (global default or
    // per-user override → effective delay > 0), the backend parks the
    // order with status=PENDING_REORDER for ~N seconds before the
    // matching engine fires. Doing the optimistic position insert in
    // that case causes the row to flash in on click → vanish on the
    // next 2-s positions poll (server has no Position yet) → reappear
    // after the delay. Skip the insert entirely — the real row lands
    // once via the regular poll after the fill, no flicker.
    const skipOptimistic = isImmediate && reorderDelayActive;

    if (isImmediate && !skipOptimistic) {
      // Cancel any in-flight positions refetch FIRST — otherwise the poll
      // that's already on the wire returns server data (without our trade
      // yet) and overwrites the optimistic row before the user sees it.
      qc.cancelQueries({ queryKey: ["positions", "open"] });

      // ── Merge with existing position (same instrument + product) ──────
      // The backend's position_service.apply_fill folds same-side fills
      // into ONE position row with a weighted-avg price. The optimistic
      // update must mirror that — otherwise each click of "BUY" briefly
      // shows a SEPARATE optimistic row in the Positions tab until the
      // server response lands and collapses them back into one. From the
      // user's perspective the table flickers between 4 rows and 1 row.
      qc.setQueryData<any[]>(["positions", "open"], (old) => {
        const prev = Array.isArray(old) ? old : [];
        const matchIdx = prev.findIndex(
          (p) =>
            p &&
            p.instrument_token === instrument.token &&
            p.product_type === productType
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
              // Include lots + lot_size so the positions panel's resolveQty
              // doesn't fall back to dividing by 1 (which would mis-display
              // a fractional-lot MCX order as e.g. "3 lots" until the next
              // server poll catches up).
              lots: (side === "BUY" ? 1 : -1) * lots,
              lot_size: lotSize,
              avg_price: fillPrice,
              ltp: ltp || fillPrice,
              stop_loss: stopLoss ? Number(stopLoss) : null,
              target: target ? Number(target) : null,
              charges: 0,
              unrealized_pnl: 0,
              realized_pnl: 0,
              margin_used: marginPerLot * lots,
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
          nextAvg =
            totalAbs > 0
              ? (curAvg * Math.abs(curQty) + fillPrice * Math.abs(signedQty)) / totalAbs
              : fillPrice;
        }

        const merged = {
          ...existing,
          quantity: newQty,
          // Keep `lots` in lock-step with quantity so the LOT column
          // updates in the same tick as SIZE. Without this the merge
          // updated only quantity → resolveQty kept reading the stale
          // `existing.lots` until the 2 s positions-poll caught up,
          // which is the "LOT updates late" symptom the user saw.
          lots: (Number(existing.lots) || 0) + (side === "BUY" ? 1 : -1) * lots,
          avg_price: nextAvg,
          ltp: ltp || existing.ltp,
          margin_used: (Number(existing.margin_used) || 0) + marginPerLot * lots,
        };

        const next = prev.slice();
        if (newQty === 0) {
          next.splice(matchIdx, 1);
        } else {
          next[matchIdx] = merged;
        }
        return next;
      });
    } else {
      // LIMIT / SL-M: park an optimistic order row so the pending-orders
      // panel reacts immediately. Shape mirrors backend orders.py
      // `_serialize` so the panel can render it the same as real rows.
      const limitPrice = Number(price || 0);
      const triggerPrice = orderType === "SL-M" ? Number(trigger || 0) : 0;
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
            action: side,
            order_type: orderTypeApi,
            product_type: productType,
            validity: "DAY",
            lots,
            quantity: totalQty,
            filled_quantity: 0,
            pending_quantity: totalQty,
            price: String(limitPrice),
            trigger_price: String(triggerPrice),
            average_price: "0",
            status: "OPEN",
            rejection_reason: null,
            is_amo: false,
            margin_blocked: String(marginPerLot * lots),
            brokerage: "0",
            other_charges: "0",
            bracket_stop_loss: stopLoss ? String(Number(stopLoss)) : null,
            bracket_target: target ? String(Number(target)) : null,
            created_at: new Date().toISOString(),
            executed_at: null,
          },
          ...prev,
        ];
      });
    }

    // Lock out the button until the API responds AND (for reorder users)
    // the matching engine actually fires the parked order ~N seconds
    // later. Cleared in .then()/.catch() for instant fills; cleared by
    // the pendingPlacement useEffect above for re-order fills.
    setSubmitting(true);

    // Synchronous "placed" toast — only for INSTANT fills. Re-order
    // users get the toast deferred until the order transitions out of
    // PENDING_REORDER (via the pendingPlacement / pendingOrderDetail
    // useEffect above), so the popup pairs with the row actually
    // landing in Positions (the user's explicit ask: "execute
    // notification trade execute hone ke baad ana chahiye").
    const pendingToastId = skipOptimistic
      ? null
      : toast.success(
          `${side} ${fmtLots(lots)} ${instrument.symbol} placed`,
          { duration: 1500 },
        );

    OrderAPI.place({
      token: instrument.token,
      action: side,
      order_type: orderTypeApi,
      product_type: productType,
      lots,
      price: orderType === "MARKET" ? 0 : Number(price || 0),
      trigger_price: orderType === "SL-M" ? Number(trigger || 0) : 0,
      validity: "DAY",
      is_amo: false,
      stop_loss: stopLoss ? Number(stopLoss) : null,
      target: target ? Number(target) : null,
      // For MARKET orders, pin the fill at exactly what the user just saw
      // on the BUY/SELL strip (ask for BUY, bid for SELL). The backend
      // caps this at ±1% from the current live bid/ask so a tampered
      // client can't book off-market, but inside that band the displayed
      // price wins — ENTRY then matches the panel down to the rupee.
      expected_price:
        orderType === "MARKET" ? (side === "BUY" ? buyPrice : sellPrice) || null : null,
      // Per-order leverage scaling. Only meaningful in TIMES mode; backend
      // ignores it for FIXED segments. UI restricts to 4 chips but backend
      // accepts any 1-100.
      leverage_pct: leveragePct,
    })
      .then((resp: any) => {
        // ── Re-order delay branch ─────────────────────────────────
        // When the user (or global default) has a re-order delay
        // configured, the backend parks this MARKET order with
        // status=PENDING_REORDER and the matching engine fires it
        // ~N seconds later. We must:
        //   • Roll back the optimistic POSITION row — no fill has
        //     happened yet; leaving it in place would flicker out
        //     on the next 2-s positions poll (which returns no
        //     matching row from the server) and reappear after the
        //     delay (matching the bug the user reported).
        //   • Suppress the "placed" success toast — the order
        //     hasn't actually executed yet.
        //   • Show a "queued" toast so the user knows the click
        //     was accepted and an execution will follow.
        // The real Position lands via the regular 2-s positions
        // poll once the executor finishes the asymmetric fill.
        // `resp` is the already-unwrapped OrderOut — unwrap() strips
        // the {data: ...} envelope, so the fields are directly on
        // `resp` (not `resp.data`). Previous version read resp.data.id
        // which was always undefined, breaking the deferred-toast +
        // submitting-clear flow for re-order users.
        const respStatus = String(resp?.status ?? "").toUpperCase();
        if (respStatus === "PENDING_REORDER") {
          // Defensive rollback — `skipOptimistic` already prevented the
          // insert when reorderDelayActive was true at click time, but
          // when the user-me cache is stale (e.g. admin just toggled
          // reorder ON for this user) the response can still come back
          // PENDING_REORDER even though we did insert. Filter just in
          // case so we never leave a phantom row behind.
          if (isImmediate && !skipOptimistic) {
            qc.setQueryData<any[]>(["positions", "open"], (old) =>
              Array.isArray(old) ? old.filter((p) => p.id !== optimisticId) : []
            );
          }
          // Stash the parked order's id so the pendingOrderDetail
          // poll above can drive the deferred toast (success or
          // rejected) once the executor fires. Works for BOTH the
          // already-known reorder case AND the stale-me catch-up
          // (cached delay was 0 but server applied one anyway).
          const orderId = String(resp?.id ?? "");
          if (orderId) {
            setPendingPlacement({
              id: orderId,
              side: side as "BUY" | "SELL",
              lots,
              symbol: instrument.symbol,
            });
          }
          // Dismiss the eager "placed" toast in the stale-me case —
          // the order hasn't actually executed yet, the deferred
          // useEffect will pop the right one once it does.
          if (!skipOptimistic && pendingToastId !== null) {
            toast.dismiss(pendingToastId);
          }
          // Refresh the cached effective-delay so next click takes the
          // fast path (skipOptimistic = true) without another stale hit.
          qc.invalidateQueries({ queryKey: ["users", "me"] });
          // Eagerly seed the pending-reorder cache so the BUY/SELL button
          // stays disabled INSTANTLY (no 2-s gap waiting for the next
          // OrderAPI.list("PENDING_REORDER") poll). The real row replaces
          // this synthetic one on the next poll.
          qc.setQueryData<any[]>(["orders", "pending-reorder"], (old) => {
            const prev = Array.isArray(old) ? old : [];
            return [
              {
                id: String(resp?.id ?? `pending_${Date.now()}`),
                status: "PENDING_REORDER",
                symbol: instrument.symbol,
              },
              ...prev,
            ];
          });
          qc.invalidateQueries({ queryKey: ["orders", "pending-reorder"] });
          qc.invalidateQueries({ queryKey: ["wallet"] });
          // Do NOT setSubmitting(false) here — the button must stay
          // loading until the matching engine actually fires the order
          // ~N seconds later. The pendingPlacement useEffect clears
          // submitting + pops the deferred "placed" toast at that point.
          return;
        }
        // Success toast already fired synchronously above — no need to
        // double-pop here. Just refresh dependent caches.
        // DO NOT invalidate "positions" here for MARKET — that triggers an
        // immediate refetch which can return server data that doesn't yet
        // include the new trade (Atlas can be ~100 ms behind the write
        // that just succeeded), and the resulting "flicker" wipes the
        // optimistic row for one tick before the next regular poll
        // restores it. The 2 s polling interval handles reconciliation.
        // For LIMIT/SL-M we DO want an orders refetch so the optimistic
        // placeholder is replaced with the real persisted row (carries
        // the proper id, order_number, server-side margin).
        qc.invalidateQueries({ queryKey: ["orders"] });
        qc.invalidateQueries({ queryKey: ["wallet"] });
        setSubmitting(false);
      })
      .catch((e: any) => {
        // Rollback whichever optimistic row we inserted — server rejected
        // the order so the user shouldn't see a phantom position/order.
        // (Nothing to roll back when skipOptimistic was true.)
        if (isImmediate && !skipOptimistic) {
          qc.setQueryData<any[]>(["positions", "open"], (old) =>
            Array.isArray(old) ? old.filter((p) => p.id !== optimisticId) : []
          );
        } else {
          qc.setQueryData<any[]>(["orders", "recent"], (old) =>
            Array.isArray(old) ? old.filter((o) => o.id !== optimisticId) : []
          );
        }
        // Dismiss the early success toast (instant-fill path only) and
        // show the real rejection. Clear the deferred-toast tracker so
        // the useEffect doesn't fire a stale "placed" later.
        if (pendingToastId !== null) toast.dismiss(pendingToastId);
        setPendingPlacement(null);
        toast.error(e.message || "Order rejected");
        setSubmitting(false);
      });
  }

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="space-y-2 border-b border-border px-3 py-2">
        <div className="flex items-baseline gap-2">
          <div className="text-sm font-semibold">{instrument?.symbol ?? "—"} order</div>
          {instrument?.expiry && (
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Expiry {formatOrderPanelExpiry(instrument.expiry)}
            </div>
          )}
        </div>
        {/* Day OHLC strip — mirrors the chart header so the trader sees the
            session's Open/High/Low/Close right on the order panel. */}
        {[open, high, low, close].some((v) => Number(v) > 0) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] tabular-nums">
            <span className="text-muted-foreground">
              O <span className="text-foreground">{fmtPrice(Number(open) || 0)}</span>
            </span>
            <span className="text-muted-foreground">
              H <span className="text-emerald-500">{fmtPrice(Number(high) || 0)}</span>
            </span>
            <span className="text-muted-foreground">
              L <span className="text-red-500">{fmtPrice(Number(low) || 0)}</span>
            </span>
            <span className="text-muted-foreground">
              C <span className="text-foreground">{fmtPrice(Number(close) || 0)}</span>
            </span>
          </div>
        )}
        {/* Expiry-day banner — invisible 99% of the time. Fires red
            on the expiry day itself (with the IST auto-squareoff
            time from `expiry_squareoff.py`'s per-segment map) and
            amber one day before, so the trader doesn't open a
            fresh NRML carry that'd get force-flattened the next
            day. */}
        <ExpiryBanner
          expiry={instrument?.expiry as string | null | undefined}
          segment={instrument?.segment as string | null | undefined}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 scrollbar-thin">
        {/* Order type tabs (the decorative "Trade" button that sat above was
            a no-op heading and just stole vertical space — removed.)
            When `pendingOrdersDisabled`, only the MARKET tab is shown and
            a grey informational banner replaces the hidden tabs. */}
        {pendingOrdersDisabled ? (
          <>
            <div className="grid grid-cols-1 border-b border-border text-xs">
              <button
                type="button"
                className="relative py-2 text-foreground"
              >
                Market
                <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-t bg-primary" />
              </button>
            </div>
            <div className="mt-2 rounded-md border border-muted-foreground/30 bg-muted/30 px-2.5 py-1.5 text-[11px] text-muted-foreground">
              Only MARKET orders are accepted at the moment.
            </div>
          </>
        ) : (
          <div className="grid grid-cols-3 border-b border-border text-xs">
            {ORDER_TABS.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => setOrderType(o.key)}
                className={cn(
                  "relative py-2 transition-colors",
                  orderType === o.key ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {o.label}
                {orderType === o.key && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-t bg-primary" />}
              </button>
            ))}
          </div>
        )}

        {/* SELL / BUY price cards — compact: label + price on one row so
            the whole panel fits in the viewport without scrolling. */}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setSide("SELL")}
            className={cn(
              "flex items-center justify-between rounded-md border px-2.5 py-1.5 text-left transition-colors",
              side === "SELL"
                ? "border-sell bg-sell/15"
                : "border-sell/30 bg-sell/5 hover:bg-sell/10"
            )}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-sell">SELL</span>
            <span className="font-tabular text-sm font-semibold">{fmtPrice(sellPrice)}</span>
          </button>
          <button
            type="button"
            onClick={() => setSide("BUY")}
            className={cn(
              "flex items-center justify-between rounded-md border px-2.5 py-1.5 text-left transition-colors",
              side === "BUY"
                ? "border-buy bg-buy/15"
                : "border-buy/30 bg-buy/5 hover:bg-buy/10"
            )}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-buy">BUY</span>
            <span className="font-tabular text-sm font-semibold">{fmtPrice(buyPrice)}</span>
          </button>
        </div>

        {/* Notional pill removed — the same number is shown inside the
            Margin breakdown as "Total value". */}

        {/* Limit / SL price input */}
        {orderType !== "MARKET" && (
          <div className="mt-2">
            <Label>{orderType === "SL-M" ? "Trigger price" : "Price"}</Label>
            <input
              type="number"
              step="0.05"
              value={orderType === "SL-M" ? trigger : price}
              onChange={(e) =>
                orderType === "SL-M" ? setTrigger(e.target.value) : setPrice(e.target.value)
              }
              placeholder={entryPlaceholder || undefined}
              className="h-9 w-full rounded-md border border-border bg-muted/20 px-2 text-sm font-tabular outline-none placeholder:text-muted-foreground focus:border-primary"
            />
          </div>
        )}

        {/* Product type UI removed by request — `productType` still tracked
            internally and submitted with every order. The default is segment-
            derived (NRML for crypto/forex, MIS for Indian intraday). */}

        {/* Lot Size — compact: stepper + meta on one row */}
        <div className="mt-2">
          <Label>{isCrypto || isForex ? "Volume (lots)" : "Lot Size"}</Label>
          <div className="flex h-9 overflow-hidden rounded-md border border-border bg-muted/20">
            <button
              type="button"
              onClick={() => setLots((x) => +Math.max(minLot, x - lotStep).toFixed(3))}
              className="grid w-9 place-items-center text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              aria-label="Decrease lots"
            >
              <Minus className="size-4" />
            </button>
            <input
              type="number"
              step={lotStep}
              min={minLot}
              max={maxLotPerOrder || undefined}
              value={lots}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v) && v >= 0) setLots(v);
              }}
              // DO NOT silently clamp the typed value on blur — neither
              // up to `minLot` nor down to `maxLotPerOrder`. Both clamps
              // bypassed the submit-time validators and let trades fire
              // at a quantity the user didn't actually type:
              //   • lower clamp masked "Lots must be at least N"
              //   • upper clamp silently truncated 10 lots → 5 lots
              //     when the admin's per-order cap was 5 (the user
              //     thought their full size order had filled)
              // The submit() handler enforces both bounds explicitly
              // with clear toast errors and aborts the order — that's
              // the single source of truth for lot-range rejection.
              className="flex-1 bg-transparent text-center font-tabular text-sm outline-none"
            />
            <button
              type="button"
              onClick={() => setLots((x) => { const v = +(x + lotStep).toFixed(3); return maxLotPerOrder > 0 ? Math.min(maxLotPerOrder, v) : v; })}
              className="grid w-9 place-items-center text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              aria-label="Increase lots"
            >
              <Plus className="size-4" />
            </button>
          </div>
          {/* Lot-info badge — mirrors the reference broker UI: for F&O the
              user wants to see "1 lot = 75 units (index points / Qty per
              exchange)" + "Total contracts: 75" right under the stepper, so
              there's no confusion about how many real contracts a lot maps
              to. For equity / crypto / forex (lot_size == 1 or fractional)
              we fall back to the compact "Total: N" pill. */}
          {lotSize > 1 && !isCrypto && !isForex ? (
            <div className="mt-1.5 space-y-0.5 rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-[10px]">
              <div className="text-primary">
                1 lot = <span className="font-tabular font-semibold">{lotSize}</span> units
                <span className="text-muted-foreground"> (index points / Qty per exchange)</span>
              </div>
              <div className="text-muted-foreground">
                Total contracts:{" "}
                <span className="font-tabular font-semibold text-foreground">{fmtLots(qty)}</span>
              </div>
            </div>
          ) : (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[10px] text-muted-foreground">
              <span>1 lot = <span className="font-tabular text-foreground">{lotSize}</span> units</span>
              <span>·</span>
              <span>Total: <span className="font-tabular text-foreground">{fmtLots(qty)}</span></span>
              {(isCrypto || isForex) && <><span>·</span><span>min {minLot}</span></>}
            </div>
          )}
        </div>

        {/* Leverage usage selector — only shown for TIMES-mode segments.
            4 fixed chips: 20 / 45 / 75 / 100 (%). Choosing a lower % reduces
            the effective leverage → more margin locked → safer trade.
            Hidden entirely for FIXED-mode segments (flat ₹/lot, leverage
            scaling makes no sense). */}
        {marginCalcMode === "times" && (
          <div className="mt-2">
            <div className="mb-1.5 text-xs text-muted-foreground">Leverage usage</div>
            <div className="grid grid-cols-4 gap-1.5">
              {([20, 45, 75, 100] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setLeveragePct(p)}
                  className={cn(
                    "rounded-md border px-2 py-1.5 text-xs font-medium transition",
                    leveragePct === p
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  {p}%
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Lower % = higher margin per lot = safer trade.
            </p>
          </div>
        )}

        {/* Take Profit + Stop Loss — hidden when disablePendingOrders is ON
            because bracket SL/TP create resting pending legs. */}
        {!pendingOrdersDisabled && (
          <>
            <PriceStepper
              label="Take Profit"
              value={target}
              onChange={setTarget}
              step={isUsdQuoted ? 0.5 : 0.05}
              placeholder={tpPlaceholder || "Not set"}
            />
            <PriceStepper
              label="Stop Loss"
              value={stopLoss}
              onChange={setStopLoss}
              step={isUsdQuoted ? 0.5 : 0.05}
              placeholder={slPlaceholder || "Not set"}
            />
          </>
        )}

        {/* Margin breakdown — tighter spacing */}
        <div className="mt-2 space-y-1 rounded-md border border-border bg-muted/10 px-2.5 py-2 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Margin</span>
            <span className="font-tabular">
              {!effSettings
                ? "Fixed"
                : marginCalcMode === "fixed"
                  ? "Fixed"
                  : marginCalcMode === "times"
                    ? `${effectiveTimes != null ? Math.round(effectiveTimes) : Math.round(serverLeverage)}×`
                    : `${(serverMarginPct * 100).toFixed(2)}%`}
              {" · "}
              {formatINR(marginPerLot)}/lot
            </span>
          </div>
          <Row label="Intraday" value={formatINR(intradayTileMargin)} />
          {/* Carryforward is shown for every segment — every admin tile
              (including CRYPTO_OPT) now carries a distinct overnight
              margin tier configured on Segment Settings → Fixed Margin
              → Overnight Margin column. Users see what holding the
              position past close will cost. Mirror the same
              INTRADAY_ONLY_ADMIN_ROWS set the backend resolver uses
              (currently empty). */}
          <Row label="Carryforward" value={formatINR(carryforwardMargin)} />
          <Row label="Total value" value={formatINR(totalValue)} />
          {brokeragePreview != null && (
            <Row label="Brokerage" value={formatINR(brokeragePreview)} />
          )}
        </div>

        {/* Show ONLY the blocking warnings; the informational chips
            (Min lot, Per order, Max/script, MIS cap, CNC cap, Limit ±%)
            were removed by request — they're enforced server-side anyway. */}
        {effSettings && (!effSettings.allow || effSettings.stop_loss_mandatory) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {!effSettings.allow && (
              <Chip className="bg-destructive/15 text-destructive">
                Trading blocked for this segment
              </Chip>
            )}
            {effSettings.stop_loss_mandatory && (
              <Chip className="bg-atm/15 text-atm">SL mandatory</Chip>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2 border-t border-border p-3">
        {/* Persistent eligibility banner — surfaces the FIRST admin /
            segment-settings rule the order would fail right now (min
            lot, max-lots-per-script, insufficient balance, marketable
            limit, market closed, …). The BUY / SELL button below stays
            disabled while a reason is present, so the trader can't fire
            a request the server is guaranteed to reject — they see the
            rule continuously and adjust without round-tripping a toast. */}
        {validationReason && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-300">
            {validationReason}
          </div>
        )}
        <Button
          type="button"
          variant={side === "BUY" ? "buy" : "sell"}
          className="h-11 w-full text-sm font-semibold"
          loading={submitting}
          disabled={submitting || validationReason !== null}
          onClick={submit}
        >
          {side} {fmtLots(lots)} {isCrypto || isForex ? "lots" : `lot${lots === 1 ? "" : "s"}`}
        </Button>
      </div>
    </aside>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 text-xs text-muted-foreground">{children}</div>;
}

function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "rounded border border-border bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground",
        className
      )}
    >
      {children}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-tabular">{value}</span>
    </div>
  );
}

function PriceStepper({
  label,
  value,
  onChange,
  step,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  step: number;
  placeholder?: string;
}) {
  function bump(delta: number) {
    const cur = Number(value || 0);
    const next = +(cur + delta).toFixed(4);
    onChange(next > 0 ? String(next) : "");
  }
  return (
    <div className="mt-3 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        {!value && <span className="text-[10px] text-muted-foreground">Not set</span>}
      </div>
      <div className="flex h-9 items-stretch overflow-hidden rounded-md border border-border bg-muted/20">
        <input
          type="number"
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "Price"}
          className="flex-1 bg-transparent px-2 text-sm font-tabular outline-none placeholder:text-muted-foreground"
        />
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => bump(-step)}
          className="grid w-9 place-items-center border-l border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground"
        >
          −
        </button>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => bump(step)}
          className="grid w-9 place-items-center border-l border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground"
        >
          +
        </button>
      </div>
    </div>
  );
}

function Collapsible({
  label,
  open,
  onToggle,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3 overflow-hidden rounded-md border border-border bg-muted/10">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 py-2 text-xs hover:bg-muted/20"
      >
        <span>{label}</span>
        <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="border-t border-border px-3 py-2">{children}</div>}
    </div>
  );
}
