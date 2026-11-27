"use client";

// Ports of apk src/features/trade/components/MarketOverview.tsx and
// MarketNews.tsx. Overview tokens are the app's hand-picked Zerodha tokens,
// ticking on the shared market socket; news is the same /user/news feed.

import { memo, type ComponentType } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  IoBarChartOutline,
  IoBusinessOutline,
  IoCardOutline,
  IoCaretDown,
  IoCaretUp,
  IoCashOutline,
  IoFlag,
  IoFlashOutline,
  IoGlobeOutline,
  IoLaptopOutline,
  IoNewspaperOutline,
  IoTrendingUp,
  IoWalletOutline,
} from "react-icons/io5";
import { api, unwrap } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useMarketStream } from "@/lib/useMarketStream";
import { fmt } from "@/components/apk/ui";
import { quoteLtp, signed } from "@/components/apk/market/format";

type IconT = ComponentType<{ size?: number; color?: string }>;

const ROWS: { token: string; symbol: string; name: string; icon: IconT; tint: string; bg: string }[] = [
  { token: "256265", symbol: "NIFTY", name: "Nifty 50", icon: IoTrendingUp, tint: "#10B981", bg: "rgba(16,185,129,0.14)" },
  { token: "260105", symbol: "BANKNIFTY", name: "Bank Nifty", icon: IoBusinessOutline, tint: "#60A5FA", bg: "rgba(96,165,250,0.14)" },
  { token: "257801", symbol: "FINNIFTY", name: "Fin Nifty", icon: IoCashOutline, tint: "#34D399", bg: "rgba(52,211,153,0.14)" },
  { token: "265", symbol: "SENSEX", name: "BSE Sensex", icon: IoBarChartOutline, tint: "#A855F7", bg: "rgba(168,85,247,0.18)" },
  { token: "738561", symbol: "RELIANCE", name: "Reliance Inds.", icon: IoFlashOutline, tint: "#22D3EE", bg: "rgba(34,211,238,0.14)" },
  { token: "2953217", symbol: "TCS", name: "Tata Consultancy", icon: IoLaptopOutline, tint: "#60A5FA", bg: "rgba(96,165,250,0.14)" },
  { token: "341249", symbol: "HDFCBANK", name: "HDFC Bank", icon: IoCardOutline, tint: "#94A3B8", bg: "rgba(148,163,184,0.16)" },
  { token: "1270529", symbol: "ICICIBANK", name: "ICICI Bank", icon: IoWalletOutline, tint: "#F97316", bg: "rgba(249,115,22,0.16)" },
  { token: "408065", symbol: "INFY", name: "Infosys", icon: IoGlobeOutline, tint: "#22D3EE", bg: "rgba(34,211,238,0.14)" },
];
const ROW_TOKENS = ROWS.map((r) => r.token);

function ChangePill({ changePct }: { changePct: number | undefined }) {
  const hasData = changePct != null && Number.isFinite(changePct);
  const up = (changePct ?? 0) >= 0;
  return (
    <span
      className={cn(
        "mt-1 inline-flex items-center rounded-full px-2 py-[3px]",
        !hasData ? "bg-apk-dim/15 text-apk-dim" : up ? "bg-apk-buy/15 text-apk-buy" : "bg-apk-sell/15 text-apk-sell",
      )}
    >
      {hasData ? <span className="mr-[3px]">{up ? <IoCaretUp size={10} /> : <IoCaretDown size={10} />}</span> : null}
      <span className="text-[11px] font-bold tabular-nums">{hasData ? `${signed(changePct)}%` : "—"}</span>
    </span>
  );
}

export const MarketOverview = memo(function MarketOverview() {
  const ticks = useMarketStream(ROW_TOKENS);
  return (
    <div className="rounded-xl border border-apk-border bg-apk-elevated px-4 pb-1 pt-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-bold tracking-[0.8px] text-apk-text">MARKET OVERVIEW</span>
        <span className="text-[11px] font-semibold tracking-[0.5px] text-apk-dim">NSE · BSE</span>
      </div>
      {ROWS.map((r, i) => {
        const q = ticks.get(r.token);
        const ltp = quoteLtp(q);
        const Icon = r.icon;
        return (
          <Link
            key={r.token}
            href={`/terminal?token=${encodeURIComponent(r.token)}`}
            className={cn("flex items-center py-3.5", i < ROWS.length - 1 && "border-b border-apk-border")}
          >
            <span className="mr-3 grid size-[38px] shrink-0 place-items-center rounded-[10px]" style={{ backgroundColor: r.bg }}>
              <Icon size={18} color={r.tint} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-bold text-apk-text">{r.symbol}</span>
              <span className="mt-0.5 block truncate text-[11px] text-apk-muted">{r.name}</span>
            </span>
            <span className="flex flex-col items-end">
              <span className="text-[15px] font-bold tabular-nums text-apk-text">{ltp != null ? fmt(ltp) : "—"}</span>
              <ChangePill changePct={q?.change_pct != null ? Number(q.change_pct) : undefined} />
            </span>
          </Link>
        );
      })}
    </div>
  );
});

interface NewsItem {
  id: string;
  title: string;
  summary?: string | null;
  source?: string | null;
  url?: string | null;
  image_url?: string | null;
  published_at?: string | null;
}

const fetchNews = () => unwrap<NewsItem[]>(api.get("/user/news", { params: { limit: 40 } }));

function timeAgo(iso?: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const m = Math.floor(Math.max(0, Date.now() - t) / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

const NewsRow = memo(function NewsRow({ item, divider }: { item: NewsItem; divider: boolean }) {
  const body = (
    <>
      {item.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.image_url} alt="" loading="lazy" className="mr-3 size-[84px] shrink-0 rounded-[10px] bg-apk-surface object-cover" />
      ) : (
        <span className="mr-3 grid size-[84px] shrink-0 place-items-center rounded-[10px] bg-apk-surface text-apk-dim">
          <IoNewspaperOutline size={28} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-[14px] font-bold leading-[19px] text-apk-text">{item.title}</span>
        {item.summary ? <span className="mt-1 line-clamp-2 text-[11px] leading-[17px] text-apk-muted">{item.summary}</span> : null}
        <span className="mt-1.5 flex items-center text-[11px]">
          {item.source ? <span className="font-semibold text-apk-info">{item.source}</span> : null}
          {item.source && item.published_at ? <span className="mx-1.5 text-apk-dim">·</span> : null}
          {item.published_at ? <span className="text-apk-dim">{timeAgo(item.published_at)}</span> : null}
        </span>
      </span>
    </>
  );
  const cls = cn("flex py-3.5", divider && "border-b border-apk-border");
  return item.url ? (
    <a href={item.url} target="_blank" rel="noopener noreferrer" className={cls}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
});

export const MarketNews = memo(function MarketNews() {
  const { data, isLoading, isError } = useQuery<NewsItem[]>({
    queryKey: ["market", "news"],
    queryFn: fetchNews,
    staleTime: 3 * 60_000,
    refetchInterval: 3 * 60_000,
    retry: 1,
    placeholderData: (prev) => prev,
  });
  const items = data ?? [];
  return (
    <div className={cn("rounded-xl border border-apk-border bg-apk-elevated px-4 pt-3", items.length > 0 ? "pb-1" : "pb-3")}>
      <div className={cn("flex items-center justify-between", items.length > 0 ? "mb-1" : "mb-2")}>
        <span className="text-[11px] font-bold tracking-[0.8px] text-apk-text">MARKET NEWS</span>
        <span className="flex items-center rounded-full bg-apk-info/15 px-2.5 py-1 text-apk-info">
          <IoFlag size={10} className="mr-1" />
          <span className="text-[11px] font-bold tracking-[0.5px]">INDIAN MARKETS</span>
        </span>
      </div>
      {isLoading ? (
        <div className="py-4 text-[12px] text-apk-muted">Loading news…</div>
      ) : isError ? (
        <div className="py-4 text-[12px] text-apk-muted">News feed unavailable right now.</div>
      ) : items.length === 0 ? (
        <div className="py-4 text-[12px] text-apk-muted">News feed will appear here as soon as a provider is connected.</div>
      ) : (
        items.map((n, i) => <NewsRow key={n.id} item={n} divider={i < items.length - 1} />)
      )}
    </div>
  );
});
