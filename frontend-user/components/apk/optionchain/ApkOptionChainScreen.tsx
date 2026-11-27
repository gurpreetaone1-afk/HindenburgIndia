"use client";

// Port of apk src/features/trade/screens/OptionChainScreen.tsx — header
// (underlying · live dot · spot), strike search, underlying chips, expiry
// pill, CE | STRIKE | PE list with ATM highlight + tick flash. Data: the
// web's OptionChainAPI with the same keys (["option-chain-config"],
// ["option-chain", underlying, expiry]) + the shared market WebSocket.
// Leg tap → order ticket; strike tap → chart (/terminal?token=).

import { memo, useCallback, useEffect, useMemo, useRef, useState, type Ref } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  IoAlertCircleOutline,
  IoArrowBack,
  IoCalendarOutline,
  IoChevronDown,
  IoChevronUp,
  IoCloseCircle,
  IoCubeOutline,
  IoSearch,
} from "react-icons/io5";
import { OptionChainAPI } from "@/lib/api";
import { useMarketStream } from "@/lib/useMarketStream";
import { usePriceFlash } from "@/lib/usePriceFlash";
import { cn } from "@/lib/utils";
import { Spinner, fmt } from "@/components/apk/ui";
import { useApkTradeSheet } from "@/components/apk/trade/TradeSheetProvider";
import { normaliseUnderlying } from "@/components/apk/trade/useOrderTicket";

// useMarketStream caps a connection at 70 tokens; stream the strikes nearest
// ATM, the 1 s REST poll covers the rest (same budget as MobileOptionChain).
const MAX_CHAIN_STREAM = 60;

const FALLBACK_UNDERLYINGS = [
  { label: "Nifty", symbol: "NIFTY", color: "#2DD4BF" },
  { label: "BankNifty", symbol: "BANKNIFTY", color: "#A855F7" },
  { label: "FinNifty", symbol: "FINNIFTY", color: "#2DD4BF" },
  { label: "Sensex", symbol: "SENSEX", color: "#60A5FA" },
];

// Admin config stores Tailwind-ish colour names.
const NAMED: Record<string, string> = {
  emerald: "#10B981",
  violet: "#8B5CF6",
  rose: "#F43F5E",
  sky: "#0EA5E9",
  amber: "#F59E0B",
  teal: "#2DD4BF",
  purple: "#A855F7",
  blue: "#60A5FA",
};

function fmtExpiry(iso: string, short = false): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", short ? { day: "2-digit", month: "short" } : { day: "2-digit", month: "short", year: "numeric" });
}

export function ApkOptionChainScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [underlying, setUnderlying] = useState(() => normaliseUnderlying(searchParams?.get("underlying") || "NIFTY"));
  const [expiry, setExpiry] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [showExpiryPicker, setShowExpiryPicker] = useState(false);

  const { data: cfg } = useQuery<any>({
    queryKey: ["option-chain-config"],
    queryFn: () => OptionChainAPI.config(),
    staleTime: 60_000,
  });
  const chain = useQuery<any>({
    queryKey: ["option-chain", underlying, expiry],
    queryFn: () => OptionChainAPI.fetch(underlying, expiry),
    refetchInterval: 1000,
    placeholderData: keepPreviousData,
  });

  const underlyings: { label: string; symbol: string; color?: string }[] =
    Array.isArray(cfg?.underlyings) && cfg.underlyings.length > 0 ? cfg.underlyings : FALLBACK_UNDERLYINGS;

  const data = chain.data;
  const expiries: string[] = data?.expiries ?? [];
  const activeExpiry: string | null = expiry ?? data?.expiry ?? expiries[0] ?? null;
  const allRows: any[] = data?.rows ?? [];
  const marketOpen = data?.market_open !== false;
  const spot: number | null = data?.spot ?? data?.atm_spot ?? null;
  const atmStrike: number | null = data?.atm_strike ?? null;

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? allRows.filter((r) => String(r.strike).toLowerCase().includes(q)) : allRows;
  }, [allRows, search]);

  const atmIdx = useMemo(() => {
    if (rows.length === 0) return -1;
    if (atmStrike != null) {
      const i = rows.findIndex((r) => r.strike === atmStrike);
      if (i >= 0) return i;
    }
    return Math.floor(rows.length / 2);
  }, [rows, atmStrike]);

  // Live overlay — strikes nearest ATM first, capped.
  const streamTokens = useMemo(() => {
    const ref = atmStrike ?? allRows[Math.floor(allRows.length / 2)]?.strike ?? 0;
    const sorted = [...allRows].sort((a, b) => Math.abs(a.strike - ref) - Math.abs(b.strike - ref));
    const out: string[] = [];
    for (const r of sorted) {
      if (r.ce?.token) out.push(String(r.ce.token));
      if (r.pe?.token) out.push(String(r.pe.token));
      if (out.length >= MAX_CHAIN_STREAM) break;
    }
    return out.slice(0, MAX_CHAIN_STREAM).sort();
  }, [allRows, atmStrike]);
  const live = useMarketStream(streamTokens);

  // Reset expiry when the underlying changes.
  const prevUnderlying = useRef(underlying);
  useEffect(() => {
    if (prevUnderlying.current !== underlying) {
      setExpiry(undefined);
      prevUnderlying.current = underlying;
    }
  }, [underlying]);

  // Centre the ATM row once per chain (underlying / expiry), like the app's
  // initialScrollIndex.
  const atmRef = useRef<HTMLDivElement | null>(null);
  const hasRows = rows.length > 0;
  useEffect(() => {
    if (hasRows && !search && !chain.isPlaceholderData) atmRef.current?.scrollIntoView({ block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [underlying, activeExpiry, hasRows, chain.isPlaceholderData]);

  const isInitialLoad = chain.isLoading && allRows.length === 0;
  const openChart = useCallback(
    (tok: string) => tok && router.push(`/terminal?token=${encodeURIComponent(tok)}`),
    [router],
  );

  return (
    <div className="flex h-[calc(100dvh-var(--apk-tabbar,0px))] flex-col bg-apk-bg">
      {/* Header */}
      <div className="flex items-center px-3 py-2.5">
        <button
          type="button"
          aria-label="Back"
          onClick={() => (window.history.length > 1 ? router.back() : router.push("/dashboard"))}
          className="-m-1 p-1 text-apk-text"
        >
          <IoArrowBack size={22} />
        </button>
        <div className="ml-2.5 min-w-0 flex-1">
          <div className="truncate text-[17px] font-bold text-apk-text">{underlying}</div>
          <div className="mt-px flex items-center gap-1.5">
            <span
              className={cn(
                "size-1.5 rounded-full",
                !marketOpen ? "bg-apk-muted" : chain.isFetching ? "bg-apk-warn" : "bg-apk-buy",
              )}
            />
            <span className="text-[11px] text-apk-muted">
              {!marketOpen ? "Market closed" : chain.isFetching ? "Updating…" : "Live"}
            </span>
          </div>
        </div>
        {spot != null ? (
          <div className="flex flex-col items-end">
            <span className="text-[11px] text-apk-dim">SPOT</span>
            <span className="text-[15px] font-bold tabular-nums text-apk-text">{fmt(spot)}</span>
          </div>
        ) : null}
      </div>

      {/* Search */}
      <div className="px-3 pb-2.5">
        <div className="flex h-10 items-center rounded-xl border border-apk-border bg-apk-elevated px-3">
          <IoSearch size={15} className="shrink-0 text-apk-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            inputMode="numeric"
            aria-label="Search strike price"
            placeholder="Search strike price"
            className="ml-2 min-w-0 flex-1 bg-transparent text-[13px] text-apk-text outline-none placeholder:text-apk-dim"
          />
          {search ? (
            <button type="button" aria-label="Clear search" onClick={() => setSearch("")} className="text-apk-muted">
              <IoCloseCircle size={15} />
            </button>
          ) : null}
        </div>
      </div>

      {/* Underlying chips */}
      <div className="apk-no-scrollbar flex h-11 shrink-0 items-center overflow-x-auto px-3">
        {underlyings.map((u) => {
          const active = u.symbol === underlying;
          const dot = u.color ? (NAMED[u.color] ?? u.color) : undefined;
          return (
            <button
              key={u.symbol}
              type="button"
              aria-pressed={active}
              onClick={() => setUnderlying(u.symbol)}
              className={cn(
                "mr-2 flex h-8 shrink-0 items-center rounded-full border px-3 text-[13px] font-semibold",
                active ? "border-apk-text bg-apk-text text-apk-inverse" : "border-apk-border bg-apk-elevated text-apk-text",
              )}
            >
              {dot ? <span className="mr-1.5 size-[7px] rounded-full" style={{ backgroundColor: dot }} /> : null}
              {u.label}
            </button>
          );
        })}
      </div>

      {/* Expiry pill */}
      {expiries.length > 0 ? (
        <div className="px-3 pb-2.5">
          <button
            type="button"
            aria-expanded={showExpiryPicker}
            onClick={() => setShowExpiryPicker((v) => !v)}
            className="flex h-8 items-center rounded-full border border-apk-border bg-apk-elevated px-3 text-apk-text"
          >
            <IoCalendarOutline size={13} className="mr-1.5 text-apk-muted" />
            <span className="text-[13px] font-semibold">{activeExpiry ? fmtExpiry(activeExpiry) : "Expiry"}</span>
            {showExpiryPicker ? (
              <IoChevronUp size={14} className="ml-1.5 text-apk-muted" />
            ) : (
              <IoChevronDown size={14} className="ml-1.5 text-apk-muted" />
            )}
          </button>
          {showExpiryPicker ? (
            <div className="apk-no-scrollbar mt-2 flex h-10 items-center overflow-x-auto">
              {expiries.map((e) => {
                const active = e === activeExpiry;
                return (
                  <button
                    key={e}
                    type="button"
                    onClick={() => {
                      setExpiry(e);
                      setShowExpiryPicker(false);
                    }}
                    className={cn(
                      "mr-2 flex h-[30px] shrink-0 items-center rounded-full border px-3 text-[11px] font-semibold",
                      active ? "border-apk-primary bg-apk-primary/15 text-apk-primary" : "border-apk-border bg-apk-elevated text-apk-muted",
                    )}
                  >
                    {fmtExpiry(e, true)}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* CE | STRIKE | PE */}
      <div className="flex items-center border-y border-apk-border bg-apk-elevated px-3 py-2">
        <div className="flex flex-1 items-center gap-1.5">
          <span className="grid h-[18px] w-[22px] place-items-center rounded bg-apk-buy text-[10px] font-extrabold text-white">CE</span>
          <span className="text-[11px] font-semibold tracking-[0.5px] text-apk-dim">CALL</span>
        </div>
        <span className="w-20 text-center text-[11px] font-bold tracking-[0.8px] text-apk-muted">STRIKE</span>
        <div className="flex flex-1 items-center justify-end gap-1.5">
          <span className="text-[11px] font-semibold tracking-[0.5px] text-apk-dim">PUT</span>
          <span className="grid h-[18px] w-[22px] place-items-center rounded bg-apk-sell text-[10px] font-extrabold text-white">PE</span>
        </div>
      </div>

      {/* Rows */}
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {isInitialLoad ? (
          <SkeletonList />
        ) : chain.isError ? (
          <div className="flex flex-col items-center py-10">
            <IoAlertCircleOutline size={28} className="text-apk-sell" />
            <span className="mt-1.5 px-4 text-center text-[12px] text-apk-sell">
              {(chain.error as Error)?.message ?? "Couldn't load option chain"}
            </span>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center py-10">
            <IoCubeOutline size={28} className="text-apk-muted" />
            <span className="mt-1.5 text-[12px] text-apk-muted">
              {search ? `No strikes match "${search}"` : `No options available for ${underlying}`}
            </span>
          </div>
        ) : (
          rows.map((r, i) => {
            const ceTok = r.ce?.token ? String(r.ce.token) : "";
            const peTok = r.pe?.token ? String(r.pe.token) : "";
            return (
              <StrikeRow
                key={r.strike}
                rowRef={i === atmIdx ? atmRef : undefined}
                row={r}
                isAtm={i === atmIdx}
                showAtmTag={i === atmIdx && spot != null}
                showChange={marketOpen}
                ceLtp={ceTok ? (live.get(ceTok)?.ltp ?? r.ce?.ltp ?? null) : null}
                peLtp={peTok ? (live.get(peTok)?.ltp ?? r.pe?.ltp ?? null) : null}
                onStrike={openChart}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

const StrikeRow = memo(function StrikeRow({
  row,
  isAtm,
  showAtmTag,
  showChange,
  ceLtp,
  peLtp,
  onStrike,
  rowRef,
}: {
  row: any;
  isAtm: boolean;
  showAtmTag: boolean;
  showChange: boolean;
  ceLtp: number | null;
  peLtp: number | null;
  onStrike: (token: string) => void;
  rowRef?: Ref<HTMLDivElement>;
}) {
  return (
    <div ref={rowRef} className={cn("flex h-16 items-center border-b border-apk-border px-3", isAtm && "bg-apk-primary/10")}>
      <LegCell leg={row.ce} side="CE" ltp={ceLtp} showChange={showChange} />
      <button
        type="button"
        onClick={() => onStrike(String(row.ce?.token || row.pe?.token || ""))}
        aria-label={`Open ${row.strike} chart`}
        className="flex w-20 shrink-0 flex-col items-center justify-center"
      >
        <span
          className={cn(
            "rounded-md px-2 py-[3px] text-[13px] font-extrabold tabular-nums",
            isAtm ? "bg-apk-primary text-white" : "border border-apk-border text-apk-text",
          )}
        >
          {Number(row.strike).toLocaleString("en-IN")}
        </span>
        {showAtmTag ? <span className="mt-0.5 text-[9px] font-semibold text-apk-dim">ATM</span> : null}
      </button>
      <LegCell leg={row.pe} side="PE" ltp={peLtp} showChange={showChange} />
    </div>
  );
});

const LegCell = memo(function LegCell({
  leg,
  side,
  ltp,
  showChange,
}: {
  leg: any;
  side: "CE" | "PE";
  ltp: number | null;
  showChange: boolean;
}) {
  const tradeSheet = useApkTradeSheet();
  const flash = usePriceFlash(ltp, 350);
  const alignEnd = side === "PE";

  if (!leg || ltp == null) {
    return (
      <div className={cn("flex flex-1 px-1", alignEnd && "justify-end")}>
        <span className="text-[13px] font-bold text-apk-dim">—</span>
      </div>
    );
  }

  const changePct = leg.change_pct != null ? Number(leg.change_pct) : null;
  const up = changePct != null && changePct >= 0;
  return (
    <button
      type="button"
      onClick={() => leg.token && tradeSheet.open({ token: String(leg.token), symbol: leg.symbol ?? undefined })}
      aria-label={`Trade ${leg.symbol ?? side}`}
      className={cn(
        "flex flex-1 flex-col rounded-md px-1.5 py-0.5",
        alignEnd ? "items-end" : "items-start",
        flash === "up" && "bg-[rgba(34,197,94,0.22)]",
        flash === "down" && "bg-[rgba(239,68,68,0.22)]",
      )}
    >
      <span className={cn("truncate text-[15px] font-extrabold tabular-nums", side === "CE" ? "text-apk-buy" : "text-apk-sell")}>
        {fmt(ltp)}
      </span>
      {showChange && changePct != null ? (
        <span
          className={cn(
            "mt-0.5 rounded px-[5px] py-px text-[10px] font-bold tabular-nums",
            up ? "bg-[rgba(34,197,94,0.15)] text-apk-buy" : "bg-[rgba(239,68,68,0.15)] text-apk-sell",
          )}
        >
          {changePct > 0 ? "+" : ""}
          {changePct.toFixed(2)}%
        </span>
      ) : null}
    </button>
  );
});

function SkeletonList() {
  return (
    <div className="pt-2">
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className="flex h-16 items-center border-b border-apk-border px-3"
          style={{ opacity: 0.6 - i * 0.05 }}
        >
          <div className="flex flex-1 flex-col items-start gap-1.5">
            <div className="h-3.5 w-[60px] rounded bg-apk-elevated" />
            <div className="h-2.5 w-8 rounded bg-apk-elevated" />
          </div>
          <div className="h-[22px] w-16 rounded-md bg-apk-elevated" />
          <div className="flex flex-1 flex-col items-end gap-1.5">
            <div className="h-3.5 w-[60px] rounded bg-apk-elevated" />
            <div className="h-2.5 w-8 rounded bg-apk-elevated" />
          </div>
        </div>
      ))}
      <div className="mt-4 flex justify-center text-apk-primary">
        <Spinner />
      </div>
    </div>
  );
}
