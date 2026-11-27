"use client";

// Port of apk src/features/trade/screens/HomeScreen.tsx (+ SegmentTabs,
// IndicesStrip, IndexCard, IntradayChartCard, IntradayLineChart). Live ticks
// come from the shared market socket (useMarketStream); the intraday line is
// the same rolling client-side LTP series the app's ticker store keeps.

import { memo, useId, useMemo, useState } from "react";
import Link from "next/link";
import { IoCaretDown, IoCaretUp, IoSettingsOutline, IoTrendingDown, IoTrendingUp } from "react-icons/io5";
import { cn } from "@/lib/utils";
import { useMarketStream } from "@/lib/useMarketStream";
import { ApkTopBar } from "@/components/apk/TopBar";
import { Chip, Screen } from "@/components/apk/ui";
import { fixed, quoteLtp, signed } from "@/components/apk/market/format";
import { SearchOverlay } from "@/components/apk/market/SearchOverlay";
import { MarketNews, MarketOverview } from "./HomeSections";

const SEGMENT_TABS = ["Stocks", "Forex", "Crypto"] as const;
type SegmentTab = (typeof SEGMENT_TABS)[number];

// Raw backend tick tokens, exactly as the app subscribes them.
const SEGMENT_TOKENS: Record<SegmentTab, { token: string; label: string }[]> = {
  Stocks: [
    { token: "256265", label: "NIFTY 50" },
    { token: "260105", label: "NIFTY BANK" },
    { token: "260617", label: "NIFTY 100" },
  ],
  Forex: [
    { token: "EURUSD", label: "EUR / USD" },
    { token: "GBPUSD", label: "GBP / USD" },
    { token: "USDJPY", label: "USD / JPY" },
    { token: "USDINR", label: "USD / INR" },
    { token: "AUDUSD", label: "AUD / USD" },
  ],
  Crypto: [
    { token: "BTCUSDT", label: "BTC / USD" },
    { token: "ETHUSDT", label: "ETH / USD" },
    { token: "SOLUSDT", label: "SOL / USD" },
    { token: "XRPUSDT", label: "XRP / USD" },
    { token: "DOGEUSDT", label: "DOGE / USD" },
  ],
};

// ── Rolling intraday series (apk ticker.store `series`) ─────────────────
// Module-level so it survives Home → Market → Home like the app's store.
interface Series {
  values: number[];
  startTs: number;
  endTs: number;
}
const SPARK_MAX = 80;
const SERIES = new Map<string, Series>();

function pushSeries(token: string, ltp: number, ts: number): Series {
  const prev = SERIES.get(token);
  let next: Series;
  if (!prev) next = { values: [ltp], startTs: ts, endTs: ts };
  else if (prev.values[prev.values.length - 1] === ltp) next = { ...prev, endTs: ts };
  else if (prev.values.length < SPARK_MAX) next = { values: [...prev.values, ltp], startTs: prev.startTs, endTs: ts };
  else
    next = {
      values: [...prev.values.slice(prev.values.length - SPARK_MAX + 1), ltp],
      startTs: prev.startTs + (prev.endTs - prev.startTs) / SPARK_MAX,
      endTs: ts,
    };
  SERIES.set(token, next);
  return next;
}

export function ApkHomeScreen() {
  const [tab, setTab] = useState<SegmentTab>("Stocks");
  const [searchOpen, setSearchOpen] = useState(false);
  const entries = SEGMENT_TOKENS[tab];
  const tokens = useMemo(() => entries.map((e) => e.token), [entries]);
  const ticks = useMarketStream(tokens);

  const indices = entries.map((e) => {
    const q = ticks.get(e.token);
    return {
      symbol: e.label,
      token: e.token,
      ltp: quoteLtp(q) ?? 0,
      change: Number(q?.change ?? 0),
      changePct: Number(q?.change_pct ?? 0),
    };
  });
  const primary = indices[0];
  const hasAnyTick = entries.some((e) => ticks.has(e.token));
  const primaryLtp = primary.ltp > 0 ? primary.ltp : null;
  // Idempotent (equal values are de-duplicated), so a double render is safe.
  const series = useMemo(
    () => (primaryLtp != null ? pushSeries(primary.token, primaryLtp, Date.now()) : SERIES.get(primary.token)),
    [primary.token, primaryLtp],
  );

  return (
    <Screen>
      <div className="sticky top-0 z-20 -mx-4 bg-apk-bg px-4">
        <ApkTopBar hasProfileBadge onSearch={() => setSearchOpen(true)} />
        <SegmentTabs active={tab} onChange={setTab} />
      </div>
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
      <div className="flex flex-col gap-[18px] pb-8 pt-2">
        <IndicesStrip data={indices} />
        <IntradayChartCard
          symbol={primary.symbol}
          changePct={primary.changePct}
          data={series?.values ?? []}
          startTs={series?.startTs}
          endTs={series?.endTs}
        />
        {!hasAnyTick ? <div className="-mt-2 text-center text-[11px] text-apk-dim">Connecting to live feed…</div> : null}
        <MarketOverview />
        <MarketNews />
        <div className="h-2" />
      </div>
    </Screen>
  );
}

const SegmentTabs = memo(function SegmentTabs({ active, onChange }: { active: SegmentTab; onChange: (t: SegmentTab) => void }) {
  return (
    <div className="flex items-center border-b border-apk-border">
      <div className="apk-no-scrollbar flex flex-1 items-center overflow-x-auto pr-3">
        {SEGMENT_TABS.map((t) => {
          const isActive = t === active;
          return (
            <button key={t} type="button" onClick={() => onChange(t)} className="flex flex-col items-center px-3.5 py-2.5">
              <span className={cn("text-[15px]", isActive ? "font-bold text-apk-text" : "font-medium text-apk-muted")}>{t}</span>
              <span className={cn("mt-1.5 h-0.5 w-full rounded-sm", isActive ? "bg-apk-text" : "bg-transparent")} />
            </button>
          );
        })}
      </div>
      <Link href="/settings" aria-label="Settings" className="px-2.5 py-2.5 text-apk-muted">
        <IoSettingsOutline size={20} />
      </Link>
    </div>
  );
});

interface IndexQuote {
  symbol: string;
  token: string;
  ltp: number;
  change: number;
  changePct: number;
}

function IndicesStrip({ data }: { data: IndexQuote[] }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="text-[18px] font-semibold text-apk-text">Indices</div>
      <div className="apk-no-scrollbar -mr-4 flex gap-2.5 overflow-x-auto pr-4">
        {data.map((it) => (
          <IndexCard key={it.token} {...it} />
        ))}
      </div>
    </div>
  );
}

const IndexCard = memo(function IndexCard({ symbol, token, ltp, change, changePct }: IndexQuote) {
  const noData = ltp === 0;
  const tone = noData ? "text-apk-dim" : change >= 0 ? "text-apk-buy" : "text-apk-sell";
  return (
    <Link
      href={`/terminal?token=${encodeURIComponent(token)}`}
      className="w-[168px] shrink-0 rounded-2xl bg-apk-elevated p-3.5"
    >
      <div className="text-[12px] text-apk-muted">{symbol}</div>
      <div className={cn("mt-1.5 text-[20px] font-bold tabular-nums", noData ? "text-apk-dim" : "text-apk-text")}>
        {noData ? "—" : fixed(ltp)}
      </div>
      <div className={cn("mt-1 text-[12px] font-semibold tabular-nums", tone)}>
        {noData ? "—" : `${signed(change)} (${signed(changePct)}%)`}
      </div>
    </Link>
  );
});

// ── IntradayChartCard ───────────────────────────────────────────────────
const FILTERS = ["Price", "OI", "Change in OI", "ATM Straddle"] as const;

// Short-term trend from the last ~12 points; "strong" past 3× the step.
function detectTrend(data: number[]): { kind: "up" | "down" | "flat"; strong: boolean; sinceIdx: number } {
  if (data.length < 4) return { kind: "flat", strong: false, sinceIdx: 0 };
  const tail = data.slice(-Math.min(12, data.length));
  const first = tail[0];
  const delta = tail[tail.length - 1] - first;
  const stepMag = Math.abs(first) * 0.001 || 0.01;
  if (Math.abs(delta) < stepMag) return { kind: "flat", strong: false, sinceIdx: 0 };
  return { kind: delta > 0 ? "up" : "down", strong: Math.abs(delta) > stepMag * 3, sinceIdx: data.length - tail.length };
}

const timeFmt = (ts: number) => new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

const IntradayChartCard = memo(function IntradayChartCard({
  symbol,
  changePct,
  data,
  startTs,
  endTs,
}: {
  symbol: string;
  changePct: number;
  data: number[];
  startTs?: number;
  endTs?: number;
}) {
  const [active, setActive] = useState<string>("Price");
  const isDown = changePct < 0;
  const toneText = isDown ? "text-apk-sell" : "text-apk-buy";
  const toneColor = isDown ? "rgb(var(--apk-sell))" : "rgb(var(--apk-buy))";
  // Card is screen width − 32 (Screen padding), plot area − 28 (card padding).
  const width = Math.min(window.innerWidth, 767) - 32 - 28;

  const trend = useMemo(() => detectTrend(data), [data]);
  const trendLabel = trend.strong
    ? trend.kind === "up"
      ? "Strong Uptrend"
      : "Strong Downtrend"
    : trend.kind === "up"
      ? "Uptrend"
      : trend.kind === "down"
        ? "Downtrend"
        : "Range-bound";
  const trendTone = trend.kind === "up" ? "text-apk-buy border-apk-buy" : trend.kind === "down" ? "text-apk-sell border-apk-sell" : "text-apk-muted border-apk-muted";
  const sinceTs =
    startTs && endTs && data.length >= 2 ? timeFmt(startTs + ((endTs - startTs) * trend.sinceIdx) / (data.length - 1)) : null;

  return (
    <div className="flex flex-col gap-3.5 rounded-2xl bg-apk-elevated p-3.5">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[18px] font-bold text-apk-text">{symbol}</span>
            <span className={cn("text-[14px] font-semibold tabular-nums", toneText)}>{signed(changePct)}%</span>
            <span className={toneText}>{isDown ? <IoCaretDown size={12} /> : <IoCaretUp size={12} />}</span>
          </div>
          <div className="mt-0.5 text-[12px] text-apk-muted">Day&apos;s analysis</div>
        </div>
        {trend.kind !== "flat" ? (
          <div className={cn("flex flex-col items-end rounded-xl border px-2.5 py-1.5", trendTone)}>
            <div className="flex items-center gap-1.5">
              {trend.kind === "up" ? <IoTrendingUp size={12} /> : <IoTrendingDown size={12} />}
              <span className="text-[11px] font-bold">{trendLabel}</span>
            </div>
            {sinceTs ? <div className="mt-0.5 text-[11px] text-apk-muted">Since {sinceTs}</div> : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Chip key={f} label={f} size="sm" active={f === active} onClick={() => setActive(f)} />
        ))}
      </div>

      <div className="mt-1">
        {/* After close only the last LTP remains — pad to a flat line. */}
        {data.length >= 1 ? (
          <IntradayLineChart
            data={data.length === 1 ? [data[0], data[0]] : data}
            width={width}
            height={200}
            startTs={startTs}
            endTs={endTs}
            color={toneColor}
          />
        ) : (
          <div className="flex h-[200px] items-center justify-center rounded-xl text-[14px] text-apk-muted">
            Live chart will appear once feed connects
          </div>
        )}
      </div>
    </div>
  );
});

const RIGHT_GUTTER = 56;
const BOTTOM_GUTTER = 26;
const TOP_PAD = 16;
const LEFT_PAD = 4;

const labelFor = (v: number) =>
  Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("en-IN") : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2);

/** apk IntradayLineChart (react-native-svg) → inline SVG. Straight segments
 *  instead of d3 curveMonotoneX (no d3 on web; identical at 80 points). */
function IntradayLineChart({
  data,
  width,
  height,
  startTs,
  endTs,
  color,
}: {
  data: number[];
  width: number;
  height: number;
  startTs?: number;
  endTs?: number;
  color: string;
}) {
  const fillId = `intraday-${useId().replace(/:/g, "")}`;
  const plot = useMemo(() => {
    const max = Math.max(...data);
    const min = Math.min(...data);
    const pad = (max - min) * 0.1 || max * 0.001 || 1;
    const yMin = min - pad;
    const yMax = max + pad;
    const plotW = width - RIGHT_GUTTER - LEFT_PAD;
    const plotH = height - BOTTOM_GUTTER - TOP_PAD;
    const stepX = plotW / (data.length - 1);
    const y = (v: number) => TOP_PAD + plotH - ((v - yMin) / (yMax - yMin)) * plotH;
    const pts = data.map((v, i) => `${(LEFT_PAD + i * stepX).toFixed(1)},${y(v).toFixed(1)}`);
    const line = `M${pts.join("L")}`;
    const base = (TOP_PAD + plotH).toFixed(1);
    const area = `${line}L${(LEFT_PAD + plotW).toFixed(1)},${base}L${LEFT_PAD},${base}Z`;
    const last = data[data.length - 1];
    return {
      line,
      area,
      ticks: [yMax, (yMax + yMin) / 2, yMin].map((v) => ({ v, y: y(v) })),
      lastX: LEFT_PAD + (data.length - 1) * stepX,
      lastY: y(last),
      last,
    };
  }, [data, width, height]);

  const pillX = Math.min(plot.lastX + 6, width - 56);
  return (
    <svg width={width} height={height} className="block">
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: color, stopOpacity: 0.3 }} />
          <stop offset="1" style={{ stopColor: color, stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      {plot.ticks.map((t, i) => (
        <line
          key={`g${i}`}
          x1={LEFT_PAD}
          x2={width - RIGHT_GUTTER}
          y1={t.y}
          y2={t.y}
          className="stroke-apk-border"
          strokeDasharray="3 6"
          strokeWidth={1}
        />
      ))}
      {plot.ticks.map((t, i) => (
        <text key={`l${i}`} x={width - RIGHT_GUTTER + 6} y={t.y + 4} className="fill-apk-muted" fontSize={10}>
          {labelFor(t.v)}
        </text>
      ))}
      <path d={plot.area} fill={`url(#${fillId})`} />
      <path d={plot.line} style={{ stroke: color }} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <rect x={pillX} y={plot.lastY - 10} width={50} height={20} rx={4} style={{ fill: color }} />
      <text x={pillX + 25} y={plot.lastY + 4} fill="#fff" fontSize={11} fontWeight={700} textAnchor="middle">
        {labelFor(plot.last)}
      </text>
      {startTs ? (
        <text x={LEFT_PAD + 2} y={height - 8} className="fill-apk-muted" fontSize={10}>
          {timeFmt(startTs)}
        </text>
      ) : null}
      {endTs ? (
        <>
          <text x={width - RIGHT_GUTTER} y={height - 8} className="fill-apk-muted" fontSize={10} textAnchor="end">
            {timeFmt(endTs)}
          </text>
          <text x={(LEFT_PAD + (width - RIGHT_GUTTER)) / 2} y={height - 8} className="fill-apk-muted" fontSize={10} textAnchor="middle">
            {new Date(endTs).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
          </text>
        </>
      ) : null}
    </svg>
  );
}
