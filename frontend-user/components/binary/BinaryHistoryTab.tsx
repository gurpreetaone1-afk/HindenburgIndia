"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { BinaryAPI } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn, formatINR } from "@/lib/utils";

function fmtTime(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "—";
  }
}

function statusBadge(s: string): { label: string; cls: string } {
  switch (s) {
    case "WON":
      return { label: "WON", cls: "bg-buy/10 text-buy" };
    case "LOST":
      return { label: "LOST", cls: "bg-sell/10 text-sell" };
    case "TIE_REFUND":
      return { label: "TIE", cls: "bg-muted text-foreground" };
    case "CANCELLED":
      return { label: "CANCELLED", cls: "bg-muted text-muted-foreground" };
    case "REJECTED":
      return { label: "REJECTED", cls: "bg-muted text-muted-foreground" };
    default:
      return { label: s, cls: "bg-muted text-muted-foreground" };
  }
}

/**
 * Settled-binaries view — newest first, paginated. We reuse the same
 * page_size as the orders blotter (50) for muscle-memory parity.
 */
export function BinaryHistoryTab() {
  const [page, setPage] = useState(1);

  const { data, isFetching } = useQuery({
    queryKey: ["binary", "history", page],
    queryFn: () => BinaryAPI.history({ page, page_size: 50 }),
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  const items = (data?.items ?? []) as any[];
  const meta = data?.meta as
    | { page: number; page_size: number; total: number; total_pages: number }
    | undefined;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto">
        {items.length === 0 ? (
          <div className="grid h-full place-items-center text-xs text-muted-foreground">
            {isFetching ? "Loading…" : "No settled binaries yet"}
          </div>
        ) : (
          <>
          {/* Mobile card list — the 8-column table is cramped on a phone. */}
          <ul className="space-y-2 p-2 md:hidden">
            {items.map((b) => {
              const isDir = b.direction === "HIGHER";
              const badge = statusBadge(b.status);
              const pnl = Number(b.profit_loss ?? 0);
              return (
                <li key={b.id} className="rounded-xl border border-border bg-card p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold">{b.symbol.replace(/_[A-Z]+$/, "")}</span>
                      <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold", isDir ? "text-buy" : "text-sell")}>
                        {isDir ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
                        {b.direction}
                      </span>
                    </div>
                    <span className={cn("inline-block rounded-md px-2 py-0.5 text-[10px] font-semibold", badge.cls)}>
                      {badge.label}
                    </span>
                  </div>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <div className="grid grid-cols-3 gap-x-3 gap-y-1">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Stake</div>
                        <div className="font-tabular text-[11px] tabular-nums">{formatINR(b.stake)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Strike</div>
                        <div className="font-tabular text-[11px] tabular-nums">{b.strike_price}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Settle</div>
                        <div className="font-tabular text-[11px] tabular-nums">{b.settle_price ?? "—"}</div>
                      </div>
                    </div>
                    <div
                      className={cn(
                        "shrink-0 font-tabular text-sm font-bold tabular-nums",
                        pnl > 0 ? "text-buy" : pnl < 0 ? "text-sell" : "text-muted-foreground",
                      )}
                    >
                      {b.profit_loss !== null && b.profit_loss !== undefined ? formatINR(b.profit_loss) : "—"}
                    </div>
                  </div>
                  <div className="mt-1.5 font-tabular text-[10px] text-muted-foreground">
                    {fmtTime(b.settled_at ?? b.placed_at)}
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Desktop table */}
          <table className="hidden w-full text-xs md:table">
            <thead className="sticky top-0 bg-card text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">When</th>
                <th className="px-3 py-2 text-left">Asset</th>
                <th className="px-3 py-2 text-left">Dir</th>
                <th className="px-3 py-2 text-right">Stake</th>
                <th className="px-3 py-2 text-right">Strike</th>
                <th className="px-3 py-2 text-right">Settle</th>
                <th className="px-3 py-2 text-right">P&amp;L</th>
                <th className="px-3 py-2 text-center">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((b) => {
                const isDir = b.direction === "HIGHER";
                const badge = statusBadge(b.status);
                const pnl = Number(b.profit_loss ?? 0);
                return (
                  <tr key={b.id}>
                    <td className="px-3 py-2 text-muted-foreground">
                      {fmtTime(b.settled_at ?? b.placed_at)}
                    </td>
                    <td className="px-3 py-2 font-medium">
                      {b.symbol.replace(/_[A-Z]+$/, "")}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-[10px] font-semibold",
                          isDir ? "text-buy" : "text-sell"
                        )}
                      >
                        {isDir ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
                        {b.direction}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatINR(b.stake)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{b.strike_price}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {b.settle_price ?? "—"}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2 text-right tabular-nums",
                        pnl > 0 ? "text-buy" : pnl < 0 ? "text-sell" : "text-muted-foreground"
                      )}
                    >
                      {b.profit_loss !== null && b.profit_loss !== undefined
                        ? formatINR(b.profit_loss)
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={cn(
                          "inline-block rounded-md px-2 py-0.5 text-[10px] font-semibold",
                          badge.cls
                        )}
                      >
                        {badge.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </>
        )}
      </div>

      {meta && meta.total_pages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-muted-foreground">
          <span>
            Page {meta.page} of {meta.total_pages} · {meta.total} total
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="size-3" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= meta.total_pages || isFetching}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="size-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
