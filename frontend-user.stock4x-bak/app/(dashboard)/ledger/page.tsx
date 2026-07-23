"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LedgerAPI } from "@/lib/api";
import { PageHeader } from "@/components/common/PageHeader";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatINR, pnlColor } from "@/lib/utils";

const PAGE_SIZE = 50;

export default function UserLedgerPage() {
  const [page, setPage] = useState(1);
  const { data, isFetching } = useQuery({
    queryKey: ["ledger", page],
    queryFn: () => LedgerAPI.list({ page, page_size: PAGE_SIZE }),
    placeholderData: (prev) => prev,
  });

  const totalPages = Number(data?.meta?.total_pages ?? 1);
  const total = Number(data?.meta?.total ?? data?.count ?? 0);

  const cols: Column<any>[] = [
    { key: "date", header: "Date", render: (r) => new Date(r.date).toLocaleString() },
    { key: "particulars", header: "Particulars", className: "max-w-[400px] truncate" },
    {
      key: "debit",
      header: "Debit",
      align: "right",
      render: (r) => (r.debit ? formatINR(r.debit) : ""),
    },
    {
      key: "credit",
      header: "Credit",
      align: "right",
      render: (r) => (r.credit ? formatINR(r.credit) : ""),
    },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      render: (r) => <span className={pnlColor(r.balance)}>{formatINR(r.balance)}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Ledger" description={`${total} entries`} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Opening balance</CardDescription>
            <CardTitle className="font-tabular text-xl">{formatINR(data?.opening_balance)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Closing balance</CardDescription>
            <CardTitle className="font-tabular text-xl">{formatINR(data?.closing_balance)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Net change</CardDescription>
            <CardTitle className={`font-tabular text-xl ${pnlColor((data?.closing_balance ?? 0) - (data?.opening_balance ?? 0))}`}>
              {formatINR((data?.closing_balance ?? 0) - (data?.opening_balance ?? 0))}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>
      <DataTable columns={cols} rows={data?.rows} keyExtractor={(r) => r.id} loading={isFetching && !data} />
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Prev
          </Button>
          <span className="self-center text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
