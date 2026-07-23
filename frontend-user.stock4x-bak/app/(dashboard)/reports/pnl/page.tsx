"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ReportsAPI } from "@/lib/api";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/common/DataTable";
import { ReportPdfButton } from "@/components/common/ReportPdfButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { formatINR, pnlColor } from "@/lib/utils";

function toIso(d: string): string | undefined {
  if (!d) return undefined;
  return new Date(`${d}T00:00:00`).toISOString();
}

export default function PnlReportPage() {
  const today = new Date();
  const thirtyAgo = new Date();
  thirtyAgo.setDate(thirtyAgo.getDate() - 30);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const [fromDate, setFromDate] = useState<string>(fmt(thirtyAgo));
  const [toDate, setToDate] = useState<string>(fmt(today));

  const { data, isFetching } = useQuery({
    queryKey: ["reports", "pnl", fromDate, toDate],
    queryFn: () =>
      ReportsAPI.pnl({
        from_date: toIso(fromDate),
        to_date: toIso(toDate),
      } as any),
    placeholderData: (prev) => prev,
  });

  const pdfParams = useMemo(
    () => ({
      from_date: toIso(fromDate),
      to_date: toIso(toDate),
    }),
    [fromDate, toDate],
  );

  const cols: Column<any>[] = [
    { key: "symbol", header: "Symbol" },
    { key: "buy_qty", header: "Buy qty", align: "right" },
    { key: "sell_qty", header: "Sell qty", align: "right" },
    { key: "buy_value", header: "Buy value", align: "right", render: (r) => formatINR(r.buy_value) },
    { key: "sell_value", header: "Sell value", align: "right", render: (r) => formatINR(r.sell_value) },
    { key: "charges", header: "Charges", align: "right", render: (r) => formatINR(r.charges) },
    {
      key: "pnl",
      header: "P&L",
      align: "right",
      render: (r) => <span className={pnlColor(r.pnl)}>{formatINR(r.pnl)}</span>,
    },
  ];

  function applyPreset(days: number) {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    setFromDate(fmt(start));
    setToDate(fmt(end));
  }

  // Window-aware description so the user always knows which slice the
  // numbers + the PDF download cover.
  const windowLabel =
    fromDate && toDate
      ? `${fromDate} → ${toDate} · By symbol`
      : fromDate
        ? `Since ${fromDate} · By symbol`
        : toDate
          ? `Until ${toDate} · By symbol`
          : "All time · By symbol";

  return (
    <div className="space-y-4">
      <PageHeader
        title="P&L report"
        description={windowLabel}
        actions={<ReportPdfButton kind="pnl" params={pdfParams} />}
      />

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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Trades" value={String(data?.total_trades ?? 0)} />
        <Stat label="Buy value" value={formatINR(data?.total_buy_value)} />
        <Stat label="Sell value" value={formatINR(data?.total_sell_value)} />
        <Stat label="Net P&L" value={formatINR(data?.net_pnl)} className={pnlColor(data?.net_pnl)} />
      </div>
      <DataTable columns={cols} rows={data?.by_symbol} keyExtractor={(r) => r.symbol} loading={isFetching && !data} />
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className={`font-tabular text-xl ${className ?? ""}`}>{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
