"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Gift } from "lucide-react";
import { BonusesUserAPI, WalletAPI } from "@/lib/api";
import { formatINR } from "@/lib/utils";
import { BonusDrawer } from "./BonusDrawer";

/**
 * Shows the user's current bonus credit balance.
 * Hidden when credit is 0 AND no active bonuses exist (or when the
 * bonuses feature flag is off — 503 → treated as empty).
 */
export function BonusCard() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: summary } = useQuery({
    queryKey: ["wallet"],
    queryFn: () => WalletAPI.summary(),
    staleTime: 10_000,
  });

  const { data: bonuses = [] } = useQuery({
    queryKey: ["user-bonuses"],
    queryFn: () => BonusesUserAPI.myBonuses(),
    // Silently hide card if the bonuses feature is disabled (503) or
    // any other error.
    retry: false,
    throwOnError: false,
  });

  const credit = Number(summary?.credit_limit ?? 0);
  const activeBonuses = (bonuses as any[]).filter(
    (b: any) => (b.status ?? "ACTIVE") === "ACTIVE",
  );

  // Hide when nothing to show
  if (credit === 0 && activeBonuses.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className="w-full flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-left transition hover:bg-emerald-500/10"
      >
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-full bg-emerald-500/15 text-emerald-500">
            <Gift className="size-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
              Bonus Credit {formatINR(credit)}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {activeBonuses.length} active bonus{activeBonuses.length !== 1 ? "es" : ""} · tap to view
            </div>
          </div>
        </div>
        <span className="text-muted-foreground text-xs">›</span>
      </button>

      <BonusDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
