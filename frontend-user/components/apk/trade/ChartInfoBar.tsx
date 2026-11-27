"use client";

// Port of apk src/features/charts/components/ChartInfoBar.tsx — symbol ·
// interval · segment, live O/H/L/C, change pill, volume + feed source tag.

import { cn } from "@/lib/utils";
import type { OrderTicket } from "./useOrderTicket";

function OhlcPair({ label, value, className }: { label: string; value: string; className: string }) {
  return (
    <span className="flex items-baseline gap-0.5">
      <span className="text-[11px] font-bold text-apk-dim">{label}</span>
      <span className={cn("text-[11px] font-bold tabular-nums", className)}>{value}</span>
    </span>
  );
}

export function ChartInfoBar({
  t,
  symbol,
  interval,
  segment,
  source,
}: {
  t: OrderTicket;
  symbol: string;
  interval: string;
  segment?: string;
  source?: string;
}) {
  const tone = t.change === 0 ? "text-apk-muted" : t.change > 0 ? "text-apk-buy" : "text-apk-sell";
  const sign = (n: number) => (n > 0 ? "+" : "");
  const hasChange = t.change !== 0 || t.changePct !== 0;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-apk-border bg-apk-bg px-3 py-2">
      <span className="flex items-center gap-1.5">
        <span className="text-[13px] font-bold text-apk-text">{symbol}</span>
        <span className="text-[11px] text-apk-dim">·</span>
        <span className="text-[11px] font-semibold text-apk-muted">{interval}</span>
        {segment ? (
          <>
            <span className="text-[11px] text-apk-dim">·</span>
            <span className="text-[11px] font-semibold text-apk-muted">{segment}</span>
          </>
        ) : null}
      </span>

      <span className="flex items-center gap-2">
        <OhlcPair label="O" value={t.fmtPrice(t.open)} className={tone} />
        <OhlcPair label="H" value={t.fmtPrice(t.high)} className="text-apk-buy" />
        <OhlcPair label="L" value={t.fmtPrice(t.low)} className="text-apk-sell" />
        <OhlcPair label="C" value={t.fmtPrice(t.ltp)} className={tone} />
      </span>

      {hasChange ? (
        <span
          className={cn("rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums", tone)}
          style={{ backgroundColor: t.change >= 0 ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)" }}
        >
          {sign(t.change)}
          {t.change.toFixed(2)} ({sign(t.changePct)}
          {t.changePct.toFixed(2)}%)
        </span>
      ) : null}

      <span className="ml-auto flex items-center gap-1.5">
        {t.volume != null ? (
          <>
            <span className="text-[11px] text-apk-muted">Vol</span>
            <span className="text-[11px] font-bold tabular-nums text-apk-text">
              {Number(t.volume).toLocaleString("en-IN")}
            </span>
          </>
        ) : null}
        {source ? (
          <span className="ml-1.5 rounded border border-apk-border bg-apk-elevated px-1.5 py-0.5 text-[9px] font-bold tracking-[0.6px] text-apk-muted">
            {source}
          </span>
        ) : null}
      </span>
    </div>
  );
}
