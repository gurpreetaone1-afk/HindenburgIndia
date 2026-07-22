"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldCheck, Mail, Copy, ExternalLink, Clock } from "lucide-react";
import { ConsentAPI } from "@/lib/api";

/**
 * First-login Client Consent & Declaration — blocking, non-dismissable.
 *
 * States (driven by the backend):
 *   - "none": show the declaration + email options (Gmail / Outlook / mail
 *     app / copy). The "I have sent the email" button unlocks only after the
 *     user opens one. On submit it goes to the owning admin/broker for
 *     approval (auto-accepted if they opted in).
 *   - "pending": awaiting the owner's approval — the user stays blocked; we
 *     poll so the gate clears the moment they're accepted.
 *   - "accepted": nothing renders.
 * A previously rejected submission comes back as "none" with a reason.
 * Copy is English.
 */
export function ConsentGate() {
  const qc = useQueryClient();
  const [opened, setOpened] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { data } = useQuery({
    queryKey: ["consent-declaration"],
    queryFn: () => ConsentAPI.declaration(),
    refetchOnWindowFocus: false,
    retry: 1,
    // Poll while awaiting approval so the gate clears on accept/reject.
    refetchInterval: (q: any) =>
      q?.state?.data?.state === "pending" ? 8000 : false,
  });

  if (!data?.required) return null;

  // ── Pending approval ──────────────────────────────────────────────
  if (data.state === "pending") {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 p-8 text-center">
          <div className="grid size-12 place-items-center rounded-full bg-amber-500/15 text-amber-500">
            <Clock className="size-6" />
          </div>
          <h2 className="text-base font-semibold">Consent submitted — awaiting approval</h2>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Your consent declaration has been submitted to{" "}
            <span className="font-medium text-foreground">{data.brand}</span> and is pending
            approval. You'll be able to continue as soon as it's accepted. This page updates
            automatically.
          </p>
          <button
            type="button"
            onClick={() => qc.invalidateQueries({ queryKey: ["consent-declaration"] })}
            className="mt-1 inline-flex h-9 items-center justify-center rounded-lg border border-border px-4 text-xs font-semibold hover:bg-muted/40"
          >
            Refresh status
          </button>
        </div>
      </Shell>
    );
  }

  // ── Needs submission (state "none", incl. after a rejection) ───────
  const to = data.to_email;
  const enc = encodeURIComponent;
  const mailto = `mailto:${enc(to)}?subject=${enc(data.subject)}&body=${enc(data.body)}`;
  const gmail =
    `https://mail.google.com/mail/?view=cm&fs=1&to=${enc(to)}` +
    `&su=${enc(data.subject)}&body=${enc(data.body)}`;
  const outlook =
    `https://outlook.office.com/mail/deeplink/compose?to=${enc(to)}` +
    `&subject=${enc(data.subject)}&body=${enc(data.body)}`;

  const openWeb = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
    setOpened(true);
  };
  const openMailApp = () => {
    window.location.href = mailto;
    setOpened(true);
  };
  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(`To: ${to}\nSubject: ${data.subject}\n\n${data.body}`);
      toast.success("Copied — paste it into a new email to " + to);
      setOpened(true);
    } catch {
      toast.error("Could not copy. Please select the text manually.");
    }
  };

  const submit = async () => {
    if (!opened) return;
    setSubmitting(true);
    try {
      await ConsentAPI.submit();
      await qc.invalidateQueries({ queryKey: ["consent-declaration"] });
    } catch (e: any) {
      toast.error(e?.message || "Could not submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Shell>
      {/* Header */}
      <div className="flex items-start gap-3 border-b border-border p-4">
        <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
          <ShieldCheck className="size-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold">Consent &amp; Declaration Required</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            To activate your services, email the declaration below to{" "}
            <span className="font-medium text-foreground">{data.brand}</span> support. Open a
            pre-filled email, send it, then tap “I have sent the email”.
          </p>
          {data.reject_reason && (
            <p className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
              Your previous submission was rejected: {data.reject_reason}. Please re-send and
              submit again.
            </p>
          )}
        </div>
      </div>

      {/* To */}
      <div className="flex items-center gap-2 border-b border-border bg-background/40 px-4 py-2 text-xs">
        <span className="text-muted-foreground">To:</span>
        <span className="min-w-0 flex-1 truncate font-medium">{to}</span>
      </div>

      {/* Declaration */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-background/40 p-4 scrollbar-thin">
        <pre className="whitespace-pre-wrap break-words font-sans text-[11px] leading-relaxed text-muted-foreground">
          {data.body}
        </pre>
      </div>

      {/* Send options */}
      <div className="space-y-2 border-t border-border p-4">
        <p className="text-[11px] font-medium text-muted-foreground">Open a pre-filled email:</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => openWeb(gmail)} className={BTN_PRIMARY}>
            <ExternalLink className="size-4" /> Gmail
          </button>
          <button type="button" onClick={() => openWeb(outlook)} className={BTN}>
            <ExternalLink className="size-4" /> Outlook
          </button>
          <button type="button" onClick={openMailApp} className={BTN}>
            <Mail className="size-4" /> Email app
          </button>
          <button type="button" onClick={copyAll} className={BTN}>
            <Copy className="size-4" /> Copy text
          </button>
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={!opened || submitting}
          className="mt-1 inline-flex h-11 w-full items-center justify-center rounded-lg bg-emerald-600 text-sm font-semibold text-white transition-colors hover:bg-emerald-600/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "I have sent the email"}
        </button>
        {!opened && (
          <p className="text-center text-[10px] text-muted-foreground">
            Open the email above and send it first — then this button unlocks.
          </p>
        )}
      </div>
    </Shell>
  );
}

const BTN =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border text-sm font-semibold transition-colors hover:bg-muted/40";
const BTN_PRIMARY =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        {children}
      </div>
    </div>
  );
}
