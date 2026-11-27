"use client";

// Port of apk src/features/charts/screens/ChartScreen.tsx (the Trade tab):
// header (back · symbol · Options · search), BuySellBar, ChartInfoBar, the
// licensed TradingView chart, interval bar, and the SHOW / HIDE POSITIONS
// split with live P&L, Close and SL·TP.
//
// Instrument selection mirrors app/(terminal)/terminal/page.tsx: ?token= →
// (apk) last instrument → BTCUSD search → first watchlist quote.

import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  IoArrowBack,
  IoArrowForward,
  IoBriefcaseOutline,
  IoChevronDown,
  IoChevronUp,
  IoClose,
  IoFlagOutline,
  IoOptionsOutline,
  IoSearch,
} from "react-icons/io5";
import { InstrumentAPI, MarketwatchAPI, OptionChainAPI, PositionAPI } from "@/lib/api";
import { useMarketStream } from "@/lib/useMarketStream";
import { playClosedTone } from "@/lib/trade-audio";
import { cn } from "@/lib/utils";
import { useApkTheme } from "@/components/apk/ApkShell";
import { Button, Input, Sheet, Spinner, fmt } from "@/components/apk/ui";
import { BuySellBar } from "./BuySellBar";
import { ChartInfoBar } from "./ChartInfoBar";
import { chainUnderlying, isOptionable, useOrderTicket } from "./useOrderTicket";
import { getLastInstrument, setLastInstrument } from "./lastInstrument";

const TradingViewChart = dynamic(
  () => import("@/components/trading/TradingViewChart").then((m) => m.TradingViewChart),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full place-items-center text-apk-muted">
        <Spinner />
      </div>
    ),
  },
);

const CHART_INTERVALS = [
  { id: "1", label: "1m" },
  { id: "5", label: "5m" },
  { id: "15", label: "15m" },
  { id: "60", label: "1h" },
  { id: "1D", label: "1D" },
] as const;
type ChartInterval = (typeof CHART_INTERVALS)[number]["id"];

// Same poll cadence as the terminal page: 2 s, widened to 3.5 s for ~3 s
// after an optimistic update so a stale read can't wipe the new row.
const livePollInterval = (query: any) => {
  const last = (query?.state?.dataUpdatedAt as number) || 0;
  return Date.now() - last < 3000 ? 3500 : 2000;
};

export function ApkChartScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const theme = useApkTheme();

  // ── Selected instrument (terminal page logic) ──
  const searchParams = useSearchParams();
  const urlToken = searchParams?.get("token") || null;
  const [selectedToken, setSelectedToken] = useState<string | null>(urlToken ?? getLastInstrument());

  useEffect(() => {
    if (urlToken && urlToken !== selectedToken) setSelectedToken(urlToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlToken]);

  // Watchlist is only the last-resort fallback, so only fetched while empty.
  const { data: watchlists } = useQuery({
    queryKey: ["watchlists"],
    queryFn: () => MarketwatchAPI.list(),
    enabled: !selectedToken,
  });
  const activeWl = watchlists?.[0];
  const { data: wlQuotes } = useQuery({
    queryKey: ["watchlist-quotes", activeWl?.id],
    queryFn: () => MarketwatchAPI.quotes(activeWl!.id),
    enabled: !selectedToken && !!activeWl?.id,
  });

  useEffect(() => {
    if (selectedToken) return;
    let cancelled = false;
    (async () => {
      try {
        const found = await InstrumentAPI.search("BTCUSD", undefined, undefined, 1);
        if (!cancelled && found && found[0]?.token) {
          setSelectedToken(found[0].token);
          return;
        }
      } catch {
        // fall through
      }
      if (!cancelled && wlQuotes && wlQuotes.length > 0) setSelectedToken(wlQuotes[0].instrument_token);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedToken, wlQuotes]);

  useEffect(() => {
    if (selectedToken) setLastInstrument(selectedToken);
  }, [selectedToken]);

  const t = useOrderTicket(selectedToken, "BUY");
  const instrument = t.instrument;

  // Lots seeded from admin settings once per instrument; edits stick.
  const [lots, setLots] = useState("");
  const seededFor = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedToken || !t.settingsReady || seededFor.current === selectedToken) return;
    seededFor.current = selectedToken;
    setLots(String(t.defaultLot));
  }, [selectedToken, t.settingsReady, t.defaultLot]);

  const [chartInterval, setChartInterval] = useState<ChartInterval>("5");
  const [panelOpen, setPanelOpen] = useState(false);

  // ── Header labels ──
  const seg = String(instrument?.segment ?? "").toUpperCase();
  const exch = String(instrument?.exchange ?? "").toUpperCase();
  const isDerivative = seg.includes("FUTURE") || seg.includes("OPTION");
  const display = instrument?.symbol ?? (selectedToken ? "…" : "—");
  const subtitle = !instrument
    ? ""
    : isDerivative && instrument.name
      ? `${instrument.name} · live`
      : `${exch}:${instrument.symbol}`;
  const segmentTag = t.isCrypto ? "CRYPTO" : t.isForex ? "FOREX" : exch || undefined;
  const source = t.quote?.source ? String(t.quote.source).toUpperCase() : undefined;
  const intervalLabel = chartInterval === "1D" ? "1D" : chartInterval === "60" ? "1h" : `${chartInterval}m`;

  const optionable = isOptionable(instrument);
  const underlying = chainUnderlying(instrument);

  // Warm the option chain the Options pill opens (apk prefetch).
  useEffect(() => {
    if (!optionable || !underlying) return;
    void qc.prefetchQuery({
      queryKey: ["option-chain", underlying, undefined],
      queryFn: () => OptionChainAPI.fetch(underlying),
      staleTime: 2_500,
    });
  }, [optionable, underlying, qc]);

  function openOptions() {
    if (!optionable) {
      toast.warning(`Options not available for ${display}`, { duration: 2000 });
      return;
    }
    router.push(`/option-chain?underlying=${encodeURIComponent(underlying)}`);
  }

  return (
    <div className="flex h-[calc(100dvh-var(--apk-tabbar,0px))] flex-col overflow-hidden bg-apk-bg">
      <div className="flex items-center gap-2.5 border-b border-apk-border bg-apk-bg px-3.5 py-2.5">
        <button
          type="button"
          aria-label="Back"
          onClick={() => (window.history.length > 1 ? router.back() : router.push("/dashboard"))}
          className="-m-1 p-1 text-apk-text"
        >
          <IoArrowBack size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[17px] font-semibold text-apk-text">{display}</div>
          <div className="truncate text-[11px] text-apk-muted">{subtitle}</div>
        </div>
        <button
          type="button"
          onClick={openOptions}
          className="flex items-center gap-1 rounded-full border border-apk-border bg-apk-elevated px-2 py-1 text-apk-text"
        >
          <IoOptionsOutline size={14} />
          <span className="text-[11px] font-semibold">Options</span>
        </button>
        <Link href="/marketwatch" aria-label="Search instruments" className="-m-1 p-1 text-apk-text">
          <IoSearch size={20} />
        </Link>
      </div>

      <BuySellBar t={t} lots={lots} onLotsChange={setLots} />

      <ChartInfoBar t={t} symbol={display} interval={intervalLabel} segment={segmentTag} source={source} />

      <div className="relative min-h-0 flex-1">
        {selectedToken ? (
          <TradingViewChart
            token={selectedToken}
            symbol={instrument?.symbol}
            interval={chartInterval}
            theme={theme}
            paneBg="#0d0d0d"
            quote={t.tick ?? null}
          />
        ) : (
          <div className="grid h-full place-items-center text-apk-muted">
            <Spinner />
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-1.5 border-t border-apk-border bg-apk-bg py-2">
        {CHART_INTERVALS.map((iv) => {
          const active = iv.id === chartInterval;
          return (
            <button
              key={iv.id}
              type="button"
              aria-pressed={active}
              onClick={() => setChartInterval(iv.id)}
              className={cn(
                "rounded-md px-3 py-[5px] text-[11px]",
                active ? "bg-apk-elevated font-bold text-apk-primary" : "font-medium text-apk-muted",
              )}
            >
              {iv.label}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        aria-expanded={panelOpen}
        onClick={() => setPanelOpen((v) => !v)}
        className={cn(
          "flex items-center justify-center gap-1.5 border-t border-apk-border bg-apk-elevated py-1.5 text-apk-muted",
          panelOpen && "border-b",
        )}
      >
        {panelOpen ? <IoChevronDown size={16} /> : <IoChevronUp size={16} />}
        <span className="text-[11px] font-bold tracking-[0.6px]">{panelOpen ? "HIDE POSITIONS" : "SHOW POSITIONS"}</span>
      </button>

      {panelOpen ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <PositionsPanel />
        </div>
      ) : null}
    </div>
  );
}

// Same 25 %-of-LTP junk-depth guard as the terminal page's live overlay.
function closeSidePrice(p: any, live: any): number {
  const qty = Number(p.quantity);
  const liveLtp = Number(live?.ltp ?? 0) || Number(p.ltp) || 0;
  const raw = Number((qty > 0 ? live?.bid : live?.ask) ?? 0);
  const near = raw > 0 && (!(liveLtp > 0) || Math.abs(raw - liveLtp) / liveLtp <= 0.25);
  return near ? raw : liveLtp;
}

function isBenignCloseError(e: any): boolean {
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

const PositionsPanel = memo(function PositionsPanel() {
  const qc = useQueryClient();
  const { data: positions, isLoading } = useQuery<any[]>({
    queryKey: ["positions", "open"],
    queryFn: () => PositionAPI.open(),
    refetchInterval: livePollInterval,
  });
  const rows = positions ?? [];
  const tokens = useMemo(
    () => Array.from(new Set(rows.map((p) => String(p?.instrument_token ?? p?.token ?? "")).filter(Boolean))),
    [rows],
  );
  const live = useMarketStream(tokens);
  const [editing, setEditing] = useState<any | null>(null);

  // Copy of PositionsTabs.squareoff (optimistic removal, no positions refetch).
  const squareoff = useCallback((id: string, symbol: string) => {
    playClosedTone();
    qc.cancelQueries({ queryKey: ["positions", "open"] });
    qc.cancelQueries({ queryKey: ["active-trades"] });
    const posSnapshot = qc.getQueryData<any[]>(["positions", "open"]);
    const tradesSnapshot = qc.getQueryData<any[]>(["active-trades"]);
    qc.setQueryData<any[]>(["positions", "open"], (old) => (Array.isArray(old) ? old.filter((p) => p.id !== id) : []));
    qc.setQueryData<any[]>(["active-trades"], (old) =>
      Array.isArray(old) ? old.filter((tr) => tr.position_id !== id) : [],
    );
    const pendingToastId = toast.success(`Closed ${symbol} at market`, { duration: 1500 });
    PositionAPI.squareoff(id)
      .then(() => {
        qc.invalidateQueries({ queryKey: ["orders"] });
        qc.invalidateQueries({ queryKey: ["wallet"] });
        qc.invalidateQueries({ queryKey: ["positions", "closed"] });
        setTimeout(() => qc.invalidateQueries({ queryKey: ["positions", "closed"] }), 1500);
      })
      .catch((e: any) => {
        if (isBenignCloseError(e)) {
          qc.invalidateQueries({ queryKey: ["positions", "open"] });
          qc.invalidateQueries({ queryKey: ["active-trades"] });
          qc.invalidateQueries({ queryKey: ["positions", "closed"] });
          qc.invalidateQueries({ queryKey: ["wallet"] });
          return;
        }
        toast.dismiss(pendingToastId);
        if (posSnapshot) qc.setQueryData(["positions", "open"], posSnapshot);
        if (tradesSnapshot) qc.setQueryData(["active-trades"], tradesSnapshot);
        toast.error(e.message || "Failed");
      });
  }, [qc]);

  if (isLoading && rows.length === 0) {
    return <div className="grid h-full place-items-center py-6 text-[12px] text-apk-muted">Loading positions…</div>;
  }
  if (rows.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1.5 py-6">
        <IoBriefcaseOutline size={26} className="text-apk-dim" />
        <span className="text-[12px] text-apk-muted">No open positions</span>
        <Link href="/positions" className="mt-0.5 text-[11px] font-bold text-apk-primary">
          Go to Portfolio →
        </Link>
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-center justify-between bg-apk-bg px-3.5 py-2">
        <span className="text-[11px] font-extrabold tracking-[0.6px] text-apk-text">OPEN POSITIONS · {rows.length}</span>
        <Link href="/positions" className="text-[11px] font-bold text-apk-primary">
          View all →
        </Link>
      </div>
      <div className="flex flex-col gap-2 px-3 pb-3">
        {rows.map((p) => (
          <LivePositionRow
            key={p.id}
            position={p}
            live={live.get(String(p?.instrument_token ?? p?.token ?? ""))}
            onClose={squareoff}
            onEditSlTp={setEditing}
          />
        ))}
      </div>
      {editing ? <SlTpSheet position={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
});

// Port of apk portfolio/components/PositionRowV2 (open rows).
const LivePositionRow = memo(function LivePositionRow({
  position: p,
  live,
  onClose,
  onEditSlTp,
}: {
  position: any;
  live: any;
  onClose: (id: string, symbol: string) => void;
  onEditSlTp: (position: any) => void;
}) {
  const router = useRouter();
  const qty = Number(p.quantity) || 0;
  const isBuy = qty > 0;
  const avg = Number(p.avg_price) || 0;
  const ltp = live ? closeSidePrice(p, live) : Number(p.ltp) || 0;
  const pnl = live && ltp && Number.isFinite(avg) ? (ltp - avg) * qty : Number(p.unrealized_pnl) || 0;
  const pnlTone = pnl > 0 ? "text-apk-buy" : pnl < 0 ? "text-apk-sell" : "text-apk-text";
  const deltaPct = avg > 0 ? ((ltp - avg) / avg) * 100 : 0;
  const lotSize = Number(p.lot_size) || 0;
  const absQty = Math.abs(qty);
  const qtyLabel = lotSize > 1 ? `${+(absQty / lotSize).toFixed(2)}L · ${absQty}` : `×${absQty}`;
  const time = p.opened_at
    ? new Date(p.opened_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })
    : "";
  const isOpen = String(p.status ?? "OPEN").toUpperCase() === "OPEN";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push("/positions")}
      onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && router.push("/positions")}
      className="flex overflow-hidden rounded-xl border border-apk-border bg-apk-elevated"
    >
      <div className={cn("w-[3px]", isBuy ? "bg-apk-buy" : "bg-apk-sell")} />
      <div className="flex min-w-0 flex-1 flex-col gap-2.5 px-3.5 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span
              className={cn(
                "rounded px-[7px] py-[3px] text-[10px] font-extrabold tracking-[0.7px]",
                isBuy ? "bg-apk-buy-dim text-apk-buy" : "bg-apk-sell-dim text-apk-sell",
              )}
            >
              {isBuy ? "BUY" : "SELL"}
            </span>
            <span className="truncate text-[16px] font-bold text-apk-text">{p.symbol}</span>
            <span className="shrink-0 rounded bg-apk-surface px-1.5 py-px text-[10px] font-bold tabular-nums text-apk-muted">
              {qtyLabel}
            </span>
          </div>
          <span className={cn("shrink-0 text-[16px] font-extrabold tabular-nums", pnlTone)}>
            {pnl > 0 ? "+" : ""}
            {fmt(pnl)}
          </span>
        </div>

        <div className="flex items-center rounded-lg bg-apk-surface px-3 py-[9px]">
          <div className="flex-1">
            <div className="text-[10px] font-semibold tracking-[0.5px] text-apk-muted">ENTRY</div>
            <div className="mt-[3px] text-[14px] font-bold tabular-nums text-apk-text">{fmt(avg)}</div>
          </div>
          <IoArrowForward size={13} className="mx-2.5 text-apk-dim" />
          <div className="flex flex-1 flex-col items-end">
            <div className="text-[10px] font-semibold tracking-[0.5px] text-apk-muted">{isBuy ? "BID" : "ASK"}</div>
            <div className="mt-[3px] flex items-baseline">
              <span className={cn("text-[14px] font-bold tabular-nums", pnlTone)}>{fmt(ltp)}</span>
              {avg > 0 ? (
                <span className={cn("ml-[5px] text-[11px] font-semibold tabular-nums", pnlTone)}>
                  {deltaPct >= 0 ? "+" : ""}
                  {fmt(deltaPct)}%
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center text-[11px] font-medium text-apk-muted">
            <span className="truncate">{p.exchange ?? "—"}</span>
            {time ? (
              <>
                <span className="mx-1.5 text-apk-dim">·</span>
                <span className="tabular-nums">{time}</span>
              </>
            ) : null}
          </div>
          {isOpen ? (
            <div className="flex items-center gap-1.5">
              <RowAction label="SL · TP" tone="primary" icon={<IoFlagOutline size={12} />} onClick={() => onEditSlTp(p)} />
              <RowAction label="CLOSE" tone="sell" icon={<IoClose size={12} />} onClick={() => onClose(p.id, p.symbol)} />
            </div>
          ) : null}
        </div>

        {isOpen && (p.stop_loss || p.target) ? (
          <div className="flex gap-1.5">
            {p.stop_loss ? <SlTpChip label="SL" value={Number(p.stop_loss)} tone="sell" /> : null}
            {p.target ? <SlTpChip label="TP" value={Number(p.target)} tone="buy" /> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
});

function RowAction({
  label,
  icon,
  tone,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  tone: "primary" | "sell";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "flex h-[26px] items-center gap-1 rounded-md px-2.5 text-[10px] font-extrabold tracking-[0.5px]",
        tone === "primary" ? "bg-apk-primary-dim text-apk-primary" : "bg-apk-sell-dim text-apk-sell",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function SlTpChip({ label, value, tone }: { label: string; value: number; tone: "buy" | "sell" }) {
  return (
    <span
      className={cn(
        "rounded px-2 py-0.5 text-[10px] font-bold tabular-nums",
        tone === "buy" ? "bg-apk-buy-dim text-apk-buy" : "bg-apk-sell-dim text-apk-sell",
      )}
    >
      {label} {fmt(value)}
    </span>
  );
}

// SL / TP editor — same endpoint + payload as PositionsTabs' EditSlTpDialog.
function SlTpSheet({ position, onClose }: { position: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [sl, setSl] = useState(position.stop_loss ? String(Number(position.stop_loss)) : "");
  const [tp, setTp] = useState(position.target ? String(Number(position.target)) : "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await PositionAPI.updateSlTp(position.id, {
        stop_loss: sl ? Number(sl) : null,
        target: tp ? Number(tp) : null,
      });
      toast.success("SL / TP updated");
      qc.invalidateQueries({ queryKey: ["positions"] });
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open onClose={onClose} title={`SL · TP — ${position.symbol}`}>
      <div className="flex flex-col gap-3 pb-2">
        <Input
          label="Stop loss"
          inputMode="decimal"
          value={sl}
          placeholder="Not set"
          onChange={(e) => setSl(e.target.value.replace(/[^\d.]/g, ""))}
        />
        <Input
          label="Target"
          inputMode="decimal"
          value={tp}
          placeholder="Not set"
          onChange={(e) => setTp(e.target.value.replace(/[^\d.]/g, ""))}
        />
        <div className="mt-1 flex gap-2">
          <Button label="Cancel" variant="ghost" className="flex-1" onClick={onClose} disabled={saving} />
          <Button label="Save" className="flex-1" loading={saving} onClick={save} />
        </div>
      </div>
    </Sheet>
  );
}
