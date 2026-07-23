"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, X, FileText, ExternalLink } from "lucide-react";
import { KycAPI } from "@/lib/api";
import { API_URL } from "@/lib/constants";
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

type KycRow = {
  id: string;
  user_id: string;
  user_code: string | null;
  user_name: string | null;
  user_email: string | null;
  id_proof_type: string;
  id_proof_number: string | null;
  id_proof_url: string | null;
  address_proof_type: string;
  address_proof_url: string | null;
  address_text: string | null;
  status: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  admin_remark: string | null;
  rejection_reason: string | null;
};

const FILTERS = ["PENDING", "APPROVED", "REJECTED", ""] as const;
const FILTER_LABEL: Record<string, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  "": "All",
};

function absUrl(u: string | null): string | null {
  if (!u) return null;
  return u.startsWith("http") ? u : `${API_URL}${u}`;
}

export default function AdminKycPage() {
  const qc = useQueryClient();
  const me = useAdminAuthStore((s) => s.admin);
  const canMutate = canEdit(me, "kyc");

  const [status, setStatus] = useState<string>("PENDING");
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null);
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
    queryKey: ["admin", "kyc", status],
    queryFn: () => KycAPI.list(status || undefined) as Promise<KycRow[]>,
    // Live queue — new submissions from users appear without a manual
    // refresh; the AdminWsBridge kyc_update event also invalidates this key.
    refetchInterval: 5000,
    placeholderData: (prev) => prev,
  });

  async function approve(id: string) {
    if (busy.has(id)) return;
    markBusy(id);
    try {
      await KycAPI.approve(id);
      toast.success("KYC approved");
      qc.invalidateQueries({ queryKey: ["admin", "kyc"] });
    } catch (e: any) {
      toast.error(e?.message || "Approve failed");
      qc.invalidateQueries({ queryKey: ["admin", "kyc"] });
    } finally {
      clearBusy(id);
    }
  }

  async function reject() {
    if (!rejecting) return;
    const reason = rejecting.reason.trim();
    if (reason.length < 5) {
      toast.error("Reason required (min 5 characters)");
      return;
    }
    const id = rejecting.id;
    if (busy.has(id)) return;
    markBusy(id);
    try {
      await KycAPI.reject(id, reason);
      toast.success("KYC rejected");
      setRejecting(null);
      qc.invalidateQueries({ queryKey: ["admin", "kyc"] });
    } catch (e: any) {
      toast.error(e?.message || "Reject failed");
      qc.invalidateQueries({ queryKey: ["admin", "kyc"] });
    } finally {
      clearBusy(id);
    }
  }

  const rows = data ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="KYC Review"
        description="Verify user identity & address proofs. Approve to mark the user KYC-verified, or reject with a reason."
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

      {/* List */}
      {isFetching && !data && (
        <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Loading…
        </div>
      )}
      {!isFetching && rows.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No {FILTER_LABEL[status]?.toLowerCase() || ""} KYC submissions.
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => {
          const isPending = r.status === "PENDING";
          const accent =
            r.status === "PENDING"
              ? "before:bg-amber-500"
              : r.status === "APPROVED"
                ? "before:bg-emerald-500"
                : r.status === "REJECTED"
                  ? "before:bg-destructive"
                  : "before:bg-muted-foreground/30";
          const idUrl = absUrl(r.id_proof_url);
          const addrUrl = absUrl(r.address_proof_url);
          return (
            <div
              key={r.id}
              className={`relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-card to-card/60 p-3 pl-4 shadow-sm before:absolute before:inset-y-2 before:left-1 before:w-1 before:rounded-full ${accent}`}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{r.user_name || "—"}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                    <span className="font-mono">{r.user_code || r.user_id?.slice(-8)}</span>
                    {r.user_email && <span className="truncate">{r.user_email}</span>}
                  </div>
                </div>
                <StatusPill status={r.status} />
              </div>

              {/* Proof meta */}
              <div className="mt-2.5 space-y-1.5 rounded-lg bg-muted/30 p-2 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">
                    ID: <span className="font-medium text-foreground">{r.id_proof_type}</span>
                    {r.id_proof_number ? (
                      <span className="ml-1 font-mono">{r.id_proof_number}</span>
                    ) : null}
                  </span>
                  {idUrl && (
                    <button
                      onClick={() => setPreview({ url: idUrl, title: `ID proof — ${r.id_proof_type}` })}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <FileText className="size-3" /> View
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">
                    Address:{" "}
                    <span className="font-medium text-foreground">{r.address_proof_type}</span>
                  </span>
                  {addrUrl && (
                    <button
                      onClick={() =>
                        setPreview({ url: addrUrl, title: `Address proof — ${r.address_proof_type}` })
                      }
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <FileText className="size-3" /> View
                    </button>
                  )}
                </div>
                {r.address_text && (
                  <div className="text-muted-foreground">
                    <span className="text-[9px] uppercase tracking-wider">Address</span>
                    <div className="text-foreground">{r.address_text}</div>
                  </div>
                )}
                {r.submitted_at && (
                  <div className="text-[10px] text-muted-foreground">
                    Submitted {new Date(r.submitted_at).toLocaleString("en-IN")}
                  </div>
                )}
                {r.status === "REJECTED" && r.rejection_reason && (
                  <div className="text-[11px] text-destructive">Reason: {r.rejection_reason}</div>
                )}
                {r.status === "APPROVED" && r.admin_remark && (
                  <div className="text-[11px] text-emerald-600 dark:text-emerald-400">
                    Remark: {r.admin_remark}
                  </div>
                )}
              </div>

              {/* Actions */}
              {isPending && (
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 flex-1 border-emerald-500/40 text-emerald-600 hover:bg-emerald-500 hover:text-white dark:text-emerald-400"
                    disabled={!canMutate || busy.has(r.id)}
                    onClick={() => canMutate && approve(r.id)}
                    title={canMutate ? "Approve KYC" : "View-only access"}
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
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Proof preview */}
      <Dialog open={!!preview} onOpenChange={(v) => !v && setPreview(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{preview?.title || "Proof"}</DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-2">
              {/* Most proofs are images; PDFs won't render in <img>, so we
                  always offer an "Open in new tab" fallback below. */}
              <img
                src={preview.url}
                alt="Proof"
                className="max-h-[70vh] w-full rounded-md object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
              <a
                href={preview.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <ExternalLink className="size-4" /> Open in new tab
              </a>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={!!rejecting} onOpenChange={(v) => !v && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject KYC</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Reason (mandatory, min 5 characters)"
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
