"use client";

// Port of apk src/features/wallet/screens/WithdrawScreen.tsx (LOOK). The
// BEHAVIOUR is the desktop wallet page's withdraw dialog: UPI or bank
// transfer, same validation, same `bank` payload, stable idempotency key,
// same toasts + invalidations. Saved bank accounts (the APK's picker) only
// pre-fill the bank fields — the request body is identical.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { IoAddCircleOutline, IoCardOutline, IoCheckmarkCircle, IoInformationCircleOutline } from "react-icons/io5";
import { WalletAPI, type WdRule } from "@/lib/api";
import { cn, formatINR } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { Screen, Header, Input, Tabs, GradientButton, Spinner, fmt } from "@/components/apk/ui";
import { DemoNotice, useLeave, walletQ } from "./common";

const QUICK_AMOUNTS = [500, 1000, 5000, 10000, 25000];
const EMPTY = {
  amount: "",
  mode: "UPI" as "UPI" | "BANK",
  upi_id: "",
  bank_name: "",
  account_number: "",
  ifsc_code: "",
  account_holder: "",
  remarks: "",
};

export function ApkWithdrawScreen() {
  const qc = useQueryClient();
  const leave = useLeave("/wallet");
  const isDemo = useAuthStore((s) => s.user?.is_demo ?? false);
  const summary = useQuery(walletQ.summary);
  const banks = useQuery(walletQ.myBanks);
  const [wd, setWd] = useState(EMPTY);
  const [wdSubmitting, setWdSubmitting] = useState(false);
  // One stable key per intended withdrawal — reused on retry, cleared after success.
  const wdIdemRef = useRef<string>("");

  // Pre-fill the bank fields from the default (or first) saved account.
  useEffect(() => {
    const list = (banks.data as any[]) ?? [];
    if (!list.length) return;
    const def = list.find((b) => b.is_default) ?? list[0];
    setWd((d) => (d.account_number ? d : fillFromBank(d, def)));
  }, [banks.data]);

  if (isDemo) return <DemoNotice title="Withdraw funds" />;

  async function submitWithdrawal() {
    if (wdSubmitting) return; // guard against double / triple clicks
    if (!wd.amount || Number(wd.amount) <= 0) return toast.error("Amount required");

    const bank: Record<string, string> = {};
    if (wd.mode === "UPI") {
      const vpa = wd.upi_id.trim();
      if (!vpa || !vpa.includes("@")) return toast.error("Enter a valid UPI ID (e.g. name@bank)");
      bank.upi_id = vpa;
    } else {
      if (!wd.account_number.trim()) return toast.error("Account number required");
      if (!wd.ifsc_code.trim()) return toast.error("IFSC required");
      if (!wd.account_holder.trim()) return toast.error("Account holder name required");
      bank.name = wd.bank_name.trim();
      bank.account_number = wd.account_number.trim();
      bank.ifsc = wd.ifsc_code.trim().toUpperCase();
      bank.holder = wd.account_holder.trim();
    }

    if (!wdIdemRef.current) {
      wdIdemRef.current =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    setWdSubmitting(true);
    try {
      await WalletAPI.createWithdrawal({
        amount: Number(wd.amount),
        remarks: wd.remarks,
        bank,
        idempotency_key: wdIdemRef.current,
      });
      toast.success("Withdrawal requested");
      wdIdemRef.current = "";
      setWd(EMPTY);
      qc.invalidateQueries({ queryKey: ["my-withdrawals"] });
      qc.invalidateQueries({ queryKey: ["wallet-summary"] });
      qc.invalidateQueries({ queryKey: ["wallet-txns"] });
      leave();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setWdSubmitting(false);
    }
  }

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setWd((d) => ({ ...d, [k]: e.target.value }));
  const list = (banks.data as any[]) ?? [];

  return (
    <Screen padded={false}>
      <div className="px-4">
        <Header title="Withdraw funds" back backHref="/wallet" />
      </div>
      <div className="flex flex-col gap-3 px-4 pb-28">
        <div className="flex flex-col gap-1.5 rounded-xl border border-apk-border bg-apk-elevated p-3">
          <div className="text-[11px] tracking-[0.5px] text-apk-muted">AVAILABLE TO WITHDRAW</div>
          <div className="text-[24px] font-bold text-apk-text tabular-nums">
            {fmt(Math.max(0, Number(summary.data?.available_balance ?? 0)))}
          </div>
          <div className="text-[11px] text-apk-dim">Enter your UPI ID or bank details. Admin approves before payout.</div>
        </div>

        <RulesBanner />

        <Input
          label="Amount"
          inputMode="decimal"
          value={wd.amount}
          onChange={(e) => setWd((d) => ({ ...d, amount: e.target.value.replace(/[^\d.]/g, "") }))}
          placeholder="0"
          className="tabular-nums"
        />
        <div className="flex flex-wrap gap-2">
          {QUICK_AMOUNTS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setWd((d) => ({ ...d, amount: String(v) }))}
              className="rounded-full border border-apk-border bg-apk-elevated px-3 py-1.5 text-[11px] font-semibold text-apk-text"
            >
              {v.toLocaleString("en-IN")}
            </button>
          ))}
        </div>

        <Tabs
          variant="pill"
          items={[
            { key: "UPI", label: "UPI" },
            { key: "BANK", label: "Bank transfer" },
          ]}
          activeKey={wd.mode}
          onChange={(k) => setWd((d) => ({ ...d, mode: k as "UPI" | "BANK" }))}
        />

        {wd.mode === "UPI" ? (
          <Input label="UPI ID" placeholder="name@bank" value={wd.upi_id} onChange={set("upi_id")} />
        ) : (
          <>
            <div className="mt-1 flex items-center justify-between">
              <span className="ml-1 text-[12px] text-apk-muted">Bank account</span>
              <Link href="/wallet/banks/add" className="flex items-center gap-1 text-[12px] font-semibold text-apk-primary">
                <IoAddCircleOutline size={14} /> Add new
              </Link>
            </div>
            {banks.isLoading ? (
              <div className="flex justify-center py-4 text-apk-primary">
                <Spinner />
              </div>
            ) : list.length ? (
              <div className="flex flex-col gap-2">
                {list.map((b) => (
                  <BankRow
                    key={b.id}
                    bank={b}
                    active={b.account_number === wd.account_number}
                    onClick={() => setWd((d) => fillFromBank(d, b))}
                  />
                ))}
              </div>
            ) : null}
            <Input label="Account holder name" value={wd.account_holder} onChange={set("account_holder")} />
            <Input label="Account number" inputMode="numeric" value={wd.account_number} onChange={set("account_number")} />
            <Input
              label="IFSC code"
              maxLength={11}
              className="uppercase"
              value={wd.ifsc_code}
              onChange={(e) => setWd((d) => ({ ...d, ifsc_code: e.target.value.toUpperCase() }))}
            />
            <Input label="Bank name (optional)" value={wd.bank_name} onChange={set("bank_name")} />
          </>
        )}

        <Input label="Remarks (optional)" placeholder="Add a note for the admin" value={wd.remarks} onChange={set("remarks")} />

        <GradientButton className="mt-3" label="Request withdrawal" loading={wdSubmitting} onClick={submitWithdrawal} />
      </div>
    </Screen>
  );
}

function fillFromBank(d: typeof EMPTY, b: any): typeof EMPTY {
  return {
    ...d,
    bank_name: b.bank_name ?? "",
    account_number: b.account_number ?? "",
    ifsc_code: String(b.ifsc_code ?? "").toUpperCase(),
    account_holder: b.account_holder ?? "",
  };
}

function BankRow({ bank, active, onClick }: { bank: any; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-xl p-3 text-left",
        active ? "border-2 border-apk-primary bg-apk-primary/[0.08]" : "border border-apk-border bg-apk-elevated",
      )}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-apk-primary/[0.18] text-apk-primary">
        <IoCardOutline size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold text-apk-text">{bank.bank_name}</span>
        <span className="block truncate text-[11px] text-apk-muted">
          {bank.account_holder} · •••• {String(bank.account_number).slice(-4)}
        </span>
      </span>
      {bank.is_verified ? <IoCheckmarkCircle size={16} className="text-apk-buy" /> : null}
    </button>
  );
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** APK-styled components/common/WdRulesBanner (kind="withdrawal"), same query. */
function RulesBanner() {
  const { data, isLoading } = useQuery({
    queryKey: ["user", "wd-rules"],
    queryFn: () => WalletAPI.wdRules(),
    staleTime: 60_000,
  });
  if (isLoading || !data) {
    return <div className="rounded-xl border border-apk-border bg-apk-elevated px-3 py-2 text-[12px] text-apk-muted">Loading rules…</div>;
  }
  const rule: WdRule = data.withdrawal;
  const allDays = !rule.allowed_days || rule.allowed_days.length === 0 || rule.allowed_days.length === 7;
  const days = allDays ? "All days" : rule.allowed_days!.map((d) => WEEKDAYS[d]).filter(Boolean).join(", ");
  return (
    <div className="rounded-xl border border-apk-primary/30 bg-apk-primary/[0.06] px-3 py-2.5">
      <div className="flex items-center gap-1.5 pb-2 text-apk-primary">
        <IoInformationCircleOutline size={14} />
        <span className="text-[12px] font-semibold">Withdrawal rules</span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        <Rule label="Min amount" value={formatINR(rule.min_amount)} />
        <Rule label="Max amount" value={formatINR(rule.max_amount)} />
        <Rule label="Allowed days" value={days} wide />
      </div>
    </div>
  );
}

function Rule({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={cn("min-w-0", wide && "col-span-2")}>
      <div className="text-[10px] uppercase tracking-wider text-apk-muted">{label}</div>
      <div className="truncate text-[12px] font-medium text-apk-text tabular-nums">{value}</div>
    </div>
  );
}
