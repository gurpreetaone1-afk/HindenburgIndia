"use client";

// Phone port of apk app/ledger/index.tsx. Data logic is the web ledger
// page's: same ["ledger", range] query (last month, limit 1000), same
// cash-movement type filter, newest first, same summary numbers.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LedgerAPI } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button, Card, Header, Screen, fmt } from "@/components/apk/ui";
import { LabeledLoader, ist } from "@/components/apk/orders/shared";
import { ListRow } from "./ReportPage";

const VISIBLE_TYPES = new Set<string>([
  "DEPOSIT",
  "WITHDRAWAL",
  "SETTLEMENT_OUTSTANDING_BOOKED",
  "SETTLEMENT_OUTSTANDING_RECOVERY",
  "ADJUSTMENT",
  "BONUS",
  "PENALTY",
  "PROMO",
]);

const PAGE = 50;

export function ApkLedgerScreen() {
  const range = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setMonth(start.getMonth() - 1);
    return { from_date: start.toISOString(), to_date: now.toISOString() };
  }, []);
  const { data, isFetching, isError, error } = useQuery({
    queryKey: ["ledger", range],
    queryFn: () => LedgerAPI.list({ ...range, limit: 1000 }),
  });
  const [shown, setShown] = useState(PAGE);

  const rows = useMemo(
    () =>
      ((data?.rows ?? []) as any[])
        .filter((r) => VISIBLE_TYPES.has(r.type))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [data],
  );
  const opening = Number(data?.opening_balance ?? 0);
  const closing = Number(data?.closing_balance ?? 0);
  const net = closing - opening;
  const settlementBooked = Number(data?.total_settlement_booked ?? 0);

  return (
    <Screen padded={false}>
      <div className="px-4">
        <Header title="Ledger" back backHref="/profile" />
      </div>
      <div className="flex flex-col gap-2.5 p-4 pb-8">
        {isFetching && !data ? (
          <LabeledLoader label="Loading ledger…" />
        ) : isError && !data ? (
          <Card>
            <span className="text-[14px] text-apk-sell">{(error as Error | null)?.message ?? "Couldn't load ledger"}</span>
          </Card>
        ) : !data ? null : (
          <>
            <Card>
              <ListRow title="Opening balance" rightLabel={fmt(opening)} divider />
              <ListRow title="Closing balance" rightLabel={fmt(closing)} divider />
              <ListRow
                title="Net change"
                divider={settlementBooked > 0}
                rightNode={
                  <span className={cn("text-[14px] tabular-nums", net > 0 ? "text-apk-buy" : net < 0 ? "text-apk-sell" : "text-apk-muted")}>
                    {fmt(net)}
                  </span>
                }
              />
              {settlementBooked > 0 ? (
                <ListRow
                  title="Settlement booked"
                  subtitle="Informational — not deducted from your balance."
                  rightNode={<span className="text-[14px] font-semibold tabular-nums text-apk-warn">{fmt(settlementBooked)}</span>}
                />
              ) : null}
            </Card>

            {rows.length === 0 ? (
              <div className="py-8 text-center text-[14px] text-apk-muted">No ledger entries</div>
            ) : (
              rows.slice(0, shown).map((r) => {
                const isDebit = Number(r.debit) > 0;
                const amount = isDebit ? Number(r.debit) : Number(r.credit);
                return (
                  <Card key={r.id}>
                    <div className="flex items-center gap-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-2 text-[14px] font-medium text-apk-text">{r.particulars}</div>
                        <div className="mt-0.5 text-[11px] text-apk-muted">
                          {ist(r.date, { day: "2-digit", month: "short", year: "numeric" })}
                          {r.label ? ` · ${r.label}` : ""}
                        </div>
                      </div>
                      <div className="flex flex-col items-end">
                        <span
                          className={cn(
                            "text-[14px] font-bold tabular-nums",
                            !(amount > 0) ? "text-apk-muted" : r.is_settlement ? "text-apk-warn" : isDebit ? "text-apk-sell" : "text-apk-buy",
                          )}
                        >
                          {amount > 0 ? `${isDebit ? "-" : "+"}${fmt(amount)}` : "—"}
                        </span>
                        <span className="mt-0.5 text-[11px] tabular-nums text-apk-dim">Bal {fmt(r.balance)}</span>
                      </div>
                    </div>
                  </Card>
                );
              })
            )}
            {rows.length > shown ? (
              <Button label={`Show more (${shown} of ${rows.length})`} variant="ghost" size="sm" onClick={() => setShown((n) => n + PAGE)} />
            ) : null}
          </>
        )}
      </div>
    </Screen>
  );
}
