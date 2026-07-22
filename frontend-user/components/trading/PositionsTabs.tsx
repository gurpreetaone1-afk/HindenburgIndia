"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, TrendingDown, TrendingUp, X, XCircle, Zap } from "lucide-react";
import { InstrumentAPI, OrderAPI, PositionAPI, ProfileAPI, SegmentSettingsAPI } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn, exactTimestamp, formatINR, formatPrice, isUsdSegment, pnlColor } from "@/lib/utils";
import { isInstrumentMarketOpen, marketLabel } from "@/lib/marketHours";
import { playClosedTone } from "@/lib/trade-audio";
import { usePriceFlash } from "@/lib/usePriceFlash";
import { ClosePositionDialog, type ClosePositionTarget } from "@/components/common/ClosePositionDialog";

/**
 * Resolve the displayed lot count + total quantity for a position / trade
 * row. We prefer values the server echoes back, but fall back to the
 * client-side canonical Indian-index helper when the stored numbers look
 * stale (e.g. position opened before the lot-size backfill landed, where
 * `quantity` was saved as `lots × 1` instead of `lots × 75`).
 *
 *   • `lots`  → integer lot count shown in the new LOT column
 *   • `qty`   → real exchange quantity shown in the SIZE column and used
 *                for the recomputed P/L
 */
function resolveQty(row: any): { lots: number; qty: number; lotSize: number } {
  const rawQty = Math.abs(Number(row?.quantity ?? 0));
  const serverLots = Number(row?.lots ?? 0);
  // Position docs embed the snapshot as `instrument.lot_size`, while orders/
  // trades sometimes serialize the field at the top level. Trust whichever
  // is set — the backend already sources F&O lots from Zerodha's CSV (for
  // NSE/BSE) and the canonical MCX table.
  const lotSize = Number(row?.lot_size ?? row?.instrument?.lot_size ?? 0) || 1;
  let lots = serverLots;
  if (!lots || !Number.isFinite(lots)) {
    lots = lotSize > 0 ? rawQty / lotSize : rawQty;
  }
  lots = Math.abs(lots);
  // SIZE = the stored contract qty when present (already in shares /
  // contracts), otherwise lots × lot_size. We don't round `lots` here
  // because MCX / crypto / forex trade fractional units.
  const qty = rawQty > 0 ? rawQty : lots * lotSize;
  return { lots, qty, lotSize };
}

interface Props {
  positions: any[];
  pendingOrders: any[];
  history: any[];
  cancelled: any[];
  totalPnL: number;
  /** Which tab to land on when the panel first mounts. Defaults to
   *  "positions" but the Orders rail-toggle opens the drawer on "pending"
   *  so the user sees their order book straight away. */
  initialTab?: TabKey;
  /** Live WebSocket quotes (token → { ltp, bid, ask }) — passed from the
   *  terminal page where the WS subscription already lives. Used to
   *  re-mark-to-market Active Trades rows at WS cadence (~250 ms) so
   *  the CURRENT / P&L columns tick in lock-step with the Positions
   *  tab instead of lagging on the 2 s REST poll. Optional — when
   *  omitted, Active Trades falls back to whatever the REST poll
   *  delivered last (the legacy behaviour). */
  liveQuotesByToken?: Map<string, { ltp?: number; bid?: number; ask?: number }>;
}

const ONE_CLICK_KEY = "stock4x.terminal.oneClick";

type TabKey = "positions" | "active" | "pending" | "history" | "cancelled";

// 14 columns: TIME · SYM · M · SIDE · LOT · SIZE · ENTRY · CURRENT · S/L · T/P · COMM · SWAP · P/L · ACTION
// LOT shows the count of lots the trader bought/sold; SIZE shows real
// exchange contracts (lots × canonical lot size). Splitting them lines up
// with how every Indian broker (Zerodha / Upstox / Dhan) displays F&O
// positions and stops the user wondering whether "3" means three lots
// or three contracts. COMM is per-fill brokerage; SWAP is the overnight-
// carry charge swap_service debits at the admin-configured rollover time.
const COL_TEMPLATE =
  "minmax(80px,80px) minmax(110px,1fr) 72px 60px 50px 70px minmax(80px,1fr) minmax(80px,1fr) minmax(80px,1fr) minmax(80px,1fr) 70px 70px minmax(80px,1fr) minmax(96px,120px)";

// Human-readable product-type label. Single letters (M / N / C) were
// faster to scan but new users kept asking what they meant; the
// long-form INTRA / CARRY / DELIVERY is unambiguous and still fits in
// the slightly-widened mode column.
function productLabel(pt: string | null | undefined): string {
  const t = (pt || "MIS").toUpperCase();
  if (t === "MIS") return "INTRA";
  if (t === "NRML") return "CARRY";
  if (t === "CNC") return "DELIVERY";
  return t;
}

export function PositionsTabs({ positions, pendingOrders, history, cancelled, totalPnL, initialTab = "positions", liveQuotesByToken }: Props) {
  const qc = useQueryClient();
  // Re-order pipeline gate — skip the optimistic close removes when
  // the backend is going to park the squareoff for N s before
  // flattening (otherwise the row flashes out, gets refilled on the
  // next 2-s poll, and vanishes again when the executor fires).
  const { data: me } = useQuery<any>({
    queryKey: ["users", "me"],
    queryFn: () => ProfileAPI.me(),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
  const reorderDelayActive =
    Number(me?.reorder_effective_delay_sec ?? 0) > 0;
  // Per-row "close in flight" tracker. Drives BOTH the spinner on
  // each row's Close icon AND the deferred "<symbol> closed" toast
  // that fires after the matching engine has actually flattened
  // the row (re-order users — explicit ask: notification trade
  // close hone ke baad aana chahiye). Symbol stashed at click time
  // so the toast can name the right instrument on drain.
  const [closingPositionIds, setClosingPositionIds] = useState<
    Map<string, { symbol: string }>
  >(() => new Map());
  const [closingActiveTradeIds, setClosingActiveTradeIds] = useState<
    Map<string, { symbol: string }>
  >(() => new Map());

  // Drain trackers + pop the deferred close-toast once the matching
  // engine has actually flattened the row (id leaves the live list).
  useEffect(() => {
    if (closingPositionIds.size === 0) return;
    const live = new Set((positions ?? []).map((p: any) => String(p.id)));
    const drained: { symbol: string }[] = [];
    setClosingPositionIds((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [id, meta] of prev) {
        if (!live.has(id)) { next.delete(id); drained.push(meta); changed = true; }
      }
      return changed ? next : prev;
    });
    for (const meta of drained) {
      toast.success(`${meta.symbol} closed`, { duration: 1500 });
    }
  }, [positions, closingPositionIds]);

  const [tab, setTab] = useState<TabKey>(initialTab);

  // One-Click trading mode persists across reloads — once a trader opts in,
  // they shouldn't have to re-tick it every session. Window-guarded for SSR.
  const [oneClick, setOneClick] = useState(false);
  // Target row for the Close Position dialog. Set when the user taps
  // the row-level X button (unless One-Click is on, in which case we
  // fire the close directly and skip the dialog). The dialog itself
  // owns partial-close presets + the Phase-5C "Roll to next expiry"
  // button — both surfaces of this component show them.
  const [closeTarget, setCloseTarget] = useState<ClosePositionTarget | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setOneClick(window.localStorage.getItem(ONE_CLICK_KEY) === "1");
  }, []);
  function toggleOneClick(v: boolean) {
    setOneClick(v);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ONE_CLICK_KEY, v ? "1" : "0");
    }
    // Broadcast so OrderPanel (separate component tree) can react too.
    window.dispatchEvent(new CustomEvent("oneclick:change", { detail: v }));
  }

  const [editing, setEditing] = useState<any | null>(null);
  // Separate state for the pending-order modify dialog. Reusing the SL/TP
  // `editing` slot would force one dialog to handle two unrelated
  // contracts (position SL/TP vs pending-order price/lots) — cleaner to
  // keep them parallel.
  const [editingOrder, setEditingOrder] = useState<any | null>(null);

  // ── Active Trades: one row per fill that's still part of an open
  // position. Lets the trader close / edit each entry individually instead
  // of dealing with the aggregated weighted-avg position.
  //
  // Polling is paused for 3 s after each optimistic update — same
  // anti-flicker pattern as the terminal page's positions/orders polls.
  // Without this an immediate poll often returns server data that's
  // ~100–500 ms behind a just-written close, briefly resurrecting the
  // row we just removed.
  const { data: activeTrades } = useQuery<any[]>({
    queryKey: ["active-trades"],
    queryFn: () => PositionAPI.activeTrades(),
    refetchInterval: (query: any) => {
      // 2 s baseline, widened to 3.5 s for the 3 s post-optimistic
      // window. Returning `false` here used to permanently stall the
      // polling loop after the first optimistic write — the symptom
      // was an active-trade row reappearing for one tick after close
      // and then never refreshing again.
      const last = (query?.state?.dataUpdatedAt as number) || 0;
      return Date.now() - last < 3000 ? 3500 : 2000;
    },
  });

  // Re-mark-to-market each active-trade row using the live WS quote
  // map. Same overlay the terminal page applies to Positions — without
  // it, Active Trades' CURRENT / P&L columns only ticked at the 2 s
  // REST poll while Positions tab ticked at ~250 ms WS cadence, so
  // the same instrument's numbers visibly drifted apart between tabs.
  const activeTradesLive = useMemo(() => {
    const rows = activeTrades ?? [];
    if (!liveQuotesByToken || liveQuotesByToken.size === 0 || rows.length === 0) {
      return rows;
    }
    return rows.map((t: any) => {
      const tok = String(t?.instrument_token ?? t?.token ?? "");
      const live = tok ? liveQuotesByToken.get(tok) : undefined;
      if (!live) return t;
      // Use the same close-side convention as Positions: a BUY (long)
      // closes by SELLing (so the exit price is the bid); a SELL
      // (short) closes by BUYing (ask). Falls back to LTP when the
      // chosen side is missing in the tick.
      const sideRaw = String(t?.action ?? t?.side ?? t?.opened_side ?? "").toUpperCase();
      const isLong = sideRaw ? sideRaw === "BUY" : Number(t?.quantity ?? 0) >= 0;
      const liveLtp = Number(live.ltp ?? 0) || Number(t?.ltp ?? 0) || 0;
      const bid = Number(live.bid ?? 0);
      const ask = Number(live.ask ?? 0);
      const closePrice = (isLong ? bid : ask) || liveLtp;
      if (!closePrice) return t;
      const entry = Number(t?.price ?? t?.avg_price ?? 0);
      const qty = Math.abs(Number(t?.quantity ?? 0));
      const pnl =
        Number.isFinite(entry) && Number.isFinite(qty) && entry > 0
          ? (isLong ? closePrice - entry : entry - closePrice) * qty
          : Number(t?.pnl ?? 0);
      return { ...t, ltp: closePrice, pnl };
    });
  }, [activeTrades, liveQuotesByToken]);

  // Drain `closingActiveTradeIds` once the row vanishes (matching
  // engine closed the trade). Placed here because `activeTradesLive`
  // is computed above; same deferred-toast pattern as positions.
  useEffect(() => {
    if (closingActiveTradeIds.size === 0) return;
    const live = new Set((activeTradesLive ?? []).map((t: any) => String(t.id)));
    const drained: { symbol: string }[] = [];
    setClosingActiveTradeIds((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [id, meta] of prev) {
        if (!live.has(id)) { next.delete(id); drained.push(meta); changed = true; }
      }
      return changed ? next : prev;
    });
    for (const meta of drained) {
      toast.success(`${meta.symbol} exited`, { duration: 1500 });
    }
  }, [activeTradesLive, closingActiveTradeIds]);

  // ── Live P&L for filled history rows ────────────────────────────
  // Each row is a closed/filled order; the P/L column shows what the
  // trade is worth right now (current_LTP vs fill_price × qty × side).
  const historyTokens = useMemo<string[]>(() => {
    const set = new Set<string>();
    for (const o of history) {
      const tok = o.token || o.instrument_token;
      if (tok) set.add(String(tok));
    }
    return Array.from(set);
  }, [history]);

  const { data: historyQuotes } = useQuery<any[]>({
    queryKey: ["history-quotes", historyTokens.sort().join(",")],
    queryFn: () => InstrumentAPI.quotesBatch(historyTokens),
    enabled: tab === "history" && historyTokens.length > 0,
    refetchInterval: 1500,
    staleTime: 1000,
  });

  const historyLtp = useMemo<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    for (const q of historyQuotes ?? []) {
      const ltp = Number(q.ltp ?? 0);
      if (ltp > 0 && q.token) m[String(q.token)] = ltp;
    }
    return m;
  }, [historyQuotes]);

  // Live USD/INR rate so per-history P&L (and the tab total below) reflect
  // wallet INR for crypto/forex trades, not raw USD.
  const { data: pnlSummary } = useQuery({
    queryKey: ["positions", "pnl-summary"],
    queryFn: () => PositionAPI.pnlSummary(),
    refetchInterval: 10000,
  });
  const usdInr = Number(pnlSummary?.usd_inr_rate ?? 83);

  // ── Merged-history view ─────────────────────────────────────────────
  // The raw history feed has one row per fill — so a BUY-then-SELL
  // lifecycle of the same lot shows as TWO rows (the BUY at entry time,
  // the SELL at close time). Traders find this confusing — they want
  // ONE row per completed trade with the OPENING side preserved (BUY
  // trade → BUY chip, even though the closing fill was technically a
  // SELL). FIFO-walk every closing fill (pnl_inr != null), consume the
  // matching opening fills' quantity, and emit one merged row per
  // close. Anything still open at the end stays as its own row.
  const mergedHistory = useMemo<any[]>(() => {
    // Group by instrument-token + product-type so close-fills only
    // match opens on the SAME contract + product mode (NRML vs MIS
    // are distinct positions even on the same symbol).
    const byKey = new Map<string, any[]>();
    for (const o of history) {
      const tok = String(o.token || o.instrument_token || "");
      const prod = String(o.product_type || "");
      const key = `${tok}|${prod}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(o);
    }

    const merged: any[] = [];
    for (const [, group] of byKey) {
      // Sort oldest-first so FIFO consumes the earliest open against
      // each close — matches every Indian broker's lot-accounting
      // convention and lines up with how Position.realized_pnl was
      // computed server-side.
      group.sort((a, b) => {
        const aT = new Date(a.created_at ?? 0).getTime();
        const bT = new Date(b.created_at ?? 0).getTime();
        return aT - bT;
      });
      // Running queue of open fills not yet consumed by a close.
      const openQueue: any[] = [];
      for (const o of group) {
        const isClosing =
          o.pnl_inr !== null && o.pnl_inr !== undefined && o.pnl_inr !== "";
        if (!isClosing) {
          openQueue.push({ ...o, remaining: Number(o.quantity ?? 0) });
          continue;
        }
        // Close-fill — consume matching opens from the front of the queue.
        let toConsume = Number(o.quantity ?? 0);
        const consumedOpens: any[] = [];
        while (toConsume > 1e-9 && openQueue.length > 0) {
          const front = openQueue[0];
          const taken = Math.min(front.remaining, toConsume);
          consumedOpens.push({ open: front, qty: taken });
          front.remaining -= taken;
          toConsume -= taken;
          if (front.remaining <= 1e-9) openQueue.shift();
        }
        if (consumedOpens.length === 0) {
          // Orphan close (no matching open in the cached window) —
          // surface it as-is so the user still sees the row instead of
          // it silently disappearing.
          merged.push({ ...o, __mergedOpenSide: o.action });
          continue;
        }
        const firstOpen = consumedOpens[0].open;
        // Quantity-weighted avg entry across the consumed opens — a
        // single close that ate three opens (5 + 3 + 2 lots) should
        // show the weighted average, not just the first fill's price.
        let entryNum = 0;
        let entryDen = 0;
        let totalQty = 0;
        let totalOpenBrokerage = 0;
        for (const { open, qty } of consumedOpens) {
          const px = Number(open.average_price ?? open.price ?? 0);
          entryNum += px * qty;
          entryDen += qty;
          totalQty += qty;
          // Apportion each open fill's brokerage by the qty we
          // consumed from it — partial fills don't double-charge.
          const openBrokerage = Number(open.brokerage ?? 0);
          const openQtyOriginal = Number(open.quantity ?? 0) || 1;
          totalOpenBrokerage += openBrokerage * (qty / openQtyOriginal);
        }
        const entryAvg = entryDen > 0 ? entryNum / entryDen : 0;
        const totalCloseBrokerage = Number(o.brokerage ?? 0);
        const totalBrokerage = totalOpenBrokerage + totalCloseBrokerage;
        const totalLots = totalQty / Math.max(1, Number(firstOpen.quantity ?? 1) / Math.max(0.0001, Number(firstOpen.lots ?? 0) || 1));
        merged.push({
          // Reuse the close-fill's id so React keys stay stable.
          id: o.id,
          symbol: o.symbol,
          product_type: o.product_type,
          segment: o.segment ?? firstOpen.segment,
          exchange: o.exchange ?? firstOpen.exchange,
          token: o.token ?? o.instrument_token,
          instrument_token: o.instrument_token ?? o.token,
          // Display the OPENING side, not the closing fill's action.
          // The close action is preserved on __closeAction for debug.
          action: firstOpen.action,
          __closeAction: o.action,
          opened_at: firstOpen.created_at,
          closed_at: o.created_at,
          // Render the close-fill timestamp in the TIME column so the
          // row sorts to where the user expects (the "trade closed at"
          // time, not the older "trade opened at" time).
          created_at: o.created_at,
          quantity: totalQty,
          lots: Number.isFinite(totalLots) && totalLots > 0 ? totalLots : Number(o.lots ?? 0),
          price: entryAvg,
          average_price: entryAvg,
          // Use a synthetic field for the close (exit) price so the
          // existing render can show entry → exit by reading both.
          close_price: Number(o.average_price ?? o.price ?? 0),
          brokerage: totalBrokerage,
          swap_charges: Number(o.swap_charges ?? 0),
          pnl_inr: o.pnl_inr,
          status: "CLOSED",
        });
      }
      // Anything still in openQueue is a partially-or-fully-still-open
      // entry — keep it visible as its own row so the user can see
      // ongoing exposure that hasn't been closed yet.
      for (const open of openQueue) {
        if (open.remaining <= 1e-9) continue;
        // If part of the open has been consumed, scale qty/lots down
        // to what's still active.
        const originalQty = Number(open.quantity ?? 0) || open.remaining;
        const scale = originalQty > 0 ? open.remaining / originalQty : 1;
        merged.push({
          ...open,
          quantity: open.remaining,
          lots: Number(open.lots ?? 0) * scale,
        });
      }
    }

    // Sort newest-first so freshly-closed trades land at the top —
    // same chronology the raw feed used.
    merged.sort((a, b) => {
      const aT = new Date(a.closed_at ?? a.created_at ?? 0).getTime();
      const bT = new Date(b.closed_at ?? b.created_at ?? 0).getTime();
      return bT - aT;
    });
    return merged;
  }, [history]);

  // Tabs row — declared AFTER mergedHistory so the History tab count
  // can read its length. Tab keys feed setTab() in the JSX render.
  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "positions", label: "Positions", count: positions.length },
    { key: "active", label: "Active Trades", count: activeTradesLive?.length ?? 0 },
    { key: "pending", label: "Pending", count: pendingOrders.length },
    { key: "history", label: "History", count: mergedHistory.length },
    { key: "cancelled", label: "Cancelled", count: cancelled.length },
  ];

  // Tab-aware P/L: positions tab shows open M2M (already INR from backend);
  // history tab sums the SERVER-frozen `pnl_inr` per closing order so the
  // footer total matches the per-row figures (also frozen) — no more
  // live drift, no more USD/INR mixing.
  const historyTotalInr = useMemo(() => {
    let sum = 0;
    for (const o of mergedHistory) {
      const v = o.pnl_inr;
      if (v === null || v === undefined || v === "") continue;
      const n = Number(v);
      if (Number.isFinite(n)) sum += n;
    }
    return sum;
  }, [mergedHistory]);

  // Active-trade totals are already INR (backend applies FX before send).
  const activeTotalInr = useMemo(() => {
    return (activeTradesLive ?? []).reduce((s, t: any) => s + Number(t.pnl || 0), 0);
  }, [activeTradesLive]);

  const tabPnL =
    tab === "positions" ? totalPnL :
    tab === "active" ? activeTotalInr :
    tab === "history" ? historyTotalInr :
    0;

  // ─── Pro-terminal close pattern ──────────────────────────────────────
  // All three close/cancel handlers below are FIRE-AND-FORGET:
  //   1. Optimistic UI update (remove the row immediately)
  //   2. Audio cue (instant feedback)
  //   3. POST in the background (no `await` — button stays responsive)
  //   4. On success → toast + invalidate caches (real fill replaces row)
  //   5. On error → rollback + error toast
  // Backend is fast; the perceived lag was the awaited promise gating the
  // click handler. Now the button releases the moment it's pressed.

  function closeActiveTrade(
    tradeId: string,
    symbol: string,
    positionId?: string,
    tradeQty?: number,
    segmentType?: string,
    exchange?: string,
  ) {
    // Optimistic-id guard — same rationale as `squareoff` below.
    // Active Trades rows seeded with synthetic ids while the BUY is
    // still in flight; closing one of those would hit
    // /active-trades/<optimistic_…>/close and return 404. Wait a beat.
    if (typeof tradeId === "string" && tradeId.startsWith("optimistic_")) {
      toast.error("Order still settling — try again in a second");
      return;
    }
    // Market-hours guard FIRST — runs before the confirm dialog, the
    // optimistic cache write, the audio cue, everything. The user kept
    // seeing the row vanish for ~1 s then come back with a "market closed"
    // toast because we used to fire the API and only rollback on rejection.
    // Now we short-circuit: clear toast, position stays in place, no flicker.
    if (!isInstrumentMarketOpen(segmentType, exchange)) {
      toast.error(`${marketLabel(segmentType, exchange)} market is closed — try closing ${symbol} during trading hours`, {
        duration: 4000,
      });
      return;
    }
    // Mobile UX — skip the native confirm() on phones (user spec:
    // "close karne par pop mat aaye, direct close ho jaye"); desktop
    // still gets the confirm step. one-click trade mode already
    // bypasses the confirm regardless of viewport.
    const isMobileUi =
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 767px)").matches;
    if (!oneClick && !isMobileUi && !confirm(`Close this ${symbol} trade at market?`)) return;
    playClosedTone();

    setClosingActiveTradeIds((prev) =>
      new Map(prev).set(tradeId, { symbol: String(symbol ?? "") }),
    );

    qc.cancelQueries({ queryKey: ["active-trades"] });
    qc.cancelQueries({ queryKey: ["positions", "open"] });

    const tradesSnapshot = qc.getQueryData<any[]>(["active-trades"]);
    const posSnapshot = qc.getQueryData<any[]>(["positions", "open"]);

    if (!reorderDelayActive) {
      // Optimistic: drop the active-trade row.
      qc.setQueryData<any[]>(["active-trades"], (old) =>
        Array.isArray(old) ? old.filter((t) => t.id !== tradeId) : []
      );

      // Optimistic: reduce the parent position's qty by the trade's qty
      // (or remove the row entirely if this is the last open fill).
      if (positionId && tradeQty && tradeQty > 0) {
        qc.setQueryData<any[]>(["positions", "open"], (old) => {
          if (!Array.isArray(old)) return [];
          return old
            .map((p) => {
              if (p.id !== positionId) return p;
              const curQty = Number(p.quantity) || 0;
              const sign = curQty >= 0 ? 1 : -1;
              const nextAbs = Math.max(0, Math.abs(curQty) - tradeQty);
              const nextQty = nextAbs * sign;
              return nextAbs < 1e-9 ? null : { ...p, quantity: nextQty };
            })
            .filter(Boolean) as any[];
        });
      }
    }

    // Synchronous close-toast for instant fills; re-order users get
    // it deferred by the drain effect once the row actually vanishes.
    const pendingToastId = reorderDelayActive
      ? null
      : toast.success(`Closed ${symbol}`, { duration: 1500 });

    PositionAPI.closeActiveTrade(tradeId)
      .then(() => {
        // No active-trades / positions invalidate here — eventual write
        // visibility on Atlas causes a flicker. 2 s poll handles it.
        qc.invalidateQueries({ queryKey: ["orders"] });
        qc.invalidateQueries({ queryKey: ["wallet"] });
      })
      .catch((e: any) => {
        if (!reorderDelayActive) {
          if (tradesSnapshot) qc.setQueryData(["active-trades"], tradesSnapshot);
          if (posSnapshot) qc.setQueryData(["positions", "open"], posSnapshot);
        }
        setClosingActiveTradeIds((prev) => {
          const next = new Map(prev);
          next.delete(tradeId);
          return next;
        });
        if (pendingToastId !== null) toast.dismiss(pendingToastId);
        toast.error(e.message || "Close failed");
      });
  }

  function squareoff(id: string, symbol: string, segmentType?: string, exchange?: string) {
    // Optimistic-id guard — OrderPanel / TradeDetailSheet seed the
    // positions cache with a synthetic `optimistic_<ts>` row in the same
    // frame as the BUY click, so the Position card appears instantly.
    // If the user mashes Close before the backend's real position write
    // lands (~300-800 ms), this handler used to fire the synthetic id at
    // `/positions/<optimistic_…>/squareoff`. Backend rejects with 404
    // "Position not found" because the path param fails ObjectId parse.
    // Show a friendlier "still settling" toast and bail — the WS push +
    // 2 s poll reconciles the cache to the real id within a tick.
    if (typeof id === "string" && id.startsWith("optimistic_")) {
      toast.error("Order still settling — try again in a second");
      return;
    }
    // Same market-hours guard as `closeActiveTrade` above — see that
    // function's comment for the rationale. Block here BEFORE the audio
    // cue and the optimistic cache writes so a click outside trading
    // hours is a no-op + one clear toast, never a flicker.
    if (!isInstrumentMarketOpen(segmentType, exchange)) {
      toast.error(`${marketLabel(segmentType, exchange)} market is closed — try closing ${symbol} during trading hours`, {
        duration: 4000,
      });
      return;
    }
    playClosedTone();

    // Cancel BOTH queries — closing a position kills its Active Trades
    // rows too (since they're just the BUY fills against this position).
    qc.cancelQueries({ queryKey: ["positions", "open"] });
    qc.cancelQueries({ queryKey: ["active-trades"] });

    setClosingPositionIds((prev) =>
      new Map(prev).set(id, { symbol: String(symbol ?? "") }),
    );

    const posSnapshot = qc.getQueryData<any[]>(["positions", "open"]);
    const tradesSnapshot = qc.getQueryData<any[]>(["active-trades"]);

    if (!reorderDelayActive) {
      // Optimistically drop the position row…
      qc.setQueryData<any[]>(["positions", "open"], (old) =>
        Array.isArray(old) ? old.filter((p) => p.id !== id) : []
      );
      // …and every Active Trades row whose position_id matches. Without
      // this the Active Trades tab keeps showing 4 stale BUY rows for
      // ~2 s after the position has already vanished from Positions.
      qc.setQueryData<any[]>(["active-trades"], (old) =>
        Array.isArray(old) ? old.filter((t) => t.position_id !== id) : []
      );
    }

    // Synchronous "Closed" toast for instant fills only — re-order
    // users get the deferred "<symbol> closed" toast from the drain
    // effect once the matching engine actually flattens the row.
    const pendingToastId = reorderDelayActive
      ? null
      : toast.success(`Closed ${symbol} at market`, { duration: 1500 });

    PositionAPI.squareoff(id)
      .then(() => {
        // DO NOT invalidate positions/active-trades here — see OrderPanel
        // comment. Atlas can briefly return the position as still-OPEN
        // immediately after the close write, causing a 1 s flicker where
        // the row reappears. The 2 s polling handles the eventual sync.
        qc.invalidateQueries({ queryKey: ["orders"] });
        qc.invalidateQueries({ queryKey: ["wallet"] });
      })
      .catch((e: any) => {
        if (!reorderDelayActive) {
          if (posSnapshot) qc.setQueryData(["positions", "open"], posSnapshot);
          if (tradesSnapshot) qc.setQueryData(["active-trades"], tradesSnapshot);
        }
        setClosingPositionIds((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
        if (pendingToastId !== null) toast.dismiss(pendingToastId);
        toast.error(e.message || "Failed");
      });
  }

  // ── Bulk close handlers ─────────────────────────────────────────────
  // Three flavours wired up to the same backend endpoint:
  //   • closeAll()         → no filter, flatten every open position
  //   • closeAll("profit") → only positions with live P&L ≥ 0
  //   • closeAll("loss")   → only positions with live P&L < 0
  // The backend re-evaluates the profit/loss split server-side using the
  // freshest LTP (not the position's stored unrealized_pnl which can lag
  // by up to a second on a busy market), so the user gets the same view
  // they're staring at on the Positions tab when they click.
  async function closeAll(filter?: "profit" | "loss") {
    const eligible = (positions ?? []).filter((p) => {
      if (filter === "profit") return Number(p.unrealized_pnl ?? 0) >= 0;
      if (filter === "loss") return Number(p.unrealized_pnl ?? 0) < 0;
      return true;
    });
    if (eligible.length === 0) {
      const label =
        filter === "profit"
          ? "No positions in profit"
          : filter === "loss"
            ? "No positions in loss"
            : "No open positions";
      toast.info(label);
      return;
    }
    if (!oneClick) {
      const confirmLabel =
        filter === "profit"
          ? `Close ALL ${eligible.length} position(s) currently in profit?`
          : filter === "loss"
            ? `Close ALL ${eligible.length} position(s) currently in loss?`
            : `Close ALL ${eligible.length} open position(s)?`;
      if (!confirm(confirmLabel)) return;
    }

    // Optimistic-clear the rows that the server is about to flatten —
    // mirrors the per-row squareoff pattern so the empty-state lands in
    // the same frame as the click. Backend reconciles via the 2 s poll.
    // Skipped on re-order users (each close gets parked for N s).
    qc.cancelQueries({ queryKey: ["positions", "open"] });
    qc.cancelQueries({ queryKey: ["positions", "summary"] });
    qc.cancelQueries({ queryKey: ["active-trades"] });
    const posSnapshot = qc.getQueryData<any[]>(["positions", "open"]);
    const tradesSnapshot = qc.getQueryData<any[]>(["active-trades"]);
    const eligibleIds = new Set(eligible.map((p) => p.id));
    if (!reorderDelayActive) {
      if (filter) {
        // Partial close — keep the rows we ARE NOT flattening.
        qc.setQueryData<any[]>(["positions", "open"], (old) =>
          Array.isArray(old) ? old.filter((p) => !eligibleIds.has(p.id)) : [],
        );
        qc.setQueryData<any[]>(["active-trades"], (old) =>
          Array.isArray(old)
            ? old.filter((t) => !eligibleIds.has(t.position_id))
            : [],
        );
      } else {
        qc.setQueryData<any[]>(["positions", "open"], () => []);
        qc.setQueryData<any[]>(["active-trades"], () => []);
      }
    }

    const labelVerb =
      filter === "profit"
        ? "in-profit"
        : filter === "loss"
          ? "in-loss"
          : "all";
    const pendingToastId = toast.success(
      `Squaring off ${eligible.length} ${labelVerb} position(s)…`,
      { duration: 1500 },
    );
    try {
      const r = await PositionAPI.squareoffAll(filter);
      toast.dismiss(pendingToastId);
      toast.success(
        `Squared off ${r?.squared_off ?? 0}/${r?.total ?? eligible.length}`,
      );
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    } catch (e: any) {
      if (!reorderDelayActive) {
        if (posSnapshot) qc.setQueryData(["positions", "open"], posSnapshot);
        if (tradesSnapshot) qc.setQueryData(["active-trades"], tradesSnapshot);
      }
      toast.dismiss(pendingToastId);
      toast.error(e?.message || "Failed");
    }
  }

  function cancel(id: string) {
    qc.cancelQueries({ queryKey: ["orders"] });

    // Optimistic remove the pending order row
    const snapshot = qc.getQueryData<any[]>(["orders"]);
    qc.setQueryData<any[]>(["orders"], (old) =>
      Array.isArray(old) ? old.filter((o) => o.id !== id) : []
    );

    // Synchronous cancel toast — pairs with the optimistic order row
    // removal so the popup appears in the same frame as the click.
    const pendingToastId = toast.success("Order cancelled", { duration: 1200 });

    OrderAPI.cancel(id)
      .then(() => {
        // No orders invalidate — 2 s poll handles reconcile without flicker.
      })
      .catch((e: any) => {
        if (snapshot) qc.setQueryData(["orders"], snapshot);
        toast.dismiss(pendingToastId);
        toast.error(e.message || "Failed");
      });
  }

  return (
    // `min-w-0` so this flex child never pushes its parent past the
    // viewport — the inner `overflow-x-auto` already handles wide-table
    // horizontal scroll; without min-w-0 the 900-px grid template can
    // grow the chart section past its allowance and clip the order panel.
    <div className="flex min-h-0 min-w-0 flex-col rounded-lg border border-border bg-card">
      {/* Tabs row */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-2">
        <div className="flex">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "relative px-3 py-2 text-xs font-medium transition-colors",
                tab === t.key ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}({t.count})
              {tab === t.key && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-t bg-primary" />}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {/* Close-All trio — flatten every open position, only those
              in profit, or only those in loss. Hidden when there are
              no positions so they don't crowd an empty toolbar.
              Mirrored in the mobile PnL strip below. */}
          {positions.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => closeAll()}
                title="Square off every open position"
                className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <XCircle className="size-3" />
                Close All
              </button>
              <button
                type="button"
                onClick={() => closeAll("profit")}
                title="Square off positions currently in profit"
                className="inline-flex items-center gap-1 rounded-md border border-buy/40 bg-buy/10 px-2 py-1 text-[11px] font-semibold text-buy transition-colors hover:bg-buy/20"
              >
                <TrendingUp className="size-3" />
                Close Profit
              </button>
              <button
                type="button"
                onClick={() => closeAll("loss")}
                title="Square off positions currently in loss"
                className="inline-flex items-center gap-1 rounded-md border border-sell/40 bg-sell/10 px-2 py-1 text-[11px] font-semibold text-sell transition-colors hover:bg-sell/20"
              >
                <TrendingDown className="size-3" />
                Close Loss
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => toggleOneClick(!oneClick)}
            title={
              oneClick
                ? "One-Click ON — close/cancel actions skip the confirm dialog"
                : "Turn on One-Click to skip the confirm dialog on close/cancel"
            }
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
              oneClick
                ? "border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400"
                : "border-border bg-muted/40 text-muted-foreground hover:text-foreground"
            )}
          >
            <Zap className={cn("size-3", oneClick && "fill-current")} />
            One Click
            <span className={cn("rounded px-1 text-[9px] tracking-wider", oneClick ? "bg-amber-500/30" : "bg-muted")}>
              {oneClick ? "ON" : "OFF"}
            </span>
          </button>
          <span className={cn("font-tabular", pnlColor(tabPnL))}>
            P/L: {tabPnL >= 0 ? "+" : ""}
            {formatINR(tabPnL)}
          </span>
        </div>
      </div>

      {/* Scrollable table area.
       *
       * One scroll container handles BOTH axes (overflow-auto, not
       * separate -x-auto + -y-auto wrappers like before). The previous
       * nested-scroll layout had two issues on Chrome / Edge:
       *   1. The inner `overflow-y-auto` div collapsed to the viewport
       *      width because its parent had a horizontal overflow, so the
       *      rows' minWidth:900 spilled into nowhere and the right-side
       *      columns (S/L, T/P, COMM, P/L, ACTION) rendered but were
       *      visually clipped under the wallet strip / order panel.
       *   2. Header sat OUTSIDE the vertical-scroll div, so it didn't
       *      align with rows once the user scrolled horizontally past
       *      the SYM column.
       * The header is now `sticky top-0` inside the single container so
       * column labels stay visible during vertical scroll AND drift
       * left/right in lockstep with the rows on horizontal scroll.
       *
       * 28vh max-height keeps the chart dominant per the existing
       * design; min-h-[120px] avoids a 0-height blotter on very small
       * screens.
       */}
      <div className="max-h-[28vh] min-h-[120px] overflow-auto scrollbar-thin">
      {/* Header */}
      <div
        className="sticky top-0 z-10 grid items-center gap-2 border-b border-border bg-card px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground"
        style={{ gridTemplateColumns: COL_TEMPLATE, minWidth: 970 }}
      >
        <span>TIME</span>
        <span>SYM</span>
        <span>MODE</span>
        <span>SIDE</span>
        <span>LOT</span>
        <span>SIZE</span>
        <span>ENTRY</span>
        <span>CURRENT</span>
        <span>S/L</span>
        <span>T/P</span>
        <span>COMM</span>
        <span>SWAP</span>
        <span className="text-right">P/L</span>
        <span className="text-right">ACTION</span>
      </div>

      {/* Body — rows render inside the same scroll container as the
          header so vertical + horizontal scroll stay in sync. */}
      <div className="min-h-[60px]">
        {tab === "positions" && (
          <Body
            empty="No open positions on this challenge"
            isEmpty={positions.length === 0}
            rows={positions.map((p) => (
              <PositionRow
                key={p.id}
                position={p}
                isClosing={closingPositionIds.has(String(p.id))}
                onEdit={() => setEditing(p)}
                onClose={() => {
                  // One-Click mode: skip the dialog and fire the close
                  // directly — preserves the existing fast-path UX for
                  // traders who explicitly opted into no-confirm.
                  // Otherwise open the dialog so the user gets the
                  // partial-close presets AND the rollover affordance
                  // when applicable.
                  if (oneClick) {
                    squareoff(p.id, p.symbol, p.segment_type, p.exchange);
                    return;
                  }
                  const { lots: openLots } = resolveQty(p);
                  setCloseTarget({
                    id: p.id,
                    symbol: p.symbol,
                    side: String(p.side ?? (Number(p.quantity) >= 0 ? "BUY" : "SELL")),
                    lots: openLots,
                    segment_type: p.segment_type,
                    exchange: p.exchange,
                    product_type: p.product_type,
                    expiry: p.expiry ?? p.instrument?.expiry ?? null,
                  });
                }}
              />
            ))}
          />
        )}
        {tab === "active" && (
          <Body
            empty="No active trades"
            isEmpty={(activeTradesLive?.length ?? 0) === 0}
            rows={(activeTradesLive ?? []).map((t: any) => (
              <ActiveTradeRow
                key={t.id}
                trade={t}
                isClosing={closingActiveTradeIds.has(String(t.id))}
                onEdit={() => setEditing({
                  // Adapt trade row → editing dialog expects position shape
                  id: t.position_id,
                  symbol: t.symbol,
                  quantity: t.action === "BUY" ? t.quantity : -t.quantity,
                  avg_price: t.price,
                  ltp: t.ltp,
                  stop_loss: t.stop_loss,
                  target: t.target,
                  segment_type: t.segment,
                  exchange: t.exchange,
                  // Override the dialog save so it routes to per-trade endpoint
                  __activeTradeId: t.id,
                })}
                onClose={() =>
                  closeActiveTrade(t.id, t.symbol, t.position_id, t.quantity, t.segment, t.exchange)
                }
              />
            ))}
          />
        )}
        {tab === "pending" && (
          <Body
            empty="No pending orders"
            isEmpty={pendingOrders.length === 0}
            rows={pendingOrders.map((o) => {
              const { lots, qty } = resolveQty(o);
              return (
                <Row
                  key={o.id}
                  cells={[
                    o.created_at ? exactTimestamp(o.created_at) : "—",
                    o.symbol,
                    productLabel(o.product_type),
                    <SideBadge key="s" side={o.action} />,
                    lots < 1 ? lots.toFixed(2) : String(lots),
                    qty < 1 ? qty.toFixed(2) : String(qty),
                    formatPrice(o.price, o.segment, o.exchange),
                    "—",
                    "—",
                    "—",
                    "—",
                    <span key="st" className="text-right text-muted-foreground">
                      {o.status}
                    </span>,
                    <RowActions
                      key="a"
                      actions={[
                        // ── Edit pending order (price / trigger / lots) ──
                        // Use case the user reported: BUY LIMIT placed at
                        // 1000, market jumped past 1000 before the order
                        // could fill → user wants to move the limit to
                        // 1005 without cancelling + replacing (which would
                        // lose queue priority + force re-validation of
                        // every cap). Opens an inline dialog with the
                        // current price + lots prefilled.
                        {
                          label: "Edit",
                          icon: Pencil,
                          onClick: () => setEditingOrder(o),
                        },
                        { label: "Cancel", icon: X, color: "destructive", onClick: () => cancel(o.id) },
                      ]}
                    />,
                  ]}
                />
              );
            })}
          />
        )}
        {tab === "history" && (
          <Body
            empty="No history"
            isEmpty={mergedHistory.length === 0}
            rows={mergedHistory.map((o) => {
              const { lots, qty } = resolveQty(o);
              // Closed lifecycle rows carry the SERVER-frozen `pnl_inr`
              // from the closing fill. Still-open entries (only an
              // opening fill exists, no matching close yet) have
              // `pnl_inr == null` and render as "—" since no realised
              // P&L exists yet. SIDE always reflects the OPENING side
              // (set on every merged row to the first-open's action)
              // so the chip matches what the trader actually opened —
              // a BUY-then-SELL lifecycle stays a single BUY row, not
              // a SELL chip surprised onto the trader's closed-trade
              // blotter.
              const pnlInrRaw = o.pnl_inr;
              const havePnl = pnlInrRaw !== null && pnlInrRaw !== undefined && pnlInrRaw !== "";
              const pnlInr = havePnl ? Number(pnlInrRaw) : 0;
              const entryPx = o.average_price ?? o.price;
              // For merged rows we stamped close_price separately so we
              // can show entry → exit; for still-open rows close_price
              // is absent and we fall through to "—".
              const exitPx = o.close_price;
              return (
                <Row
                  key={o.id}
                  cells={[
                    o.created_at ? exactTimestamp(o.created_at) : "—",
                    o.symbol,
                    productLabel(o.product_type),
                    <SideBadge key="s" side={o.action} />,
                    lots < 1 ? lots.toFixed(2) : String(lots),
                    qty < 1 ? qty.toFixed(2) : String(qty),
                    formatPrice(entryPx, o.segment, o.exchange),
                    exitPx != null && exitPx !== ""
                      ? formatPrice(exitPx, o.segment, o.exchange)
                      : "—",
                    "—",
                    "—",
                    <BrokerageCell key="comm" amount={Number(o.brokerage ?? 0)} />,
                    <SwapCell key="swap" amount={Number(o.swap_charges ?? 0)} />,
                    havePnl ? (
                      <span key="pnl" className={cn("text-right font-tabular", pnlColor(pnlInr))}>
                        {formatINR(pnlInr)}
                      </span>
                    ) : (
                      <span key="pnl" className="text-right text-muted-foreground">—</span>
                    ),
                    <span key="st" className="text-right text-[10px] text-muted-foreground">
                      {o.status}
                    </span>,
                  ]}
                />
              );
            })}
          />
        )}
        {tab === "cancelled" && (
          <Body
            empty="No cancelled orders"
            isEmpty={cancelled.length === 0}
            rows={cancelled.map((o) => {
              const { lots, qty } = resolveQty(o);
              return (
                <Row
                  key={o.id}
                  cells={[
                    o.created_at ? exactTimestamp(o.created_at) : "—",
                    o.symbol,
                    productLabel(o.product_type),
                    <SideBadge key="s" side={o.action} />,
                    lots < 1 ? lots.toFixed(2) : String(lots),
                    qty < 1 ? qty.toFixed(2) : String(qty),
                    formatPrice(o.price, o.segment, o.exchange),
                    "—",
                    "—",
                    "—",
                    "—",
                    <span key="st" className="text-right text-muted-foreground">
                      {o.status}
                    </span>,
                    "—",
                  ]}
                />
              );
            })}
          />
        )}
      </div>{/* end body wrapper */}
      </div>{/* end single overflow-auto container (header + body) */}

      <EditSlTpDialog
        position={editing}
        onClose={() => setEditing(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["positions"] })}
      />
      <EditPendingOrderDialog
        order={editingOrder}
        onClose={() => setEditingOrder(null)}
        onSaved={() => {
          // Refresh both the orders list and any cached pending count.
          // The PUT response updates the document so the row re-renders
          // with the new price the moment the cache invalidates.
          qc.invalidateQueries({ queryKey: ["orders"] });
        }}
      />
      <ClosePositionDialog
        target={closeTarget}
        onClose={() => setCloseTarget(null)}
        onSubmit={(positionId) => {
          const row = (positions ?? []).find(
            (p: any) => String(p.id) === String(positionId),
          );
          setClosingPositionIds((prev) =>
            new Map(prev).set(positionId, { symbol: String(row?.symbol ?? "") }),
          );
        }}
      />
    </div>
  );
}

function Body({ empty, isEmpty, rows }: { empty: string; isEmpty: boolean; rows: React.ReactNode[] }) {
  if (isEmpty) {
    return <div className="grid h-32 place-items-center text-xs text-muted-foreground">{empty}</div>;
  }
  return <div>{rows}</div>;
}

function Row({ cells }: { cells: React.ReactNode[] }) {
  return (
    <div
      className="grid items-center gap-2 border-b border-border/40 px-3 py-2 text-xs hover:bg-muted/10"
      style={{ gridTemplateColumns: COL_TEMPLATE, minWidth: 900 }}
    >
      {cells.map((c, i) => (
        <span key={i} className="truncate font-tabular">
          {c}
        </span>
      ))}
    </div>
  );
}

function PositionRow({
  position,
  onEdit,
  onClose,
  isClosing,
}: {
  position: any;
  onEdit: () => void;
  onClose: () => void;
  isClosing?: boolean;
}) {
  const isBuy = Number(position.quantity) >= 0;
  const seg = position.segment_type;
  const exch = position.exchange;
  const { lots, qty } = resolveQty(position);
  // Recompute P/L from the canonical qty so legacy positions opened
  // pre-fix (stored with quantity = lots × 1) still show the right MTM.
  // Falls back to whatever the server sent when we can't derive both
  // prices on the client (avoids zeroing P/L for non-Indian segments).
  const avg = Number(position.avg_price);
  const ltp = Number(position.ltp);
  const serverPnl = Number(position.unrealized_pnl ?? 0);
  const derivedPnl =
    Number.isFinite(avg) && Number.isFinite(ltp) && qty > 0
      ? (isBuy ? ltp - avg : avg - ltp) * qty
      : serverPnl;
  // Trust the bigger absolute value — server P/L can be stale if its
  // stored quantity was wrong, derived P/L can be wrong for FX/crypto.
  const displayPnl = Math.abs(derivedPnl) >= Math.abs(serverPnl) ? derivedPnl : serverPnl;
  return (
    <Row
      cells={[
        position.opened_at ? exactTimestamp(position.opened_at) : "—",
        position.symbol,
        productLabel(position.product_type),
        <SideBadge key="s" side={isBuy ? "BUY" : "SELL"} />,
        lots < 1 ? lots.toFixed(2) : String(lots),
        qty < 1 ? qty.toFixed(2) : String(qty),
        formatPrice(position.avg_price, seg, exch),
        <CurrentPriceCell key="cur" value={Number(position.ltp)} segment={seg} exchange={exch} />,
        position.stop_loss ? formatPrice(position.stop_loss, seg, exch) : "—",
        position.target ? formatPrice(position.target, seg, exch) : "—",
        <BrokerageCell key="comm" amount={Number(position.charges ?? 0)} />,
        <SwapCell key="swap" amount={Number(position.swap_charges ?? 0)} />,
        <span key="pnl" className={cn("text-right font-tabular", pnlColor(displayPnl))}>
          {formatINR(displayPnl)}
        </span>,
        <RowActions
          key="a"
          actions={[
            { label: "Edit SL / TP", icon: Pencil, onClick: onEdit },
            { label: "Close", icon: X, color: "destructive", onClick: onClose, showLabel: true, loading: !!isClosing },
          ]}
        />,
      ]}
    />
  );
}

/** One row per fill that's still part of an open position. Entry price is
 *  the trade's actual fill price (NOT the position's weighted average), so
 *  the P/L shown here is what the trader sees as the gain on this specific
 *  entry. Closing this row partially closes the underlying position at the
 *  trade's lot count — server settles P&L vs avg price internally. */
function ActiveTradeRow({
  trade,
  onEdit,
  onClose,
  isClosing,
}: {
  trade: any;
  onEdit: () => void;
  onClose: () => void;
  isClosing?: boolean;
}) {
  const seg = trade.segment;
  const exch = trade.exchange;
  const { lots, qty } = resolveQty(trade);
  const avg = Number(trade.price);
  const ltp = Number(trade.ltp);
  const isBuy = String(trade.action).toUpperCase() === "BUY";
  const serverPnl = Number(trade.pnl ?? 0);
  const derivedPnl =
    Number.isFinite(avg) && Number.isFinite(ltp) && qty > 0
      ? (isBuy ? ltp - avg : avg - ltp) * qty
      : serverPnl;
  const displayPnl = Math.abs(derivedPnl) >= Math.abs(serverPnl) ? derivedPnl : serverPnl;
  return (
    <Row
      cells={[
        trade.executed_at ? exactTimestamp(trade.executed_at) : "—",
        trade.symbol,
        productLabel(trade.product_type),
        <SideBadge key="s" side={trade.action as "BUY" | "SELL"} />,
        lots < 1 ? lots.toFixed(2) : String(lots),
        qty < 1 ? qty.toFixed(2) : String(qty),
        formatPrice(trade.price, seg, exch),
        <CurrentPriceCell key="cur" value={Number(trade.ltp)} segment={seg} exchange={exch} />,
        trade.stop_loss ? formatPrice(trade.stop_loss, seg, exch) : "—",
        trade.target ? formatPrice(trade.target, seg, exch) : "—",
        <BrokerageCell key="comm" amount={Number(trade.brokerage ?? 0)} />,
        <SwapCell key="swap" amount={Number(trade.swap_charges ?? 0)} />,
        <span key="pnl" className={cn("text-right font-tabular", pnlColor(displayPnl))}>
          {displayPnl >= 0 ? "+" : ""}
          {formatINR(displayPnl)}
        </span>,
        <RowActions
          key="a"
          actions={[
            { label: "Edit SL / TP", icon: Pencil, onClick: onEdit },
            { label: "Close", icon: X, color: "destructive", onClick: onClose, showLabel: true, loading: !!isClosing },
          ]}
        />,
      ]}
    />
  );
}

function RowActions({
  actions,
}: {
  actions: {
    label: string;
    icon: any;
    color?: "destructive" | "default";
    onClick: () => void;
    showLabel?: boolean;
    loading?: boolean;
  }[];
}) {
  return (
    <span className="flex justify-end gap-1">
      {actions.map((a, i) => {
        const Icon = a.icon;
        return (
          <button
            key={i}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (a.loading) return;
              a.onClick();
            }}
            disabled={a.loading}
            title={a.loading ? `${a.label}…` : a.label}
            aria-label={a.label}
            className={cn(
              "inline-flex h-7 items-center justify-center gap-1 rounded-md text-[11px] font-semibold transition-colors",
              a.showLabel ? "px-2.5" : "size-6",
              a.color === "destructive"
                ? "bg-destructive/15 text-destructive ring-1 ring-inset ring-destructive/30 hover:bg-destructive hover:text-destructive-foreground hover:ring-destructive"
                : "border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
              a.loading && "cursor-not-allowed opacity-70 hover:bg-destructive/15 hover:text-destructive hover:ring-destructive/30"
            )}
          >
            {a.loading ? (
              <span className="inline-block size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <Icon className="size-3.5" />
            )}
            {a.showLabel && <span>{a.label}</span>}
          </button>
        );
      })}
    </span>
  );
}

/** COMM column — per-fill brokerage charged on every executed trade. */
function BrokerageCell({ amount }: { amount: number }) {
  return (
    <span title={`Brokerage ${formatINR(amount)}`} className="font-tabular">
      {formatINR(amount)}
    </span>
  );
}

/** SWAP column — overnight-carry charge that swap_service debits at the
 *  admin-configured rollover time. Greyed out when zero (no carry charged
 *  yet) and highlighted amber once a charge has accrued, mirroring how
 *  every MetaTrader / cTrader terminal shows swap on F&O positions. */
function SwapCell({ amount }: { amount: number }) {
  const has = amount !== 0;
  return (
    <span
      title={has ? `Swap ${formatINR(amount)}` : "No swap charged yet"}
      className={cn(
        "font-tabular",
        has ? "text-amber-600 dark:text-amber-300" : "text-muted-foreground",
      )}
    >
      {has ? formatINR(amount) : "—"}
    </span>
  );
}

function SideBadge({ side }: { side: "BUY" | "SELL" }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit rounded px-1.5 py-0.5 text-[10px] font-semibold",
        side === "BUY" ? "bg-buy/15 text-buy" : "bg-sell/15 text-sell"
      )}
    >
      {side}
    </span>
  );
}

/** P/L cell for the History tab — what would this trade be worth right now
 *  if the user marked-to-market against the live LTP. Coloured green when
 *  positive, red when negative. Source-currency (USD for crypto/forex/CDS,
 *  ₹ otherwise) so it lines up with the price columns in the same row. */
function HistoryPnl({
  pnl,
  segment,
  exchange,
  ltp,
  avg,
  qty,
}: {
  pnl: number;
  segment?: string;
  exchange?: string;
  ltp: number;
  avg: number;
  qty: number;
}) {
  const isProfit = pnl > 0;
  const isLoss = pnl < 0;
  // All P&L is INR-native now (Infoway prices are treated as INR), so the
  // USD branch is gone. `segment` / `exchange` kept on the signature for
  // call-site compatibility.
  void segment;
  void exchange;
  const formatted = `${pnl >= 0 ? "+" : ""}${formatINR(pnl)}`;
  return (
    <span
      title={`LTP ${ltp} − Avg ${avg} × ${qty}`}
      className={cn(
        "inline-block rounded px-1.5 py-0.5 text-right font-tabular text-[11px] font-bold",
        isProfit && "bg-profit/10 text-profit",
        isLoss && "bg-loss/10 text-loss",
        !isProfit && !isLoss && "text-muted-foreground"
      )}
    >
      {formatted}
    </span>
  );
}

// ── Edit a pending LIMIT / SL-M order ────────────────────────────────
// The user reported: "BUY LIMIT @ 1000 placed, market jumped to 1010
// before fill, mujhe ab limit 1005 ki lagani — wahi se edit kar saku".
// Modify endpoint already exists on the backend (`PUT /user/orders/{id}`)
// and accepts `{ lots?, price?, trigger_price? }`. The dialog below
// prefills with the current values, validates direction + range
// client-side, then submits.
function EditPendingOrderDialog({
  order,
  onClose,
  onSaved,
}: {
  order: any | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [price, setPrice] = useState<string>("");
  const [trigger, setTrigger] = useState<string>("");
  const [lots, setLots] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [synced, setSynced] = useState<string | null>(null);

  // Live LTP for the order's instrument — drives the "current market"
  // hint + the marketable-limit guard below. 1.5 s refetch matches the
  // OrderPanel cadence so the comparison reference doesn't drift.
  const { data: quote } = useQuery<any>({
    queryKey: ["quote", order?.instrument_token ?? order?.token],
    queryFn: () => InstrumentAPI.quote(order!.instrument_token ?? order!.token),
    enabled: !!order?.id && (!!order?.instrument_token || !!order?.token),
    refetchInterval: 1500,
    staleTime: 1000,
  });

  // Sync once per opened order — same pattern as EditSlTpDialog. Reseed
  // when a different pending row is clicked while the dialog was open.
  if (order && synced !== order.id) {
    setPrice(order.price != null ? String(Number(order.price)) : "");
    setTrigger(
      order.trigger_price != null && Number(order.trigger_price) > 0
        ? String(Number(order.trigger_price))
        : "",
    );
    setLots(order.lots != null ? String(Number(order.lots)) : "");
    setSynced(order.id);
  }
  if (!order && synced !== null) {
    setPrice("");
    setTrigger("");
    setLots("");
    setSynced(null);
  }

  const orderType: string = String(order?.order_type ?? "LIMIT").toUpperCase();
  const isLimit = orderType === "LIMIT";
  const isSlm = orderType === "SL_M" || orderType === "SL-M" || orderType === "SLM";
  const isSl = orderType === "SL";

  async function save() {
    if (!order) return;

    // ── Validation ──────────────────────────────────────────────────
    // Catch bad input here so the user gets a clear toast instead of a
    // generic backend rejection (and avoids a round-trip).
    const priceNum = price ? Number(price) : NaN;
    const triggerNum = trigger ? Number(trigger) : NaN;
    const lotsNum = lots ? Number(lots) : NaN;

    if (isLimit) {
      if (!Number.isFinite(priceNum) || priceNum <= 0) {
        toast.error("Enter a valid limit price");
        return;
      }
    }
    if (isSlm || isSl) {
      if (!Number.isFinite(triggerNum) || triggerNum <= 0) {
        toast.error("Enter a valid trigger price");
        return;
      }
      if (isSl && (!Number.isFinite(priceNum) || priceNum <= 0)) {
        toast.error("Enter a valid limit price");
        return;
      }
    }
    if (Number.isFinite(lotsNum) && lotsNum <= 0) {
      toast.error("Lots must be greater than 0");
      return;
    }

    // Marketable-LIMIT guard — same logic OrderPanel runs at placement
    // time. A BUY LIMIT at or above the current ask (or SELL LIMIT at
    // or below the current bid) would fill IMMEDIATELY on the very
    // next pending-poller tick — at which point the user might as well
    // have placed a MARKET. We warn instead of blocking so a trader
    // who explicitly wants to "lock in better than market" still can,
    // but the common mistake gets caught.
    if (isLimit && Number.isFinite(priceNum)) {
      const side = String(order.action ?? "").toUpperCase();
      const ask = Number(quote?.ask ?? quote?.ltp ?? 0);
      const bid = Number(quote?.bid ?? quote?.ltp ?? 0);
      if (side === "BUY" && ask > 0 && priceNum >= ask) {
        toast.error(
          `BUY LIMIT ${priceNum} is at or above the current ask ${ask} — this would fill immediately. To wait for a lower price, lower the limit; to wait for a higher price, switch to an SL-M order.`,
          { duration: 6000 },
        );
        return;
      }
      if (side === "SELL" && bid > 0 && priceNum <= bid) {
        toast.error(
          `SELL LIMIT ${priceNum} is at or below the current bid ${bid} — this would fill immediately. To wait for a higher price, raise the limit; to wait for a lower price, switch to an SL-M order.`,
          { duration: 6000 },
        );
        return;
      }
    }

    // Lower-bound sanity on the new size if user edited lots.
    if (Number.isFinite(lotsNum) && lotsNum > 0) {
      const filled = Number(order.filled_quantity ?? 0);
      if (filled > 0) {
        // Partially-filled order: can't shrink below what's already filled.
        const lotSize = Number(order.instrument?.lot_size ?? order.lot_size ?? 1) || 1;
        const minLots = filled / lotSize;
        if (lotsNum < minLots) {
          toast.error(
            `Already filled ${filled} qty (${minLots.toFixed(2)} lots) — new lots must be ≥ that.`,
          );
          return;
        }
      }
    }

    setSaving(true);
    try {
      // Only send the fields the user actually changed — keeps the
      // backend's modify endpoint idempotent and avoids accidentally
      // zeroing trigger_price when editing a pure LIMIT.
      const body: Record<string, number> = {};
      if (isLimit && Number.isFinite(priceNum)) body.price = priceNum;
      if ((isSlm || isSl) && Number.isFinite(triggerNum))
        body.trigger_price = triggerNum;
      if (isSl && Number.isFinite(priceNum)) body.price = priceNum;
      if (Number.isFinite(lotsNum) && lotsNum > 0) body.lots = lotsNum;
      if (Object.keys(body).length === 0) {
        toast.error("Nothing to update");
        setSaving(false);
        return;
      }
      await OrderAPI.modify(order.id, body);
      toast.success("Order updated");
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  const liveLtp = Number(quote?.ltp ?? 0);

  return (
    <Dialog
      open={!!order}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            Edit {orderType} — {order?.symbol}
          </DialogTitle>
          <DialogDescription className="space-y-1">
            <div className="text-[11px] text-muted-foreground">
              {order?.action} · {order?.product_type} · placed{" "}
              {order?.created_at ? exactTimestamp(order.created_at) : "—"}
            </div>
            {liveLtp > 0 && (
              <div className="text-[11px]">
                Current price:{" "}
                <span className="font-tabular font-semibold text-foreground">
                  {formatPrice(liveLtp, order?.segment, order?.exchange)}
                </span>
              </div>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {(isLimit || isSl) && (
            <div className="space-y-1">
              <Label htmlFor="edit-pending-price" className="text-xs">
                Limit price
              </Label>
              <Input
                id="edit-pending-price"
                value={price}
                onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))}
                inputMode="decimal"
                placeholder="0.00"
                className="font-tabular"
              />
            </div>
          )}
          {(isSlm || isSl) && (
            <div className="space-y-1">
              <Label htmlFor="edit-pending-trigger" className="text-xs">
                Trigger price
              </Label>
              <Input
                id="edit-pending-trigger"
                value={trigger}
                onChange={(e) => setTrigger(e.target.value.replace(/[^\d.]/g, ""))}
                inputMode="decimal"
                placeholder="0.00"
                className="font-tabular"
              />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="edit-pending-lots" className="text-xs">
              Lots
            </Label>
            <Input
              id="edit-pending-lots"
              value={lots}
              onChange={(e) => setLots(e.target.value.replace(/[^\d.]/g, ""))}
              inputMode="decimal"
              placeholder="1"
              className="font-tabular"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Update order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditSlTpDialog({
  position,
  onClose,
  onSaved,
}: {
  position: any | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [sl, setSl] = useState<string>("");
  const [tp, setTp] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [synced, setSynced] = useState<string | null>(null);

  // Sync once per opened position
  if (position && synced !== position.id) {
    setSl(position.stop_loss ? String(Number(position.stop_loss)) : "");
    setTp(position.target ? String(Number(position.target)) : "");
    setSynced(position.id);
  }
  if (!position && synced !== null) {
    setSl("");
    setTp("");
    setSynced(null);
  }

  // ── Limit-away % from segment settings ─────────────────────────────
  // Same source the OrderPanel uses — segment-resolved effective config
  // for THIS instrument + close-side + product type. SL/TP placeholders
  // show the nearest allowed boundary; save() rejects values closer
  // than that to LTP (matches the order_validator backend check). Close
  // side is the opposite of the position direction: a long is closed
  // by SELLing → use "SELL"; short → "BUY".
  const closeSide: "BUY" | "SELL" =
    position && Number(position.quantity ?? 0) > 0 ? "SELL" : "BUY";
  const { data: effSettings } = useQuery<any>({
    queryKey: [
      "segment-settings",
      position?.instrument_token,
      closeSide,
      position?.product_type,
    ],
    queryFn: () =>
      SegmentSettingsAPI.effective(
        position!.instrument_token,
        closeSide,
        position!.product_type,
      ),
    enabled: !!position?.instrument_token && !!position?.product_type,
    staleTime: 5_000,
  });
  const limitAwayPct = Number(effSettings?.limit_percentage ?? 0) || 0;
  const ltpRef = Number(position?.ltp ?? 0);
  const _round = (n: number) => +n.toFixed(2);
  // Long is closed by SELLing → SL below LTP, TP above LTP.
  // Short is closed by BUYing → SL above LTP, TP below LTP.
  const isLong = position ? Number(position.quantity ?? 0) > 0 : true;
  const slPlaceholder =
    limitAwayPct > 0 && ltpRef > 0
      ? String(_round(isLong ? ltpRef * (1 - limitAwayPct / 100) : ltpRef * (1 + limitAwayPct / 100)))
      : "Leave blank to clear";
  const tpPlaceholder =
    limitAwayPct > 0 && ltpRef > 0
      ? String(_round(isLong ? ltpRef * (1 + limitAwayPct / 100) : ltpRef * (1 - limitAwayPct / 100)))
      : "Leave blank to clear";

  // ── Live SL/TP validation ────────────────────────────────────────────
  // Mirrors the same set of rules `save()` runs below — directional
  // sanity vs avg entry + limit-away band vs LTP — but as a memo so the
  // result tracks every keystroke. Returns null when both fields are
  // valid (or blank, since blank = "clear"); a single English reason
  // string when something would be rejected. The Save button stays
  // disabled + the warning banner stays visible while the reason is
  // non-null, matching the OrderPanel pre-validation gate so the user
  // sees the failing rule continuously instead of after clicking Save.
  const validationReason = useMemo<string | null>(() => {
    if (!position) return null;
    const avg = Number(position.avg_price ?? 0);
    const qty = Number(position.quantity ?? 0);
    const slNum = sl ? Number(sl) : 0;
    const tpNum = tp ? Number(tp) : 0;

    // Blank-blank is legal (clears both brackets) — bail early.
    if (slNum <= 0 && tpNum <= 0) return null;

    // Non-numeric / negative entries.
    if (sl && (!Number.isFinite(slNum) || slNum < 0)) return "Stop loss must be a positive number";
    if (tp && (!Number.isFinite(tpNum) || tpNum < 0)) return "Target must be a positive number";

    // Directional sanity vs the average entry price — wrong-side levels
    // would auto-trigger on the very next tick, instantly squaring the
    // position off. Same rule the backend rejects with SL_WRONG_SIDE /
    // TP_WRONG_SIDE.
    if (avg > 0 && qty !== 0) {
      const isLongPos = qty > 0;
      if (slNum > 0) {
        if (isLongPos && slNum >= avg) {
          return `Stop loss must be BELOW entry ${avg} for a long`;
        }
        if (!isLongPos && slNum <= avg) {
          return `Stop loss must be ABOVE entry ${avg} for a short`;
        }
      }
      if (tpNum > 0) {
        if (isLongPos && tpNum <= avg) {
          return `Target must be ABOVE entry ${avg} for a long`;
        }
        if (!isLongPos && tpNum >= avg) {
          return `Target must be BELOW entry ${avg} for a short`;
        }
      }
    }

    // Limit-away band vs LTP — both levels must sit at least
    // limitAwayPct away from the live tick so auto-squareoff doesn't
    // fire the instant the user saves. Strict comparison so values
    // EXACTLY on the boundary still pass (matches the backend, which
    // uses `>` / `<` rather than `>=` / `<=` for the band check).
    if (limitAwayPct > 0 && ltpRef > 0) {
      const upperBand = ltpRef * (1 + limitAwayPct / 100);
      const lowerBand = ltpRef * (1 - limitAwayPct / 100);
      if (slNum > 0) {
        if (isLong && slNum > lowerBand) {
          return `Stop loss ${slNum} too close to LTP ${ltpRef} — must be ≤ ${_round(lowerBand)} (${limitAwayPct}% away)`;
        }
        if (!isLong && slNum < upperBand) {
          return `Stop loss ${slNum} too close to LTP ${ltpRef} — must be ≥ ${_round(upperBand)} (${limitAwayPct}% away)`;
        }
      }
      if (tpNum > 0) {
        if (isLong && tpNum < upperBand) {
          return `Target ${tpNum} too close to LTP ${ltpRef} — must be ≥ ${_round(upperBand)} (${limitAwayPct}% away)`;
        }
        if (!isLong && tpNum > lowerBand) {
          return `Target ${tpNum} too close to LTP ${ltpRef} — must be ≤ ${_round(lowerBand)} (${limitAwayPct}% away)`;
        }
      }
    }

    return null;
  }, [position, sl, tp, limitAwayPct, ltpRef, isLong]);

  async function save() {
    if (!position) return;

    // ── Directional sanity ─────────────────────────────────────────
    // Mirrors the backend check in positions.py — wrong-side SL/TP
    // would auto-trigger on the very next tick, instantly squaring off
    // the position. Catching it here avoids a server round-trip + toast.
    //   • Long  (qty > 0):  SL < avg  AND  TP > avg
    //   • Short (qty < 0):  SL > avg  AND  TP < avg
    const avg = Number(position.avg_price ?? 0);
    const qty = Number(position.quantity ?? 0);
    const slNum = sl ? Number(sl) : 0;
    const tpNum = tp ? Number(tp) : 0;
    if (avg > 0 && qty !== 0) {
      const isLong = qty > 0;
      if (slNum > 0) {
        if (isLong && slNum >= avg) {
          toast.error(`Stop loss must be BELOW entry ${avg} for a long`);
          return;
        }
        if (!isLong && slNum <= avg) {
          toast.error(`Stop loss must be ABOVE entry ${avg} for a short`);
          return;
        }
      }
      if (tpNum > 0) {
        if (isLong && tpNum <= avg) {
          toast.error(`Target must be ABOVE entry ${avg} for a long`);
          return;
        }
        if (!isLong && tpNum >= avg) {
          toast.error(`Target must be BELOW entry ${avg} for a short`);
          return;
        }
      }
    }

    // ── Limit-away enforcement (same as OrderPanel SL/TP rules) ─────
    // Auto-squareoff fires at MARKET when LTP touches SL/TP, so the
    // band immediately around LTP is rejected — the value must sit at
    // least `limit_percentage` away. Backend re-runs the same check;
    // doing it here avoids the round-trip + toast flicker.
    if (limitAwayPct > 0 && ltpRef > 0) {
      const upperBand = ltpRef * (1 + limitAwayPct / 100);
      const lowerBand = ltpRef * (1 - limitAwayPct / 100);
      if (slNum > 0) {
        // Long → SL is BELOW LTP, must be ≤ lowerBand.
        // Short → SL is ABOVE LTP, must be ≥ upperBand.
        if (isLong && slNum > lowerBand) {
          toast.error(
            `Stop loss ${slNum} too close to LTP ${ltpRef}. Must be at least ${limitAwayPct}% away — maximum ${_round(lowerBand)}.`,
            { duration: 6000 },
          );
          return;
        }
        if (!isLong && slNum < upperBand) {
          toast.error(
            `Stop loss ${slNum} too close to LTP ${ltpRef}. Must be at least ${limitAwayPct}% away — minimum ${_round(upperBand)}.`,
            { duration: 6000 },
          );
          return;
        }
      }
      if (tpNum > 0) {
        // Long → TP is ABOVE LTP, must be ≥ upperBand.
        // Short → TP is BELOW LTP, must be ≤ lowerBand.
        if (isLong && tpNum < upperBand) {
          toast.error(
            `Target ${tpNum} too close to LTP ${ltpRef}. Must be at least ${limitAwayPct}% away — minimum ${_round(upperBand)}.`,
            { duration: 6000 },
          );
          return;
        }
        if (!isLong && tpNum > lowerBand) {
          toast.error(
            `Target ${tpNum} too close to LTP ${ltpRef}. Must be at least ${limitAwayPct}% away — maximum ${_round(lowerBand)}.`,
            { duration: 6000 },
          );
          return;
        }
      }
    }

    setSaving(true);
    try {
      const body = {
        stop_loss: sl ? Number(sl) : null,
        target: tp ? Number(tp) : null,
      };
      // Active-trade rows tag themselves with __activeTradeId so we can route
      // through the per-trade endpoint (which still hits the parent position
      // server-side, but keeps the API surface symmetric for future per-leg
      // SL/TP support).
      if (position.__activeTradeId) {
        await PositionAPI.updateActiveTradeSlTp(position.__activeTradeId, body);
      } else {
        await PositionAPI.updateSlTp(position.id, body);
      }
      toast.success("SL / TP updated");
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={!!position}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit SL / TP — {position?.symbol}</DialogTitle>
          <DialogDescription>
            {position && (
              <>
                {Number(position.quantity) >= 0 ? "Long" : "Short"}{" "}
                {Math.abs(Number(position.quantity ?? 0))} @{" "}
                {formatPrice(position?.avg_price, position.segment_type, position.exchange)} · LTP{" "}
                {formatPrice(position?.ltp, position.segment_type, position.exchange)}
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Stop loss</Label>
            <Input
              type="number"
              step="0.01"
              value={sl}
              onChange={(e) => setSl(e.target.value)}
              placeholder={slPlaceholder}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Target price</Label>
            <Input
              type="number"
              step="0.01"
              value={tp}
              onChange={(e) => setTp(e.target.value)}
              placeholder={tpPlaceholder}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            When LTP crosses these levels the position is auto-squared off at market.
            {limitAwayPct > 0 && (
              <>
                {" "}Each level must sit at least <strong>{limitAwayPct}%</strong> from LTP — the placeholder shows the nearest allowed boundary.
              </>
            )}
          </p>
          {/* Persistent validation banner — same UX as the OrderPanel
              eligibility gate. Stays visible (and Save stays disabled)
              while either SL or TP fails a rule. Empty fields are
              treated as "clear" and don't trip the banner. */}
          {validationReason && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-300">
              {validationReason}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={save}
            loading={saving}
            disabled={validationReason !== null}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


/** CURRENT price cell — flashes green when LTP ticks up, red when it
 *  ticks down, then decays back to neutral after ~700 ms. Matches
 *  every Indian broker's market-watch UX so the trader's eye catches
 *  price movement at a glance without comparing two static numbers. */
function CurrentPriceCell({
  value,
  segment,
  exchange,
}: {
  value: number;
  segment?: string;
  exchange?: string;
}) {
  const dir = usePriceFlash(value);
  const flashColor =
    dir === "up"
      ? "text-emerald-500"
      : dir === "down"
        ? "text-red-500"
        : "";
  return (
    <span className={cn("text-right font-tabular tabular-nums transition-colors", flashColor)}>
      {formatPrice(value, segment, exchange)}
    </span>
  );
}
