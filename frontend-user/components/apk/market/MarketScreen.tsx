"use client";

// Port of apk src/features/trade/screens/MarketScreen.tsx (Market tab):
// "Market" header, in-bucket search, bucket chips, then Favorites / managed
// Indian segment / feed segment lists. Data, keys, limits, toasts and the
// segment add/remove + favourite logic are the web's MobileInstrumentsBar's.

import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { IoAlertCircleOutline, IoCloseCircle, IoCubeOutline, IoPersonOutline, IoSearch, IoStarOutline, IoWalletOutline } from "react-icons/io5";
import { InstrumentAPI, MarketwatchAPI, SegmentSettingsAPI } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useApkTradeSheet } from "@/components/apk/trade/TradeSheetProvider";
import { InstrumentRow, pickQuote, useLiveQuotes } from "./InstrumentRow";
import { useFavorites } from "./useFavorites";

interface Bucket {
  key: string;
  label: string;
  segments?: string[];
  adminRow?: string;
  managed?: boolean;
}

// The web's bucket set (the app's extra "Crypto OPT" chip has no admin row
// on this backend, so it is left out).
const BUCKETS: Bucket[] = [
  { key: "favorites", label: "Favorites" },
  { key: "nse_eq", label: "NSE EQ", segments: ["NSE_EQUITY"], adminRow: "NSE_EQ", managed: true },
  { key: "nse_fut", label: "NSE FUT", segments: ["NSE_FUTURE", "NSE_INDEX_FUTURE"], adminRow: "NSE_FUT", managed: true },
  { key: "nse_opt", label: "NSE OPT", segments: ["NSE_INDEX_OPTION_BUY", "NSE_INDEX_OPTION_SELL", "NSE_STOCK_OPTION_BUY", "NSE_STOCK_OPTION_SELL"], adminRow: "NSE_OPT", managed: true },
  { key: "bse_eq", label: "BSE EQ", segments: ["BSE_EQUITY"], adminRow: "BSE_EQ", managed: true },
  { key: "bse_fut", label: "BSE FUT", segments: ["BSE_FUTURE", "BSE_INDEX_FUTURE"], adminRow: "BSE_FUT", managed: true },
  { key: "bse_opt", label: "BSE OPT", segments: ["BSE_OPTION_BUY", "BSE_OPTION_SELL"], adminRow: "BSE_OPT", managed: true },
  { key: "mcx_fut", label: "MCX FUT", segments: ["MCX_FUTURE"], adminRow: "MCX_FUT", managed: true },
  { key: "mcx_opt", label: "MCX OPT", segments: ["MCX_OPTION_BUY", "MCX_OPTION_SELL"], adminRow: "MCX_OPT", managed: true },
  { key: "indices", label: "Indices", segments: ["INDICES"], adminRow: "INDICES" },
  { key: "stocks", label: "Stocks", segments: ["STOCKS"], adminRow: "STOCKS" },
  { key: "commodities", label: "Commodities", segments: ["COMMODITIES"], adminRow: "COMMODITIES" },
  { key: "forex", label: "Forex", segments: ["FOREX"], adminRow: "FOREX" },
  { key: "crypto", label: "Crypto", segments: ["CRYPTO_PERPETUAL", "CRYPTO_SPOT", "CRYPTO_FUTURE"], adminRow: "CRYPTO" },
];

type Fav = ReturnType<typeof useFavorites>;
type OnTap = (token: string, symbol: string, name?: string) => void;

export function ApkMarketScreen() {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [bucketKey, setBucketKey] = useState("favorites");
  const trade = useApkTradeSheet();
  const fav = useFavorites();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 200);
    return () => clearTimeout(t);
  }, [q]);

  const { data: inactiveRows } = useQuery({
    queryKey: ["segment-settings", "inactive"],
    queryFn: () => SegmentSettingsAPI.inactive(),
    staleTime: 30_000,
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
  });
  const visibleBuckets = useMemo(() => {
    const inactive = new Set(inactiveRows ?? []);
    return BUCKETS.filter((b) => !b.adminRow || !inactive.has(b.adminRow));
  }, [inactiveRows]);
  const bucket = visibleBuckets.find((b) => b.key === bucketKey) ?? visibleBuckets[0];

  // Row tap opens the order ticket, as in the app's Market tab.
  const onTap = useCallback<OnTap>((token, symbol, name) => trade.open({ token, symbol, name }), [trade]);

  return (
    <div className="flex min-h-[calc(100dvh-var(--apk-tabbar,0px))] flex-col bg-apk-bg">
      <div className="sticky top-0 z-20 bg-apk-bg">
        <div className="flex items-center gap-2.5 px-3.5 pb-1.5 pt-3">
          <h1 className="flex-1 text-[22px] font-extrabold tracking-normal text-apk-text">Market</h1>
          <Link href="/wallet" aria-label="Wallet" className="px-1.5 text-apk-text">
            <IoWalletOutline size={20} />
          </Link>
          <Link href="/profile" aria-label="Profile" className="text-apk-text">
            <IoPersonOutline size={20} />
          </Link>
        </div>
        <div className="px-3.5 pb-1.5 pt-1">
          <div className="flex h-10 items-center gap-2 rounded-[10px] border border-apk-border bg-apk-elevated px-3">
            <IoSearch size={15} className="shrink-0 text-apk-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Search in ${bucket.label}`}
              aria-label={`Search in ${bucket.label}`}
              autoCapitalize="characters"
              autoCorrect="off"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-apk-text outline-none placeholder:text-apk-muted"
            />
            {q.length > 0 ? (
              <button type="button" aria-label="Clear search" onClick={() => setQ("")} className="text-apk-muted">
                <IoCloseCircle size={15} />
              </button>
            ) : null}
          </div>
        </div>
        <div className="apk-no-scrollbar flex items-center gap-2 overflow-x-auto px-3.5 py-1.5">
          {visibleBuckets.map((b) => {
            const active = b.key === bucket.key;
            return (
              <button
                key={b.key}
                type="button"
                onClick={() => {
                  setBucketKey(b.key);
                  setQ("");
                  setDebouncedQ("");
                }}
                className={cn(
                  "h-[30px] shrink-0 whitespace-nowrap rounded-full border px-3.5 text-[12px] font-bold uppercase tracking-[0.6px]",
                  active ? "border-apk-text bg-apk-text text-apk-inverse" : "border-apk-border bg-apk-elevated text-apk-text",
                )}
              >
                {b.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-3.5 pb-6">
        {bucket.key === "favorites" ? (
          <FavList q={debouncedQ} fav={fav} onTap={onTap} />
        ) : bucket.managed ? (
          <ManagedSegmentList key={bucket.key} bucket={bucket} q={debouncedQ} fav={fav} onTap={onTap} />
        ) : (
          <FeedSegmentList key={bucket.key} bucket={bucket} q={debouncedQ} fav={fav} onTap={onTap} />
        )}
      </div>
    </div>
  );
}

function FavList({ q, fav, onTap }: { q: string; fav: Fav; onTap: OnTap }) {
  const activeWl = fav.activeWl;
  const { data: wlQuotes, isLoading, isError } = useQuery({
    queryKey: ["watchlist-quotes", activeWl?.id],
    queryFn: () => MarketwatchAPI.quotes(activeWl!.id),
    enabled: !!activeWl?.id,
    refetchInterval: 3000,
    staleTime: 2000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });
  const live = useLiveQuotes(
    useMemo(() => (activeWl?.items ?? []).map((it: any) => String(it.instrument_token ?? it.token)), [activeWl?.items]),
  );
  const rows = useMemo(() => {
    const all = wlQuotes ?? [];
    const needle = q.trim().toLowerCase();
    return needle ? all.filter((r: any) => String(r.symbol ?? "").toLowerCase().includes(needle)) : all;
  }, [wlQuotes, q]);

  if (!activeWl) {
    if (fav.isLoading) return <LoaderRows />;
    if (fav.isError) return <ErrorState />;
    return <ListEmpty icon={IoStarOutline} title="No watchlist yet" hint="Tap the star on any instrument to add it here." />;
  }
  if (rows.length === 0) {
    if (isLoading) return <LoaderRows />;
    if (isError) return <ErrorState />;
    return (
      <ListEmpty
        icon={IoStarOutline}
        title={q ? "No favorites match your search" : "No favorites yet"}
        hint={q ? undefined : "Switch to a section, search for a stock, and tap the star to add."}
      />
    );
  }
  return (
    <>
      {rows.map((r: any) => {
        const token = String(r.instrument_token ?? r.token ?? "");
        const p = pickQuote(live, token, r);
        return (
          <InstrumentRow
            key={token}
            token={token}
            symbol={r.symbol}
            name={r.name || r.symbol}
            bid={p.bid}
            ask={p.ask}
            changePct={p.changePct}
            starred={fav.isFav(token)}
            onToggleStar={fav.toggle}
            onPress={onTap}
          />
        );
      })}
    </>
  );
}

interface SegListProps {
  bucket: Bucket;
  q: string;
  fav: Fav;
  onTap: OnTap;
}

/** Search hits scoped to the bucket's segments (web MobileInstrumentsBar keys). */
function useSegmentSearch(bucket: Bucket, q: string) {
  const segs = bucket.segments?.join(",");
  return useQuery({
    queryKey: ["mobile-instruments-search", q, segs],
    queryFn: () => InstrumentAPI.search(q, undefined, segs, 30),
    enabled: q.trim().length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });
}

function ManagedSegmentList({ bucket, q, fav, onTap }: SegListProps) {
  const qc = useQueryClient();
  const name = bucket.adminRow!;
  const items = useQuery<any[]>({
    queryKey: ["segment-items", name],
    queryFn: () => MarketwatchAPI.segmentItems(name),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
  const search = useSegmentSearch(bucket, q);
  const showingSearch = q.trim().length > 0;

  const addedTokens = useMemo(() => new Set((items.data ?? []).map((it) => String(it.instrument_token))), [items.data]);
  const rows = useMemo(
    () =>
      showingSearch
        ? (search.data ?? []).map((s: any) => ({ token: String(s.token), symbol: s.symbol, name: s.name }))
        : (items.data ?? []).map((it) => ({ token: String(it.instrument_token), symbol: it.symbol, name: it.name })),
    [showingSearch, search.data, items.data],
  );
  const live = useLiveQuotes(useMemo(() => rows.map((r) => r.token), [rows]));

  const onTrailing = useCallback(
    async (token: string, symbol: string) => {
      const adding = showingSearch;
      try {
        if (adding) await MarketwatchAPI.addSegmentItem(name, token);
        else await MarketwatchAPI.removeSegmentItem(name, token);
        qc.invalidateQueries({ queryKey: ["segment-items", name] });
        toast.success(adding ? `Added ${symbol} to ${bucket.label}` : `Removed ${symbol}`, { duration: 1500 });
      } catch (e: any) {
        toast.error(e?.message || (adding ? `Failed to add ${symbol}` : `Failed to remove ${symbol}`));
      }
    },
    [showingSearch, name, bucket.label, qc],
  );

  if (rows.length === 0) {
    if (showingSearch ? search.isLoading : items.isLoading) return <LoaderRows />;
    if (showingSearch ? search.isError : items.isError) return <ErrorState />;
    return (
      <ListEmpty
        icon={IoCubeOutline}
        title={showingSearch ? "No instruments match" : `No ${bucket.label} added yet`}
        hint={showingSearch ? "Try a different symbol." : "Search above and tap + to add instruments to this list."}
      />
    );
  }
  return (
    <>
      {rows.map((r) => {
        const p = pickQuote(live, r.token);
        return (
          <InstrumentRow
            key={r.token}
            token={r.token}
            symbol={r.symbol}
            name={r.name || r.symbol}
            bid={p.bid}
            ask={p.ask}
            changePct={p.changePct}
            starred={fav.isFav(r.token)}
            onToggleStar={fav.toggle}
            trailing={showingSearch ? (addedTokens.has(r.token) ? null : "add") : "remove"}
            onTrailing={onTrailing}
            onPress={onTap}
          />
        );
      })}
    </>
  );
}

function FeedSegmentList({ bucket, q, fav, onTap }: SegListProps) {
  const segs = bucket.segments?.join(",");
  const showingSearch = q.trim().length > 0;
  const browse = useQuery({
    queryKey: ["mobile-instruments-bucket", bucket.key, segs],
    queryFn: () => InstrumentAPI.search(undefined, undefined, segs, 40),
    enabled: !showingSearch && !!segs,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });
  const search = useSegmentSearch(bucket, q);
  const src = showingSearch ? search : browse;
  const rows = src.data ?? [];
  const live = useLiveQuotes(useMemo(() => rows.map((r: any) => String(r.token)), [rows]));

  if (rows.length === 0) {
    if (src.isLoading) return <LoaderRows />;
    if (src.isError) return <ErrorState />;
    return <ListEmpty icon={IoCubeOutline} title="No instruments found" hint={q ? "Try a different symbol." : `${bucket.label} feed is empty.`} />;
  }
  return (
    <>
      {rows.map((it: any) => {
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
            onPress={onTap}
          />
        );
      })}
    </>
  );
}

function LoaderRows() {
  return (
    <div className="pt-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center border-b border-apk-border py-3" style={{ opacity: 0.6 - i * 0.06 }}>
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="h-3.5 w-20 rounded bg-apk-elevated" />
            <div className="h-2.5 w-[130px] rounded bg-apk-elevated" />
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <div className="h-3.5 w-[70px] rounded bg-apk-elevated" />
            <div className="h-2.5 w-10 rounded bg-apk-elevated" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ListEmpty({ icon: Icon, title, hint }: { icon: ComponentType<{ size?: number }>; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 py-[60px] text-center">
      <span className="text-apk-dim">
        <Icon size={28} />
      </span>
      <div className="mt-1 text-[14px] font-semibold text-apk-text">{title}</div>
      {hint ? <div className="mx-6 text-[12px] text-apk-muted">{hint}</div> : null}
    </div>
  );
}

function ErrorState() {
  return <ListEmpty icon={IoAlertCircleOutline} title="Couldn't load instruments" hint="Check your connection and try again." />;
}
