"use client";

// Phone port of apk src/features/portfolio/screens/PortfolioScreen.tsx
// (+ WalletKpiStrip / TotalPnLCard). Data, live P&L, close / exit / close-all
// and SL/TP logic are the web positions page's (./data, ./logic). Only the
// KPI strip and the total card subscribe to every token; each row
// subscribes to its own, so a tick never re-renders the whole list.

import { memo, useCallback, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { IoCheckmarkDoneOutline, IoClose, IoCloseCircle, IoLayersOutline, IoPulseOutline, IoSearch } from "react-icons/io5";
import { cn } from "@/lib/utils";
import { useMarketStream } from "@/lib/useMarketStream";
import { Button, GradientButton, Screen, Sheet, Tabs, fmt } from "@/components/apk/ui";
import { IllustrationEmpty, SideFilterChips, type SideFilter } from "@/components/apk/orders/shared";
import { useActiveTrades, useClosedPositions, useOpenPositions, usePositionActions, useWalletSummary } from "./data";
import { activeLive, closedSide, holdingMarginFor, isInfowayPosition, positionLive, resolveSide, tokenOf } from "./logic";
import { PositionRow, type RowKind } from "./PositionRow";
import { PositionSheet } from "./PositionSheet";
import { SlTpSheet } from "./SlTpSheet";

type TabKey = "position" | "active" | "closed";
const KIND: Record<TabKey, RowKind> = { position: "position", active: "active", closed: "closed" };

function matchesFilter(r: any, kind: RowKind, f: SideFilter): boolean {
  if (f === "all") return true;
  const side = kind === "closed" ? closedSide(r) : resolveSide(r);
  if (f === "buy") return side === "BUY";
  if (f === "sell") return side === "SELL";
  return Number(r.stop_loss) > 0 || Number(r.target) > 0 || r.close_reason === "SL_HIT" || r.close_reason === "TP_HIT";
}

function uniqueTokens(rows: any[]): string[] {
  return Array.from(new Set(rows.map(tokenOf).filter(Boolean)));
}

export function ApkPositionsScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>("position");
  const [sideFilter, setSideFilter] = useState<SideFilter>("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sheet, setSheet] = useState<{ id: string; kind: "position" | "active" } | null>(null);
  const [slTp, setSlTp] = useState<{ row: any; kind: "position" | "active" } | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [closingAll, setClosingAll] = useState(false);

  const openQ = useOpenPositions();
  const activeQ = useActiveTrades();
  const closedQ = useClosedPositions();
  const actions = usePositionActions();

  const open = openQ.data ?? [];
  const active = activeQ.data ?? [];
  const closed = useMemo(() => closedQ.data?.pages.flatMap((p) => p.items) ?? [], [closedQ.data]);
  const closedTotal = closedQ.data?.pages[0]?.total ?? 0;
  const kind = KIND[tab];

  const rows = useMemo(() => {
    const base = tab === "position" ? open : tab === "active" ? active : closed;
    const q = searchQuery.trim().toUpperCase();
    return base.filter(
      (r) =>
        matchesFilter(r, kind, sideFilter) &&
        (!q || String(r.symbol ?? "").toUpperCase().includes(q) || String(r.exchange ?? "").toUpperCase().includes(q)),
    );
  }, [tab, kind, open, active, closed, sideFilter, searchQuery]);

  const onPress = useCallback(
    (r: any, k: RowKind) => {
      if (k !== "closed" && tokenOf(r)) setSheet({ id: r.id, kind: k });
      else if (k === "closed") router.push(`/positions/${encodeURIComponent(r.id)}`);
    },
    [router],
  );
  const onCloseRow = useCallback(
    (r: any, k: RowKind) => void (k === "active" ? actions.exitActive(r.id) : actions.squareoff(r.id)),
    [actions],
  );
  const onEditSlTp = useCallback((r: any, k: RowKind) => k !== "closed" && setSlTp({ row: r, kind: k }), []);

  function selectTab(k: string) {
    setTab(k as TabKey);
    if (k === "closed") {
      // Same as the web Closed tab: refetch now + once more after commit lag.
      qc.invalidateQueries({ queryKey: ["positions", "closed"] });
      setTimeout(() => qc.invalidateQueries({ queryKey: ["positions", "closed"] }), 1500);
    }
  }

  const q = tab === "position" ? openQ : tab === "active" ? activeQ : closedQ;
  const tabLoading = q.isPending;
  const tabError = q.isError && !q.data;
  const sheetRow = sheet ? (sheet.kind === "position" ? open : active).find((r) => r.id === sheet.id) : undefined;

  return (
    <Screen padded={false}>
      <KpiStrip open={open} />

      <div className="flex items-center justify-between px-4 py-2">
        <h1 className="text-[24px] font-extrabold text-apk-text">Portfolio</h1>
        <div className="flex items-center">
          {tab === "position" && open.length > 0 ? (
            <button
              type="button"
              onClick={() => setConfirmAll(true)}
              disabled={closingAll}
              className="mr-2 flex items-center rounded-full bg-apk-sell px-3 py-[7px] text-[12px] font-bold text-white disabled:opacity-60"
            >
              <IoLayersOutline size={14} className="mr-1" />
              {closingAll ? "Closing…" : "Close All"}
            </button>
          ) : null}
          <button
            type="button"
            aria-label={searchOpen ? "Close search" : "Search positions"}
            onClick={() => {
              if (searchOpen) setSearchQuery("");
              setSearchOpen((v) => !v);
            }}
            className={cn(
              "grid size-[34px] place-items-center rounded-full border",
              searchOpen ? "border-apk-primary bg-apk-primary-dim text-apk-primary" : "border-apk-border bg-apk-elevated text-apk-text",
            )}
          >
            {searchOpen ? <IoClose size={16} /> : <IoSearch size={16} />}
          </button>
        </div>
      </div>

      {/* 3 × 17 px labels overflow a 360 px phone: scroll the strip, never the page. */}
      <div className="apk-no-scrollbar overflow-x-auto px-4 pb-2">
        <Tabs
          className="[&>button]:shrink-0 [&_span]:whitespace-nowrap"
          items={[
            { key: "position", label: `Positions (${open.length})` },
            { key: "active", label: `Active (${active.length})` },
            { key: "closed", label: `Closed (${closedTotal || closed.length})` },
          ]}
          activeKey={tab}
          onChange={selectTab}
        />
      </div>

      {searchOpen ? (
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2 rounded-full border border-apk-border bg-apk-elevated px-3 py-2">
            <IoSearch size={14} className="shrink-0 text-apk-muted" />
            <input
              autoFocus
              aria-label="Search your positions"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search your positions (symbol / exchange)"
              autoCapitalize="characters"
              autoCorrect="off"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-apk-text outline-none placeholder:text-apk-dim"
            />
            {searchQuery ? (
              <button type="button" aria-label="Clear search" onClick={() => setSearchQuery("")} className="text-apk-muted">
                <IoCloseCircle size={16} />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <SideFilterChips active={sideFilter} onChange={setSideFilter} className="pb-2" />

      {rows.length > 0 ? (
        <div className="pt-2">
          <TotalPnL rows={rows} kind={kind} />
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="flex flex-col gap-2.5 pb-8">
          {rows.map((r) => (
            <PositionRow
              key={r.id}
              row={r}
              kind={kind}
              onPress={onPress}
              onClose={kind === "closed" ? undefined : onCloseRow}
              onEditSlTp={kind === "closed" ? undefined : onEditSlTp}
            />
          ))}
          {tab === "closed" && closedQ.hasNextPage ? (
            <div className="flex justify-center px-4 pt-2">
              <Button
                label={closedQ.isFetchingNextPage ? "Loading…" : `Load more (${closed.length} of ${closedTotal})`}
                variant="ghost"
                size="sm"
                disabled={closedQ.isFetchingNextPage}
                onClick={() => closedQ.fetchNextPage()}
              />
            </div>
          ) : null}
        </div>
      ) : tabLoading ? (
        <div className="flex flex-col gap-2.5 px-4">
          {[0.5, 0.38, 0.26].map((o) => (
            <div key={o} className="h-24 rounded-xl bg-apk-elevated" style={{ opacity: o }} />
          ))}
        </div>
      ) : tabError ? (
        <IllustrationEmpty kind="briefcase" title="Couldn't load data" description="Please try again." />
      ) : tab === "active" ? (
        <EmptyHint
          icon={<IoPulseOutline size={26} />}
          title="No active trades"
          hint="Per-fill view of currently-open exposure appears here."
        />
      ) : tab === "closed" ? (
        <EmptyHint
          icon={<IoCheckmarkDoneOutline size={26} />}
          title="No closed positions"
          hint="Squared-off positions will appear here."
        />
      ) : (
        <IllustrationEmpty
          kind="briefcase"
          title="No open positions"
          description="Open positions appear here as soon as you place a trade."
          action={
            <div className="w-[220px]">
              <GradientButton label="Place a trade" onClick={() => router.push("/terminal")} />
            </div>
          }
        />
      )}

      {sheet && sheetRow ? (
        <PositionSheet
          row={sheetRow}
          kind={sheet.kind}
          onClose={() => setSheet(null)}
          onExit={() => {
            onCloseRow(sheetRow, sheet.kind);
            setSheet(null);
          }}
          closeLots={actions.closeLots}
        />
      ) : null}

      <SlTpSheet target={slTp} onClose={() => setSlTp(null)} />

      <Sheet open={confirmAll} onClose={() => setConfirmAll(false)} title="Square off all positions?">
        <div className="pb-2">
          <p className="text-[14px] text-apk-muted">
            This closes{" "}
            <span className="font-semibold text-apk-text">
              all {open.length} open position{open.length === 1 ? "" : "s"}
            </span>{" "}
            at the current market price. This can&apos;t be undone.
          </p>
          <div className="mt-4 flex gap-2">
            <Button label="Cancel" variant="ghost" fullWidth onClick={() => setConfirmAll(false)} />
            <Button
              label="Square off all"
              variant="danger"
              fullWidth
              onClick={async () => {
                setConfirmAll(false);
                setClosingAll(true);
                try {
                  await actions.squareoffAll();
                } finally {
                  setClosingAll(false);
                }
              }}
            />
          </div>
        </div>
      </Sheet>
    </Screen>
  );
}

function EmptyHint({ icon, title, hint }: { icon: ReactNode; title: string; hint: string }) {
  return (
    <div className="mx-4 mt-3 flex flex-col items-center rounded-xl border border-dashed border-apk-border py-5 text-center">
      <span className="text-apk-muted">{icon}</span>
      <div className="mt-1.5 text-[14px] font-semibold text-apk-text">{title}</div>
      <div className="mt-1 px-4 text-[11px] text-apk-muted">{hint}</div>
    </div>
  );
}

/** LEDGER BALANCE | MARGIN AVAILABLE / MARGIN USED | M2M / CF REQUIRED. */
const KpiStrip = memo(function KpiStrip({ open }: { open: any[] }) {
  const { data: wallet } = useWalletSummary();
  const tokens = useMemo(() => uniqueTokens(open), [open]);
  const quotes = useMarketStream(tokens);

  const available = Number(wallet?.available_balance ?? 0);
  const used = Number(wallet?.used_margin ?? 0);
  const ledger = available + used; // web "Balance"
  // Web header M2M: live close-side P&L summed over open positions.
  const m2m = open.reduce((s, p) => s + positionLive(p, quotes.get(tokenOf(p))).pnl, 0);
  // Web "CF Required": overnight margin over non-Infoway positions.
  const cfRequired = useMemo(
    () => open.filter((p) => !isInfowayPosition(p)).reduce((s, p) => s + holdingMarginFor(p), 0),
    [open],
  );

  return (
    <div className="mx-4 mb-2 mt-3 overflow-hidden rounded-xl border border-apk-border bg-apk-elevated">
      <div className="flex">
        <Kpi label="LEDGER BALANCE" value={fmt(ledger)} />
        <div className="w-px bg-apk-border" />
        <Kpi label="MARGIN AVAILABLE" value={fmt(available + m2m)} />
      </div>
      <div className="h-px bg-apk-border" />
      <div className="flex">
        <Kpi label="MARGIN USED" value={fmt(used)} />
        <div className="w-px bg-apk-border" />
        <Kpi label="M2M" value={fmt(m2m)} cls={m2m > 0 ? "text-apk-buy" : m2m < 0 ? "text-apk-sell" : undefined} />
      </div>
      <div className="h-px bg-apk-border" />
      <Kpi label="CF REQUIRED" value={fmt(cfRequired)} cls={cfRequired > ledger ? "text-apk-sell" : undefined} />
    </div>
  );
});

function Kpi({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="min-w-0 flex-1 px-3.5 py-3">
      <div className="text-[10px] font-bold tracking-[0.7px] text-apk-dim">{label}</div>
      <div className={cn("mt-1 truncate text-[17px] font-extrabold tabular-nums text-apk-text", cls)}>{value}</div>
    </div>
  );
}

/** TOTAL P&L of the visible rows — live for open / active, realized for closed. */
const TotalPnL = memo(function TotalPnL({ rows, kind }: { rows: any[]; kind: RowKind }) {
  const tokens = useMemo(() => (kind === "closed" ? [] : uniqueTokens(rows)), [rows, kind]);
  const quotes = useMarketStream(tokens);
  const total = rows.reduce((s, r) => {
    if (kind === "closed") return s + Number(r.realized_pnl ?? 0);
    const tick = quotes.get(tokenOf(r));
    return s + (kind === "active" ? activeLive(r, tick) : positionLive(r, tick)).pnl;
  }, 0);
  return (
    <div className="mx-4 mb-2 flex flex-col items-center gap-1 rounded-xl border border-apk-border bg-apk-elevated py-3.5">
      <div className="text-[11px] font-bold tracking-[0.8px] text-apk-dim">TOTAL P&amp;L</div>
      <div
        className={cn(
          "text-[22px] font-extrabold tabular-nums",
          total > 0 ? "text-apk-buy" : total < 0 ? "text-apk-sell" : "text-apk-muted",
        )}
      >
        {fmt(total)}
      </div>
    </div>
  );
});
