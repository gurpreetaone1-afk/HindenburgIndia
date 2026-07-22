"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, LogOut, Wallet as WalletIcon } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { UserWsBridge } from "@/components/common/UserWsBridge";
import { BottomNav } from "@/components/layout/BottomNav";
import { WalletAPI } from "@/lib/api";
import { cn, formatINR } from "@/lib/utils";
import {
  readWalletSnapshot,
  writeWalletSnapshot,
} from "@/lib/walletSnapshot";

/**
 * Full-bleed broker layout for the binary terminal — mirrors the
 * trading-terminal layout (back · theme · wallet · sign-out header,
 * no dashboard sidebar, no padded shell) so /binary opens as its
 * own page chrome rather than the dashboard-card surface it used
 * to live inside. UserWsBridge is mounted here so binary_settled
 * pushes keep the active / history tabs live without an extra WS
 * client per page.
 */
export default function BinaryLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    if (hydrated && !user) router.replace("/login");
  }, [hydrated, user, router]);

  // Wallet pill on the header — same shape as the dashboard topbar's
  // pill so users have a consistent affordance for "click to add funds".
  const { data: wallet, isLoading: walletLoading } = useQuery({
    queryKey: ["wallet", "summary"],
    queryFn: async () => {
      const s = await WalletAPI.summary();
      writeWalletSnapshot(s);
      return s;
    },
    refetchInterval: 8000,
    placeholderData: () => readWalletSnapshot(),
    enabled: !!user,
  });
  const hasBalance = wallet?.available_balance != null;
  const balance = Number(wallet?.available_balance ?? 0);

  if (!hydrated) {
    return (
      <div className="grid h-screen place-items-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!user) return null;

  return (
    <div className="flex h-screen min-h-0 flex-col bg-background">
      <UserWsBridge />

      <header className="relative z-20 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card px-3">
        <Button
          asChild
          variant="ghost"
          size="icon"
          aria-label="Back to dashboard"
          className="size-8"
        >
          <Link href="/dashboard">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div className="text-sm font-semibold">Binary Trading</div>

        <Link
          href="/wallet"
          className="ml-auto inline-flex max-w-[55vw] items-center gap-1.5 truncate rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 sm:max-w-none sm:gap-2 sm:px-3"
        >
          <WalletIcon className="size-3.5 shrink-0" />
          <span className="hidden text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:inline">
            Wallet
          </span>
          <span
            className={cn(
              "truncate font-tabular",
              !hasBalance && walletLoading && "text-muted-foreground/60"
            )}
          >
            {hasBalance ? formatINR(balance) : walletLoading ? "₹ —" : formatINR(balance)}
          </span>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Sign out"
            className="size-8"
            onClick={() => logout().then(() => (window.location.href = "/login"))}
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto pb-14 md:pb-0 lg:overflow-hidden">
        {children}
      </main>

      <BottomNav />
    </div>
  );
}
