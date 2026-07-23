"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Timer } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { BinaryAPI } from "@/lib/api";
import { cn, formatINR } from "@/lib/utils";

interface Props {
  /** When the user clicks an active row we ask the page to focus that
   *  symbol on the chart. */
  onSelectSymbol?: (symbol: string) => void;
}

function fmtRemaining(ms: number): string {
  if (ms <= 0) return "0s";
  const sec = Math.ceil(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

/**
 * Bottom dock — every OPEN binary for the user, sorted by closest
 * expiry. The WS bridge calls invalidate on `binary_settled` so this
 * shrinks the instant a binary resolves; we ALSO ratchet a 1-Hz local
 * tick so the countdown decrements smoothly between server pushes
 * (otherwise the user would see "8s" frozen until the next refetch).
 */
export function BinaryActiveDock({ onSelectSymbol }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const { data: active } = useQuery({
    queryKey: ["binary", "active"],
    queryFn: () => BinaryAPI.active(),
    refetchInterval: 5000,
    refetchOnWindowFocus: false,
  });

  const rows = active ?? [];

  if (rows.length === 0) {
    return (
      <div className="grid h-full place-items-center px-4 py-6 text-xs text-muted-foreground">
        No active binaries — pick a duration on the right and place a trade
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      {/* Mobile card list — the 6-column table is cramped on a phone. */}
      <ul className="space-y-2 p-2 md:hidden">
        {rows.map((r: any) => {
          const expiryMs = new Date(r.expiry_at).getTime();
          const remaining = expiryMs - now;
          const totalDuration = (Number(r.duration_sec) || 60) * 1000;
          const progress = Math.max(
            0,
            Math.min(1, 1 - remaining / Math.max(1, totalDuration)),
          );
          const isDir = r.direction === "HIGHER";
          return (
            <li
              key={r.id}
              onClick={() => onSelectSymbol?.(r.symbol)}
              className="cursor-pointer rounded-xl border border-border bg-card p-3 shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold">
                  {r.symbol.replace(/_[A-Z]+$/, "")}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold",
                    isDir ? "bg-buy/10 text-buy" : "bg-sell/10 text-sell",
                  )}
                >
                  {isDir ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
                  {r.direction}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Stake</div>
                  <div className="font-tabular text-xs font-semibold tabular-nums">{formatINR(r.stake)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Strike</div>
                  <div className="font-tabular text-xs font-semibold tabular-nums">{r.strike_price}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Payout</div>
                  <div className="font-tabular text-xs font-semibold tabular-nums text-buy">{formatINR(r.potential_payout)}</div>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Timer className="size-3 text-muted-foreground" />
                <span className="font-tabular text-xs tabular-nums">{fmtRemaining(remaining)}</span>
                <div className="ml-1 h-1 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full transition-all duration-1000",
                      remaining < 5000 ? "bg-amber-500" : "bg-primary",
                    )}
                    style={{ width: `${progress * 100}%` }}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Desktop table */}
      <table className="hidden w-full text-xs md:table">
        <thead className="sticky top-0 bg-card text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Asset</th>
            <th className="px-3 py-2 text-left">Direction</th>
            <th className="px-3 py-2 text-right">Stake</th>
            <th className="px-3 py-2 text-right">Strike</th>
            <th className="px-3 py-2 text-right">Payout</th>
            <th className="px-3 py-2 text-right">Time left</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r: any) => {
            const expiryMs = new Date(r.expiry_at).getTime();
            const remaining = expiryMs - now;
            const totalDuration = (Number(r.duration_sec) || 60) * 1000;
            const progress = Math.max(
              0,
              Math.min(1, 1 - remaining / Math.max(1, totalDuration))
            );
            const isDir = r.direction === "HIGHER";
            return (
              <tr
                key={r.id}
                className="cursor-pointer hover:bg-accent/30"
                onClick={() => onSelectSymbol?.(r.symbol)}
              >
                <td className="px-3 py-2 font-medium">{r.symbol.replace(/_[A-Z]+$/, "")}</td>
                <td className="px-3 py-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold",
                      isDir
                        ? "bg-buy/10 text-buy"
                        : "bg-sell/10 text-sell"
                    )}
                  >
                    {isDir ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
                    {r.direction}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatINR(r.stake)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.strike_price}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatINR(r.potential_payout)}</td>
                <td className="px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <Timer className="size-3 text-muted-foreground" />
                    <span className="tabular-nums">{fmtRemaining(remaining)}</span>
                  </div>
                  <div className="mt-1 h-1 w-20 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full transition-all duration-1000",
                        remaining < 5000 ? "bg-amber-500" : "bg-primary"
                      )}
                      style={{ width: `${progress * 100}%` }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
