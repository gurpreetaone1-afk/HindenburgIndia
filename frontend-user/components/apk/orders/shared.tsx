"use client";

// Bits shared by the phone Orders + Portfolio screens (ports of apk
// shared/components/IllustrationEmpty + SketchIllustration, the Loader with
// a label, and the All / Buy / Sell / SL·TP chip strip both blotters use).

import type { ReactNode } from "react";
import { cn, parseBackendDate } from "@/lib/utils";
import { Spinner } from "@/components/apk/ui";

/** Backend datetime → IST string (backend may send naive UTC; parseBackendDate fixes that). */
export function ist(v: string | null | undefined, opts: Intl.DateTimeFormatOptions): string {
  const d = parseBackendDate(v);
  return d ? d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", ...opts }) : "";
}

export function SketchIllustration({ kind, size = 220 }: { kind: "clipboard" | "briefcase"; size?: number }) {
  const id = `apk-sketch-${kind}`;
  const s = `url(#${id})`;
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#F97316" />
        </linearGradient>
      </defs>
      {kind === "clipboard" ? (
        <>
          <path d="M50 40 H140 V170 H50 Z" stroke={s} strokeWidth="2" strokeLinejoin="round" />
          <path d="M80 30 H110 V50 H80 Z" stroke={s} strokeWidth="2" />
          <path d="M55 75 L40 105 L65 95 Z" stroke={s} strokeWidth="2" />
          <path d="M140 170 L160 150 L140 150 Z" stroke={s} strokeWidth="2" />
          {[90, 105, 120, 135].map((y) => (
            <path key={y} d={`M55 ${y + 80} L120 ${y + 80}`} stroke={s} strokeWidth="1" opacity="0.5" />
          ))}
        </>
      ) : (
        <>
          <rect x="40" y="80" width="120" height="80" stroke={s} strokeWidth="2" />
          <path d="M70 80 V60 H130 V80" stroke={s} strokeWidth="2" />
          <path d="M40 160 L155 50" stroke={s} strokeWidth="1" opacity="0.5" />
          <path d="M40 80 L155 50" stroke={s} strokeWidth="2" />
          <path d="M155 50 V130" stroke={s} strokeWidth="2" />
          <path d="M155 130 L160 160" stroke={s} strokeWidth="2" />
        </>
      )}
    </svg>
  );
}

export function IllustrationEmpty({
  kind,
  title,
  description,
  action,
}: {
  kind: "clipboard" | "briefcase";
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-6 text-center">
      <SketchIllustration kind={kind} />
      <div className="text-[18px] font-medium text-apk-text">{title}</div>
      {description ? <div className="text-[14px] text-apk-muted">{description}</div> : null}
      {action}
    </div>
  );
}

/** apk Loader with `label` (+ `fullscreen` = flex-1). */
export function LabeledLoader({ label }: { label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
      <Spinner className="text-apk-primary" />
      <span className="text-[14px] text-apk-muted">{label}</span>
    </div>
  );
}

export type SideFilter = "all" | "buy" | "sell" | "sltp";

const PILLS: { key: SideFilter; label: string; on: string }[] = [
  { key: "all", label: "All", on: "border-apk-text bg-apk-surface text-apk-text" },
  { key: "buy", label: "Buy", on: "border-apk-buy bg-apk-buy-dim text-apk-buy" },
  { key: "sell", label: "Sell", on: "border-apk-sell bg-apk-sell-dim text-apk-sell" },
  { key: "sltp", label: "SL · TP", on: "border-apk-primary bg-apk-primary-dim text-apk-primary" },
];

/** 4-pill strip — All / Buy / Sell / SL·TP (same on Orders and Portfolio). */
export function SideFilterChips({
  active,
  onChange,
  className,
}: {
  active: SideFilter;
  onChange: (next: SideFilter) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-2 px-4", className)}>
      {PILLS.map((p) => (
        <button
          key={p.key}
          type="button"
          aria-pressed={p.key === active}
          onClick={() => onChange(p.key)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-[11px] font-extrabold tracking-[0.4px]",
            p.key === active ? p.on : "border-apk-border bg-apk-elevated text-apk-muted",
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
