"use client";

// Wallet money-in / money-out feed. buildFeed() is a verbatim copy of the
// row merge in app/(dashboard)/wallet/page.tsx (TransactionsFeed): ledger
// DEPOSIT / WITHDRAWAL / ADJUSTMENT rows + PENDING / REJECTED requests, no
// brokerage / settlement / P&L rows. Delete mirrors FeedRowItem.handleDelete.

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { IoTrashOutline } from "react-icons/io5";
import { WalletAPI } from "@/lib/api";
import { Spinner, useConfirm } from "@/components/apk/ui";

export type FeedKind = "deposit" | "withdrawal" | "admin_add" | "admin_deduct";
export type FeedRow = {
  id: string;
  kind: FeedKind;
  amount: number; // always positive — sign comes from `kind`
  date: string;
  status: "completed" | "pending" | "rejected";
  narration: string;
  balance_after?: number | null;
  reqId?: string;
  reqType?: "deposit" | "withdrawal";
};

export const isMoneyIn = (k: FeedKind) => k === "deposit" || k === "admin_add";

export function buildFeed(txns: any[], deposits: any[], withdrawals: any[]): FeedRow[] {
  const out: FeedRow[] = [];

  for (const t of txns) {
    const tt = String(t?.transaction_type ?? "").toUpperCase();
    const amt = Number(t?.amount ?? 0);
    const absAmt = Math.abs(amt);
    let kind: FeedKind | null = null;
    let narration = String(t?.narration ?? "").trim();
    if (tt === "DEPOSIT") {
      kind = "deposit";
      if (!narration) narration = "Deposit credited";
    } else if (tt === "WITHDRAWAL") {
      kind = "withdrawal";
      if (!narration) narration = "Withdrawal debited";
    } else if (tt === "ADJUSTMENT") {
      kind = amt >= 0 ? "admin_add" : "admin_deduct";
      if (!narration) narration = amt >= 0 ? "Admin credited funds" : "Admin debited funds";
    }
    if (!kind) continue;
    out.push({
      id: `txn-${t.id}`,
      kind,
      amount: absAmt,
      date: t.created_at,
      status: "completed",
      narration,
      balance_after: t.balance_after != null ? Number(t.balance_after) : null,
    });
  }

  for (const d of deposits) {
    const status = String(d?.status ?? "").toUpperCase();
    if (status !== "PENDING" && status !== "REJECTED") continue;
    out.push({
      id: `dep-${d.id}`,
      kind: "deposit",
      amount: Math.abs(Number(d.amount ?? 0)),
      date: d.created_at,
      status: status === "PENDING" ? "pending" : "rejected",
      narration:
        status === "REJECTED"
          ? `Deposit rejected${d.admin_remark ? ` — ${d.admin_remark}` : ""}`
          : `Deposit request · ${d.payment_mode ?? "manual"}`,
      balance_after: null,
      reqId: status === "PENDING" ? String(d.id) : undefined,
      reqType: status === "PENDING" ? "deposit" : undefined,
    });
  }

  for (const w of withdrawals) {
    const status = String(w?.status ?? "").toUpperCase();
    if (status !== "PENDING" && status !== "REJECTED") continue;
    out.push({
      id: `wd-${w.id}`,
      kind: "withdrawal",
      amount: Math.abs(Number(w.amount ?? 0)),
      date: w.created_at,
      status: status === "PENDING" ? "pending" : "rejected",
      narration:
        status === "REJECTED"
          ? `Withdrawal rejected${w.admin_remark ? ` — ${w.admin_remark}` : ""}`
          : `Withdrawal request · ${w.mode ?? "bank"}`,
      balance_after: null,
      reqId: status === "PENDING" ? String(w.id) : undefined,
      reqType: status === "PENDING" ? "withdrawal" : undefined,
    });
  }

  out.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return out;
}

/** Trash button for a PENDING deposit / withdrawal request. */
export function DeleteRequestButton({ id, type }: { id: string; type: "deposit" | "withdrawal" }) {
  const qc = useQueryClient();
  const [deleting, setDeleting] = useState(false);
  const [confirm, confirmDialog] = useConfirm();
  async function handleDelete() {
    const ok = await confirm({
      title: "Delete request?",
      message: `This pending ${type} request will be removed.`,
      confirmLabel: "Delete",
      danger: true,
      icon: <IoTrashOutline size={22} />,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      if (type === "deposit") await WalletAPI.deleteDeposit(id);
      else await WalletAPI.deleteWithdrawal(id);
      toast.success("Request deleted");
      qc.invalidateQueries({ queryKey: ["my-deposits"] });
      qc.invalidateQueries({ queryKey: ["my-withdrawals"] });
    } catch (e: any) {
      toast.error(e?.message || "Could not delete request");
    } finally {
      setDeleting(false);
    }
  }
  return (
    <>
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        aria-label="Delete pending request"
        className="-mr-1 grid size-8 shrink-0 place-items-center rounded-full text-apk-muted disabled:opacity-50"
      >
        {deleting ? <Spinner className="size-4" /> : <IoTrashOutline size={16} />}
      </button>
      {confirmDialog}
    </>
  );
}
