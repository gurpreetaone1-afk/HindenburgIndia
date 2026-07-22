"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { WalletAPI } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";

/**
 * Thin global banner shown ONLY for demo (paper) accounts. Surfaces the demo
 * balance and a Reset button (wipes paper trades + restores the admin-set
 * initial balance). Renders nothing for live users, so it's safe to mount in
 * every authenticated layout.
 */
export function DemoBanner() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["wallet-summary"],
    queryFn: () => WalletAPI.summary(),
    enabled: !!user?.is_demo,
    refetchInterval: 5000,
  });

  const resetMut = useMutation({
    mutationFn: () => WalletAPI.demoReset(),
    onSuccess: () => {
      toast.success("Demo account reset");
      // Refresh everything the paper account touches.
      for (const key of [
        ["wallet-summary"],
        ["positions", "open"],
        ["orders", "recent"],
        ["positions-closed"],
      ]) {
        qc.invalidateQueries({ queryKey: key });
      }
    },
    onError: (e: any) => toast.error(e?.message || "Reset failed"),
  });

  if (!user?.is_demo) return null;

  const bal = Number(data?.available_balance ?? 0);

  return (
    <div className="flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs">
      <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
        <FlaskConical className="size-3.5" />
        <span className="font-semibold uppercase tracking-wide">Demo account</span>
        <span className="text-muted-foreground">
          · Balance{" "}
          <span className="font-tabular font-semibold text-foreground">
            ₹{bal.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
          </span>
        </span>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="h-6 gap-1 border-amber-500/40 px-2 text-amber-700 hover:bg-amber-500 hover:text-white dark:text-amber-400"
        disabled={resetMut.isPending}
        onClick={() => {
          if (
            confirm(
              "Reset demo account? This wipes ALL your paper trades and restores the balance to the initial amount."
            )
          )
            resetMut.mutate();
        }}
      >
        <RotateCcw className="size-3" />
        {resetMut.isPending ? "Resetting…" : "Reset"}
      </Button>
    </div>
  );
}
