"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { LogOut, Pencil, X } from "lucide-react";
import { OrderAPI, PositionAPI, ProfileAPI, SegmentSettingsAPI, WalletAPI } from "@/lib/api";
import { useMarketStream } from "@/lib/useMarketStream";
import { usePriceFlash } from "@/lib/usePriceFlash";
import { isInstrumentMarketOpen, marketLabel } from "@/lib/marketHours";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/common/PageHeader";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusPill } from "@/components/common/StatusPill";
import { ClosePositionDialog, type ClosePositionTarget } from "@/components/common/ClosePositionDialog";
import { TradeDetailSheet } from "@/components/trading/TradeDetailSheet";
import { cn, formatINR, formatIST, formatPrice, pnlColor } from "@/lib/utils";

// Unified blotter tabs: Position (open) / Active (per-fill) / Closed
// (today's realised) / Cancelled (orders) / Rejected (orders). Replaces
// the separate /orders page so the trader sees every state in one row.
type TabKey =
  | "position"
  | "active"
  | "pending"
  | "closed"
  | "cancelled"
  | "rejected";

/** Bare-number price formatter — no ₹ / $ prefix on any instrument
 *  price (LTP / bid / ask / avg_price / close). Forex pairs render with
 *  4 decimals, everything else with 2. `quote` is still accepted for
 *  call-site compatibility but ignored (the previous USD/INR branch is
 *  gone now that prices render uniformly). */
function fmtFeedPrice(
  value: string | number | null | undefined,
  _quote?: string,
  segment?: string,
  exchange?: string,
) {
  return formatPrice(value, segment, exchange);
}

/**
 * Extract a readable expiry chip from an NSE/MCX derivative symbol.
 * Handles both encoding styles NSE uses for FUT + options:
 *
 *  • Monthly (alphabetic month):   `CRUDEOIL26JUNFUT` / `NIFTY26JUN23700PE`
 *                                  → "26 JUN"
 *  • Weekly NIFTY/BANKNIFTY etc:   `NIFTY2651923800PE` (YY=26, M=5,
 *                                  D=19, strike, side) → "19 MAY 26"
 *  • Weekly Oct/Nov/Dec:           NSE encodes those single chars as
 *                                  "O" / "N" / "D" in the month slot —
 *                                  same parser handles that path.
 *
 * Returns null for spot stocks, indices, or anything that doesn't match
 * the two encodings above.
 */
function extractExpiryLabel(symbol: string | null | undefined): string | null {
  if (!symbol) return null;
  const sym = String(symbol).toUpperCase();
  const MONTH_NAMES = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN",
                       "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

  // Monthly pattern — `<UNDERLYING><YY><MMM>...`. The regex anchors on
  // the YY+MMM tuple so it works for any underlying prefix and for both
  // FUT (CRUDEOIL26JUNFUT) and option (NIFTY26JUN23700PE) suffixes.
  const monthly =
    /(\d{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/.exec(sym);
  if (monthly) return `${monthly[1]} ${monthly[2]}`;

  // Weekly numeric pattern — `<ALPHA><YY><M><DD>...<CE|PE>` where M is
  // a single char: 1-9 for Jan-Sep, then O/N/D for Oct/Nov/Dec. So
  // NIFTY2651923800PE = YY 26, M 5, DD 19, strike 23800, PE.
  const weekly =
    /^[A-Z]+(\d{2})([1-9OND])(\d{2})\d+(?:CE|PE)$/.exec(sym);
  if (weekly) {
    const yy = weekly[1];
    const mChar = weekly[2];
    const dd = weekly[3];
    let monthIdx: number;
    if (/^[1-9]$/.test(mChar)) {
      monthIdx = parseInt(mChar, 10) - 1;       // "5" → May (index 4)
    } else if (mChar === "O") {
      monthIdx = 9;                              // Oct
    } else if (mChar === "N") {
      monthIdx = 10;                             // Nov
    } else {
      monthIdx = 11;                             // Dec
    }
    if (monthIdx < 0 || monthIdx > 11) return null;
    return `${dd} ${MONTH_NAMES[monthIdx]} ${yy}`;
  }

  return null;
}

// Compact pill that translates Position.close_reason into a human label
// with a tone-matching color. Same legal set as
// stock4x_ind/backend/app/models/position.py:close_reason.
const CLOSE_REASON_META: Record<
  string,
  { label: string; cls: string }
> = {
  USER: { label: "User", cls: "bg-blue-500/10 text-blue-400 ring-blue-500/30" },
  SL_HIT: {
    label: "Stop Loss",
    cls: "bg-sell/10 text-sell ring-sell/30",
  },
  TP_HIT: { label: "Target", cls: "bg-buy/10 text-buy ring-buy/30" },
  STOP_OUT: {
    label: "Stop-out",
    cls: "bg-amber-500/10 text-amber-400 ring-amber-500/30",
  },
  AUTO: {
    label: "Auto",
    cls: "bg-muted/40 text-muted-foreground ring-border",
  },
};

// Overnight (carry-forward) margin estimate for a single position or
// active-trade row. MIS blocks ~40% less margin intraday than NRML, so
// rolling a MIS position past 3:20 PM needs roughly 1.4× the current
// block; NRML/CNC already sits at full margin so it's unchanged. Used
// by the per-position "Holding Margin" tile AND the wallet strip's CF
// Required aggregate so both stay in lockstep — previously the strip
// summed `margin_used` (intraday) which made it identical to the Used
// Margin tile and meaningless as a CF indicator.
function holdingMarginFor(row: any): number {
  const used = Number(row?.margin_used ?? row?.margin ?? row?.used_margin ?? 0);
  const isMIS = String(row?.product_type ?? "").toUpperCase() === "MIS";
  return isMIS ? +(used * 1.4).toFixed(2) : used;
}

function CloseReasonChip({ reason }: { reason?: string | null }) {
  if (!reason)
    return <span className="text-muted-foreground/60 text-xs">—</span>;
  const meta = CLOSE_REASON_META[reason] ?? {
    label: reason,
    cls: "bg-muted/40 text-muted-foreground ring-border",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset",
        meta.cls,
      )}
    >
      {meta.label}
    </span>
  );
}

export default function PositionsPage() {
  const qc = useQueryClient();
  // Per-user re-order config — when reorder_effective_delay_sec > 0 the
  // backend parks every MARKET squareoff for ~N seconds before the
  // matching engine actually flattens the position. The OPTIMISTIC
  // remove paths below must skip in that case, otherwise the row
  // vanishes on click, the 2-s positions poll fires WHILE the server
  // still sees the row as OPEN and the cache gets refilled, then ~N s
  // later the close finally lands and the row vanishes again — same
  // flash-in / flash-out pattern as the open-side re-order bug.
  const { data: me } = useQuery<any>({
    queryKey: ["users", "me"],
    queryFn: () => ProfileAPI.me(),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
  const reorderDelayActive =
    Number(me?.reorder_effective_delay_sec ?? 0) > 0;
  // Per-row "close in flight" tracker — populated when the user
  // clicks X Close (via squareoff / exitActive / ClosePositionDialog
  // onSubmit), drained when the matching engine actually flattens
  // the position (the row vanishes from `open`). Drives BOTH the
  // loading spinner on the row's Close button AND the deferred
  // "Closed <symbol>" toast that fires only after the position has
  // actually been flattened (user explicit ask: notification trade
  // close hone ke baad aana chahiye). The symbol is captured at
  // click time so the toast can name the right instrument once the
  // drain effect picks up the disappearance.
  const [closingPositionIds, setClosingPositionIds] = useState<
    Map<string, { symbol: string }>
  >(() => new Map());
  const [closingActiveTradeIds, setClosingActiveTradeIds] = useState<
    Map<string, { symbol: string }>
  >(() => new Map());
  const [tab, setTab] = useState<TabKey>("position");
  // `source` discriminates between the two tabs that share the same edit
  // dialog. Active-trade rows hit the per-trade SL/TP endpoint by their
  // own trade id; position rows hit the per-position endpoint by the
  // position id. Without this tag the dialog used to blindly route every
  // mobile click through the active-trade endpoint, so editing SL/TP
  // from the Position tab on mobile failed with "Trade not found".
  const [editing, setEditing] = useState<
    { row: any; kind: "TP" | "SL"; source: "position" | "active" } | null
  >(null);
  // Slide-up trade card token — mobile-only. When the user taps any
  // position / active-trade card on a phone, open the same
  // TradeDetailSheet used by /marketwatch and /option-chain so they
  // can place a new BUY/SELL on the same instrument without leaving
  // the Positions page. User-flagged: "potion page me kisi bhi
  // potion ko click karne par bhi same buy/sell ke liye card open
  // ho jaisa option chain me kiya hai".
  const [sheetToken, setSheetToken] = useState<string | null>(null);

  // ── Data ────────────────────────────────────────────────────────────
  // Open positions are always fetched so the tab badge stays current and
  // the Active-tab margin breakdown has fresh used_margin to sum.
  const { data: open, isFetching: openLoading } = useQuery<any[]>({
    queryKey: ["positions", "open"],
    queryFn: () => PositionAPI.open(),
    refetchInterval: 3000,
  });
  const { data: closed, isFetching: closedLoading } = useQuery<any[]>({
    queryKey: ["positions", "closed"],
    queryFn: () => PositionAPI.closed(),
    refetchInterval: 10000,
    enabled: tab === "closed",
  });
  const { data: activeTrades, isFetching: activeLoading } = useQuery<any[]>({
    queryKey: ["positions", "active-trades"],
    queryFn: () => PositionAPI.activeTrades(),
    refetchInterval: 3000,
    enabled: tab === "active",
  });
  // pnlSummary is used for live USD/INR + wallet strip; always polled
  // (cheap, single endpoint, 5 s) so the header tracker stays current
  // regardless of which tab is open.
  const { data: pnlSummary } = useQuery<any>({
    queryKey: ["positions", "pnl-summary"],
    queryFn: () => PositionAPI.pnlSummary(),
    refetchInterval: 5000,
  });

  // Drain closingPositionIds once the matching engine has actually
  // flattened the position (= row no longer in the open list). At
  // that moment we ALSO pop the deferred "Closed <symbol>" toast,
  // so the notification matches the row vanishing from Positions —
  // even when the close went through the re-order delay window.
  useEffect(() => {
    if (closingPositionIds.size === 0) return;
    const ids = new Set((open ?? []).map((p: any) => String(p.id)));
    const drained: { symbol: string }[] = [];
    setClosingPositionIds((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [id, meta] of prev) {
        if (!ids.has(id)) {
          next.delete(id);
          drained.push(meta);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    for (const meta of drained) {
      toast.success(`${meta.symbol} closed`, { duration: 1500 });
    }
  }, [open, closingPositionIds]);

  // Same drain pattern for active-trade close buttons.
  useEffect(() => {
    if (closingActiveTradeIds.size === 0) return;
    const ids = new Set((activeTrades ?? []).map((t: any) => String(t.id)));
    const drained: { symbol: string }[] = [];
    setClosingActiveTradeIds((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [id, meta] of prev) {
        if (!ids.has(id)) {
          next.delete(id);
          drained.push(meta);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    for (const meta of drained) {
      toast.success(`${meta.symbol} exited`, { duration: 1500 });
    }
  }, [activeTrades, closingActiveTradeIds]);

  // Per-tab pagination state. Resets to page 1 when the user opens
  // each tab (most users want the latest entries first). Page size
  // matches the backend default (50) so the page-count math lines up.
  const [pendingPage, setPendingPage] = useState(1);
  const [cancelledPage, setCancelledPage] = useState(1);
  const [rejectedPage, setRejectedPage] = useState(1);
  // Phase-5C close-position dialog target. Opens the partial-close +
  // rollover dialog when the user taps a row's Close button. The
  // existing `squareoff(id)` fast-path stays for `squareoffAll` and
  // any future flow that needs to fire a market close without the
  // dialog ceremony.
  const [closeTarget, setCloseTarget] = useState<ClosePositionTarget | null>(null);

  // Pending orders — LIMIT / SL-M parked in the order book waiting for
  // their trigger condition. Status is OPEN at this point (PENDING is the
  // brief validation window before the order is accepted). Polled live
  // (3 s) so a trigger-fire moves the row out of this tab the moment the
  // matching engine flips status → EXECUTED.
  const { data: pendingPaginated, isFetching: pendingLoading } = useQuery({
    queryKey: ["orders", "OPEN", pendingPage],
    queryFn: () => OrderAPI.listPaginated({ status: "OPEN", page: pendingPage, page_size: 50 }),
    refetchInterval: 3000,
    enabled: tab === "pending",
    placeholderData: (prev) => prev,
  });
  const pending = pendingPaginated?.items;
  const pendingMeta = pendingPaginated?.meta;

  // Cancelled / Rejected feed orders, not positions — fold them in here
  // so the user has one unified blotter for every order state. Lazy
  // (only fetched when the tab is selected) and a slow 10 s poll since
  // cancelled/rejected don't change live.
  const { data: cancelledPaginated, isFetching: cancelledLoading } = useQuery({
    queryKey: ["orders", "CANCELLED", cancelledPage],
    queryFn: () => OrderAPI.listPaginated({ status: "CANCELLED", page: cancelledPage, page_size: 50 }),
    refetchInterval: 10000,
    enabled: tab === "cancelled",
    placeholderData: (prev) => prev,
  });
  const cancelled = cancelledPaginated?.items;
  const cancelledMeta = cancelledPaginated?.meta;
  const { data: rejectedPaginated, isFetching: rejectedLoading } = useQuery({
    queryKey: ["orders", "REJECTED", rejectedPage],
    queryFn: () => OrderAPI.listPaginated({ status: "REJECTED", page: rejectedPage, page_size: 50 }),
    refetchInterval: 10000,
    enabled: tab === "rejected",
    placeholderData: (prev) => prev,
  });
  const rejected = rejectedPaginated?.items;
  const rejectedMeta = rejectedPaginated?.meta;

  // Wallet snapshot for the top status strip.
  const { data: wallet } = useQuery<any>({
    queryKey: ["wallet", "summary"],
    queryFn: () => WalletAPI.summary(),
    refetchInterval: 10000,
    staleTime: 5000,
  });

  // ── Counts ──────────────────────────────────────────────────────────
  const counts = {
    closed: closed?.length ?? 0,
    position: open?.length ?? 0,
    active: activeTrades?.length ?? 0,
    pending: pending?.length ?? 0,
    cancelled: cancelled?.length ?? 0,
    rejected: rejected?.length ?? 0,
  };

  // ── Live WS overlay ─────────────────────────────────────────────────
  // Subscribe to /ws/marketdata for every open-position / active-trade
  // token so the "Current" column updates tick-to-tick (250 ms) just
  // like the trading-terminal positions tab. Without this the table
  // only refreshes when the 3 s REST poll fires, so a fast-moving
  // instrument's LTP looks frozen between polls.
  const streamTokens = useMemo<string[]>(() => {
    const set = new Set<string>();
    for (const p of open ?? []) {
      const t = String(p?.instrument_token ?? "");
      if (t) set.add(t);
    }
    for (const t of activeTrades ?? []) {
      const tok = String(t?.token ?? t?.instrument_token ?? "");
      if (tok) set.add(tok);
    }
    return Array.from(set);
  }, [open, activeTrades]);
  const liveQuotes = useMarketStream(streamTokens);

  /** Side-aware close-side price for a position row.
   *
   * User reported the position card's CURRENT column was labelled "BID"
   * but the value matched the underlying's LTP, not the actual bid
   * shown on a real broker terminal. That mislabel cascaded into P&L
   * too — we computed (ltp - avg) but the realised price on exit is
   * the close-side of the book (bid for BUY, ask for SELL). Same
   * bug the APK had, fixed there in c11d619; this is the web mirror.
   *
   * Priority: live bid/ask (side-aware) → live ltp → stored row.ltp.
   * `side` ("BUY"/"SELL") drives whether we ask for bid or ask. When
   * called without a side (legacy callers / aggregate previews) we
   * fall back to plain ltp, identical to the old behaviour.
   */
  function liveLtpFor(row: any, side?: "BUY" | "SELL"): number {
    // Market-closed gate — when the instrument's segment is past its
    // close-of-day (NSE/BSE 15:30, MCX 23:30, indices session-bound),
    // we IGNORE every live overlay and return the last stored
    // `row.ltp`. The user reported "market band hai fir bhi PnL move
    // kar raha" — root cause was Zerodha/Infoway replaying the final
    // pre-close snapshot every few seconds, and our display picking up
    // each replay as a "new" tick. Freezing at row.ltp matches the
    // exchange's actual state: no transactions are happening, the
    // price MUST not drift on screen.
    //
    // Crypto / forex / spot commodity segments are 24×5 / 24×7 — for
    // those isInstrumentMarketOpen returns true around the clock, so
    // this gate is a no-op there.
    const seg = row?.segment_type ?? row?.segment;
    const exch = row?.exchange;
    if (!isInstrumentMarketOpen(seg, exch)) {
      return Number(row?.ltp ?? 0);
    }
    const tok = String(row?.instrument_token ?? row?.token ?? "");
    if (tok) {
      const tick = liveQuotes.get(tok);
      if (side === "BUY") {
        const liveBid = Number(tick?.bid ?? 0);
        if (liveBid > 0) return liveBid;
      } else if (side === "SELL") {
        const liveAsk = Number(tick?.ask ?? 0);
        if (liveAsk > 0) return liveAsk;
      }
      const liveLtp = Number(tick?.ltp ?? 0);
      if (liveLtp > 0) return liveLtp;
    }
    return Number(row?.ltp ?? 0);
  }

  /** Resolve the side ("BUY"/"SELL") of a position row. Looks at the
   * explicit `opened_side` first (survives close), then `action` (active
   * trades), then the signed quantity (legacy positions without
   * opened_side). Centralises the "which side is this row?" decision so
   * every close-price lookup uses the same answer. */
  function resolveSide(row: any): "BUY" | "SELL" {
    const raw = String(row?.opened_side ?? row?.action ?? row?.side ?? "")
      .toUpperCase();
    if (raw === "BUY" || raw === "SELL") return raw as "BUY" | "SELL";
    const q = Number(row?.quantity ?? 0);
    return q < 0 ? "SELL" : "BUY";
  }

  // ── Header description: M2M snapshot ────────────────────────────────
  // Sum live floating P&L by computing per-row from WS LTP. The stored
  // unrealized_pnl is 3-s stale; using live ticks here keeps the header
  // tracker in lockstep with the table rows below.
  const totalMtm = (open ?? []).reduce((s: number, p: any) => {
    // Realisable P&L if the user squared off every position right now:
    // BUY rows close at the live BID, SELL rows at the live ASK. Falls
    // back to LTP when bid/ask aren't on the tick yet. Matches the
    // matching-engine fill behaviour (matching_engine.execute_market_order
    // uses BID/ASK for execution), so M2M never overstates what the
    // user would actually book.
    const side = resolveSide(p);
    const price = liveLtpFor(p, side) || Number(p.ltp ?? 0);
    const avg = Number(p.avg_price ?? 0);
    const qty = Number(p.quantity ?? 0);
    if (!price || !avg || !qty) return s;
    return s + (price - avg) * qty;
  }, 0);

  // CF Required (carry-forward margin) — sums each non-Infoway position's
  // OVERNIGHT margin estimate, not its current intraday `margin_used`.
  // Previously this just totalled `margin_used` which made it numerically
  // identical to (a subset of) the Used Margin tile — useless as a
  // separate indicator. With `holdingMarginFor` it now answers the
  // question the trader actually asks: "if my MIS positions roll
  // overnight, what margin will the platform need to lock?"
  // Infoway-fed instruments (Forex / Crypto / Stocks / Indices /
  // Commodities) trade in carry-forward mode by default so their
  // `margin_used` IS the carry margin already; counting them here
  // would double-count what the wallet's Used Margin tile already shows.
  const isInfowayPosition = (p: any): boolean => {
    const seg = (p?.segment_type ?? "").toUpperCase();
    const exch = (p?.exchange ?? "").toUpperCase();
    return (
      /CRYPTO|FOREX|FX|CDS|STOCKS|INDICES|COMMODITIES/.test(seg) ||
      exch === "CDS" ||
      exch === "CRYPTO"
    );
  };
  const requiredMargin = useMemo(
    () =>
      (open ?? [])
        .filter((p: any) => !isInfowayPosition(p))
        .reduce((s, p) => s + holdingMarginFor(p), 0),
    [open],
  );

  // ── Actions ─────────────────────────────────────────────────────────
  async function squareoff(id: string) {
    // Optimistic rows have synthetic IDs (`optimistic_<ts>`) created by
    // OrderPanel before the backend confirms the trade. They're not real
    // ObjectIds, so hitting /positions/<optimistic_…>/squareoff returns a
    // raw 500 (PydanticObjectId(…) raises InvalidId, which the CORS
    // middleware can't decorate — the browser sees it as a CORS error).
    // Block here and tell the user to wait a beat for the server to land
    // the real row; the WS push usually reconciles within 500 ms.
    if (id.startsWith("optimistic_")) {
      toast.error("Order still settling — try again in a second");
      return;
    }
    // Market-hours guard — must run BEFORE the optimistic remove,
    // otherwise the row vanishes for a flash, the backend rejects
    // with "market closed", and we roll back (flicker). Show the
    // toast and leave the row in place instead.
    const row = (open ?? []).find((p: any) => p.id === id);
    if (row && !isInstrumentMarketOpen(row.segment_type, row.exchange)) {
      toast.error(
        `${marketLabel(row.segment_type, row.exchange)} market is closed — try closing ${row.symbol} during trading hours`,
        { duration: 4000 },
      );
      return;
    }
    // Mobile UX — skip the native confirm() dialog and just fire. The
    // user explicitly asked for "close karne par pop mat aaye" on
    // phones; desktop still gets the confirm step to protect against
    // accidental clicks on a wider hit-area. Bootstrap-md breakpoint
    // (768px) matches the rest of the responsive layout here.
    const isMobileUi =
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 767px)").matches;
    if (!isMobileUi && !confirm("Square off this position at market?")) return;

    // OPTIMISTIC REMOVE — drop the row from the cache in the SAME frame
    // as the click so the UI feels instant. Skipped when the user is on
    // the re-order pipeline (backend will park the close for N seconds
    // before actually flattening), otherwise the row would flash out,
    // get refilled by the 2-s positions poll while the server still
    // sees it as OPEN, and vanish again only when the executor fires
    // ~N s later.
    qc.cancelQueries({ queryKey: ["positions", "open"] });
    qc.cancelQueries({ queryKey: ["positions", "summary"] });
    qc.cancelQueries({ queryKey: ["active-trades"] });
    const posSnapshot = qc.getQueryData<any[]>(["positions", "open"]);
    const tradesSnapshot = qc.getQueryData<any[]>(["active-trades"]);
    if (!reorderDelayActive) {
      qc.setQueryData<any[]>(["positions", "open"], (old) =>
        Array.isArray(old) ? old.filter((p) => p.id !== id) : [],
      );
      qc.setQueryData<any[]>(["active-trades"], (old) =>
        Array.isArray(old) ? old.filter((t) => t.position_id !== id) : [],
      );
    }

    // Mark the row as "closing" — drives the spinner on the Close
    // button until the matching engine actually flattens it (drained
    // by the useEffect above when the row vanishes from `open`). The
    // drain effect also pops the deferred "<symbol> closed" toast at
    // that moment, so we stash the symbol here.
    const sym = String(row?.symbol ?? "");
    setClosingPositionIds((prev) =>
      new Map(prev).set(id, { symbol: sym }),
    );

    // Suppress the synchronous toast for re-order users — the deferred
    // "<symbol> closed" toast pops in the drain effect once the
    // position actually disappears. Non-reorder users still get the
    // instant feedback because their fill is sub-second.
    const pendingToastId = reorderDelayActive
      ? null
      : toast.success(
          isMobileUi ? "Closed" : "Submitted",
          { duration: 1500 },
        );
    try {
      await PositionAPI.squareoff(id);
      // DO NOT invalidate positions here — Mongo Atlas can briefly
      // return the just-closed position as still OPEN on the read
      // replica for a tick, which would re-add the row and cause a
      // flicker. The 2 s background poll handles eventual consistency.
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    } catch (e: any) {
      // Rollback both caches so the row reappears (no-op when we
      // didn't optimistically remove in the first place).
      if (!reorderDelayActive) {
        if (posSnapshot) qc.setQueryData(["positions", "open"], posSnapshot);
        if (tradesSnapshot) qc.setQueryData(["active-trades"], tradesSnapshot);
      }
      // Clear the closing-spinner flag — API rejected outright, the
      // row's still open so the button must come back to "Close".
      setClosingPositionIds((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      if (pendingToastId !== null) toast.dismiss(pendingToastId);
      toast.error(e?.message || "Failed");
    }
  }
  async function squareoffAll(filter?: "profit" | "loss") {
    if (!open?.length) return;
    let eligible = open.filter((p) => {
      if (filter === "profit") return Number(p.unrealized_pnl ?? 0) >= 0;
      if (filter === "loss") return Number(p.unrealized_pnl ?? 0) < 0;
      return true;
    });
    // Market-hours filter — drop positions whose segment is closed
    // so the backend doesn't reject them mid-fan-out (which would
    // leave the cache in a weird half-cleared state). Tell the user
    // exactly how many got skipped so the partial action is honest.
    const closed = eligible.filter(
      (p: any) => !isInstrumentMarketOpen(p.segment_type, p.exchange),
    );
    if (closed.length) {
      eligible = eligible.filter(
        (p: any) => isInstrumentMarketOpen(p.segment_type, p.exchange),
      );
      toast.error(
        `${closed.length} position(s) skipped — market closed for those segments`,
        { duration: 4000 },
      );
    }
    if (eligible.length === 0) {
      toast.info(
        filter === "profit"
          ? "No positions in profit"
          : filter === "loss"
            ? "No positions in loss"
            : "No open positions",
      );
      return;
    }
    const isMobileUi =
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 767px)").matches;
    if (!isMobileUi) {
      const msg =
        filter === "profit"
          ? `Square off ALL ${eligible.length} position(s) in profit?`
          : filter === "loss"
            ? `Square off ALL ${eligible.length} position(s) in loss?`
            : "Square off ALL open positions?";
      if (!confirm(msg)) return;
    }

    // Same optimistic-clear pattern as single squareoff — wipe the rows
    // the server is about to flatten so the empty state shows
    // instantly. Skipped on re-order users (the backend parks each
    // close for N s before flattening, so the rows would re-appear on
    // the next 2-s poll).
    qc.cancelQueries({ queryKey: ["positions", "open"] });
    qc.cancelQueries({ queryKey: ["positions", "summary"] });
    qc.cancelQueries({ queryKey: ["active-trades"] });
    const posSnapshot = qc.getQueryData<any[]>(["positions", "open"]);
    const tradesSnapshot = qc.getQueryData<any[]>(["active-trades"]);
    const eligibleIds = new Set(eligible.map((p) => p.id));
    if (!reorderDelayActive) {
      if (filter) {
        qc.setQueryData<any[]>(["positions", "open"], (oldData) =>
          Array.isArray(oldData) ? oldData.filter((p) => !eligibleIds.has(p.id)) : [],
        );
        qc.setQueryData<any[]>(["active-trades"], (oldData) =>
          Array.isArray(oldData)
            ? oldData.filter((t) => !eligibleIds.has(t.position_id))
            : [],
        );
      } else {
        qc.setQueryData<any[]>(["positions", "open"], () => []);
        qc.setQueryData<any[]>(["active-trades"], () => []);
      }
    }

    // Mark every eligible row as "closing" — each X Close button
    // shows its spinner until the matching engine drains the row.
    // Stash the symbol so the per-row "closed" toast names the right
    // instrument when the drain effect picks it up.
    setClosingPositionIds((prev) => {
      const next = new Map(prev);
      for (const p of eligible) {
        next.set(String(p.id), { symbol: String(p.symbol ?? "") });
      }
      return next;
    });

    const verb =
      filter === "profit" ? "in-profit" : filter === "loss" ? "in-loss" : "all";
    // For re-order users skip the immediate "Squaring off…" toast —
    // each row's deferred close-toast already announces the actual
    // landing. Non-reorder users keep the existing inline summary.
    const pendingToastId = reorderDelayActive
      ? null
      : toast.success(
          `Squaring off ${eligible.length} ${verb} position(s)…`,
          { duration: 1500 },
        );
    try {
      const r = await PositionAPI.squareoffAll(filter);
      if (pendingToastId !== null) toast.dismiss(pendingToastId);
      if (!reorderDelayActive) {
        toast.success(`Squared off ${r?.squared_off ?? 0}/${r?.total ?? eligible.length}`);
      }
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    } catch (e: any) {
      if (!reorderDelayActive) {
        if (posSnapshot) qc.setQueryData(["positions", "open"], posSnapshot);
        if (tradesSnapshot) qc.setQueryData(["active-trades"], tradesSnapshot);
      }
      // Clear spinners on bulk-close failure — none of the rows got
      // closed so the buttons must come back to "Close".
      setClosingPositionIds((prev) => {
        const next = new Map(prev);
        for (const p of eligible) next.delete(String(p.id));
        return next;
      });
      if (pendingToastId !== null) toast.dismiss(pendingToastId);
      toast.error(e?.message || "Failed");
    }
  }
  async function exitActive(id: string) {
    // Optimistic-id guard — same reasoning as `squareoff` above.
    // Active trade rows can carry a synthetic `optimistic_<ts>` id
    // while the backend insert is still in flight; hitting the close
    // endpoint with that returns 404 "Position not found".
    if (typeof id === "string" && id.startsWith("optimistic_")) {
      toast.error("Order still settling — try again in a second");
      return;
    }
    // Market-hours guard — same reasoning as `squareoff` above.
    // active-trades rows carry segment_type + exchange just like
    // positions rows.
    const activeRows: any[] = qc.getQueryData(["active-trades"]) ?? [];
    const trow = activeRows.find((t: any) => t.id === id || t.position_id === id);
    if (trow && !isInstrumentMarketOpen(trow.segment_type, trow.exchange)) {
      toast.error(
        `${marketLabel(trow.segment_type, trow.exchange)} market is closed — try exiting ${trow.symbol} during trading hours`,
        { duration: 4000 },
      );
      return;
    }
    setClosingActiveTradeIds((prev) =>
      new Map(prev).set(id, { symbol: String(trow?.symbol ?? "") }),
    );
    // Skip the immediate "Exit placed" toast for re-order users —
    // the drain effect pops "<symbol> exited" once the close lands.
    const pendingToastId = reorderDelayActive
      ? null
      : toast.success("Exit placed");
    try {
      await PositionAPI.closeActiveTrade(id);
      qc.invalidateQueries({ queryKey: ["positions"] });
    } catch (e: any) {
      setClosingActiveTradeIds((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      if (pendingToastId !== null) toast.dismiss(pendingToastId);
      toast.error(e?.message || "Failed");
    }
  }

  // Cancel a parked LIMIT / SL-M order. Released-margin and tracker
  // updates are handled server-side by `cancel_order` in matching_engine.
  async function cancelPending(id: string, sym: string) {
    if (!confirm(`Cancel pending order for ${sym}?`)) return;
    try {
      await OrderAPI.cancel(id);
      toast.success("Order cancelled");
      qc.invalidateQueries({ queryKey: ["orders"] });
    } catch (e: any) {
      toast.error(e?.message || "Cancel failed");
    }
  }

  // ── Columns per tab ─────────────────────────────────────────────────
  const positionCols: Column<any>[] = [
    { key: "symbol", header: "Symbol" },
    { key: "exchange", header: "Exch" },
    {
      key: "quantity",
      header: "Qty",
      align: "right",
      render: (r) => (
        <span className={r.quantity >= 0 ? "text-buy" : "text-sell"}>
          {r.quantity}
        </span>
      ),
    },
    {
      key: "avg_price",
      header: "Avg",
      align: "right",
      render: (r) =>
        fmtFeedPrice(r.avg_price, r.currency_quote, r.segment_type, r.exchange),
    },
    {
      key: "ltp",
      header: "Current",
      align: "right",
      render: (r) => (
        <CurrentPriceCell
          value={liveLtpFor(r, resolveSide(r))}
          quote={r.currency_quote}
          segment={r.segment_type}
          exchange={r.exchange}
        />
      ),
    },
    {
      key: "unrealized_pnl",
      header: "M2M",
      align: "right",
      render: (r) => {
        // Always recompute on the frontend: live close-side price
        // (BID for BUY, ASK for SELL) so the M2M matches the matching
        // engine's actual fill behaviour. Falls back to row.ltp when
        // bid/ask aren't on the tick yet. Never trust backend's
        // `unrealized_pnl` because legacy builds may still have applied
        // the (now-disabled) FX ×83 conversion to it.
        const side = resolveSide(r);
        const price = liveLtpFor(r, side) || Number(r.ltp ?? 0);
        const avg = Number(r.avg_price ?? 0);
        const qty = Number(r.quantity ?? 0);
        const pnl = (price > 0 && avg > 0 && qty !== 0) ? (price - avg) * qty : 0;
        return (
          <span className={pnlColor(pnl)}>{formatINR(pnl)}</span>
        );
      },
    },
    // Removed REALIZED column from the Open Positions tab — an open
    // position has no realized P&L by definition.
    {
      key: "margin_used",
      header: "Margin",
      align: "right",
      render: (r) => formatINR(r.margin_used),
    },
    {
      // Cumulative brokerage deducted on every fill that built this
      // position. Sourced from `charges` on the positions response
      // (sum of trade.brokerage across all open trades for the
      // (token, product_type) key). Displayed alongside Swap so
      // traders can see both deductions side-by-side without
      // hovering the COMM tooltip on the terminal blotter.
      key: "charges",
      header: "Brokerage",
      align: "right",
      render: (r) => (
        <span className="font-tabular text-muted-foreground">
          {formatINR(r.charges ?? 0)}
        </span>
      ),
    },
    {
      key: "swap_charges",
      header: "Swap",
      align: "right",
      render: (r) => (
        <span className="font-tabular text-muted-foreground">
          {formatINR(r.swap_charges ?? 0)}
        </span>
      ),
    },
    // Inline TP / SL edit — click to set, click to edit existing.
    // Matches the Active tab UX so the trader doesn't have to switch
    // tabs to attach brackets to the aggregated position.
    {
      key: "tp",
      header: "TP",
      align: "right",
      render: (r) => (
        <button
          type="button"
          onClick={() => setEditing({ row: r, kind: "TP", source: "position" })}
          className="rounded border border-border px-1.5 py-0.5 text-[11px] font-semibold hover:bg-muted/40"
        >
          {r.target ? Number(r.target).toFixed(2) : "Add +"}
        </button>
      ),
    },
    {
      key: "sl",
      header: "SL",
      align: "right",
      render: (r) => (
        <button
          type="button"
          onClick={() => setEditing({ row: r, kind: "SL", source: "position" })}
          className="rounded border border-border px-1.5 py-0.5 text-[11px] font-semibold hover:bg-muted/40"
        >
          {r.stop_loss ? Number(r.stop_loss).toFixed(2) : "Add +"}
        </button>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => {
        // While the optimistic row is on screen (waiting for the WS push
        // that delivers the real ObjectId), disable the close + edit
        // controls. Tapping them with the synthetic id would 500 on the
        // backend (InvalidId).
        const isOptimistic =
          typeof r.id === "string" && r.id.startsWith("optimistic_");
        return (
          <div className="flex items-center justify-end gap-1.5">
            <Button
              size="icon"
              variant="ghost"
              aria-label="Edit SL / TP"
              title={isOptimistic ? "Waiting for confirmation…" : "Edit SL / TP"}
              onClick={() => setEditing({ row: r, kind: "TP", source: "position" })}
              disabled={isOptimistic}
              className="h-7 w-7"
            >
              <Pencil className="size-3.5" />
            </Button>
            <Button
              size="sm"
              loading={closingPositionIds.has(String(r.id))}
              onClick={() => {
                // Open the close dialog (partial-close presets +
                // Phase-5C rollover button) instead of firing the
                // raw squareoff. `squareoff(id)` is kept around for
                // squareoffAll's internal loop and any future flows
                // that need the dialog-less fast path.
                const heldLots =
                  Number(r.lots ?? 0) ||
                  (r.lot_size > 0 ? Math.abs(Number(r.quantity ?? 0)) / r.lot_size : 0);
                setCloseTarget({
                  id: r.id,
                  symbol: r.symbol,
                  side: String(r.side ?? (Number(r.quantity) >= 0 ? "BUY" : "SELL")),
                  lots: heldLots,
                  segment_type: r.segment_type,
                  exchange: r.exchange,
                  product_type: r.product_type,
                  expiry: r.expiry ?? null,
                });
              }}
              disabled={isOptimistic || closingPositionIds.has(String(r.id))}
              title={
                isOptimistic
                  ? "Waiting for confirmation…"
                  : closingPositionIds.has(String(r.id))
                    ? "Closing…"
                    : "Square off"
              }
              className="h-7 gap-1 rounded-md bg-destructive/15 px-2.5 text-xs font-semibold text-destructive ring-1 ring-inset ring-destructive/30 hover:bg-destructive hover:text-destructive-foreground hover:ring-destructive disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-destructive/15 disabled:hover:text-destructive disabled:hover:ring-destructive/30"
            >
              {!closingPositionIds.has(String(r.id)) && <X className="size-3.5" />}
              {isOptimistic ? "…" : "Close"}
            </Button>
          </div>
        );
      },
    },
  ];

  // ── Cancelled / Rejected order columns ─────────────────────────────
  // Shared between both tabs — only the cancelled_at vs rejected reason
  // detail differs, and that's surfaced via the row data itself.
  const orderCols: Column<any>[] = [
    { key: "symbol", header: "Symbol" },
    { key: "exchange", header: "Exch" },
    {
      key: "action",
      header: "Side",
      align: "center",
      render: (r) => <StatusPill status={r.action} />,
    },
    {
      key: "order_type",
      header: "Type",
      align: "center",
      render: (r) => <StatusPill status={r.order_type} />,
    },
    { key: "lots", header: "Lots", align: "right" },
    {
      key: "price",
      header: "Price",
      align: "right",
      render: (r) =>
        formatPrice(
          Number(r.average_price) > 0 ? r.average_price : r.price,
          r.segment,
          r.exchange,
        ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} />,
    },
    {
      key: "reason",
      header: "Reason",
      render: (r) => (
        <span className="text-[11px] text-muted-foreground">
          {r.rejection_reason ?? "—"}
        </span>
      ),
    },
    {
      key: "created_at",
      header: "Placed",
      render: (r) => (
        <span className="whitespace-nowrap font-tabular text-xs tabular-nums text-foreground">
          {formatIST(r.created_at, { withSeconds: true })}
        </span>
      ),
    },
  ];

  // Pending-tab columns: same shape as orderCols but with two extras —
  // a Trigger column (shows the parked trigger price for SL/SL-M) and
  // a Cancel action. Lets the trader see why an order is parked and
  // bin it without diving into the modify dialog.
  const pendingCols: Column<any>[] = [
    { key: "symbol", header: "Symbol" },
    { key: "exchange", header: "Exch" },
    {
      key: "action",
      header: "Side",
      align: "center",
      render: (r) => <StatusPill status={r.action} />,
    },
    {
      key: "order_type",
      header: "Type",
      align: "center",
      render: (r) => <StatusPill status={r.order_type} />,
    },
    { key: "lots", header: "Lots", align: "right" },
    {
      key: "price",
      header: "Limit",
      align: "right",
      render: (r) => formatPrice(r.price, r.segment, r.exchange),
    },
    {
      key: "trigger_price",
      header: "Trigger",
      align: "right",
      render: (r) =>
        r.trigger_price != null && Number(r.trigger_price) > 0
          ? formatPrice(r.trigger_price, r.segment, r.exchange)
          : "—",
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} />,
    },
    {
      key: "created_at",
      header: "Placed",
      render: (r) => (
        <span className="whitespace-nowrap font-tabular text-xs tabular-nums text-foreground">
          {formatIST(r.created_at, { withSeconds: true })}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <Button
          size="sm"
          variant="outline"
          onClick={() => cancelPending(r.id, r.symbol)}
          className="h-7 gap-1 px-2.5 text-xs"
        >
          <X className="size-3.5" /> Cancel
        </Button>
      ),
    },
  ];

  // Closed-tab columns: realized P&L is the headline number, no live LTP
  // because the position is fully exited. Stays in the same table shape
  // so the user's eye doesn't have to relearn the column layout when
  // switching tabs.
  const closedCols: Column<any>[] = [
    { key: "symbol", header: "Symbol" },
    { key: "exchange", header: "Exch" },
    {
      // For a closed row `quantity` has been zeroed by the matching engine.
      // Prefer the preserved `opening_quantity` (peak |qty| during the
      // position's lifecycle) so the user sees the size they actually held.
      key: "quantity",
      header: "Qty",
      align: "right",
      render: (r) => {
        const size = Number(r.opening_quantity ?? Math.abs(r.quantity ?? 0)) || 0;
        // Direction is recorded on the realized leg — positive realized
        // P&L on a long means long, etc. Fall back to neutral coloring
        // when we can't infer.
        const isLong = Number(r.realized_pnl ?? 0) >= 0 ? true : false;
        return (
          <span className={isLong ? "text-buy" : "text-sell"}>{size}</span>
        );
      },
    },
    {
      key: "avg_price",
      header: "Avg",
      align: "right",
      render: (r) =>
        fmtFeedPrice(r.avg_price, r.currency_quote, r.segment_type, r.exchange),
    },
    {
      key: "ltp",
      header: "Close",
      align: "right",
      render: (r) =>
        fmtFeedPrice(r.ltp, r.currency_quote, r.segment_type, r.exchange),
    },
    {
      key: "realized_pnl",
      header: "Realized P&L",
      align: "right",
      render: (r) => (
        <span className={pnlColor(r.realized_pnl)}>
          {formatINR(r.realized_pnl)}
        </span>
      ),
    },
    {
      // Total brokerage + charges that were deducted across every fill
      // tied to this closed position. Summed server-side from the trades
      // collection (see backend/app/api/v1/user/positions.py:closed_positions).
      key: "charges",
      header: "Brokerage",
      align: "right",
      render: (r) => (
        <span className="font-tabular text-muted-foreground">
          {formatINR(r.charges ?? 0)}
        </span>
      ),
    },
    {
      key: "swap_charges",
      header: "Swap",
      align: "right",
      render: (r) => (
        <span className="font-tabular text-muted-foreground">
          {formatINR(r.swap_charges ?? 0)}
        </span>
      ),
    },
    {
      key: "opened_at",
      header: "Open Time",
      render: (r) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {r.opened_at ? formatIST(r.opened_at, { withSeconds: true }) : "—"}
        </span>
      ),
    },
    {
      key: "closed_at",
      header: "Close Time",
      render: (r) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {r.closed_at ? formatIST(r.closed_at, { withSeconds: true }) : "—"}
        </span>
      ),
    },
    {
      // Compact tag stamped by the squareoff path. Lets the user see at a
      // glance that a position was closed by their bracket SL/TP while
      // they were away — not by a forgotten manual close.
      key: "close_reason",
      header: "Closed By",
      render: (r) => <CloseReasonChip reason={r.close_reason} />,
    },
  ];

  // Active-trades-tab columns: one row per fill that's still part of an
  // open position. Adds Used Margin / Holding Margin (1.4× for MIS, same
  // for NRML), inline TP / SL edit buttons and a per-fill Exit action.
  const activeCols: Column<any>[] = [
    { key: "symbol", header: "Symbol" },
    { key: "exchange", header: "Exch" },
    {
      key: "action",
      header: "Side",
      align: "center",
      render: (r) => (
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
            String(r.action ?? r.side).toUpperCase() === "BUY"
              ? "bg-buy/15 text-buy"
              : "bg-sell/15 text-sell",
          )}
        >
          {String(r.action ?? r.side).toUpperCase()}
        </span>
      ),
    },
    {
      key: "product_type",
      header: "Prod",
      align: "center",
      render: (r) => (
        <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase">
          {r.product_type}
        </span>
      ),
    },
    { key: "quantity", header: "Qty", align: "right" },
    {
      key: "price",
      header: "Entry",
      align: "right",
      render: (r) =>
        fmtFeedPrice(r.price, r.currency_quote, r.segment, r.exchange),
    },
    {
      key: "ltp",
      header: "Current",
      align: "right",
      render: (r) => (
        <CurrentPriceCell
          value={liveLtpFor(r, resolveSide(r))}
          quote={r.currency_quote}
          segment={r.segment}
          exchange={r.exchange}
        />
      ),
    },
    {
      key: "used_margin",
      header: "Used",
      align: "right",
      render: (r) => formatINR(r.margin ?? r.used_margin ?? r.margin_used ?? 0),
    },
    {
      key: "holding_margin",
      header: "Holding",
      align: "right",
      render: (r) => {
        const used = Number(r.margin ?? r.used_margin ?? r.margin_used ?? 0);
        const isMIS = String(r.product_type ?? "").toUpperCase() === "MIS";
        const holding = isMIS ? +(used * 1.4).toFixed(2) : used;
        return formatINR(holding);
      },
    },
    {
      key: "swap_charges",
      header: "Swap",
      align: "right",
      render: (r) => (
        <span className="font-tabular text-muted-foreground">
          {formatINR(r.swap_charges ?? 0)}
        </span>
      ),
    },
    {
      key: "pnl",
      header: "P&L",
      align: "right",
      render: (r) => {
        // Recompute per-fill at the live close-side (BID for BUY,
        // ASK for SELL) × (price − entry) × qty, with BUY/SELL sign.
        // Matches the matching engine's actual fill behaviour so the
        // P&L equals what the user would book on exit, not the LTP-
        // approximated number.
        const side = resolveSide(r);
        const price = liveLtpFor(r, side) || Number(r.ltp ?? 0);
        const entry = Number(r.price ?? 0);
        const qty = Number(r.quantity ?? 0);
        const dir = side === "SELL" ? -1 : 1;
        const pnl = (price > 0 && entry > 0 && qty !== 0) ? dir * (price - entry) * qty : 0;
        return <span className={pnlColor(pnl)}>{formatINR(pnl)}</span>;
      },
    },
    {
      key: "tp",
      header: "TP",
      align: "right",
      render: (r) => (
        <button
          type="button"
          onClick={() => setEditing({ row: r, kind: "TP", source: "active" })}
          className="rounded border border-border px-1.5 py-0.5 text-[11px] font-semibold hover:bg-muted/40"
        >
          {r.target ? Number(r.target).toFixed(2) : "Add +"}
        </button>
      ),
    },
    {
      key: "sl",
      header: "SL",
      align: "right",
      render: (r) => (
        <button
          type="button"
          onClick={() => setEditing({ row: r, kind: "SL", source: "active" })}
          className="rounded border border-border px-1.5 py-0.5 text-[11px] font-semibold hover:bg-muted/40"
        >
          {r.stop_loss ? Number(r.stop_loss).toFixed(2) : "Add +"}
        </button>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => {
        const isClosing = closingActiveTradeIds.has(String(r.id));
        return (
          <Button
            size="sm"
            loading={isClosing}
            disabled={isClosing}
            onClick={() => exitActive(r.id)}
            title={isClosing ? "Closing…" : "Exit"}
            className="h-7 gap-1 rounded-md bg-destructive/15 px-2.5 text-xs font-semibold text-destructive ring-1 ring-inset ring-destructive/30 hover:bg-destructive hover:text-destructive-foreground hover:ring-destructive"
          >
            {!isClosing && <LogOut className="size-3.5" />}
            Exit
          </Button>
        );
      },
    },
  ];

  // Pick what to render based on the selected tab.
  const tableProps =
    tab === "closed"
      ? { columns: closedCols, rows: closed, loading: closedLoading && !closed }
      : tab === "active"
        ? {
            columns: activeCols,
            rows: activeTrades,
            loading: activeLoading && !activeTrades,
          }
        : tab === "pending"
          ? {
              columns: pendingCols,
              rows: pending,
              loading: pendingLoading && !pending,
            }
          : tab === "cancelled"
            ? {
                columns: orderCols,
                rows: cancelled,
                loading: cancelledLoading && !cancelled,
              }
            : tab === "rejected"
              ? {
                  columns: orderCols,
                  rows: rejected,
                  loading: rejectedLoading && !rejected,
                }
              : { columns: positionCols, rows: open, loading: openLoading && !open };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Positions"
        description={`${counts.position} open · M2M: ${formatINR(totalMtm)}`}
        actions={
          // Three close-all flavours, mirrors the terminal toolbar.
          // Hidden when no open positions so they don't crowd an empty
          // header. `flex-wrap` lets them stack on mobile so the
          // destructive Close All never gets pushed off-screen.
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!open?.length}
              onClick={() => squareoffAll("profit")}
              className="border-buy/40 bg-buy/10 text-buy hover:bg-buy/20"
            >
              Close Profit
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!open?.length}
              onClick={() => squareoffAll("loss")}
              className="border-sell/40 bg-sell/10 text-sell hover:bg-sell/20"
            >
              Close Loss
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={!open?.length}
              onClick={() => squareoffAll()}
            >
              Close All
            </Button>
          </div>
        }
      />

      {/* Wallet + margin status strip — Balance / Equity / M2M / Used.
          CF Required (carry-forward margin estimate) used to live here
          as a 5th tile but the user asked to drop it from the Positions
          tab: it duplicates the per-row Holding Margin already on every
          card and only matters when reviewing the carry-eligible legs.
          We now hide it on the Position tab and show it on the Active
          tab via `showCfRequired` so the wallet strip stays 4 tiles
          where the trader is just looking at the net position view. */}
      <WalletStatusStrip
        wallet={wallet}
        m2m={totalMtm}
        cfRequired={requiredMargin}
        showCfRequired={tab === "active"}
      />

      {/* Unified blotter tabs — Position / Active / Closed / Cancelled /
          Rejected. Replaces the separate /orders page; every order
          state is one tap away. Horizontal scroll on narrow screens
          so the 5 tabs don't break the layout. */}
      <div className="flex items-center gap-6 overflow-x-auto border-b border-border">
        <TabBtn
          active={tab === "position"}
          count={counts.position}
          onClick={() => setTab("position")}
        >
          Position
        </TabBtn>
        <TabBtn active={tab === "active"} count={counts.active} onClick={() => setTab("active")}>
          Active
        </TabBtn>
        <TabBtn active={tab === "pending"} count={counts.pending} onClick={() => setTab("pending")}>
          Pending
        </TabBtn>
        <TabBtn active={tab === "closed"} count={counts.closed} onClick={() => setTab("closed")}>
          Closed
        </TabBtn>
        <TabBtn
          active={tab === "cancelled"}
          count={counts.cancelled}
          onClick={() => setTab("cancelled")}
        >
          Cancelled
        </TabBtn>
        <TabBtn
          active={tab === "rejected"}
          count={counts.rejected}
          onClick={() => setTab("rejected")}
        >
          Rejected
        </TabBtn>
      </div>

      {/* Closed + Active tabs render a mobile-friendly card list at
          `<md` and the full DataTable from `md+`. Other tabs use the
          table on every breakpoint — they're already compact enough to
          fit on a phone. */}
      {tab === "closed" ? (
        <>
          <div className="md:hidden">
            <ClosedMobileList rows={(closed ?? []) as any[]} loading={closedLoading && !closed} />
          </div>
          <div className="hidden md:block">
            <DataTable
              columns={tableProps.columns}
              rows={tableProps.rows}
              keyExtractor={(r) => r.id}
              loading={tableProps.loading}
            />
          </div>
        </>
      ) : tab === "active" ? (
        <>
          <div className="md:hidden">
            <ActiveMobileList
              rows={(activeTrades ?? []) as any[]}
              loading={activeLoading && !activeTrades}
              liveLtpFor={liveLtpFor}
              onEdit={(row, kind) => setEditing({ row, kind, source: "active" })}
              onExit={exitActive}
              onTrade={(tok) => setSheetToken(tok)}
              isClosing={(id) => closingActiveTradeIds.has(String(id))}
            />
          </div>
          <div className="hidden md:block">
            <DataTable
              columns={tableProps.columns}
              rows={tableProps.rows}
              keyExtractor={(r) => r.id}
              loading={tableProps.loading}
            />
          </div>
        </>
      ) : tab === "position" ? (
        <>
          <div className="md:hidden">
            <ActiveMobileList
              rows={(open ?? []) as any[]}
              loading={openLoading && !open}
              liveLtpFor={liveLtpFor}
              onEdit={(row, kind) => setEditing({ row, kind, source: "position" })}
              onExit={squareoff}
              onTrade={(tok) => setSheetToken(tok)}
              isClosing={(id) => closingPositionIds.has(String(id))}
            />
          </div>
          <div className="hidden md:block">
            <DataTable
              columns={tableProps.columns}
              rows={tableProps.rows}
              keyExtractor={(r) => r.id}
              loading={tableProps.loading}
            />
          </div>
        </>
      ) : (
        // Pending / Cancelled / Rejected — mobile gets the card list, desktop
        // keeps the compact order table.
        <>
          <div className="md:hidden">
            <OrderMobileList
              rows={(tableProps.rows ?? []) as any[]}
              loading={tableProps.loading}
              emptyText={
                tab === "pending"
                  ? "No pending orders"
                  : tab === "cancelled"
                    ? "No cancelled orders"
                    : "No rejected orders"
              }
              onCancel={tab === "pending" ? cancelPending : undefined}
            />
          </div>
          <div className="hidden md:block">
            <DataTable
              columns={tableProps.columns}
              rows={tableProps.rows}
              keyExtractor={(r) => r.id}
              loading={tableProps.loading}
            />
          </div>
        </>
      )}

      {/* Pagination controls — pending / cancelled / rejected tabs
          paginate at 50 rows/page. The active server poll only fetches
          the current page so polling cost stays constant regardless of
          how many historical orders the user has. */}
      {(() => {
        const meta =
          tab === "pending"
            ? pendingMeta
            : tab === "cancelled"
              ? cancelledMeta
              : tab === "rejected"
                ? rejectedMeta
                : null;
        const curPage =
          tab === "pending"
            ? pendingPage
            : tab === "cancelled"
              ? cancelledPage
              : tab === "rejected"
                ? rejectedPage
                : 1;
        const setCurPage =
          tab === "pending"
            ? setPendingPage
            : tab === "cancelled"
              ? setCancelledPage
              : tab === "rejected"
                ? setRejectedPage
                : null;
        if (!meta || !setCurPage || Number(meta.total_pages) <= 1) return null;
        return (
          <div className="flex items-center justify-end gap-2 text-xs">
            <span className="self-center text-muted-foreground">{meta.total} entries</span>
            <Button
              variant="outline"
              size="sm"
              disabled={curPage <= 1}
              onClick={() => setCurPage((p: number) => Math.max(1, p - 1))}
            >
              Prev
            </Button>
            <span className="self-center text-muted-foreground">
              {meta.page} / {meta.total_pages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={curPage >= Number(meta.total_pages)}
              onClick={() => setCurPage((p: number) => p + 1)}
            >
              Next
            </Button>
          </div>
        );
      })()}

      <EditSlTpDialog
        open={!!editing}
        kind={editing?.kind ?? "TP"}
        row={editing?.row}
        source={editing?.source ?? "active"}
        onClose={() => setEditing(null)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["positions"] });
          setEditing(null);
        }}
      />

      {/* Mobile-only slide-up trade card — opens when a position /
          active-trade card is tapped. `onSwap` lets the in-sheet
          Option Chain picker swap strikes while keeping the sheet
          open. Same component the marketwatch / option-chain /
          terminal pages use, so the BUY/SELL flow stays identical
          everywhere. */}
      <TradeDetailSheet
        token={sheetToken}
        open={!!sheetToken}
        onClose={() => setSheetToken(null)}
        onSwap={(tok) => setSheetToken(tok)}
      />
      <ClosePositionDialog
        target={closeTarget}
        onClose={() => setCloseTarget(null)}
        onSubmit={(positionId) => {
          const row = (open ?? []).find((p: any) => String(p.id) === String(positionId));
          setClosingPositionIds((prev) =>
            new Map(prev).set(positionId, { symbol: String(row?.symbol ?? "") }),
          );
        }}
      />
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────

/**
 * Wallet + margin status strip — Balance / Equity / M2M / Used Margin /
 * CF Required. Shown above the tabs so the trader sees their wallet
 * health on every tab, not just the active-margin breakdown.
 *
 * `m2m` is the live floating P&L computed from WS LTPs in the parent
 * (matches the table rows exactly). `cfRequired` is the carry-forward
 * margin requirement summed across INDIAN segments only — Infoway-fed
 * positions are already in carry mode by default.
 */
function WalletStatusStrip({
  wallet,
  m2m,
  cfRequired,
  showCfRequired = true,
}: {
  wallet: any;
  m2m: number;
  cfRequired: number;
  /** Drop the CF Required tile when false — used on the Position tab
   *  so the trader sees a clean 4-tile wallet row. Active tab keeps it
   *  on (5 tiles) because that's where carry-forward planning lives. */
  showCfRequired?: boolean;
}) {
  const available = Number(wallet?.available_balance ?? 0);
  const used = Number(wallet?.used_margin ?? 0);
  const balance = available + used;
  const equity = balance + m2m;
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-2 sm:grid-cols-3",
        showCfRequired ? "lg:grid-cols-5" : "lg:grid-cols-4",
      )}
    >
      <WalletTile label="Balance" value={formatINR(balance)} />
      <WalletTile label="Equity" value={formatINR(equity)} />
      <WalletTile
        label="M2M"
        value={`${m2m >= 0 ? "+" : ""}${formatINR(m2m)}`}
        valueClass={pnlColor(m2m)}
      />
      <WalletTile label="Used Margin" value={formatINR(used)} />
      {showCfRequired && (
        <WalletTile
          label="CF Required"
          value={formatINR(cfRequired)}
          valueClass={cfRequired > available ? "text-red-500" : undefined}
        />
      )}
    </div>
  );
}

function WalletTile({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 font-tabular text-sm font-semibold tabular-nums",
          valueClass,
        )}
      >
        {value}
      </div>
    </div>
  );
}

function TabBtn({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative -mb-px flex items-center gap-1.5 pb-2 pt-1 text-sm transition-colors",
        active
          ? "font-semibold text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
      {count > 0 && (
        <span
          className={cn(
            "rounded-full border px-1.5 text-[10px] font-semibold",
            active
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border text-muted-foreground",
          )}
        >
          {count}
        </span>
      )}
      {active && (
        <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-t bg-primary" />
      )}
    </button>
  );
}

function EditSlTpDialog({
  open,
  kind,
  row,
  source,
  onClose,
  onSaved,
}: {
  open: boolean;
  kind: "TP" | "SL";
  row: any;
  source: "position" | "active";
  onClose: () => void;
  onSaved: () => void;
}) {
  const initial =
    kind === "TP"
      ? row?.target != null
        ? String(Number(row.target))
        : ""
      : row?.stop_loss != null
        ? String(Number(row.stop_loss))
        : "";
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);

  // Reset value when dialog opens for a different row/kind.
  useMemo(() => {
    setValue(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row?.id, kind]);

  // ── Limit-away % from segment settings ─────────────────────────────
  // Mirrors the trading-terminal Edit SL/TP dialog. Close side is the
  // opposite of the position's direction (long closes by SELLing → use
  // "SELL"; short → "BUY"). Re-uses the cached SegmentSettingsAPI query
  // key the OrderPanel uses for the same instrument, so opening this
  // dialog on a chart you were just looking at is an instant hit.
  const isLongPos = (() => {
    const sideRaw = String(row?.action ?? row?.side ?? row?.opened_side ?? "").toUpperCase();
    if (sideRaw === "BUY") return true;
    if (sideRaw === "SELL") return false;
    return Number(row?.quantity ?? 0) >= 0;
  })();
  const closeSide: "BUY" | "SELL" = isLongPos ? "SELL" : "BUY";
  const { data: effSettings } = useQuery<any>({
    queryKey: ["segment-settings", row?.instrument_token, closeSide, row?.product_type],
    queryFn: () =>
      SegmentSettingsAPI.effective(row!.instrument_token, closeSide, row!.product_type),
    enabled: open && !!row?.instrument_token && !!row?.product_type,
    staleTime: 5_000,
  });
  const limitAwayPct = Number(effSettings?.limit_percentage ?? 0) || 0;
  const ltpRef = Number(row?.ltp ?? row?.current_price ?? 0);
  const _round = (n: number) => +n.toFixed(2);
  // SL boundary — closes the position. Long → SL below LTP; Short → above.
  // TP boundary — opposite direction.
  const slBoundary =
    ltpRef > 0 && limitAwayPct > 0
      ? isLongPos
        ? ltpRef * (1 - limitAwayPct / 100)
        : ltpRef * (1 + limitAwayPct / 100)
      : 0;
  const tpBoundary =
    ltpRef > 0 && limitAwayPct > 0
      ? isLongPos
        ? ltpRef * (1 + limitAwayPct / 100)
        : ltpRef * (1 - limitAwayPct / 100)
      : 0;
  const placeholder =
    (kind === "TP" ? tpBoundary : slBoundary) > 0
      ? String(_round(kind === "TP" ? tpBoundary : slBoundary))
      : "Leave blank to clear";

  // ── Live SL/TP validation ────────────────────────────────────────────
  // Same rule set as save() below but as a memo so the warning + Save
  // disable update on every keystroke. Empty input = "clear" so it
  // never trips the banner. Mirrors the OrderPanel / terminal Edit
  // SL/TP pattern.
  const validationReason = useMemo<string | null>(() => {
    if (!row || !value) return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return "Enter a valid positive number";
    if (n === 0) return null;

    // Directional sanity vs entry.
    const entrySrc = row.price ?? row.avg_price;
    if (entrySrc != null) {
      const entry = Number(entrySrc);
      if (entry > 0) {
        if (kind === "SL") {
          if (isLongPos && n >= entry) {
            return `Stop loss must be BELOW entry ${entry} for a BUY`;
          }
          if (!isLongPos && n <= entry) {
            return `Stop loss must be ABOVE entry ${entry} for a SELL`;
          }
        } else {
          if (isLongPos && n <= entry) {
            return `Target must be ABOVE entry ${entry} for a BUY`;
          }
          if (!isLongPos && n >= entry) {
            return `Target must be BELOW entry ${entry} for a SELL`;
          }
        }
      }
    }

    // Limit-away band vs LTP.
    if (limitAwayPct > 0 && ltpRef > 0) {
      const upper = ltpRef * (1 + limitAwayPct / 100);
      const lower = ltpRef * (1 - limitAwayPct / 100);
      if (kind === "SL") {
        if (isLongPos && n > lower) {
          return `Stop loss ${n} too close to LTP ${ltpRef} — must be ≤ ${_round(lower)} (${limitAwayPct}% away)`;
        }
        if (!isLongPos && n < upper) {
          return `Stop loss ${n} too close to LTP ${ltpRef} — must be ≥ ${_round(upper)} (${limitAwayPct}% away)`;
        }
      } else {
        if (isLongPos && n < upper) {
          return `Target ${n} too close to LTP ${ltpRef} — must be ≥ ${_round(upper)} (${limitAwayPct}% away)`;
        }
        if (!isLongPos && n > lower) {
          return `Target ${n} too close to LTP ${ltpRef} — must be ≤ ${_round(lower)} (${limitAwayPct}% away)`;
        }
      }
    }

    return null;
  }, [row, value, kind, isLongPos, limitAwayPct, ltpRef]);

  async function save() {
    if (!row) return;
    const n = value === "" ? null : Number(value);
    if (n !== null && !Number.isFinite(n)) {
      toast.error("Enter a valid number");
      return;
    }
    // Directional sanity — mirrors backend SL_WRONG_SIDE / TP_WRONG_SIDE
    // so the user catches a wrong-side bracket here instead of via a
    // server-rejection toast after the dialog has already closed. The
    // entry field is `price` on active-trade rows, `avg_price` on
    // position rows; ditto for side (`action`/`side` vs `opened_side`).
    const entrySrc = row.price ?? row.avg_price;
    if (n !== null && n > 0 && entrySrc != null) {
      const entry = Number(entrySrc);
      const sideRaw = String(
        row.action ?? row.side ?? row.opened_side ?? "",
      ).toUpperCase();
      const isLong = sideRaw
        ? sideRaw === "BUY"
        : Number(row.quantity ?? 0) >= 0;
      if (kind === "SL") {
        if (isLong && n >= entry) {
          toast.error(`Stop loss must be BELOW entry ${entry} for a BUY`);
          return;
        }
        if (!isLong && n <= entry) {
          toast.error(`Stop loss must be ABOVE entry ${entry} for a SELL`);
          return;
        }
      } else {
        if (isLong && n <= entry) {
          toast.error(`Target must be ABOVE entry ${entry} for a BUY`);
          return;
        }
        if (!isLong && n >= entry) {
          toast.error(`Target must be BELOW entry ${entry} for a SELL`);
          return;
        }
      }
    }

    // ── Limit-away enforcement (same as terminal Edit SL/TP) ─────────
    // Auto-squareoff fires at MARKET when LTP touches SL/TP, so the
    // band immediately around LTP is rejected — the value must sit at
    // least `limit_percentage` away. Backend re-runs the same check;
    // doing it here avoids the round-trip + toast flicker.
    if (n !== null && n > 0 && limitAwayPct > 0 && ltpRef > 0) {
      const upper = ltpRef * (1 + limitAwayPct / 100);
      const lower = ltpRef * (1 - limitAwayPct / 100);
      if (kind === "SL") {
        if (isLongPos && n > lower) {
          toast.error(
            `Stop loss ${n} too close to LTP ${ltpRef}. Must be at least ${limitAwayPct}% away — maximum ${_round(lower)}.`,
            { duration: 6000 },
          );
          return;
        }
        if (!isLongPos && n < upper) {
          toast.error(
            `Stop loss ${n} too close to LTP ${ltpRef}. Must be at least ${limitAwayPct}% away — minimum ${_round(upper)}.`,
            { duration: 6000 },
          );
          return;
        }
      } else {
        if (isLongPos && n < upper) {
          toast.error(
            `Target ${n} too close to LTP ${ltpRef}. Must be at least ${limitAwayPct}% away — minimum ${_round(upper)}.`,
            { duration: 6000 },
          );
          return;
        }
        if (!isLongPos && n > lower) {
          toast.error(
            `Target ${n} too close to LTP ${ltpRef}. Must be at least ${limitAwayPct}% away — maximum ${_round(lower)}.`,
            { duration: 6000 },
          );
          return;
        }
      }
    }

    setSaving(true);
    try {
      const body =
        kind === "TP" ? { target: n as any } : { stop_loss: n as any };
      // Route to the correct endpoint based on which tab opened the
      // dialog. `row.id` is the trade id on the Active tab and the
      // position id on the Position tab — calling the wrong endpoint
      // is what produced the "trade not found" error on mobile before.
      if (source === "active") {
        await PositionAPI.updateActiveTradeSlTp(row.id, body);
      } else {
        await PositionAPI.updateSlTp(row.id, body);
      }
      toast.success(`${kind === "TP" ? "Target" : "Stop loss"} updated`);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "Update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {kind === "TP" ? "Take Profit" : "Stop Loss"} — {row?.symbol ?? ""}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            type="number"
            step="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            autoFocus
          />
          <p className="text-[11px] text-muted-foreground">
            When the market crosses this level the position is auto-squared off at market.
            {limitAwayPct > 0 && (
              <>
                {" "}Must sit at least <strong>{limitAwayPct}%</strong> from LTP — the placeholder shows the nearest allowed boundary.
              </>
            )}
          </p>
          {/* Persistent eligibility banner — Save stays disabled while
              this is non-null. Matches the OrderPanel / terminal Edit
              SL/TP pattern so the trader sees the failing rule live
              instead of via a toast after clicking Save. */}
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


/** Tick-flashing "Current" price cell — green when the LTP just ticked
 *  up, red when it ticked down, decays back to neutral after ~700 ms.
 *  Identical UX to the trading-terminal positions table. */
function CurrentPriceCell({
  value,
  quote,
  segment,
  exchange,
}: {
  value: number;
  quote?: string;
  segment?: string;
  exchange?: string;
}) {
  const dir = usePriceFlash(value);
  const flashColor =
    dir === "up" ? "text-emerald-500" : dir === "down" ? "text-red-500" : "";
  return (
    <span
      className={cn(
        "whitespace-nowrap font-tabular tabular-nums transition-colors",
        flashColor,
      )}
    >
      {fmtFeedPrice(value, quote, segment, exchange)}
    </span>
  );
}

/**
 * Mobile-only card list for the Closed tab. Each row stacks side / qty /
 * status / product across the top and condenses the rest into right-
 * aligned `pnl / brokerage`, `entry → close`, and `open time → close
 * time` lines. The 9-column DataTable is unreadable on a phone, so the
 * Closed tab swaps to this presentation under `md:` while desktop keeps
 * the grid for fast scanning across many rows.
 */
function ClosedMobileList({ rows, loading }: { rows: any[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="grid place-items-center py-10 text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!rows || rows.length === 0) {
    return (
      <div className="grid place-items-center py-10 text-sm text-muted-foreground">
        No closed positions yet.
      </div>
    );
  }
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <ClosedMobileCard key={r.id} row={r} />
      ))}
    </ul>
  );
}

function ClosedMobileCard({ row: r }: { row: any }) {
  // Direction badge — opened_side survives the close (quantity is zero
  // on closed rows). Falls back to inferring from realized P&L when an
  // older row predates the field.
  const sideRaw = String(r.opened_side ?? "").toUpperCase();
  const side: "BUY" | "SELL" =
    sideRaw === "BUY" || sideRaw === "SELL"
      ? (sideRaw as "BUY" | "SELL")
      : Number(r.realized_pnl ?? 0) >= 0
        ? "BUY"
        : "SELL";

  const qty = Math.abs(Number(r.opening_quantity ?? r.quantity ?? 0));
  // `realized_pnl` is already NET — backend subtracts brokerage + swap
  // before sending. The denominator below shows the combined deduction
  // so the user can see how much the gross was eaten by costs.
  const pnl = Number(r.realized_pnl ?? 0);
  const charges = Number(r.charges ?? 0);
  const swap = Number(r.swap_charges ?? 0);
  const totalDeducted = charges + swap;

  const avg = r.avg_price;
  const close = r.ltp;

  // Sub-line: trading_symbol for option/future contracts (e.g.
  // SENSEX25MAY75000CE), exchange otherwise.
  const subLine =
    r.trading_symbol && r.trading_symbol !== r.symbol
      ? r.trading_symbol
      : r.exchange;
  const expiry = extractExpiryLabel(r.symbol);

  function timeOnly(v: string | null | undefined): string {
    if (!v) return "—";
    // Re-use formatIST then strip the leading "DD Mon, " prefix so the
    // card shows only the clock portion (matches the reference design).
    const full = formatIST(v, { withSeconds: true });
    const parts = full.split(", ");
    return parts.length > 1 ? parts.slice(1).join(", ") : full;
  }

  return (
    <li className="rounded-xl border border-border bg-card p-3 shadow-sm">
      {/* Top row: BUY/SELL · qty · CLOSED · product */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ring-inset",
              side === "BUY"
                ? "bg-buy/10 text-buy ring-buy/30"
                : "bg-sell/10 text-sell ring-sell/30",
            )}
          >
            {side}
          </span>
          <span className="font-tabular text-xs text-muted-foreground">
            🛒 {qty}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded bg-muted/40 px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground ring-1 ring-inset ring-border">
            CLOSED
          </span>
          <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase">
            {r.product_type}
          </span>
        </div>
      </div>

      {/* Symbol + sub-line on the left, P&L / brokerage on the right */}
      <div className="mt-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-base font-bold leading-tight">
            {r.symbol}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            <span className="truncate">{subLine}</span>
            {expiry ? (
              <span className="rounded bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">
                Exp {expiry}
              </span>
            ) : null}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div
            className={cn(
              "font-tabular text-sm font-bold tabular-nums",
              pnlColor(pnl),
            )}
          >
            {formatINR(pnl, { withSymbol: false })}
            <span
              className="text-muted-foreground"
              title={
                swap > 0
                  ? `Brokerage ${formatINR(charges)} + Swap ${formatINR(swap)} = ${formatINR(totalDeducted)}`
                  : `Brokerage ${formatINR(charges)}`
              }
            >
              /{formatINR(totalDeducted, { withSymbol: false })}
            </span>
          </div>
          <div className="mt-0.5 font-tabular text-[11px] text-muted-foreground">
            {fmtFeedPrice(avg, r.currency_quote, r.segment_type, r.exchange)}{" "}
            → {fmtFeedPrice(close, r.currency_quote, r.segment_type, r.exchange)}
          </div>
        </div>
      </div>

      {/* Order kind + timing */}
      <div className="mt-1.5 flex items-baseline justify-between gap-2 text-[10px] text-muted-foreground">
        <span className="uppercase tracking-wider">Market → Market</span>
        <span className="whitespace-nowrap font-tabular">
          {timeOnly(r.opened_at)} → {timeOnly(r.closed_at)}
        </span>
      </div>

      {/* Closed-reason chip when present (SL/TP/stop-out flag). Kept in a
          separate line so the main card stays clean for the common
          "USER" close. */}
      {r.close_reason && r.close_reason !== "USER" && (
        <div className="mt-1.5">
          <CloseReasonChip reason={r.close_reason} />
        </div>
      )}
    </li>
  );
}

/**
 * Mobile-only card list for the order tabs (Pending / Cancelled / Rejected).
 * The order DataTable (Symbol/Exch/Side/Type/Lots/Price/Trigger/Status…) is
 * cramped on a phone, so under `md:` those tabs swap to this card list while
 * desktop keeps the grid. `onCancel` is only passed for the Pending tab so
 * cancelled/rejected cards stay read-only.
 */
function OrderMobileList({
  rows,
  loading,
  emptyText,
  onCancel,
}: {
  rows: any[];
  loading: boolean;
  emptyText: string;
  onCancel?: (id: string, sym: string) => void;
}) {
  if (loading) {
    return (
      <div className="grid place-items-center py-10 text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!rows || rows.length === 0) {
    return (
      <div className="grid place-items-center py-10 text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <OrderMobileCard key={r.id} row={r} onCancel={onCancel} />
      ))}
    </ul>
  );
}

function OrderMobileCard({
  row: r,
  onCancel,
}: {
  row: any;
  onCancel?: (id: string, sym: string) => void;
}) {
  const side: "BUY" | "SELL" =
    String(r.action ?? "").toUpperCase() === "SELL" ? "SELL" : "BUY";
  const subLine =
    r.trading_symbol && r.trading_symbol !== r.symbol
      ? r.trading_symbol
      : r.exchange;
  const hasTrigger = r.trigger_price != null && Number(r.trigger_price) > 0;
  return (
    <li className="rounded-xl border border-border bg-card p-3 shadow-sm">
      {/* Top row: BUY/SELL · lots · type · status */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ring-inset",
              side === "BUY"
                ? "bg-buy/10 text-buy ring-buy/30"
                : "bg-sell/10 text-sell ring-sell/30",
            )}
          >
            {side}
          </span>
          <span className="font-tabular text-xs text-muted-foreground">
            🛒 {r.lots}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase">
            {r.order_type}
          </span>
          <span className="rounded bg-muted/40 px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground ring-1 ring-inset ring-border">
            {r.status}
          </span>
        </div>
      </div>

      {/* Symbol + sub-line on the left, price / trigger on the right */}
      <div className="mt-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-base font-bold leading-tight">
            {r.symbol}
          </div>
          <div className="mt-0.5 truncate text-[11px] uppercase tracking-wide text-muted-foreground">
            {subLine}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-tabular text-sm font-bold tabular-nums">
            {formatPrice(r.price, r.segment, r.exchange)}
          </div>
          {hasTrigger ? (
            <div className="mt-0.5 font-tabular text-[11px] text-muted-foreground">
              Trig {formatPrice(r.trigger_price, r.segment, r.exchange)}
            </div>
          ) : null}
        </div>
      </div>

      {/* Product + placed time */}
      <div className="mt-1.5 flex items-baseline justify-between gap-2 text-[10px] text-muted-foreground">
        <span className="uppercase tracking-wider">{r.product_type ?? ""}</span>
        <span className="whitespace-nowrap font-tabular">
          {r.created_at ? formatIST(r.created_at, { withSeconds: true }) : "—"}
        </span>
      </div>

      {/* Rejection reason (rejected tab) */}
      {r.rejection_reason ? (
        <div className="mt-1.5 text-[11px] leading-snug text-sell">
          {r.rejection_reason}
        </div>
      ) : null}

      {/* Cancel action — pending only */}
      {onCancel ? (
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onCancel(r.id, r.symbol)}
            className="h-7 gap-1 px-2.5 text-xs"
          >
            <X className="size-3.5" /> Cancel
          </Button>
        </div>
      ) : null}
    </li>
  );
}

/**
 * Mobile-only card list for the Active Trades tab. Stacks BUY/SELL · qty
 * · product · time across the top, big symbol + contract sub-line on
 * the left, P&L + bid/ask transition on the right, then Used / Holding
 * margin tiles paired with TP / SL / Exit controls. Desktop continues
 * to render the wide DataTable for many-row scanning.
 */
function ActiveMobileList({
  rows,
  loading,
  liveLtpFor,
  onEdit,
  onExit,
  onTrade,
  isClosing,
}: {
  rows: any[];
  loading: boolean;
  // Now side-aware — pass "BUY"/"SELL" to get the real close-side
  // price (BID for BUY, ASK for SELL) instead of plain LTP.
  liveLtpFor: (row: any, side?: "BUY" | "SELL") => number;
  onEdit: (row: any, kind: "TP" | "SL") => void;
  onExit: (id: string) => void;
  /** Mobile: tap on the card body fires this with the row's
   *  instrument token so the parent can open the slide-up
   *  TradeDetailSheet. Inner TP/SL/Exit buttons stopPropagation
   *  so they don't fire trade open simultaneously. */
  onTrade?: (token: string) => void;
  /** Whether each row's close action is currently in flight (drives
   *  the Exit button spinner during the re-order delay window). */
  isClosing?: (id: string) => boolean;
}) {
  if (loading) {
    return (
      <div className="grid place-items-center py-10 text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!rows || rows.length === 0) {
    return (
      <div className="grid place-items-center py-10 text-sm text-muted-foreground">
        No active trades.
      </div>
    );
  }
  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        // Pass side so the helper returns BID for BUY rows, ASK for
        // SELL — the same close-side price the matching engine fills
        // at. Without this the card was showing LTP under a "BID"
        // label, which mismatched both the broker's quote and the
        // P&L the user would actually realise on exit.
        const sideRaw = String(r?.opened_side ?? r?.action ?? r?.side ?? "")
          .toUpperCase();
        const side: "BUY" | "SELL" =
          sideRaw === "BUY" || sideRaw === "SELL"
            ? (sideRaw as "BUY" | "SELL")
            : Number(r?.quantity ?? 0) < 0
              ? "SELL"
              : "BUY";
        return (
          <ActiveMobileCard
            key={r.id}
            row={r}
            liveLtp={liveLtpFor(r, side)}
            onEdit={onEdit}
            onExit={onExit}
            onTrade={onTrade}
            isClosing={!!isClosing?.(String(r.id))}
          />
        );
      })}
    </ul>
  );
}

function ActiveMobileCard({
  row: r,
  liveLtp,
  onEdit,
  onExit,
  onTrade,
  isClosing,
}: {
  row: any;
  liveLtp: number;
  onEdit: (row: any, kind: "TP" | "SL") => void;
  onExit: (id: string) => void;
  onTrade?: (token: string) => void;
  isClosing?: boolean;
}) {
  // The same card now drives both Active-trades rows (per-fill) AND
  // Position rows (per-instrument net). Field-name shims keep the
  // accessor identical for both shapes:
  //   • side       — `action`/`side` on active rows, `opened_side` on
  //                  positions; fall back to quantity-sign for legacy
  //                  position rows written before opened_side existed.
  //   • entry      — `price` on active rows, `avg_price` on positions.
  //   • timestamp  — `executed_at` (active) vs `opened_at` (position).
  //   • segment    — `segment` vs `segment_type`.
  const rawSide = (r.action ?? r.side ?? r.opened_side ?? "").toString().toUpperCase();
  const signedQty = Number(r.quantity ?? 0);
  const side: "BUY" | "SELL" =
    rawSide === "BUY" || rawSide === "SELL"
      ? (rawSide as "BUY" | "SELL")
      : signedQty >= 0
        ? "BUY"
        : "SELL";
  const qty = Math.abs(signedQty);
  const entry = Number(r.price ?? r.avg_price ?? 0);
  const ltp = liveLtp || Number(r.ltp ?? 0);
  const ts = r.executed_at ?? r.opened_at ?? null;
  const seg = r.segment ?? r.segment_type;
  // Same per-fill P&L formula the desktop column uses — raw INR, FX
  // disabled. Keeps mobile + desktop totals in lockstep.
  const dir = side === "SELL" ? -1 : 1;
  const pnl =
    ltp > 0 && entry > 0 && qty !== 0 ? dir * (ltp - entry) * qty : 0;

  const used = Number(r.margin ?? r.used_margin ?? r.margin_used ?? 0);
  const holding = holdingMarginFor(r);

  // Time-only renderer — strips the "DD Mon, " date prefix that
  // formatIST produces so the card matches the reference design's
  // clock-only style.
  function timeOnly(v: string | null | undefined): string {
    if (!v) return "—";
    const full = formatIST(v, { withSeconds: true });
    const parts = full.split(", ");
    return parts.length > 1 ? parts.slice(1).join(", ").replace(" IST", "") : full;
  }

  const subLine =
    r.trading_symbol && r.trading_symbol !== r.symbol
      ? r.trading_symbol
      : r.exchange;
  // Expiry derived from the symbol's monthly token (CRUDEOIL26JUNFUT
  // → "26 JUN"). Renders as a small chip next to the sub-line so the
  // user can see at a glance how far out the contract is — was
  // missing entirely on the mobile card before, the only way to tell
  // was to mentally parse the symbol.
  const expiry = extractExpiryLabel(r.symbol);

  // Tap-anywhere-on-card → open the slide-up trade sheet for this
  // instrument so the user can place a fresh BUY / SELL on the same
  // symbol without leaving the Positions page. Inner action buttons
  // (TP / SL / Exit) stopPropagation so they don't double-fire.
  const tradeToken =
    String(r?.instrument_token ?? r?.token ?? r?.instrument?.token ?? "") || "";
  const cardOpensTrade = !!onTrade && !!tradeToken;
  return (
    <li
      className={cn(
        "rounded-xl border border-border bg-card p-3 shadow-sm",
        cardOpensTrade && "cursor-pointer transition-colors hover:bg-muted/20",
      )}
      onClick={cardOpensTrade ? () => onTrade!(tradeToken) : undefined}
    >
      {/* Top row: BUY/SELL · qty · NRML/MIS · time */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ring-inset",
              side === "BUY"
                ? "bg-buy/10 text-buy ring-buy/30"
                : "bg-sell/10 text-sell ring-sell/30",
            )}
          >
            {side}
          </span>
          <span className="font-tabular text-xs text-muted-foreground">
            🛒 {qty}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase">
            {r.product_type}
          </span>
          <span className="rounded border border-border px-1.5 py-0.5 font-tabular text-[10px] text-muted-foreground">
            {timeOnly(ts)}
          </span>
        </div>
      </div>

      {/* Symbol + sub-line on left, live P&L + price transition on right */}
      <div className="mt-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-base font-bold leading-tight">
            {r.symbol}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            <span className="truncate">{subLine}</span>
            {expiry ? (
              <span className="rounded bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">
                Exp {expiry}
              </span>
            ) : null}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div
            className={cn(
              "font-tabular text-base font-bold tabular-nums",
              pnlColor(pnl),
            )}
          >
            {formatINR(pnl, { withSymbol: false })}
          </div>
          <div className="mt-0.5 font-tabular text-[11px] text-muted-foreground">
            {fmtFeedPrice(entry, r.currency_quote, seg, r.exchange)}{" "}
            → {fmtFeedPrice(ltp, r.currency_quote, seg, r.exchange)}{" "}
            <span className="uppercase">{side === "BUY" ? "BID" : "ASK"}</span>
          </div>
        </div>
      </div>

      {/* Bottom: margin tiles on the left, TP/SL/Exit controls on the right */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <div className="rounded-md border border-border bg-muted/20 px-2.5 py-1.5">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
              Used Margin
            </div>
            <div className="font-tabular text-sm font-semibold tabular-nums">
              {formatINR(used)}
            </div>
          </div>
          <div className="rounded-md border border-border bg-muted/20 px-2.5 py-1.5">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
              Holding Margin
            </div>
            <div className="font-tabular text-sm font-semibold tabular-nums">
              {formatINR(holding)}
            </div>
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                // Card wrapper's onClick opens the trade sheet; the
                // inline TP/SL/Exit actions must stop propagation so a
                // single tap doesn't fire BOTH "edit SL/TP" AND
                // "open trade sheet" at once.
                e.stopPropagation();
                onEdit(r, "TP");
              }}
              className="rounded-md border border-dashed border-border px-2 py-1.5 text-[11px] font-semibold hover:bg-muted/40"
            >
              TP{" "}
              <span className="font-tabular tabular-nums">
                {r.target ? Number(r.target).toFixed(2) : "Add +"}
              </span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(r, "SL");
              }}
              className="rounded-md border border-dashed border-border px-2 py-1.5 text-[11px] font-semibold hover:bg-muted/40"
            >
              SL{" "}
              <span className="font-tabular tabular-nums">
                {r.stop_loss ? Number(r.stop_loss).toFixed(2) : "Add +"}
              </span>
            </button>
          </div>
          <Button
            size="sm"
            loading={!!isClosing}
            disabled={!!isClosing}
            onClick={(e) => {
              e.stopPropagation();
              if (isClosing) return;
              onExit(r.id);
            }}
            className="h-9 w-full gap-1 rounded-md bg-destructive/15 px-2.5 text-xs font-semibold text-destructive ring-1 ring-inset ring-destructive/30 hover:bg-destructive hover:text-destructive-foreground hover:ring-destructive"
          >
            {!isClosing && <LogOut className="size-3.5" />}
            Exit
          </Button>
        </div>
      </div>
    </li>
  );
}
