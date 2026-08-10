"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, X, Copy, Trash2 } from "lucide-react";
import { ApiAccessAPI } from "@/lib/api";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusPill } from "@/components/common/StatusPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAdminAuthStore } from "@/stores/authStore";
import { canEdit } from "@/lib/permissions";

type ApiRow = {
  id: string;
  user_id: string;
  user_code: string | null;
  user_name: string | null;
  api_key: string;
  status: string;
  rejection_reason: string | null;
  created_at: string | null;
  updated_at: string | null;
  reviewed_at: string | null;
};

const FILTERS = ["PENDING", "APPROVED", "REJECTED", ""] as const;
const FILTER_LABEL: Record<string, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  "": "All",
};

export default function AdminApiAccessPage() {
  const qc = useQueryClient();
  const me = useAdminAuthStore((s) => s.admin);
  const canMutate = canEdit(me, "users");

  const [status, setStatus] = useState<string>("PENDING");
  const [rejecting, setRejecting] = useState<{ id: string; reason: string } | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const markBusy = (id: string) => setBusy((s) => new Set(s).add(id));
  const clearBusy = (id: string) =>
    setBusy((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });

  const { data, isFetching } = useQuery({
    queryKey: ["admin", "api-access", status],
    queryFn: () => ApiAccessAPI.list(status || undefined),
    // Live queue — new submissions appear without a manual refresh; the
    // AdminWsBridge api_access_update event also invalidates this key.
    refetchInterval: 5000,
    placeholderData: (prev) => prev,
  });

  async function approve(id: string) {
    if (busy.has(id)) return;
    markBusy(id);
    try {
      await ApiAccessAPI.approve(id);
      toast.success("API access approved");
      qc.invalidateQueries({ queryKey: ["admin", "api-access"] });
    } catch (e: any) {
      toast.error(e?.message || "Approve failed");
      qc.invalidateQueries({ queryKey: ["admin", "api-access"] });
    } finally {
      clearBusy(id);
    }
  }

  async function reject() {
    if (!rejecting) return;
    const reason = rejecting.reason.trim();
    const id = rejecting.id;
    if (busy.has(id)) return;
    markBusy(id);
    try {
      await ApiAccessAPI.reject(id, reason);
      toast.success("API access rejected");
      setRejecting(null);
      qc.invalidateQueries({ queryKey: ["admin", "api-access"] });
    } catch (e: any) {
      toast.error(e?.message || "Reject failed");
      qc.invalidateQueries({ queryKey: ["admin", "api-access"] });
    } finally {
      clearBusy(id);
    }
  }

  async function remove(id: string) {
    if (busy.has(id)) return;
    if (
      !window.confirm(
        "Delete this API-access request? The user loses API access and must submit a new key from the app.",
      )
    )
      return;
    markBusy(id);
    try {
      await ApiAccessAPI.remove(id);
      toast.success("API-access request deleted");
      qc.invalidateQueries({ queryKey: ["admin", "api-access"] });
    } catch (e: any) {
      toast.error(e?.message || "Delete failed");
      qc.invalidateQueries({ queryKey: ["admin", "api-access"] });
    } finally {
      clearBusy(id);
    }
  }

  function copyKey(k: string) {
    navigator.clipboard?.writeText(k).then(
      () => toast.success("API key copied"),
      () => toast.error("Copy failed"),
    );
  }

  const rows = data?.items ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="API Access"
        description="Clients submit an API key from the app. Approve to grant API access (flips the user's API-access permission on), or reject with a reason."
      />

      {/* Status filter */}
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          {rows.length} {FILTER_LABEL[status]?.toLowerCase() || "all"}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f || "all"}
              onClick={() => setStatus(f)}
              className={
                "rounded-full px-3 py-1 text-xs font-medium transition-colors " +
                (status === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground")
              }
            >
              {FILTER_LABEL[f]}
            </button>
          ))}
        </div>
      </div>

      {isFetching && !data && (
        <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Loading…
        </div>
      )}
      {!isFetching && rows.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No {FILTER_LABEL[status]?.toLowerCase() || ""} API-access requests.
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((r: ApiRow) => {
          const isPending = r.status === "PENDING";
          const accent =
            r.status === "PENDING"
              ? "before:bg-amber-500"
              : r.status === "APPROVED"
                ? "before:bg-emerald-500"
                : r.status === "REJECTED"
                  ? "before:bg-destructive"
                  : "before:bg-muted-foreground/30";
          return (
            <div
              key={r.id}
              className={`relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-card to-card/60 p-3 pl-4 shadow-sm before:absolute before:inset-y-2 before:left-1 before:w-1 before:rounded-full ${accent}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{r.user_name || "—"}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground font-mono">
                    {r.user_code || r.user_id?.slice(-8)}
                  </div>
                </div>
                <StatusPill status={r.status} />
              </div>

              {/* API key */}
              <div className="mt-2.5 space-y-1.5 rounded-lg bg-muted/30 p-2 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                    API Key
                  </span>
                  <button
                    onClick={() => copyKey(r.api_key)}
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <Copy className="size-3" /> Copy
                  </button>
                </div>
                <div className="break-all font-mono text-foreground">{r.api_key}</div>
                {r.updated_at && (
                  <div className="text-[10px] text-muted-foreground">
                    Submitted {new Date(r.updated_at).toLocaleString("en-IN")}
                  </div>
                )}
                {r.status === "REJECTED" && r.rejection_reason && (
                  <div className="text-[11px] text-destructive">Reason: {r.rejection_reason}</div>
                )}
              </div>

              <div className="mt-3 flex items-center gap-2">
                {isPending && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 flex-1 border-emerald-500/40 text-emerald-600 hover:bg-emerald-500 hover:text-white dark:text-emerald-400"
                      disabled={!canMutate || busy.has(r.id)}
                      onClick={() => canMutate && approve(r.id)}
                      title={canMutate ? "Approve API access" : "View-only access"}
                    >
                      <Check className="size-4" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 flex-1 border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                      disabled={!canMutate || busy.has(r.id)}
                      onClick={() => canMutate && setRejecting({ id: r.id, reason: "" })}
                      title={canMutate ? "Reject with reason" : "View-only access"}
                    >
                      <X className="size-4" /> Reject
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className={`h-9 ${isPending ? "px-2.5" : "flex-1"} border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground`}
                  disabled={!canMutate || busy.has(r.id)}
                  onClick={() => canMutate && remove(r.id)}
                  title={canMutate ? "Delete request - user must resubmit" : "View-only access"}
                >
                  <Trash2 className="size-4" />
                  {isPending ? "" : " Delete"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Reject dialog */}
      <Dialog open={!!rejecting} onOpenChange={(v) => !v && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject API access</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Reason (optional — shown to the user)"
            value={rejecting?.reason ?? ""}
            onChange={(e) => setRejecting((r) => (r ? { ...r, reason: e.target.value } : r))}
            onKeyDown={(e) => e.key === "Enter" && reject()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={reject}
              disabled={!!rejecting && busy.has(rejecting.id)}
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
