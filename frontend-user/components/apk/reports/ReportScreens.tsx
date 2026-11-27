"use client";

// Phone ports of apk app/reports/{index,tradebook,pnl,brokerage,margin,tax}.
// All data via the web's ReportsAPI. Where the backend payload differs from
// the shape the app expects (brokerage → `totals`, margin → wallet summary,
// tax → `buckets`), the real fields are read so numbers aren't all ₹0.

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  IoBarChartOutline,
  IoCashOutline,
  IoDocumentTextOutline,
  IoReceiptOutline,
  IoTrendingUpOutline,
} from "react-icons/io5";
import { ReportsAPI } from "@/lib/api";
import { cn, formatPrice } from "@/lib/utils";
import { Card, Header, Screen, fmt } from "@/components/apk/ui";
import { ist } from "@/components/apk/orders/shared";
import { ListRow, ReportPage, ReportRow, SectionCaption } from "./ReportPage";

const num = (v: unknown) => Number(v ?? 0) || 0;

function useReport<T>(kind: string, fn: () => Promise<T>, params?: object) {
  return useQuery<T>({
    queryKey: ["reports", kind, params ?? {}],
    queryFn: fn,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}

export function ApkReportsHome() {
  const router = useRouter();
  const items = [
    { href: "/reports/pnl", title: "P&L", icon: <IoTrendingUpOutline size={20} /> },
    { href: "/reports/tradebook", title: "Tradebook", icon: <IoReceiptOutline size={20} /> },
    { href: "/reports/brokerage", title: "Brokerage", icon: <IoCashOutline size={20} /> },
    { href: "/reports/margin", title: "Margin", icon: <IoBarChartOutline size={20} /> },
    { href: "/reports/tax", title: "Tax", icon: <IoDocumentTextOutline size={20} /> },
  ];
  return (
    <Screen padded={false}>
      <div className="px-4">
        <Header title="Reports" back />
      </div>
      <div className="px-4">
        {items.map((it, i) => (
          <ListRow
            key={it.href}
            icon={it.icon}
            title={it.title}
            divider={i < items.length - 1}
            onClick={() => router.push(it.href)}
          />
        ))}
      </div>
    </Screen>
  );
}

const TRADEBOOK_PARAMS = { limit: 100 };

export function ApkTradebookScreen() {
  const q = useReport("tradebook", () => ReportsAPI.tradebook(TRADEBOOK_PARAMS), TRADEBOOK_PARAMS);
  const rows = q.data ?? [];
  return (
    <ReportPage
      title="Tradebook"
      isLoading={q.isPending}
      isError={q.isError && !q.data}
      errorMessage={(q.error as Error | null)?.message}
      empty={rows.length === 0}
      emptyHint="No trades yet"
      download={{ kind: "tradebook", params: { limit: 500 } }}
    >
      {rows.map((t: any) => {
        const buy = String(t.action).toUpperCase() === "BUY";
        return (
          <Card key={t.id}>
            <div className="flex items-center gap-2.5">
              <span className={cn("w-[3px] self-stretch rounded-sm", buy ? "bg-apk-buy" : "bg-apk-sell")} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold text-apk-text">{t.symbol}</div>
                <div className="mt-0.5 text-[11px] text-apk-muted">
                  {ist(t.executed_at, { day: "2-digit", month: "short", year: "numeric" })} ·{" "}
                  {ist(t.executed_at, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })}
                </div>
              </div>
              <div className="flex flex-col items-end">
                <span className={cn("text-[12px] font-bold tabular-nums", buy ? "text-apk-buy" : "text-apk-sell")}>
                  {t.action} {t.quantity}
                </span>
                <span className="mt-0.5 text-[13px] tabular-nums text-apk-text">@ {formatPrice(t.price, t.segment, t.exchange)}</span>
                {t.pnl != null ? (
                  <span className={cn("mt-0.5 text-[11px] tabular-nums", num(t.pnl) >= 0 ? "text-apk-buy" : "text-apk-sell")}>
                    {fmt(t.pnl)}
                  </span>
                ) : null}
              </div>
            </div>
          </Card>
        );
      })}
    </ReportPage>
  );
}

export function ApkPnlScreen() {
  const q = useReport("pnl", () => ReportsAPI.pnl());
  const d = q.data;
  // Backend sends the app shape (total_net, rows…) and the PDF shape (net_pnl, by_symbol…).
  const totalNet = num(d?.total_net ?? d?.net_pnl);
  const rows: { symbol: string; net_pnl?: unknown; trades?: number }[] =
    d?.rows ?? d?.by_symbol?.map((r: any) => ({ symbol: r.symbol, net_pnl: r.pnl })) ?? [];
  return (
    <ReportPage
      title="P&L"
      isLoading={q.isPending}
      isError={q.isError && !d}
      errorMessage={(q.error as Error | null)?.message}
      empty={!d}
      download={{ kind: "pnl" }}
    >
      <Card>
        <ReportRow label="Net P&L" value={fmt(totalNet)} tone={totalNet > 0 ? "buy" : totalNet < 0 ? "sell" : "default"} />
        <ReportRow label="Realized" value={fmt(d?.total_realized ?? d?.net_pnl)} />
        <ReportRow label="Unrealized" value={fmt(d?.total_unrealized)} />
        <ReportRow label="Brokerage" value={fmt(d?.total_brokerage ?? d?.total_charges)} tone="muted" />
        <ReportRow label="Taxes" value={fmt(d?.total_taxes)} tone="muted" />
      </Card>
      <SectionCaption>By symbol</SectionCaption>
      {rows.length === 0 ? (
        <div className="py-6 text-center text-[12px] text-apk-muted">No trades in this period</div>
      ) : (
        rows.map((r) => (
          <Card key={r.symbol}>
            <ReportRow label={r.symbol} value={fmt(r.net_pnl as number)} />
            {r.trades != null ? <ReportRow label="Trades" value={String(r.trades)} tone="muted" /> : null}
          </Card>
        ))
      )}
    </ReportPage>
  );
}

export function ApkBrokerageScreen() {
  const q = useReport("brokerage", () => ReportsAPI.brokerage());
  const d = q.data;
  // Backend: { totals: { brokerage, total }, trade_count } — total = all charges.
  const brokerage = num(d?.total_brokerage ?? d?.totals?.brokerage);
  const total = num(d?.total ?? d?.totals?.total);
  return (
    <ReportPage
      title="Brokerage & charges"
      isLoading={q.isPending}
      isError={q.isError && !d}
      errorMessage={(q.error as Error | null)?.message}
      empty={!d}
      download={{ kind: "brokerage" }}
    >
      <Card>
        <ReportRow label="Brokerage" value={fmt(brokerage)} />
        <ReportRow label="Taxes" value={fmt(d?.total_taxes ?? total - brokerage)} />
        <ReportRow label="Total" value={fmt(total)} />
        {d?.trade_count != null ? <ReportRow label="Trades" value={String(d.trade_count)} tone="muted" /> : null}
      </Card>
    </ReportPage>
  );
}

export function ApkMarginScreen() {
  const q = useReport("margin", () => ReportsAPI.margin());
  const d = q.data;
  // Backend returns the wallet summary: margin (used) / free / bal.
  return (
    <ReportPage
      title="Margin"
      isLoading={q.isPending}
      isError={q.isError && !d}
      errorMessage={(q.error as Error | null)?.message}
      empty={!d}
      download={{ kind: "margin" }}
    >
      <Card>
        <ReportRow label="Used" value={fmt(d?.total_used ?? d?.margin ?? d?.used_margin)} tone="sell" />
        <ReportRow label="Available" value={fmt(d?.total_available ?? d?.free ?? d?.available_balance)} tone="buy" />
        <ReportRow label="Total" value={fmt(d?.total ?? d?.bal)} />
      </Card>
    </ReportPage>
  );
}

const TAX_BUCKETS: Record<string, string> = {
  intraday_speculative: "Intraday (speculative)",
  stcg: "STCG",
  ltcg: "LTCG",
  fno: "F&O",
};

export function ApkTaxScreen() {
  const q = useReport("tax", () => ReportsAPI.tax());
  const d = q.data;
  const buckets: Record<string, unknown> = d?.buckets ?? {};
  return (
    <ReportPage
      title="Tax"
      isLoading={q.isPending}
      isError={q.isError && !d}
      errorMessage={(q.error as Error | null)?.message}
      empty={!d}
      download={{ kind: "tax" }}
    >
      {d?.fy ? <div className="ml-1 text-[11px] text-apk-muted">FY {d.fy}</div> : null}
      <SectionCaption>By category</SectionCaption>
      <Card>
        {Object.entries(buckets).map(([k, v]) => (
          <ReportRow key={k} label={TAX_BUCKETS[k] ?? k} value={fmt(v as number)} />
        ))}
      </Card>
    </ReportPage>
  );
}
