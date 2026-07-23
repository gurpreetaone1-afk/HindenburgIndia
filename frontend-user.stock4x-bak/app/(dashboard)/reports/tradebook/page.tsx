"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ReportsAPI } from "@/lib/api";
import { PageHeader } from "@/components/common/PageHeader";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusPill } from "@/components/common/StatusPill";
import { ReportPdfButton } from "@/components/common/ReportPdfButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { formatINR, formatPrice } from "@/lib/utils";

// Local helper — turn a `YYYY-MM-DD` <input type="date"> value into the
// shape FastAPI's `datetime` query coercion accepts (ISO start-of-day
// in the user's local zone). The backend re-interprets the date in
// IST and applies start/end-of-day boundaries on its own.
function toIso(d: string): string | undefined {
  if (!d) return undefined;
  return new Date(`${d}T00:00:00`).toISOString();
}

export default function TradebookPage() {
  // Default window: last 30 days. Empty string = no bound. Both fields
  // are independently optional — clearing one acts as open-ended on
  // that side (matches the admin-side tradebook export semantics).
  const today = new Date();
  const thirtyAgo = new Date();
  thirtyAgo.setDate(thirtyAgo.getDate() - 30);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const [fromDate, setFromDate] = useState<string>(fmt(thirtyAgo));
  const [toDate, setToDate] = useState<string>(fmt(today));

  // Re-fetch the JSON list whenever the date window changes so the
  // table preview matches what the PDF will contain. Limit kept at
  // 500 for the table preview; PDF endpoint paginates internally.
  const { data, isFetching } = useQuery({
    queryKey: ["reports", "tradebook", fromDate, toDate],
    queryFn: () =>
      ReportsAPI.tradebook({
        from_date: toIso(fromDate),
        to_date: toIso(toDate),
        limit: 500,
      } as any),
    placeholderData: (prev) => prev,
  });

  // PDF params are the same date strings — the backend accepts a plain
  // date string and re-interprets at IST boundaries (see
  // backend/app/api/v1/user/reports.py:tradebook_pdf).
  const pdfParams = useMemo(
    () => ({
      from_date: toIso(fromDate),
      to_date: toIso(toDate),
      limit: 500,
    }),
    [fromDate, toDate],
  );

  const cols: Column<any>[] = [
    { key: "executed_at", header: "When", render: (r) => new Date(r.executed_at).toLocaleString() },
    { key: "trade_number", header: "Trade #", render: (r) => <span className="font-mono text-[11px]">{r.trade_number}</span> },
    { key: "symbol", header: "Symbol" },
    { key: "exchange", header: "Exch" },
    { key: "action", header: "Side", render: (r) => <StatusPill status={r.action} /> },
    { key: "quantity", header: "Qty", align: "right" },
    {
      key: "price",
      header: "Price",
      align: "right",
      render: (r) => formatPrice(r.price, r.segment, r.exchange),
    },
    {
      key: "value",
      header: "Value",
      align: "right",
      render: (r) => formatPrice(r.value, r.segment, r.exchange),
    },
    { key: "total_charges", header: "Charges", align: "right", render: (r) => formatINR(r.total_charges) },
  ];

  function applyPreset(days: number) {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    setFromDate(fmt(start));
    setToDate(fmt(end));
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tradebook"
        description={`${data?.length ?? 0} trades`}
        actions={
          <ReportPdfButton kind="tradebook" params={pdfParams} />
        }
      />

      {/* Custom date range — drives BOTH the table preview and the PDF
          download. Leaving from / to blank treats that side as
          unbounded; the backend then defaults to "since account
          inception" / "now" respectively. Preset buttons offer the
          common windows in one click. */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">From</Label>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="h-9 w-40 font-mono"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">To</Label>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="h-9 w-40 font-mono"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" onClick={() => applyPreset(7)}>7d</Button>
          <Button size="sm" variant="outline" onClick={() => applyPreset(30)}>30d</Button>
          <Button size="sm" variant="outline" onClick={() => applyPreset(90)}>90d</Button>
          <Button size="sm" variant="outline" onClick={() => applyPreset(365)}>1y</Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { setFromDate(""); setToDate(""); }}
            title="Clear filter to include every trade since inception"
          >
            All
          </Button>
        </div>
      </div>

      <DataTable columns={cols} rows={data} keyExtractor={(r) => r.id} loading={isFetching && !data} />
    </div>
  );
}
