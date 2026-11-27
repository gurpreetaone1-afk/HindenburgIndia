"use client";

// Port of apk src/features/trade/components/InstrumentRow.tsx: symbol +
// change% on the left, BID (sell, red) over ASK (buy, green) on the right,
// optional favourite star and +/× trailing action. Prices are fed by the
// parent list through `useLiveQuotes` (one shared-socket consumer per list,
// not one per row), so the row itself is a pure memoised view.

import { memo, useMemo, type KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { IoAdd, IoClose, IoStar, IoStarOutline } from "react-icons/io5";
import { InstrumentAPI } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useMarketStream, type MarketQuote } from "@/lib/useMarketStream";
import { fixed, livePrice, signed } from "./format";

/** Same cap + seed as the web's MobileInstrumentsBar: the first 30 rows
 *  stream live, a one-shot batch quote paints them before the first tick. */
const LIVE_TOKEN_CAP = 30;

export function useLiveQuotes(tokens: string[]) {
  const key = tokens.slice(0, LIVE_TOKEN_CAP).join(",");
  const capped = useMemo(() => (key ? key.split(",") : []), [key]);
  const { data: seed } = useQuery<any[]>({
    queryKey: ["mobile-instruments-batch-seed", key],
    queryFn: () => InstrumentAPI.quotesBatch(capped),
    enabled: capped.length > 0,
    staleTime: 60_000,
    refetchInterval: false,
    refetchOnWindowFocus: false,
  });
  const stream = useMarketStream(capped);
  const seedMap = useMemo(() => {
    const m = new Map<string, any>();
    for (const q of seed ?? []) m.set(String(q.token), q);
    return m;
  }, [seed]);
  return { stream, seedMap };
}

type QuoteLike = Partial<MarketQuote> & { last_ltp?: unknown };

/** App display chain: live tick → row's REST snapshot → batch seed → last-known. */
export function pickQuote(
  live: { stream: Map<string, MarketQuote>; seedMap: Map<string, any> },
  token: string,
  rest?: QuoteLike | null,
) {
  const t = live.stream.get(token) as QuoteLike | undefined;
  const s = live.seedMap.get(token) as QuoteLike | undefined;
  const ltp =
    livePrice(t?.ltp) ?? livePrice(rest?.ltp) ?? livePrice(s?.ltp) ?? livePrice(t?.last_ltp) ?? livePrice(rest?.last_ltp) ?? livePrice(s?.last_ltp);
  const pct = t?.change_pct ?? rest?.change_pct ?? s?.change_pct;
  return {
    bid: livePrice(t?.bid) ?? livePrice(rest?.bid) ?? livePrice(s?.bid) ?? ltp,
    ask: livePrice(t?.ask) ?? livePrice(rest?.ask) ?? livePrice(s?.ask) ?? ltp,
    changePct: pct != null && Number.isFinite(Number(pct)) ? Number(pct) : null,
  };
}

interface Props {
  token: string;
  symbol: string;
  name?: string;
  bid: number | null;
  ask: number | null;
  changePct: number | null;
  starred?: boolean;
  onToggleStar?: (token: string) => void;
  trailing?: "add" | "remove" | null;
  onTrailing?: (token: string, symbol: string) => void;
  onPress: (token: string, symbol: string, name?: string) => void;
}

export const InstrumentRow = memo(function InstrumentRow({
  token,
  symbol,
  name,
  bid,
  ask,
  changePct,
  starred,
  onToggleStar,
  trailing,
  onTrailing,
  onPress,
}: Props) {
  const tone = changePct == null || changePct === 0 ? "text-apk-dim" : changePct > 0 ? "text-apk-buy" : "text-apk-sell";
  // Forex / spot metals (6-letter pairs) quote in pips → 4 dp; crypto
  // (…USDT/USDC), indices, stocks stay at 2 — same rule as the app.
  const up = symbol.toUpperCase();
  const dp = /USDT$|USDC$/.test(up) ? 2 : /^[A-Z]{6}$/.test(up) ? 4 : 2;
  const press = () => onPress(token, symbol, name);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={press}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          press();
        }
      }}
      className="flex cursor-pointer items-center border-b border-apk-border py-3"
    >
      <div className="min-w-0 flex-1 pr-2">
        <div className="truncate text-[15px] font-semibold text-apk-text">{symbol}</div>
        <div className={cn("mt-[3px] text-[12px] font-semibold tabular-nums", tone)}>
          {changePct != null ? `${signed(changePct)}%` : " "}
        </div>
      </div>
      <div className="flex min-w-[100px] flex-col items-end">
        <span className="text-[14px] font-bold tabular-nums text-apk-sell">{fixed(bid, dp)}</span>
        <span className="mt-0.5 text-[14px] font-bold tabular-nums text-apk-buy">{fixed(ask, dp)}</span>
      </div>
      {onToggleStar ? (
        <button
          type="button"
          aria-label={starred ? `Remove ${symbol} from favorites` : `Add ${symbol} to favorites`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleStar(token);
          }}
          className="ml-3 p-0.5"
        >
          {starred ? <IoStar size={18} color="#F59E0B" /> : <IoStarOutline size={18} className="text-apk-muted" />}
        </button>
      ) : null}
      {trailing && onTrailing ? (
        <button
          type="button"
          aria-label={trailing === "add" ? `Add ${symbol}` : `Remove ${symbol}`}
          onClick={(e) => {
            e.stopPropagation();
            onTrailing(token, symbol);
          }}
          className={cn(
            "ml-2.5 grid size-7 shrink-0 place-items-center rounded-full",
            trailing === "add" ? "bg-apk-primary text-white" : "border border-apk-border bg-apk-elevated text-apk-muted",
          )}
        >
          {trailing === "add" ? <IoAdd size={18} /> : <IoClose size={14} />}
        </button>
      ) : null}
    </div>
  );
});
