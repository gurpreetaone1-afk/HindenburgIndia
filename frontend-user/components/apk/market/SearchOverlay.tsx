"use client";

// Port of apk src/features/trade/components/InstrumentSearchOverlay.tsx
// (+ the star from SearchScreen.tsx, wired to the web watchlist). Same
// /user/instruments/search params as the app's segment chips; row tap opens
// the terminal on that instrument (the app pushes /trade/chart).

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { IoArrowBack, IoCloseCircle, IoSearch } from "react-icons/io5";
import { InstrumentAPI } from "@/lib/api";
import { Chip, Spinner } from "@/components/apk/ui";
import { InstrumentRow, pickQuote, useLiveQuotes } from "./InstrumentRow";
import { useFavorites } from "./useFavorites";

const SEGMENTS: { key: string; label: string; segment?: string; exchange?: string; match?: RegExp }[] = [
  { key: "all", label: "All" },
  { key: "stocks", label: "Stocks", exchange: "NSE" },
  { key: "fno", label: "F&O", segment: "NFO-FUT,NSE_INDEX_OPTION_BUY,NSE_INDEX_OPTION_SELL,NSE_STOCK_OPTION_BUY,NSE_STOCK_OPTION_SELL" },
  { key: "forex", label: "Forex", segment: "CDS_FUTURE" },
  { key: "crypto", label: "Crypto", segment: "CRYPTO_SPOT" },
  { key: "metal", label: "Metal", segment: "MCX_FUTURE,MCX-FUT", match: /(GOLD|SILVER|COPPER|ZINC|ALUMINI|NICKEL|LEAD|PLATINUM)/i },
  { key: "energy", label: "Energy", segment: "MCX_FUTURE,MCX-FUT", match: /(CRUDE|NATGAS|NATURALGAS|OIL)/i },
  { key: "commodity", label: "All Commodity", segment: "MCX_FUTURE,MCX-FUT" },
];

export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Body only mounts while open, so its queries + socket tokens stop on close
  // and the query / chip reset for free (app clears them on close too).
  return open ? <SearchOverlayBody onClose={onClose} /> : null;
}

function SearchOverlayBody({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [segKey, setSegKey] = useState("all");
  const seg = SEGMENTS.find((s) => s.key === segKey) ?? SEGMENTS[0];
  const fav = useFavorites();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const hasFilter = debouncedQ.length > 0 || !!seg.segment || !!seg.exchange;
  const { data, isLoading, isError } = useQuery<any[]>({
    queryKey: ["apk-instrument-search", debouncedQ, seg.key],
    queryFn: () => InstrumentAPI.search(debouncedQ || undefined, seg.exchange, seg.segment, 80),
    enabled: hasFilter,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });

  const rows = useMemo(() => {
    const raw = hasFilter ? (data ?? []) : [];
    if (!seg.match) return raw;
    return raw.filter((it) => seg.match!.test(it.symbol ?? "") || seg.match!.test(it.name ?? "") || seg.match!.test(it.trading_symbol ?? ""));
  }, [data, seg, hasFilter]);

  const live = useLiveQuotes(useMemo(() => rows.map((r) => String(r.token)), [rows]));

  const openTerminal = useCallback(
    (token: string) => {
      onClose();
      router.push(`/terminal?token=${encodeURIComponent(token)}`);
    },
    [onClose, router],
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-apk-bg" role="dialog" aria-label="Search instruments">
      <div
        className="flex items-center gap-2.5 border-b border-apk-border bg-apk-bg px-3.5 pb-3"
        style={{ paddingTop: "calc(max(env(safe-area-inset-top), 12px) + 6px)" }}
      >
        <button type="button" aria-label="Back" onClick={onClose} className="text-apk-text">
          <IoArrowBack size={22} />
        </button>
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-apk-border bg-apk-elevated px-3 py-2.5">
          <IoSearch size={16} className="shrink-0 text-apk-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search NIFTY, GOLD, BTCUSD, EURUSD…"
            aria-label="Search instruments"
            autoFocus
            autoCapitalize="characters"
            autoCorrect="off"
            enterKeyHint="search"
            className="min-w-0 flex-1 bg-transparent text-[14px] text-apk-text outline-none placeholder:text-apk-muted"
          />
          {q.length > 0 ? (
            <button type="button" aria-label="Clear search" onClick={() => setQ("")} className="text-apk-muted">
              <IoCloseCircle size={16} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="apk-no-scrollbar flex h-12 shrink-0 items-center gap-2 overflow-x-auto border-b border-apk-border px-3.5">
        {SEGMENTS.map((s) => (
          <Chip key={s.key} label={s.label} size="sm" active={s.key === segKey} onClick={() => setSegKey(s.key)} />
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5 pt-2" style={{ paddingBottom: "calc(max(env(safe-area-inset-bottom), 24px) + 16px)" }}>
        {rows.length === 0 ? (
          isLoading && hasFilter ? (
            <div className="flex justify-center py-8 text-apk-primary">
              <Spinner />
            </div>
          ) : (
            <div className="py-10 text-center text-[14px] text-apk-muted">
              {isError
                ? "Couldn't load instruments"
                : q.length === 0 && segKey === "all"
                  ? "Type to search or pick a segment above"
                  : "No instruments found"}
            </div>
          )
        ) : (
          rows.map((it) => {
            const token = String(it.token);
            const p = pickQuote(live, token);
            return (
              <InstrumentRow
                key={token}
                token={token}
                symbol={it.symbol}
                name={it.name}
                bid={p.bid}
                ask={p.ask}
                changePct={p.changePct}
                starred={fav.isFav(token)}
                onToggleStar={fav.toggle}
                onPress={openTerminal}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
