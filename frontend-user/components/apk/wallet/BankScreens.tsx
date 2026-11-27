"use client";

// Ports of apk BankAccountsScreen + BankFormScreen (+ BankAccountCard,
// BankFormFields). The web backend only has GET / POST
// /user/wallet/bank-accounts (WalletAPI.myBankAccounts / addBankAccount),
// so there is no edit / delete / OTP gate here — list + add only.

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IoBusinessOutline, IoInformationCircleOutline, IoShieldCheckmarkOutline } from "react-icons/io5";
import { WalletAPI } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Screen, Header, Badge, Input, Toggle, GradientButton, Loader } from "@/components/apk/ui";
import { useLeave, walletQ } from "./common";

// Same cap the app enforces client-side (apk core/config/flags MAX_BANK_ACCOUNTS).
const MAX_BANK_ACCOUNTS = 5;

function maskAccount(n: string): string {
  const digits = (n ?? "").replace(/\s/g, "");
  if (digits.length <= 4) return digits;
  return `${"•".repeat(Math.min(digits.length - 4, 8))} ${digits.slice(-4)}`;
}

export function ApkBankAccountsScreen() {
  const router = useRouter();
  const banks = useQuery(walletQ.myBanks);
  const list = (banks.data as any[]) ?? [];
  const used = list.length;
  const canAdd = used < MAX_BANK_ACCOUNTS;
  const hasBank = used > 0;

  return (
    <Screen padded={false}>
      <div className="px-4">
        <Header title="Bank details" back backHref="/profile" />
      </div>
      <div className="flex flex-col gap-3 px-4 pb-8">
        <div
          className={cn(
            "flex gap-2.5 rounded-xl border p-3",
            hasBank ? "border-apk-border bg-apk-elevated" : "border-apk-primary bg-apk-primary-dim",
          )}
        >
          {hasBank ? (
            <IoShieldCheckmarkOutline size={18} className="shrink-0 text-apk-buy" />
          ) : (
            <IoInformationCircleOutline size={18} className="shrink-0 text-apk-primary" />
          )}
          <div className="flex-1">
            <div className="text-[14px] font-bold text-apk-text">{hasBank ? "Bank details on file" : "Add a payout account"}</div>
            <div className="mt-0.5 text-[12px] text-apk-muted">
              {hasBank
                ? "Payouts go to the account marked default. Keep it up to date."
                : "Add the bank account where you want withdrawals paid out."}
            </div>
          </div>
        </div>

        <div className="flex items-center">
          <span className="flex-1 text-[12px] text-apk-muted">
            {used} of {MAX_BANK_ACCOUNTS} accounts used
          </span>
          {!canAdd ? <span className="text-[11px] text-apk-warn">Limit reached</span> : null}
        </div>

        {banks.isLoading ? (
          <Loader />
        ) : banks.isError ? (
          <div className="text-[14px] text-apk-sell">{(banks.error as Error)?.message || "Couldn't load bank accounts"}</div>
        ) : (
          list.map((b) => (
            <div
              key={b.id}
              className={cn(
                "flex flex-col gap-1.5 rounded-xl border bg-apk-elevated p-3",
                b.is_default ? "border-apk-primary" : "border-apk-border",
              )}
            >
              <div className="flex items-center gap-2">
                <IoBusinessOutline size={18} className="text-apk-muted" />
                <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-apk-text">{b.bank_name}</span>
                {b.is_default ? <Badge label="DEFAULT" tone="primary" /> : null}
                {b.is_verified ? <Badge label="VERIFIED" tone="buy" /> : null}
              </div>
              <div className="text-[12px] text-apk-muted tabular-nums">
                {maskAccount(b.account_number)} · {b.ifsc_code}
              </div>
              <div className="text-[11px] text-apk-dim">
                {b.account_holder}
                {b.nickname ? ` · ${b.nickname}` : ""}
              </div>
            </div>
          ))
        )}

        <GradientButton
          label={hasBank ? "Add another bank account" : "Add bank details"}
          disabled={!canAdd || banks.isLoading}
          onClick={() => router.push("/wallet/banks/add")}
        />
        <div className="text-center text-[11px] text-apk-dim">To change or remove a saved account, contact support.</div>
      </div>
    </Screen>
  );
}

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export function ApkBankFormScreen() {
  const qc = useQueryClient();
  const leave = useLeave("/wallet/banks");
  const banks = useQuery(walletQ.myBanks);
  const blocked = ((banks.data as any[]) ?? []).length >= MAX_BANK_ACCOUNTS;
  const [f, setF] = useState({ bank_name: "", account_holder: "", account_number: "", ifsc_code: "", nickname: "", is_default: false });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof f, string>>>({});
  const [saving, setSaving] = useState(false);

  function validate() {
    const e: typeof errors = {};
    if (f.bank_name.trim().length < 2) e.bank_name = "Enter the bank name";
    if (f.account_holder.trim().length < 2) e.account_holder = "Enter the name as per passbook";
    if (!/^\d{9,18}$/.test(f.account_number)) e.account_number = "Account number must be 9-18 digits";
    if (!IFSC_RE.test(f.ifsc_code.trim())) e.ifsc_code = "Invalid IFSC — format XXXX0XXXXXX";
    if (f.nickname.trim().length > 24) e.nickname = "Keep it under 24 characters";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function save() {
    if (blocked || saving || !validate()) return;
    setSaving(true);
    try {
      await WalletAPI.addBankAccount({
        bank_name: f.bank_name.trim(),
        account_holder: f.account_holder.trim(),
        account_number: f.account_number,
        ifsc_code: f.ifsc_code.trim(),
        nickname: f.nickname.trim() || undefined,
        is_default: f.is_default,
      });
      toast.success("Bank added");
      qc.invalidateQueries({ queryKey: ["my-banks"] });
      leave();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen padded={false}>
      <div className="px-4">
        <Header title="Add bank account" back backHref="/wallet/banks" />
      </div>
      <div className="flex flex-col gap-3 px-4 pb-14">
        <p className="text-[12px] text-apk-muted">
          {blocked
            ? `You already have ${MAX_BANK_ACCOUNTS} saved accounts. Contact support to remove one first.`
            : "We pay approved withdrawals into this account, so the name must match your KYC."}
        </p>
        <Input
          label="Bank name"
          placeholder="e.g. HDFC Bank"
          value={f.bank_name}
          error={errors.bank_name}
          onChange={(e) => setF((s) => ({ ...s, bank_name: e.target.value }))}
        />
        <Input
          label="Account holder name"
          placeholder="As per passbook"
          value={f.account_holder}
          error={errors.account_holder}
          onChange={(e) => setF((s) => ({ ...s, account_holder: e.target.value }))}
        />
        <Input
          label="Account number"
          placeholder="A/C number"
          inputMode="numeric"
          value={f.account_number}
          error={errors.account_number}
          onChange={(e) => setF((s) => ({ ...s, account_number: e.target.value.replace(/\s/g, "") }))}
        />
        <Input
          label="IFSC code"
          placeholder="e.g. HDFC0001234"
          maxLength={11}
          value={f.ifsc_code}
          error={errors.ifsc_code}
          hint="11 characters, format XXXX0XXXXXX"
          onChange={(e) => setF((s) => ({ ...s, ifsc_code: e.target.value.toUpperCase() }))}
        />
        <Input
          label="Nickname (optional)"
          placeholder="Salary / Savings"
          value={f.nickname}
          error={errors.nickname}
          onChange={(e) => setF((s) => ({ ...s, nickname: e.target.value }))}
        />
        <div className="flex items-center rounded-xl border border-apk-border bg-apk-elevated px-3.5 py-3.5">
          <div className="flex-1">
            <div className="text-[14px] font-medium text-apk-text">Set as default</div>
            <div className="mt-0.5 text-[11px] text-apk-muted">Pre-selected for future withdrawals.</div>
          </div>
          <Toggle value={f.is_default} onChange={(v) => setF((s) => ({ ...s, is_default: v }))} />
        </div>
        <GradientButton label="Save bank account" loading={saving} disabled={blocked} onClick={save} />
      </div>
    </Screen>
  );
}
