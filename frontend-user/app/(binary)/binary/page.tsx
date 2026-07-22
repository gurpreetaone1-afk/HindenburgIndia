"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CandlestickChart, ChevronDown, History, ListChecks } from "lucide-react";
import { BinaryAPI } from "@/lib/api";
import { BinaryAssetList } from "@/components/binary/BinaryAssetList";
import { BinaryAssetPickerDialog } from "@/components/binary/BinaryAssetPickerDialog";
import {
  BINARY_CHART_TYPES,
  BinaryChart,
  type BinaryActiveMarker,
  type BinaryChartType,
} from "@/components/binary/BinaryChart";
import { BinaryTradePanel } from "@/components/binary/BinaryTradePanel";
import { BinaryActiveDock } from "@/components/binary/BinaryActiveDock";
import { BinaryHistoryTab } from "@/components/binary/BinaryHistoryTab";
import { cn } from "@/lib/utils";

const CHART_TYPE_STORAGE_KEY = "stock4x.binary.chartType";

function isChartType(v: unknown): v is BinaryChartType {
  return (
    typeof v === "string" &&
    BINARY_CHART_TYPES.some((t) => t.value === v)
  );
}

/** Custom resolutions exposed in the chart toolbar. Match the backend's
 *  `binary_candle_aggregator.RESOLUTIONS_SEC` so we never request a
 *  bucket the server doesn't persist. */
const RESOLUTION_CHIPS: { sec: number; label: string }[] = [
  { sec: 10, label: "10s" },
  { sec: 30, label: "30s" },
  { sec: 60, label: "1m" },
  { sec: 120, label: "2m" },
  { sec: 180, label: "3m" },
  { sec: 300, label: "5m" },
  { sec: 600, label: "10m" },
  { sec: 900, label: "15m" },
  { sec: 1800, label: "30m" },
  { sec: 3600, label: "1h" },
];

/** Fallback asset list before settings load — the cfg.enabled_assets
 *  field is the authoritative pool (admin-controlled). */
const FALLBACK_ASSETS = [
  "EURUSD", "USDJPY", "GBPUSD", "AUDUSD", "USDCAD", "USDCHF",
  "BTCUSDT", "ETHUSDT", "XAUUSD", "XAGUSD",
];

export default function BinaryTradingPage() {
  const [selected, setSelected] = useState<string>("");
  const [resolution, setResolution] = useState<number>(60);
  const [bottomTab, setBottomTab] = useState<"active" | "history">("active");
  const [previewStrike, setPreviewStrike] = useState<number | null>(null);
  // Chart-type picker — hydrated from localStorage on mount so the
  // trader's preference survives reloads. Default to "line" since
  // that's the Pocket Option-style live tape the user asked for.
  const [chartType, setChartTypeState] = useState<BinaryChartType>("line");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(CHART_TYPE_STORAGE_KEY);
    if (isChartType(raw)) setChartTypeState(raw);
  }, []);

  const setChartType = (next: BinaryChartType) => {
    setChartTypeState(next);
    try {
      window.localStorage.setItem(CHART_TYPE_STORAGE_KEY, next);
    } catch {
      /* private mode / quota — non-fatal */
    }
  };

  // Global cfg — gives us the admin-controlled `enabled_assets` pool
  // and a snapshot of `global_enabled` for the disabled banner.
  const { data: globalCfg } = useQuery({
    queryKey: ["binary", "settings", ""],
    queryFn: () => BinaryAPI.settings(),
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  const assets: string[] = useMemo(() => {
    const list = (globalCfg?.enabled_assets as string[] | undefined) ?? FALLBACK_ASSETS;
    return list.filter(Boolean);
  }, [globalCfg]);

  // Auto-pick first asset once we know the enabled pool.
  useEffect(() => {
    if (!selected && assets.length > 0) {
      setSelected(assets[0]);
    } else if (selected && assets.length > 0 && !assets.includes(selected)) {
      // Admin removed the previously-selected asset from the whitelist.
      setSelected(assets[0]);
    }
  }, [assets, selected]);

  // Active binaries for the strike overlays on the chart — only the
  // ones on the currently-selected symbol get drawn. We ALSO use the
  // length below to badge the Active tab on mobile so the count is
  // visible without expanding the dock.
  const { data: activeAll } = useQuery({
    queryKey: ["binary", "active"],
    queryFn: () => BinaryAPI.active(),
    refetchInterval: 5000,
    refetchOnWindowFocus: false,
  });

  const activeMarkers: BinaryActiveMarker[] = useMemo(() => {
    return ((activeAll ?? []) as any[])
      .filter((b) => b.symbol === selected)
      .map((b) => ({
        id: b.id,
        strike: Number(b.strike_price),
        expirySec: Math.floor(new Date(b.expiry_at).getTime() / 1000),
        direction: b.direction as "HIGHER" | "LOWER",
      }))
      .filter((m) => Number.isFinite(m.strike));
  }, [activeAll, selected]);

  const activeCount = (activeAll ?? []).length;
  const shortSelected = selected ? selected.replace(/_[A-Z]+$/, "") : "—";

  // Tabs row — extracted because both desktop and mobile share it.
  const tabsRow = (
    <div className="flex items-center gap-1 border-b border-border px-2">
      <button
        type="button"
        onClick={() => setBottomTab("active")}
        className={cn(
          "flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors",
          bottomTab === "active"
            ? "border-primary text-primary"
            : "border-transparent text-muted-foreground hover:text-foreground"
        )}
      >
        <ListChecks className="size-3.5" /> Active
        {activeCount > 0 && (
          <span className="ml-0.5 inline-block rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
            {activeCount}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={() => setBottomTab("history")}
        className={cn(
          "flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors",
          bottomTab === "history"
            ? "border-primary text-primary"
            : "border-transparent text-muted-foreground hover:text-foreground"
        )}
      >
        <History className="size-3.5" /> History
      </button>
    </div>
  );

  const resolutionChips = (extraClass?: string) => (
    <div
      className={cn(
        "flex flex-nowrap gap-1 overflow-x-auto scrollbar-thin",
        extraClass
      )}
    >
      {RESOLUTION_CHIPS.map((r) => (
        <button
          key={r.sec}
          type="button"
          onClick={() => setResolution(r.sec)}
          className={cn(
            "h-7 shrink-0 rounded-md border px-2 text-[11px] font-medium transition-colors",
            resolution === r.sec
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-accent"
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  );

  // Hard gate: if binary isn't available to this user (global off, per-user
  // off, or their admin/broker pool isn't enabled), never render the trading
  // UI — even on direct /binary navigation. The nav entries are already
  // hidden; this covers bookmarks / history.
  if (globalCfg && (globalCfg as any).available === false) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Binary trading is not available for your account.
        </p>
        <a href="/dashboard" className="text-sm text-primary underline">
          Back to dashboard
        </a>
      </div>
    );
  }

  return (
    <>
      {/* ── Desktop layout (≥ md): three-column grid ───────────────
         No negative margins anymore — the (binary) route group's
         layout is full-bleed (no dashboard padding to escape from). */}
      <div className="hidden h-full flex-col md:flex">
        <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-1 md:grid-cols-[220px_1fr_300px]">
          <div className="flex min-h-0 flex-col border-r border-border bg-card">
            <BinaryAssetList
              assets={assets}
              selected={selected}
              onSelect={setSelected}
            />
          </div>

          <div className="flex min-h-0 min-w-0 flex-col">
            <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2">
              <div className="text-sm font-semibold">{shortSelected}</div>
              <ChartTypePicker value={chartType} onChange={setChartType} />
              <div className="ml-auto">{resolutionChips()}</div>
            </div>

            <div className="min-h-0 flex-1 bg-card">
              {selected ? (
                <BinaryChart
                  symbol={selected}
                  resolutionSec={resolution}
                  active={activeMarkers}
                  chartType={chartType}
                  previewStrike={previewStrike}
                />
              ) : (
                <div className="grid h-full place-items-center text-xs text-muted-foreground">
                  Select an asset to begin
                </div>
              )}
            </div>

            <div className="flex h-56 flex-col border-t border-border bg-card">
              {tabsRow}
              <div className="min-h-0 flex-1">
                {bottomTab === "active" ? (
                  <BinaryActiveDock onSelectSymbol={setSelected} />
                ) : (
                  <BinaryHistoryTab />
                )}
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-col overflow-y-auto border-l border-border bg-card">
            {selected && (
              <BinaryTradePanel
                symbol={selected}
                onPreviewChange={setPreviewStrike}
              />
            )}
          </div>
        </div>
      </div>

      {/* ── Mobile layout (< md): stacked, asset picker in a sheet ─
          Total viewport budget: 100vh − topbar (3.5) − bottomnav (~3.5)
          ≈ calc(100vh-7rem). We give:
            ~40 px  toolbar (asset + resolution chips share one row)
            ~46vh   chart
            auto    trade panel (chips + stake + action buttons)
            ~28vh   bottom dock (active / history tabs)
          The page is laid out as a column with `overflow-y-auto` on the
          dock so the active list scrolls but the trade panel & chart
          stay anchored. */}
      <div className="flex flex-col md:hidden">
        {/* Toolbar — asset picker button + resolution chips. The
            binary layout's header is sticky at top:0 (h-12 = 3rem),
            so we offset the toolbar's sticky position to sit just
            below it. */}
        <div className="sticky top-12 z-10 flex items-center gap-2 border-b border-border bg-card px-2 py-2">
          <BinaryAssetPickerDialog
            assets={assets}
            selected={selected}
            onSelect={setSelected}
            trigger={
              <button
                type="button"
                className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-semibold"
              >
                {shortSelected}
                <ChevronDown className="size-3 text-muted-foreground" />
              </button>
            }
          />
          <ChartTypePicker
            value={chartType}
            onChange={setChartType}
            compact
          />
          {resolutionChips("ml-auto max-w-[calc(100vw-10rem)]")}
        </div>

        {/* Chart — fixed proportion of the available viewport */}
        <div className="h-[46vh] bg-card">
          {selected ? (
            <BinaryChart
              symbol={selected}
              resolutionSec={resolution}
              active={activeMarkers}
              chartType={chartType}
              previewStrike={previewStrike}
            />
          ) : (
            <div className="grid h-full place-items-center text-xs text-muted-foreground">
              Select an asset to begin
            </div>
          )}
        </div>

        {/* Trade panel — compact mode tightens vertical rhythm so the
            HIGHER / LOWER buttons sit above the fold on a 360×800 phone */}
        <div className="border-t border-border bg-card">
          {selected && (
            <BinaryTradePanel
              symbol={selected}
              compact
              onPreviewChange={setPreviewStrike}
            />
          )}
        </div>

        {/* Bottom dock — Active / History tabs. Reuses the same tab row
            so the active-count badge from the desktop dock follows over. */}
        <div className="flex flex-col border-t border-border bg-card">
          {tabsRow}
          <div className="max-h-[28vh] min-h-[120px] overflow-y-auto scrollbar-thin">
            {bottomTab === "active" ? (
              <BinaryActiveDock onSelectSymbol={setSelected} />
            ) : (
              <BinaryHistoryTab />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Chart-type picker — small button-styled native `<select>` so we don't
 * have to pull in a Radix dropdown for one widget. Native select is
 * keyboard / a11y-correct for free, and on mobile it triggers the OS
 * picker wheel which is exactly the right affordance.
 */
function ChartTypePicker({
  value,
  onChange,
  compact = false,
}: {
  value: BinaryChartType;
  onChange: (next: BinaryChartType) => void;
  compact?: boolean;
}) {
  return (
    <label
      className={cn(
        "relative inline-flex items-center gap-1 rounded-md border border-border bg-background text-xs font-medium text-foreground",
        compact ? "h-7 px-1.5" : "h-7 px-2"
      )}
      title="Chart style"
    >
      <CandlestickChart className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="hidden truncate sm:inline">
        {BINARY_CHART_TYPES.find((t) => t.value === value)?.label ?? "Line"}
      </span>
      <ChevronDown className="size-3 text-muted-foreground" />
      <select
        aria-label="Chart style"
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          if (isChartType(next)) onChange(next);
        }}
        className="absolute inset-0 cursor-pointer appearance-none opacity-0"
      >
        {BINARY_CHART_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
    </label>
  );
}
