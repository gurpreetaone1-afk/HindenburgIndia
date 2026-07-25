"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { ReportPdfButton } from "@/components/common/ReportPdfButton";
import { DateRangeBar, toIsoFrom, toIsoTo, type DateRange } from "@/components/common/DateRangeBar";
import { Card } from "@/components/ui/card";

// Reports is now a single "download your trade book" page — the trades
// DataTable / mobile list / pagination were removed. The PDF is rendered
// server-side by ReportPdfButton, so no client-side rows fetch is needed.
export default function TradebookPage() {
  const [range, setRange] = useState<DateRange>(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 30);
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { from: iso(from), to: iso(to) };
  });

  const range_iso = useMemo(
    () => ({ from_date: toIsoFrom(range.from), to_date: toIsoTo(range.to) }),
    [range],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        back
        title="Tradebook"
        description="Choose a date range and download your trade book."
        actions={
          <div className="flex gap-2">
            <ReportPdfButton kind="tradebook" params={{ ...range_iso, limit: 2000 }} label="Simple PDF" />
            <ReportPdfButton kind="tradebook/full" params={{ ...range_iso }} label="Full Tradebook" />
          </div>
        }
      />

      <Card className="p-4">
        <div className="mb-3 text-sm font-medium">Select period</div>
        <DateRangeBar simple value={range} onChange={setRange} />
      </Card>
    </div>
  );
}
