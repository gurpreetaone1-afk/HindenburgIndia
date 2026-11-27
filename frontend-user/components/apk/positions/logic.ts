// Pure helpers COPIED from app/(dashboard)/positions/page.tsx (the desktop
// page is left untouched). Only change: `liveLtpFor` takes the row's tick
// instead of reading the page-level quotes Map, so each phone row can
// subscribe to its own token and re-render alone.

import { isInstrumentMarketOpen } from "@/lib/marketHours";
import type { MarketQuote } from "@/lib/useMarketStream";

export type Side = "BUY" | "SELL";

/** Qty without float noise (65.00999 → 65); sub-1 sizes kept. */
export function fmtQty(q: any): string {
  const n = Math.abs(Number(q) || 0);
  if (n === 0) return "0";
  const r = Math.round(n * 1000) / 1000;
  const nearest = Math.round(r);
  if (n >= 1 && Math.abs(r - nearest) < 0.02) return String(nearest);
  return String(r);
}

/** Backend-stamped overnight margin, else the locked intraday margin. */
export function holdingMarginFor(row: any): number {
  const stamped = row?.holding_margin;
  if (stamped !== null && stamped !== undefined && stamped !== "") {
    const n = Number(stamped);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return Number(row?.margin_used ?? row?.margin ?? row?.used_margin ?? 0);
}

/** Infoway-fed rows already trade carry-forward — excluded from CF Required. */
export function isInfowayPosition(p: any): boolean {
  const seg = (p?.segment_type ?? "").toUpperCase();
  const exch = (p?.exchange ?? "").toUpperCase();
  return /CRYPTO|FOREX|FX|CDS|STOCKS|INDICES|COMMODITIES/.test(seg) || exch === "CDS" || exch === "CRYPTO";
}

export function resolveSide(row: any): Side {
  const raw = String(row?.opened_side ?? row?.action ?? row?.side ?? "").toUpperCase();
  if (raw === "BUY" || raw === "SELL") return raw as Side;
  const q = Number(row?.quantity ?? 0);
  return q < 0 ? "SELL" : "BUY";
}

/** Closed rows: opened_side survives the close; older rows infer from realized P&L. */
export function closedSide(r: any): Side {
  const raw = String(r?.opened_side ?? "").toUpperCase();
  if (raw === "BUY" || raw === "SELL") return raw as Side;
  return Number(r?.realized_pnl ?? 0) >= 0 ? "BUY" : "SELL";
}

export function tokenOf(row: any): string {
  return String(row?.instrument_token ?? row?.token ?? "");
}

/**
 * Side-aware close price: live bid (BUY) / ask (SELL) when within 25 % of
 * LTP, else live LTP, else stored row.ltp. Frozen at row.ltp while the
 * instrument's market is closed (replayed pre-close snapshots must not move P&L).
 */
export function liveLtpFor(row: any, tick: MarketQuote | undefined, side?: Side): number {
  const seg = row?.segment_type ?? row?.segment;
  const exch = row?.exchange;
  if (!isInstrumentMarketOpen(seg, exch)) {
    return Number(row?.ltp ?? 0);
  }
  const liveLtp = Number(tick?.ltp ?? 0);
  const near = (raw: number) => raw > 0 && (!(liveLtp > 0) || Math.abs(raw - liveLtp) / liveLtp <= 0.25);
  if (side === "BUY") {
    const liveBid = Number(tick?.bid ?? 0);
    if (near(liveBid)) return liveBid;
  } else if (side === "SELL") {
    const liveAsk = Number(tick?.ask ?? 0);
    if (near(liveAsk)) return liveAsk;
  }
  if (liveLtp > 0) return liveLtp;
  return Number(row?.ltp ?? 0);
}

/** Open position M2M — the desktop M2M column / header total formula. */
export function positionLive(row: any, tick: MarketQuote | undefined): { price: number; pnl: number } {
  const side = resolveSide(row);
  const price = liveLtpFor(row, tick, side) || Number(row?.ltp ?? 0);
  const avg = Number(row?.avg_price ?? 0);
  const qty = Number(row?.quantity ?? 0);
  return { price, pnl: price > 0 && avg > 0 && qty !== 0 ? (price - avg) * qty : 0 };
}

/** Active trade (per-fill) P&L — the desktop Active P&L column formula. */
export function activeLive(row: any, tick: MarketQuote | undefined): { price: number; pnl: number } {
  const side = resolveSide(row);
  const price = liveLtpFor(row, tick, side) || Number(row?.ltp ?? 0);
  const entry = Number(row?.avg_price ?? row?.price ?? 0);
  const qty = Number(row?.quantity ?? 0);
  const dir = side === "SELL" ? -1 : 1;
  return { price, pnl: price > 0 && entry > 0 && qty !== 0 ? dir * (price - entry) * qty : 0 };
}

/** Close errors to reconcile silently (already gone / in flight / network). */
export function isBenignCloseError(e: any): boolean {
  const msg = String(e?.message ?? "").toLowerCase();
  const code = String(e?.code ?? "").toUpperCase();
  return (
    code === "NETWORK" ||
    msg.includes("in flight") ||
    msg.includes("network") ||
    msg.includes("timeout") ||
    msg.includes("already closed") ||
    msg.includes("not found") ||
    msg.includes("no open position")
  );
}
