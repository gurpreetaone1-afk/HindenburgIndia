"use client";

// Port of apk app/wallet/transactions.tsx (TxnRow look). Rows + filter +
// delete-pending behaviour = the desktop wallet's TransactionsFeed.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { IoArrowDown, IoArrowUp, IoReceiptOutline } from "react-icons/io5";
import { cn } from "@/lib/utils";
import { Screen, Header, Chip, fmt } from "@/components/apk/ui";
import { walletQ } from "./common";
import { buildFeed, isMoneyIn, DeleteRequestButton, type FeedKind } from "./feed";

const TITLE: Record<FeedKind, string> = {
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  admin_add: "Admin credit",
  admin_deduct: "Admin debit",
};

const STATUS = {
  completed: { label: "COMPLETED", cls: "text-apk-buy" },
  pending: { label: "PENDING", cls: "text-apk-warn" },
  rejected: { label: "REJECTED", cls: "text-apk-sell" },
} as const;

const FILTERS = [
  { key: "all", label: "All" },
  { key: "in", label: "Money in" },
  { key: "out", label: "Money out" },
] as const;

export function ApkTransactionsScreen() {
  const txns = useQuery(walletQ.txns);
  const deposits = useQuery(walletQ.deposits);
  const withdrawals = useQuery(walletQ.withdrawals);
  const [filter, setFilter] = useState<"all" | "in" | "out">("all");

  const rows = buildFeed(txns.data ?? [], deposits.data ?? [], withdrawals.data ?? []).filter((r) =>
    filter === "all" ? true : filter === "in" ? isMoneyIn(r.kind) : !isMoneyIn(r.kind),
  );

  return (
    <Screen padded={false}>
      <div className="px-4">
        <Header title="Transactions" back backHref="/wallet" />
      </div>
      <div className="apk-no-scrollbar flex gap-2 overflow-x-auto px-4 pb-1">
        {FILTERS.map((f) => (
          <Chip key={f.key} size="sm" label={f.label} active={filter === f.key} onClick={() => setFilter(f.key)} />
        ))}
      </div>
      <div className="px-4 pb-6">
        {txns.isLoading ? (
          <div className="py-4 text-[14px] text-apk-muted">Loading transactions…</div>
        ) : txns.isError ? (
          <div className="py-4 text-[14px] text-apk-sell">{(txns.error as Error)?.message || "Couldn't load transactions"}</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <IoReceiptOutline size={48} className="text-apk-dim" />
            <span className="text-[14px] text-apk-muted">No transactions yet</span>
            <span className="text-[12px] text-apk-dim">
              {filter === "in"
                ? "Deposits and admin credits will show here."
                : filter === "out"
                  ? "Withdrawals and admin debits will show here."
                  : "Use Add funds / Withdraw on the Wallet to get started."}
            </span>
          </div>
        ) : (
          rows.map((r) => {
            const credit = isMoneyIn(r.kind);
            return (
              <div key={r.id} className="flex items-center gap-3 border-b border-apk-border py-3.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-apk-surface">
                  {credit ? <IoArrowDown size={16} className="text-apk-buy" /> : <IoArrowUp size={16} className="text-apk-sell" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-medium text-apk-text">{TITLE[r.kind]}</div>
                  <div className="mt-0.5 truncate text-[11px] text-apk-muted">{r.narration}</div>
                  <div className="mt-0.5 text-[11px] text-apk-dim">
                    {new Date(r.date).toLocaleString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
                <div className="text-right">
                  <div className={cn("text-[14px] font-semibold tabular-nums", credit ? "text-apk-buy" : "text-apk-sell")}>
                    {credit ? "+" : "-"}
                    {fmt(r.amount)}
                  </div>
                  <div className={cn("mt-0.5 text-[11px]", STATUS[r.status].cls)}>{STATUS[r.status].label}</div>
                  {r.balance_after != null ? (
                    <div className="text-[10px] text-apk-dim tabular-nums">Bal {fmt(r.balance_after)}</div>
                  ) : null}
                </div>
                {r.status === "pending" && r.reqId && r.reqType ? <DeleteRequestButton id={r.reqId} type={r.reqType} /> : null}
              </div>
            );
          })
        )}
      </div>
    </Screen>
  );
}
