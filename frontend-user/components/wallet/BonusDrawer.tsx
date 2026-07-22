"use client";

import { useQuery } from "@tanstack/react-query";
import { BonusesUserAPI } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface BonusDrawerProps {
  open: boolean;
  onClose: () => void;
}

function daysUntil(dateStr: string): number {
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function statusPillClass(status: string): string {
  switch (status?.toUpperCase()) {
    case "ACTIVE":
      return "bg-emerald-500/15 text-emerald-500";
    case "COMPLETED":
      return "bg-primary/15 text-primary";
    case "CANCELLED":
    case "EXPIRED":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function BonusDrawer({ open, onClose }: BonusDrawerProps) {
  const { data: bonuses = [], isLoading } = useQuery({
    queryKey: ["user-bonuses"],
    queryFn: () => BonusesUserAPI.myBonuses(),
    enabled: open,
    retry: false,
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Your Bonuses</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Loading bonuses…
          </div>
        ) : bonuses.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No active bonuses
          </div>
        ) : (
          <ul className="space-y-3">
            {bonuses.map((b: any) => {
              const days = b.expires_at ? daysUntil(b.expires_at) : null;
              const originalAmount = Number(b.original_amount ?? b.amount ?? 0);
              const currentCredit = Number(b.current_credit ?? b.credit_amount ?? 0);

              return (
                <li
                  key={b.id ?? b.bonus_id}
                  className="rounded-xl border border-border bg-card p-4 space-y-3"
                >
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">
                        {b.template_name_snapshot ?? b.template_name ?? "Bonus"}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        Original ₹{originalAmount.toLocaleString("en-IN")} · Credit ₹{currentCredit.toLocaleString("en-IN")}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        statusPillClass(b.status),
                      )}
                    >
                      {b.status ?? "ACTIVE"}
                    </span>
                  </div>

                  {/* Expiry */}
                  {days !== null && (
                    <div className="text-[11px] text-muted-foreground">
                      {days === 0
                        ? "Expires today"
                        : `Expires in ${days} day${days === 1 ? "" : "s"}`}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
