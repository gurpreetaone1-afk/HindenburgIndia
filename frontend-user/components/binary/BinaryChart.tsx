"use client";

import { useEffect, useMemo, useRef } from "react";
import { useTheme } from "next-themes";
import {
  createChart,
  type BarData,
  type CandlestickData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type LineData,
  type SeriesType,
  type Time,
} from "lightweight-charts";
import { useQuery } from "@tanstack/react-query";
import { BinaryAPI } from "@/lib/api";
import { marketTickBus } from "@/lib/marketTickBus";

/** Chart-type modes supported by lightweight-charts v4. The terminal's
 *  TradingView Advanced Charts dropdown has more (HLC bars, HLC area,
 *  Line with markers, High-low), but those have no native series type
 *  in lightweight-charts so they're omitted here.
 *
 *  - `line` / `step` / `area` / `baseline` are SINGLE-VALUE series.
 *    Live tip advances at 1-second cadence (Olymp Trade / Pocket
 *    Option-style).
 *  - `candles` / `hollow` / `bars` are OHLC series. Live tip is
 *    bucket-aligned to the chip resolution; ticks within a bucket
 *    update H/L/C, bucket boundaries roll a new candle. */
export type BinaryChartType =
  | "line"
  | "step"
  | "area"
  | "baseline"
  | "candles"
  | "hollow"
  | "bars";

export const BINARY_CHART_TYPES: { value: BinaryChartType; label: string }[] = [
  { value: "line", label: "Line" },
  { value: "step", label: "Step line" },
  { value: "area", label: "Area" },
  { value: "baseline", label: "Baseline" },
  { value: "candles", label: "Candles" },
  { value: "hollow", label: "Hollow candles" },
  { value: "bars", label: "Bars" },
];

const OHLC_TYPES: BinaryChartType[] = ["candles", "hollow", "bars"];

export interface BinaryActiveMarker {
  id: string;
  strike: number;
  expirySec: number;
  direction: "HIGHER" | "LOWER";
}

interface Props {
  symbol: string;
  resolutionSec: number;
  /** Active binaries on this symbol — render strike + expiry overlays. */
  active?: BinaryActiveMarker[];
  /** Persisted chart-type chosen by the trader (Line / Candles / …). */
  chartType?: BinaryChartType;
  /** When set, show a faded preview line for the trade panel's pending stake. */
  previewStrike?: number | null;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sn = Math.max(0, Math.min(100, s)) / 100;
  const ln = Math.max(0, Math.min(100, l)) / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) =>
    ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

function cssVar(name: string, alpha?: number): string {
  if (typeof window === "undefined") return "transparent";
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return "transparent";
  const parts = raw.split(/[,\s]+/).filter(Boolean);
  if (parts.length < 3) return "transparent";
  const h = parseFloat(parts[0]);
  const s = parseFloat(parts[1]);
  const l = parseFloat(parts[2]);
  if (!Number.isFinite(h) || !Number.isFinite(s) || !Number.isFinite(l)) return "transparent";
  const [r, g, b] = hslToRgb(h, s, l);
  return alpha === undefined ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function readPalette() {
  return {
    text: cssVar("--muted-foreground"),
    grid: cssVar("--border", 0.4),
    border: cssVar("--border"),
    up: cssVar("--buy"),
    down: cssVar("--sell"),
    accent: cssVar("--primary"),
    line: cssVar("--primary"),
    areaTop: cssVar("--primary", 0.25),
    areaBottom: cssVar("--primary", 0),
  };
}

function precisionFor(symbol: string): { precision: number; minMove: number } {
  const s = symbol.toUpperCase();
  if (s.endsWith("JPY")) return { precision: 3, minMove: 0.001 };
  if (s.startsWith("XAU") || s.startsWith("XAG")) return { precision: 2, minMove: 0.01 };
  if (s.endsWith("USDT") || s.endsWith("USDC") || s.endsWith("USD")) {
    if (s.startsWith("BTC") || s.startsWith("ETH")) return { precision: 2, minMove: 0.01 };
    return { precision: 4, minMove: 0.0001 };
  }
  if (/^(EUR|GBP|AUD|NZD|USD|CAD|CHF)[A-Z]{3}$/.test(s)) return { precision: 5, minMove: 0.00001 };
  return { precision: 4, minMove: 0.0001 };
}

/** State shape for the live in-flight bar. `value` populated for line-
 *  family types; `o/h/l/c` populated for candle-family types. */
type LiveState =
  | { kind: "value"; time: number; value: number }
  | { kind: "ohlc"; time: number; o: number; h: number; l: number; c: number };

/** Build a fresh series of the requested type with theme-aware colors. */
function makeSeries(
  chart: IChartApi,
  type: BinaryChartType,
  palette: ReturnType<typeof readPalette>,
  priceFormat: { type: "price"; precision: number; minMove: number },
): ISeriesApi<SeriesType> {
  const common = {
    priceFormat,
    lastValueVisible: false,
    priceLineVisible: false,
  } as const;
  switch (type) {
    case "line":
      return chart.addLineSeries({
        ...common,
        color: palette.line,
        lineWidth: 2,
        crosshairMarkerVisible: false,
      });
    case "step":
      return chart.addLineSeries({
        ...common,
        color: palette.line,
        lineWidth: 2,
        lineType: 1, // WithSteps
        crosshairMarkerVisible: false,
      });
    case "area":
      return chart.addAreaSeries({
        ...common,
        lineColor: palette.line,
        topColor: palette.areaTop,
        bottomColor: palette.areaBottom,
        lineWidth: 2,
        crosshairMarkerVisible: false,
      });
    case "baseline":
      return chart.addBaselineSeries({
        ...common,
        baseValue: { type: "price", price: 0 },
        topLineColor: palette.up,
        topFillColor1: cssVar("--buy", 0.25),
        topFillColor2: cssVar("--buy", 0),
        bottomLineColor: palette.down,
        bottomFillColor1: cssVar("--sell", 0),
        bottomFillColor2: cssVar("--sell", 0.25),
        lineWidth: 2,
        crosshairMarkerVisible: false,
      });
    case "candles":
      return chart.addCandlestickSeries({
        ...common,
        upColor: palette.up,
        downColor: palette.down,
        borderUpColor: palette.up,
        borderDownColor: palette.down,
        wickUpColor: palette.up,
        wickDownColor: palette.down,
      });
    case "hollow":
      return chart.addCandlestickSeries({
        ...common,
        upColor: "transparent",
        downColor: palette.down,
        borderUpColor: palette.up,
        borderDownColor: palette.down,
        wickUpColor: palette.up,
        wickDownColor: palette.down,
      });
    case "bars":
      return chart.addBarSeries({
        ...common,
        upColor: palette.up,
        downColor: palette.down,
      });
  }
}

/**
 * Binary trading chart with switchable series types.
 *
 * Persisted line family modes update the rightmost point every second
 * (Olymp-style live tape). OHLC family modes (candles/hollow/bars) use
 * bucket-aligned candles at the chip resolution — ticks within a
 * bucket update H/L/C; bucket boundaries roll a fresh candle.
 *
 * Strike overlays remain on top of all chart types.
 */
export function BinaryChart({
  symbol,
  resolutionSec,
  active = [],
  chartType = "line",
}: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const strikeLinesRef = useRef<Map<string, IPriceLine>>(new Map());
  const lastPointRef = useRef<LiveState | null>(null);
  const { resolvedTheme } = useTheme();
  const { precision, minMove } = useMemo(() => precisionFor(symbol), [symbol]);

  const isOhlc = OHLC_TYPES.includes(chartType);

  const { data: bars } = useQuery({
    queryKey: ["binary", "candles", symbol, resolutionSec],
    queryFn: () => BinaryAPI.candles(symbol, resolutionSec, 200),
    enabled: !!symbol && resolutionSec > 0,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  // Chart instance — only rebuilds when the symbol's price precision
  // changes (different decimals) OR when the user picks a new chart
  // type (different series API).
  useEffect(() => {
    if (!wrapRef.current) return;
    const palette = readPalette();
    const chart = createChart(wrapRef.current, {
      width: wrapRef.current.clientWidth,
      height: wrapRef.current.clientHeight,
      layout: {
        background: { color: "transparent" },
        textColor: palette.text,
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: palette.grid },
        horzLines: { color: palette.grid },
      },
      rightPriceScale: {
        borderColor: palette.border,
        scaleMargins: { top: 0.15, bottom: 0.15 },
      },
      timeScale: {
        borderColor: palette.border,
        timeVisible: true,
        secondsVisible: true,
        rightOffset: 8,
        barSpacing: 8,
      },
      crosshair: { mode: 0 },
      handleScroll: true,
      handleScale: true,
      autoSize: false,
    });

    const series = makeSeries(chart, chartType, palette, {
      type: "price",
      precision,
      minMove,
    });

    chartRef.current = chart;
    seriesRef.current = series;
    // Reset live state when the chart is rebuilt — the previous
    // series's last point is no longer valid against the new one.
    lastPointRef.current = null;

    const ro = new ResizeObserver(() => {
      if (!wrapRef.current) return;
      chart.applyOptions({
        width: wrapRef.current.clientWidth,
        height: wrapRef.current.clientHeight,
      });
    });
    ro.observe(wrapRef.current);

    return () => {
      ro.disconnect();
      strikeLinesRef.current.clear();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [precision, minMove, chartType]);

  // Re-apply palette on theme flip. Only the color-config call differs
  // per type, so we just rebuild the series via applyOptions with the
  // common keys present on every series type's options.
  useEffect(() => {
    const ch = chartRef.current;
    const series = seriesRef.current;
    if (!ch || !series) return;
    const id = requestAnimationFrame(() => {
      const p = readPalette();
      ch.applyOptions({
        layout: { background: { color: "transparent" }, textColor: p.text },
        grid: { vertLines: { color: p.grid }, horzLines: { color: p.grid } },
        rightPriceScale: { borderColor: p.border },
        timeScale: { borderColor: p.border },
      });
      try {
        // Defensive — applyOptions accepts any subset; we send the
        // union of color keys across series types and let the lib
        // ignore the ones that don't apply.
        series.applyOptions({
          color: p.line,
          upColor: p.up,
          downColor: p.down,
          borderUpColor: p.up,
          borderDownColor: p.down,
          wickUpColor: p.up,
          wickDownColor: p.down,
          lineColor: p.line,
          topColor: p.areaTop,
          bottomColor: p.areaBottom,
          topLineColor: p.up,
          bottomLineColor: p.down,
        } as any);
      } catch {
        /* ignore — degraded theming is better than a crash */
      }
    });
    return () => cancelAnimationFrame(id);
  }, [resolvedTheme]);

  // Reset chart series data immediately on symbol change so old-symbol
  // points don't ghost into the new chart while bars refetches.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    try {
      series.setData([]);
    } catch {
      /* ignore */
    }
    lastPointRef.current = null;
  }, [symbol]);

  // Seed historical points. Line-family extracts `close` as a single
  // value; OHLC-family preserves the full o/h/l/c.
  useEffect(() => {
    const series = seriesRef.current;
    const ch = chartRef.current;
    if (!series || !ch || !bars) return;

    if (isOhlc) {
      const raw = (bars as any[])
        .map((b: any) => {
          const t = Number(b?.t);
          const o = Number(b?.o);
          const h = Number(b?.h);
          const l = Number(b?.l);
          const c = Number(b?.c);
          return {
            time: Math.floor(t / 1000) as Time,
            open: o,
            high: h,
            low: l,
            close: c,
          };
        })
        .filter(
          (p) =>
            Number.isFinite(p.open) &&
            Number.isFinite(p.high) &&
            Number.isFinite(p.low) &&
            Number.isFinite(p.close) &&
            p.open > 0 &&
            p.close > 0 &&
            Number.isFinite(p.time as number) &&
            (p.time as number) > 0,
        );
      const byTime = new Map<number, (typeof raw)[number]>();
      for (const p of raw) byTime.set(p.time as number, p);
      const data: CandlestickData<Time>[] = Array.from(byTime.values()).sort(
        (a, b) => (a.time as number) - (b.time as number),
      );
      try {
        (series as ISeriesApi<"Candlestick" | "Bar">).setData(
          data as unknown as (CandlestickData<Time> | BarData<Time>)[],
        );
      } catch {
        return;
      }
      const last = data[data.length - 1];
      if (last) {
        lastPointRef.current = {
          kind: "ohlc",
          time: Number(last.time),
          o: last.open,
          h: last.high,
          l: last.low,
          c: last.close,
        };
        ch.timeScale().fitContent();
        ch.timeScale().scrollToRealTime();
      } else {
        lastPointRef.current = null;
        seedEmptyVisibleRange(ch, resolutionSec);
      }
      return;
    }

    // Line-family
    const raw: LineData<Time>[] = (bars as any[])
      .map((b: any) => {
        const t = Number(b?.t);
        const v = Number(b?.c);
        return { time: Math.floor(t / 1000) as Time, value: v };
      })
      .filter(
        (p) =>
          Number.isFinite(p.value) &&
          (p.value as number) > 0 &&
          Number.isFinite(p.time as number) &&
          (p.time as number) > 0,
      );
    const byTime = new Map<number, number>();
    for (const p of raw) byTime.set(p.time as number, p.value);
    const data: LineData<Time>[] = Array.from(byTime.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([t, v]) => ({ time: t as Time, value: v }));
    try {
      (series as ISeriesApi<"Line" | "Area" | "Baseline">).setData(data);
    } catch {
      return;
    }
    const last = data[data.length - 1];
    if (last) {
      lastPointRef.current = {
        kind: "value",
        time: Number(last.time),
        value: last.value,
      };
      ch.timeScale().fitContent();
      ch.timeScale().scrollToRealTime();
    } else {
      lastPointRef.current = null;
      seedEmptyVisibleRange(ch, resolutionSec);
    }
  }, [bars, resolutionSec, isOhlc]);

  // Live ticks. Cadence differs per chart family:
  // - Line family: 1-second points (Pocket Option-style scrolling).
  // - OHLC family: bucket-aligned, H/L/C update within a bucket.
  useEffect(() => {
    if (!symbol || bars === undefined) return;

    const unsub = marketTickBus.subscribe([symbol], (q) => {
      const series = seriesRef.current;
      const ch = chartRef.current;
      if (!series || !ch) return;
      const ltp = Number(q.ltp ?? q.last_price ?? q.bid ?? q.ask);
      if (!Number.isFinite(ltp) || ltp <= 0) return;

      const last = lastPointRef.current;

      if (isOhlc) {
        const bucket = Math.floor(Date.now() / 1000 / resolutionSec) * resolutionSec;
        if (last && last.kind !== "ohlc") {
          // Type just switched and the line-family last point hasn't
          // been replaced by an OHLC seed yet. Skip — the bars effect
          // will fix it on next render.
          return;
        }
        if (!last || bucket > last.time) {
          const fresh: LiveState = {
            kind: "ohlc",
            time: bucket,
            o: ltp,
            h: ltp,
            l: ltp,
            c: ltp,
          };
          lastPointRef.current = fresh;
          try {
            (series as ISeriesApi<"Candlestick" | "Bar">).update({
              time: fresh.time as Time,
              open: fresh.o,
              high: fresh.h,
              low: fresh.l,
              close: fresh.c,
            });
            ch.timeScale().scrollToRealTime();
          } catch {
            /* ignore */
          }
        } else if (bucket === last.time) {
          last.h = Math.max(last.h, ltp);
          last.l = Math.min(last.l, ltp);
          last.c = ltp;
          try {
            (series as ISeriesApi<"Candlestick" | "Bar">).update({
              time: last.time as Time,
              open: last.o,
              high: last.h,
              low: last.l,
              close: last.c,
            });
          } catch {
            /* ignore */
          }
        }
        return;
      }

      // Line family
      const nowSec = Math.floor(Date.now() / 1000);
      if (last && last.kind !== "value") {
        return;
      }
      if (last && nowSec < last.time) return;

      if (!last || nowSec > last.time) {
        const fresh: LiveState = { kind: "value", time: nowSec, value: ltp };
        lastPointRef.current = fresh;
        try {
          (series as ISeriesApi<"Line" | "Area" | "Baseline">).update({
            time: fresh.time as Time,
            value: fresh.value,
          });
          ch.timeScale().scrollToRealTime();
        } catch {
          /* ignore */
        }
      } else {
        // nowSec === last.time → overwrite the current second.
        last.value = ltp;
        try {
          (series as ISeriesApi<"Line" | "Area" | "Baseline">).update({
            time: last.time as Time,
            value: ltp,
          });
        } catch {
          /* ignore */
        }
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, bars === undefined, isOhlc, resolutionSec]);

  // Strike price-lines for active binaries on this symbol
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    const desired = new Map<string, BinaryActiveMarker>();
    for (const a of active) desired.set(a.id, a);
    const existing = strikeLinesRef.current;
    for (const [id, line] of existing.entries()) {
      if (!desired.has(id)) {
        try {
          series.removePriceLine(line);
        } catch {
          /* ignore — chart may have been disposed */
        }
        existing.delete(id);
      }
    }
    for (const [id, a] of desired.entries()) {
      if (existing.has(id)) continue;
      const colour = a.direction === "HIGHER" ? cssVar("--buy") : cssVar("--sell");
      try {
        const line = series.createPriceLine({
          price: a.strike,
          color: colour,
          lineWidth: 2,
          lineStyle: 2,
          axisLabelVisible: true,
          title: `${a.direction === "HIGHER" ? "▲" : "▼"} strike`,
        });
        existing.set(id, line);
      } catch {
        /* ignore */
      }
    }
  }, [active]);

  const showWaitingHint =
    Array.isArray(bars) && bars.length === 0 && lastPointRef.current === null;

  return (
    <div className="relative h-full w-full">
      <div
        ref={wrapRef}
        className="h-full w-full cursor-grab select-none active:cursor-grabbing"
      />
      {showWaitingHint && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div className="rounded-md border border-border bg-card/80 px-3 py-2 text-xs text-muted-foreground backdrop-blur-sm">
            <div className="font-medium text-foreground">Waiting for the first tick…</div>
            <div className="mt-0.5">
              The chart will start drawing as soon as the live feed updates.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function seedEmptyVisibleRange(ch: IChartApi, resolutionSec: number) {
  const nowSec = Math.floor(Date.now() / 1000);
  const bucket = Math.floor(nowSec / resolutionSec) * resolutionSec;
  try {
    ch.timeScale().setVisibleRange({
      from: (bucket - 50 * resolutionSec) as Time,
      to: (bucket + 5 * resolutionSec) as Time,
    });
  } catch {
    /* ignore */
  }
}
