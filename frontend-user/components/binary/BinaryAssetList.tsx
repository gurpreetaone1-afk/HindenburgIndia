"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { marketTickBus, type MarketQuote } from "@/lib/marketTickBus";

interface Props {
  assets: string[];
  selected: string;
  onSelect: (symbol: string) => void;
}

/** Strip Infoway suffixes ("EURUSD_FX", "BTCUSDT_CRYPTO") for the chip label. */
function shortLabel(sym: string): string {
  return sym.replace(/_[A-Z]+$/, "");
}

function fmtPrice(n: number | undefined, sym: string): string {
  if (n === undefined || !Number.isFinite(n) || n <= 0) return "—";
  const s = sym.toUpperCase();
  const dp =
    s.endsWith("JPY") ? 3
    : (s.startsWith("BTC") || s.startsWith("ETH")) && s.endsWith("USDT") ? 2
    : (s.startsWith("XAU") || s.startsWith("XAG")) ? 2
    : 4;
  return n.toFixed(dp);
}

/**
 * Left-rail asset list — one row per enabled binary asset with live
 * bid/ask streaming off the shared market tick bus. Selecting a row
 * tells the page which symbol to chart + trade.
 */
export function BinaryAssetList({ assets, selected, onSelect }: Props) {
  const [filter, setFilter] = useState("");
  const [quotes, setQuotes] = useState<Map<string, MarketQuote>>(new Map());
  // Coalesce render-rate so 100 ticks/sec doesn't re-render this list at 100Hz.
  const pendingRef = useRef<Map<string, MarketQuote>>(new Map());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!assets.length) return;
    const unsub = marketTickBus.subscribe(assets, (q) => {
      pendingRef.current.set(String(q.token), q);
      if (flushTimerRef.current) return;
      flushTimerRef.current = setTimeout(() => {
        flushTimerRef.current = null;
        setQuotes((prev) => {
          const next = new Map(prev);
          for (const [k, v] of pendingRef.current.entries()) next.set(k, v);
          pendingRef.current.clear();
          return next;
        });
      }, 200);
    });
    return () => {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      unsub();
    };
  }, [assets]);

  const f = filter.trim().toUpperCase();
  const visible = f ? assets.filter((a) => a.toUpperCase().includes(f)) : assets;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search asset"
            className="h-8 w-full rounded-md border border-input bg-background pl-7 pr-2 text-xs outline-none focus:border-primary"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {visible.length === 0 ? (
          <div className="grid h-full place-items-center px-3 text-xs text-muted-foreground">
            No assets enabled by admin
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((sym) => {
              const q = quotes.get(sym);
              const ltp = Number(q?.ltp ?? q?.bid ?? q?.ask ?? 0);
              const bid = Number(q?.bid ?? 0);
              const ask = Number(q?.ask ?? 0);
              const isActive = sym === selected;
              return (
                <li key={sym}>
                  <button
                    type="button"
                    onClick={() => onSelect(sym)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-accent"
                    )}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold">{shortLabel(sym)}</div>
                      <div className="mt-0.5 flex gap-2 text-[10px] text-muted-foreground">
                        <span>B {fmtPrice(bid, sym)}</span>
                        <span>A {fmtPrice(ask, sym)}</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-xs font-medium tabular-nums">
                        {fmtPrice(ltp, sym)}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
