"use client";

// Port of apk src/features/wallet/screens/WalletScreen.tsx. Data = the
// desktop wallet page's queries (walletQ). "Recent transactions" uses the
// desktop's money-in / money-out filter (no brokerage / P&L rows).

import type { ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  IoArrowDown,
  IoArrowUp,
  IoWalletOutline,
  IoReceiptOutline,
  IoArrowDownCircleOutline,
  IoArrowUpCircleOutline,
  IoCheckmarkCircle,
  IoCloseCircle,
  IoTimeOutline,
} from "react-icons/io5";
import { cn } from "@/lib/utils";
import { Screen, Header, fmt } from "@/components/apk/ui";
import { walletQ, istShort } from "./common";
import { buildFeed, isMoneyIn, DeleteRequestButton } from "./feed";

export function ApkWalletScreen() {
  const summary = useQuery(walletQ.summary);
  const txns = useQuery(walletQ.txns);
  const deposits = useQuery(walletQ.deposits);
  const withdrawals = useQuery(walletQ.withdrawals);

  const s = summary.data ?? {};
  const pendingDeposits = (deposits.data ?? []).filter((d: any) => d.status === "PENDING").length;
  const pendingWithdrawals = (withdrawals.data ?? []).filter((w: any) => w.status === "PENDING").length;
  const recent = buildFeed(txns.data ?? [], [], []);

  return (
    <Screen padded={false}>
      <div className="px-4">
        <Header title="Wallet" back />
      </div>
      <div className="flex flex-col gap-3 px-4 pb-10">
        {/* Hero — never show a negative balance (shortfall lives in settlement_outstanding). */}
        <div className="flex flex-col gap-4 rounded-2xl bg-gradient-to-br from-apk-grad-from via-apk-grad-via to-apk-grad-to p-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 text-white/85">
              <IoWalletOutline size={12} />
              <span className="text-[10px] font-bold tracking-[0.8px]">AVAILABLE BALANCE</span>
            </div>
            <div className="truncate text-[28px] font-extrabold leading-9 text-white tabular-nums">
              {summary.isLoading ? "—" : fmt(Math.max(0, Number(s.available_balance ?? 0)))}
            </div>
            {summary.isError ? (
              <div className="text-[11px] text-white/85">{(summary.error as Error)?.message}</div>
            ) : null}
          </div>
          <div className="flex rounded-xl bg-black/[0.18] px-1 py-3.5">
            <HeroStat label="Used" value={fmt(s.used_margin ?? 0)} />
            <div className="my-1 w-px bg-white/[0.18]" />
            <HeroStat label="Credit" value={fmt(s.credit_limit ?? 0)} />
            <div className="my-1 w-px bg-white/[0.18]" />
            <HeroStat label="Realised P&L" value={fmt(s.realized_pnl ?? 0)} />
          </div>
        </div>

        <div className="flex gap-2.5">
          <ActionButton href="/wallet/deposit" icon={<IoArrowDown size={16} />} label="Add funds" primary />
          <ActionButton href="/wallet/withdraw" icon={<IoArrowUp size={16} />} label="Withdraw" />
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <StatTile label="Total deposits" value={fmt(s.total_deposits ?? 0)} />
          <StatTile label="Total withdrawals" value={fmt(s.total_withdrawals ?? 0)} />
          <StatTile label="Pending deposits" value={String(pendingDeposits)} hint="awaiting approval" warn={pendingDeposits > 0} />
          <StatTile
            label="Pending withdrawals"
            value={String(pendingWithdrawals)}
            hint="awaiting approval"
            warn={pendingWithdrawals > 0}
          />
        </div>

        <SectionHeader title="Recent transactions" right={recent.length > 0 ? { label: "View all", href: "/wallet/transactions" } : undefined} />
        {txns.isLoading ? (
          <Skeleton />
        ) : recent.length === 0 ? (
          <EmptyRow message="No transactions yet" icon={<IoReceiptOutline size={26} />} />
        ) : (
          <div className="rounded-xl border border-apk-border bg-apk-elevated px-3">
            {recent.slice(0, 6).map((r) => {
              const credit = isMoneyIn(r.kind);
              return (
                <div key={r.id} className="flex items-center gap-2.5 border-b border-apk-border py-3 last:border-b-0">
                  <span
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-full",
                      credit ? "bg-apk-buy/[0.18] text-apk-buy" : "bg-apk-sell/[0.18] text-apk-sell",
                    )}
                  >
                    {credit ? <IoArrowDown size={14} /> : <IoArrowUp size={14} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-apk-text">{r.narration}</div>
                    <div className="text-[11px] text-apk-dim">{istShort(r.date)}</div>
                  </div>
                  <div className="text-right">
                    <div className={cn("text-[13px] font-bold tabular-nums", credit ? "text-apk-buy" : "text-apk-sell")}>
                      {credit ? "+" : "-"}
                      {fmt(r.amount)}
                    </div>
                    {r.balance_after != null ? (
                      <div className="text-[11px] text-apk-dim tabular-nums">{fmt(r.balance_after)} bal</div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <SectionHeader title="Deposit requests" />
        <RequestList rows={deposits.data ?? []} kind="deposit" loading={deposits.isLoading} />

        <SectionHeader title="Withdrawal requests" />
        <RequestList rows={withdrawals.data ?? []} kind="withdrawal" loading={withdrawals.isLoading} />
      </div>
    </Screen>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-[3px] px-1">
      <div className="line-clamp-2 text-center text-[9px] font-bold uppercase tracking-[0.5px] text-white/70">{label}</div>
      <div className="max-w-full truncate text-center text-[13px] font-bold text-white tabular-nums">{value}</div>
    </div>
  );
}

function ActionButton({ href, icon, label, primary }: { href: string; icon: ReactNode; label: string; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "flex flex-1 items-center justify-center rounded-xl border py-3.5 text-[14px] font-semibold",
        primary ? "border-apk-primary bg-apk-primary text-white" : "border-apk-border bg-apk-elevated text-apk-text",
      )}
    >
      <span className="mr-2 inline-flex">{icon}</span>
      {label}
    </Link>
  );
}

function StatTile({ label, value, hint, warn }: { label: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-1 rounded-xl border bg-apk-elevated p-3", warn ? "border-apk-warn/40" : "border-apk-border")}>
      <div className="text-[11px] uppercase tracking-[0.4px] text-apk-muted">{label}</div>
      <div className={cn("truncate text-[18px] font-bold tabular-nums", warn ? "text-apk-warn" : "text-apk-text")}>{value}</div>
      {hint ? <div className="text-[11px] text-apk-dim">{hint}</div> : null}
    </div>
  );
}

function SectionHeader({ title, right }: { title: string; right?: { label: string; href: string } }) {
  return (
    <div className="mt-2 flex items-center justify-between">
      <div className="text-[15px] font-bold text-apk-text">{title}</div>
      {right ? (
        <Link href={right.href} className="text-[12px] font-semibold text-apk-primary">
          {right.label}
        </Link>
      ) : null}
    </div>
  );
}

function RequestList({ rows, kind, loading }: { rows: any[]; kind: "deposit" | "withdrawal"; loading: boolean }) {
  if (loading) return <Skeleton />;
  if (rows.length === 0)
    return (
      <EmptyRow
        message={`No ${kind} requests yet`}
        icon={kind === "deposit" ? <IoArrowDownCircleOutline size={26} /> : <IoArrowUpCircleOutline size={26} />}
      />
    );
  return (
    <div className="rounded-xl border border-apk-border bg-apk-elevated px-3">
      {rows.slice(0, 4).map((r) => {
        const status = String(r.status);
        const tone =
          status === "APPROVED" || status === "COMPLETED" ? "ok" : status === "REJECTED" || status === "CANCELLED" ? "danger" : "warn";
        const color = tone === "ok" ? "text-apk-buy" : tone === "danger" ? "text-apk-sell" : "text-apk-warn";
        const Icon = tone === "ok" ? IoCheckmarkCircle : tone === "danger" ? IoCloseCircle : IoTimeOutline;
        return (
          <div key={r.id} className="flex items-center gap-2.5 border-b border-apk-border py-3 last:border-b-0">
            <Icon size={18} className={cn("shrink-0", color)} />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-bold text-apk-text tabular-nums">{fmt(r.amount)}</div>
              <div className="text-[11px] text-apk-dim">{istShort(r.created_at)}</div>
            </div>
            <span className={cn("rounded-full bg-apk-surface px-2 py-[3px] text-[10px] font-bold", color)}>{status}</span>
            {status === "PENDING" ? <DeleteRequestButton id={String(r.id)} type={kind} /> : null}
          </div>
        );
      })}
    </div>
  );
}

function EmptyRow({ message, icon }: { message: string; icon: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-apk-border bg-apk-elevated py-4">
      <span className="text-apk-dim">{icon}</span>
      <span className="text-[12px] text-apk-muted">{message}</span>
    </div>
  );
}

function Skeleton() {
  return <div className="h-20 animate-pulse rounded-xl border border-apk-border bg-apk-elevated" />;
}
