"use client";

// Shared bits for the phone (APK-style) wallet / profile / settings /
// support screens. Query options mirror app/(dashboard)/wallet/page.tsx
// exactly (same keys, same polls) so phone and desktop share one cache.

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { queryOptions } from "@tanstack/react-query";
import { IoFlaskOutline } from "react-icons/io5";
import { WalletAPI } from "@/lib/api";
import { APP_NAME } from "@/lib/constants";
import { useTenantBrand } from "@/lib/branding-context";
import { Screen, Header } from "@/components/apk/ui";

export const walletQ = {
  summary: queryOptions({
    queryKey: ["wallet-summary"],
    queryFn: () => WalletAPI.summary(),
    refetchInterval: 3000,
  }),
  txns: queryOptions({
    queryKey: ["wallet-txns"],
    queryFn: () => WalletAPI.transactions(50),
    refetchInterval: 5000,
  }),
  deposits: queryOptions({
    queryKey: ["my-deposits"],
    queryFn: () => WalletAPI.myDeposits(),
    refetchInterval: 3000,
  }),
  withdrawals: queryOptions({
    queryKey: ["my-withdrawals"],
    queryFn: () => WalletAPI.myWithdrawals(),
    refetchInterval: 5000,
  }),
  companyBanks: queryOptions({ queryKey: ["company-banks"], queryFn: () => WalletAPI.companyBanks() }),
  myBanks: queryOptions({ queryKey: ["my-banks"], queryFn: () => WalletAPI.myBankAccounts() }),
};

/** White-label brand name — tenant brand on an admin's domain, else the app name. */
export function useBrandName(): string {
  return useTenantBrand()?.name ?? APP_NAME;
}

/**
 * Phone-only route (APK stack screen with no desktop page). Renders the
 * phone screen below 768 px; on tablet / desktop it replaces the URL with
 * the nearest desktop page. Checks matchMedia directly so a hydration-time
 * `false` can never bounce a phone.
 */
export function PhoneRoute({ fallback, children }: { fallback: string; children: ReactNode }) {
  const router = useRouter();
  const isPhone = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
  useEffect(() => {
    if (!isPhone) router.replace(fallback);
  }, [isPhone, fallback, router]);
  return isPhone ? <>{children}</> : null;
}

/** Back to the previous screen, or `href` when this is the first entry. */
export function useLeave(href: string) {
  const router = useRouter();
  return () => (window.history.length > 1 ? router.back() : router.push(href));
}

/** Indian date + time, the APK's fmtIST(..., "dd MMM · hh:mm a"). */
export function istShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const day = d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short" });
  const time = d
    .toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true })
    .toUpperCase();
  return `${day} · ${time}`;
}

/** Demo accounts can't deposit / withdraw — same copy as DemoUpgradeDialog. */
export function DemoNotice({ title }: { title: string }) {
  const leave = useLeave("/wallet");
  return (
    <Screen>
      <Header title={title} back backHref="/wallet" />
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-apk-warn/10 text-apk-warn">
          <IoFlaskOutline size={28} />
        </span>
        <div className="text-[18px] font-bold text-apk-text">Demo Account</div>
        <p className="text-[14px] text-apk-muted">
          You&apos;re trading with <span className="font-semibold text-apk-text">₹50,00,000 virtual money</span>.
          Deposits and withdrawals are not available on demo accounts.
        </p>
        <p className="text-[12px] text-apk-dim">Open a real account to deposit funds and trade with real money.</p>
        <Link
          href="/register"
          className="mt-2 w-full rounded-xl bg-gradient-to-br from-apk-grad-from via-apk-grad-via to-apk-grad-to py-3.5 text-[15px] font-semibold text-white"
        >
          Open Real Account
        </Link>
        <button type="button" onClick={leave} className="py-2 text-[14px] font-semibold text-apk-muted">
          Continue with Demo
        </button>
      </div>
    </Screen>
  );
}
