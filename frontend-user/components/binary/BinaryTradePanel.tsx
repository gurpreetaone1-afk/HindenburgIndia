"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { BinaryAPI, WalletAPI } from "@/lib/api";
import { cn, formatINR } from "@/lib/utils";
import { marketTickBus } from "@/lib/marketTickBus";

interface Props {
  symbol: string;
  /** Reports the user's pending stake/strike upward so the chart can
   *  render a preview "now" line. */
  onPreviewChange?: (livePrice: number | null) => void;
  /** Tighter vertical rhythm + side-by-side payout/stake on phones so
   *  the HIGHER / LOWER buttons sit above the dock without scrolling. */
  compact?: boolean;
}

function durationLabel(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  return `${Math.round(sec / 3600)}h`;
}

/** Local in-state quick-stake chips. Multiplied with the smallest unit
 *  so the user can size 1x / 5x / 10x / 25x quickly. */
const STAKE_CHIPS = [1, 5, 10, 25];

/**
 * Right-rail trade panel. Renders effective settings (duration chips +
 * payout %) for the selected symbol, takes a stake, and places HIGHER /
 * LOWER. Wallet + active list invalidated optimistically on success;
 * the WS bridge handles the `binary_settled` push later.
 */
export function BinaryTradePanel({ symbol, onPreviewChange, compact = false }: Props) {
  const qc = useQueryClient();
  const [duration, setDuration] = useState<number>(60);
  const [stake, setStake] = useState<string>("100");
  const [livePrice, setLivePrice] = useState<number | null>(null);

  // Effective settings (folds global + per-asset override)
  const { data: cfg } = useQuery({
    queryKey: ["binary", "settings", symbol],
    queryFn: () => BinaryAPI.settings(symbol),
    enabled: !!symbol,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  // Wallet for the available-balance line above the buttons.
  const { data: wallet } = useQuery({
    queryKey: ["wallet"],
    queryFn: () => WalletAPI.summary(),
    staleTime: 5_000,
    refetchOnWindowFocus: false,
  });

  const allowedDurations: number[] = useMemo(() => {
    const list = (cfg?.allowed_durations as number[] | undefined) ?? [
      10, 30, 60, 120, 180, 300, 600, 900, 1800, 3600,
    ];
    return [...list].sort((a, b) => a - b);
  }, [cfg]);

  // Snap the duration selector when the asset's allowlist changes.
  useEffect(() => {
    if (!allowedDurations.length) return;
    if (!allowedDurations.includes(duration)) {
      setDuration(allowedDurations[0]);
    }
  }, [allowedDurations, duration]);

  const payoutPctByDuration: Record<string, number> =
    (cfg?.payout_pct_by_duration as Record<string, number> | undefined) ?? {};
  const payoutPct = (() => {
    const exact = payoutPctByDuration[String(duration)];
    if (typeof exact === "number") return exact;
    // Nearest-neighbour fallback matches the backend's
    // payout_for_duration helper so what we render here is what the
    // server will actually credit on a win.
    const keys = Object.keys(payoutPctByDuration)
      .map((k) => Number(k))
      .filter((k) => Number.isFinite(k))
      .sort((a, b) => a - b);
    if (!keys.length) return 0.7;
    let best = keys[0];
    let bestDelta = Math.abs(best - duration);
    for (const k of keys) {
      const d = Math.abs(k - duration);
      if (d < bestDelta) {
        best = k;
        bestDelta = d;
      }
    }
    return payoutPctByDuration[String(best)] ?? 0.7;
  })();

  const minStake = Number(cfg?.min_stake_inr ?? 10);
  const maxStake = Number(cfg?.max_stake_inr ?? 10000);
  const stakeNum = Number(stake);
  const stakeValid = Number.isFinite(stakeNum) && stakeNum >= minStake && stakeNum <= maxStake;
  const payoutPreview = stakeValid ? stakeNum * (1 + payoutPct) : 0;
  const profitPreview = stakeValid ? stakeNum * payoutPct : 0;
  const tradingEnabled = Boolean(cfg?.enabled);
  const availableBalance = Number(wallet?.available_balance ?? 0);

  // Live LTP for this panel's header display only. We no longer
  // push the value up via `onPreviewChange` on every tick — the chart
  // surfaces the live price through its built-in `priceLineVisible`
  // affordance, and the per-tick state-set was triggering the
  // BinaryChart preview-line effect to recreate a price-line ten
  // times per second, which in turn raced the live-bar `series.update`
  // and crashed lightweight-charts' Area renderer with "Value is null".
  // Prop kept in the signature so the parent doesn't break.
  useEffect(() => {
    if (!symbol) return;
    const unsub = marketTickBus.subscribe([symbol], (q) => {
      const ltp = Number(q.ltp ?? q.bid ?? q.ask ?? 0);
      if (Number.isFinite(ltp) && ltp > 0) {
        setLivePrice(ltp);
      }
    });
    return () => {
      unsub();
    };
  }, [symbol]);

  const placeMut = useMutation({
    mutationFn: (direction: "HIGHER" | "LOWER") =>
      BinaryAPI.place({ symbol, direction, stake: stakeNum, duration_sec: duration }),
    onSuccess: (row: any, direction) => {
      toast.success(
        `${direction === "HIGHER" ? "▲ HIGHER" : "▼ LOWER"} ${symbol} placed — strike ${row?.strike_price ?? "—"}`
      );
      qc.invalidateQueries({ queryKey: ["binary", "active"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    },
    onError: (err: any) => {
      const m =
        err?.message ||
        err?.response?.data?.error?.message ||
        "Could not place — try again";
      toast.error(m);
    },
  });

  const place = (direction: "HIGHER" | "LOWER") => {
    if (!stakeValid) {
      toast.error(`Stake must be between ${formatINR(minStake)} and ${formatINR(maxStake)}`);
      return;
    }
    if (stakeNum > availableBalance) {
      toast.error("Insufficient wallet balance");
      return;
    }
    placeMut.mutate(direction);
  };

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        compact ? "gap-2 p-2.5" : "gap-3 p-3"
      )}
    >
      {/* Live price header — desktop only; on mobile the page header
          already shows the asset chip + chart shows live LTP, so we
          drop it here to save vertical real estate. */}
      {!compact && (
        <div className="rounded-md border border-border bg-card p-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {symbol.replace(/_[A-Z]+$/, "")}
          </div>
          <div className="mt-0.5 text-lg font-semibold tabular-nums">
            {livePrice ? livePrice.toFixed(symbol.toUpperCase().endsWith("JPY") ? 3 : 5) : "—"}
          </div>
        </div>
      )}

      {!tradingEnabled && (
        <div
          className={cn(
            "rounded-md border border-amber-500/40 bg-amber-500/10 text-[11px] text-amber-700 dark:text-amber-300",
            compact ? "p-1.5" : "p-2"
          )}
        >
          Binary trading isn't available right now.
        </div>
      )}

      {/* Duration chips — horizontal scroll on compact so a long
          allowlist doesn't wrap and push the buttons off-screen */}
      <div>
        <div
          className={cn(
            "mb-1 text-[10px] uppercase tracking-wider text-muted-foreground",
            compact && "sr-only"
          )}
        >
          Duration
        </div>
        <div
          className={cn(
            "flex gap-1.5",
            compact
              ? "flex-nowrap overflow-x-auto scrollbar-thin"
              : "flex-wrap"
          )}
        >
          {allowedDurations.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDuration(d)}
              className={cn(
                "shrink-0 rounded-md border px-2 text-xs font-medium transition-colors",
                compact ? "h-7 min-w-[40px]" : "h-8 min-w-[44px]",
                duration === d
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent"
              )}
            >
              {durationLabel(d)}
            </button>
          ))}
        </div>
      </div>

      {/* Stake + payout side-by-side on compact so both fit in one row */}
      <div className={cn("grid gap-2", compact ? "grid-cols-[1fr_auto]" : "grid-cols-1")}>
        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Stake (₹)
            </span>
            {!compact && (
              <span className="text-[10px] text-muted-foreground">
                min {formatINR(minStake, { withSymbol: false })} · max {formatINR(maxStake, { withSymbol: false })}
              </span>
            )}
          </div>
          <input
            type="number"
            inputMode="decimal"
            value={stake}
            onChange={(e) => setStake(e.target.value)}
            min={minStake}
            max={maxStake}
            className={cn(
              "w-full rounded-md border bg-background px-3 font-semibold tabular-nums outline-none",
              compact ? "h-9 text-sm" : "h-10 text-base",
              stakeValid ? "border-input focus:border-primary" : "border-destructive"
            )}
          />
          <div className={cn("mt-1.5 flex gap-1.5", compact && "hidden")}>
            {STAKE_CHIPS.map((mult) => {
              const v = Math.min(maxStake, Math.max(minStake, minStake * mult));
              return (
                <button
                  key={mult}
                  type="button"
                  onClick={() => setStake(String(v))}
                  className="h-7 flex-1 rounded-md border border-border text-[11px] text-muted-foreground hover:bg-accent"
                >
                  {formatINR(v, { withSymbol: false })}
                </button>
              );
            })}
          </div>
        </div>

        {compact && (
          <div className="rounded-md border border-border bg-muted/30 p-1.5 text-right text-[10px]">
            <div className="text-muted-foreground">
              +{Math.round(payoutPct * 100)}%
            </div>
            <div className="mt-0.5 text-sm font-semibold tabular-nums text-buy">
              {formatINR(profitPreview, { withSymbol: false })}
            </div>
            <div className="text-[10px] text-muted-foreground">profit</div>
          </div>
        )}
      </div>

      {/* Payout preview — full card on desktop, hidden on compact (the
          side-by-side mini-card above already surfaces the key number) */}
      {!compact && (
        <div className="rounded-md border border-border bg-muted/30 p-2 text-[11px]">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Payout %</span>
            <span className="font-semibold">{Math.round(payoutPct * 100)}%</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-muted-foreground">Profit on win</span>
            <span className="font-semibold text-buy">{formatINR(profitPreview)}</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-muted-foreground">Total payout</span>
            <span className="font-semibold">{formatINR(payoutPreview)}</span>
          </div>
          <div className="mt-1 flex justify-between border-t border-border pt-1 text-[10px]">
            <span className="text-muted-foreground">Wallet</span>
            <span className="tabular-nums">{formatINR(availableBalance)}</span>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className={cn("grid grid-cols-2 gap-2", !compact && "mt-auto")}>
        <Button
          variant="buy"
          size="lg"
          className={cn(compact ? "h-11 text-sm" : "h-14 text-base")}
          disabled={!tradingEnabled || placeMut.isPending}
          loading={placeMut.isPending && placeMut.variables === "HIGHER"}
          onClick={() => place("HIGHER")}
        >
          <ArrowUp className={compact ? "size-4" : "size-5"} />
          HIGHER
        </Button>
        <Button
          variant="sell"
          size="lg"
          className={cn(compact ? "h-11 text-sm" : "h-14 text-base")}
          disabled={!tradingEnabled || placeMut.isPending}
          loading={placeMut.isPending && placeMut.variables === "LOWER"}
          onClick={() => place("LOWER")}
        >
          <ArrowDown className={compact ? "size-4" : "size-5"} />
          LOWER
        </Button>
      </div>
    </div>
  );
}
