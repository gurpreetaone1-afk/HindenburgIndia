"use client";

import { useEffect, useState } from "react";
import { marketTickBus, type MarketQuote } from "@/lib/marketTickBus";

export type { MarketQuote };

/**
 * Live market-data stream. Subscribes to the shared `marketTickBus` (one
 * WebSocket per browser tab, refcounted across all consumers) for the
 * given tokens, and returns a `{token → quote}` map that updates as
 * ticks arrive.
 *
 * Throttling — display refresh is coalesced to ~500 ms (matches Zerodha
 * Kite / Dhan; Groww + Upstox sit at ~1 s). The bus itself still receives
 * every upstream tick at full rate so data freshness is preserved; we
 * just apply the LATEST per-token snapshot to React state at most twice
 * per second so the PnL number doesn't flicker 4-10× per second.
 * User-reported symptom before this change: "PnL bahut jada fast move ho
 * raha hai, glitch jaisa lag raha". Setting this to 0 would restore the
 * old behaviour (every tick → re-render).
 *
 * Sticky merge (no zero-frame on partial ticks) and reconnect logic both
 * live in `marketTickBus` now, so the chart's TradingView datafeed gets
 * them too without duplicating code.
 */
const DISPLAY_THROTTLE_MS = 500;

export function useMarketStream(tokens: string[]): Map<string, MarketQuote> {
  const [quotes, setQuotes] = useState<Map<string, MarketQuote>>(new Map());
  const tokensKey = tokens.join(",");

  useEffect(() => {
    const list = tokens.filter(Boolean).map(String);
    if (list.length === 0) {
      // No tokens to watch — make sure stale quotes don't linger across
      // a transition from "some tokens" → "none".
      setQuotes((prev) => (prev.size === 0 ? prev : new Map()));
      return;
    }

    const dirty = new Set<string>();
    const latest = new Map<string, MarketQuote>();
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    function flush() {
      flushTimer = null;
      if (dirty.size === 0) return;
      const drained = Array.from(dirty);
      dirty.clear();
      setQuotes((prev) => {
        const next = new Map(prev);
        for (const tok of drained) {
          const q = latest.get(tok);
          if (q) next.set(tok, q);
        }
        return next;
      });
    }

    const unsubscribe = marketTickBus.subscribe(list, (q) => {
      const tok = q.token;
      if (!tok) return;
      latest.set(tok, q);
      dirty.add(tok);
      if (flushTimer === null) {
        flushTimer = setTimeout(flush, DISPLAY_THROTTLE_MS);
      }
    });

    return () => {
      unsubscribe();
      if (flushTimer) clearTimeout(flushTimer);
      latest.clear();
      dirty.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokensKey]);

  return quotes;
}
