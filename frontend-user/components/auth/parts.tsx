import * as React from "react";
import { cn } from "@/lib/utils";

// Shared form primitives for the always-light /login + /register pages.
// Inline here so the auth flow does NOT pull from the dashboard-themed
// `<Input>` / `<Button>` primitives — those use CSS-var tokens that
// flip with dark mode, which would break the auth pages' fixed light look.

export const authInputClass = cn(
  "w-full rounded-xl border border-transparent bg-slate-100 px-4 py-3 text-sm text-slate-900",
  "placeholder:text-slate-400",
  "focus:border-[#2563eb] focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100",
  "transition-all duration-150",
);

export const authPrimaryButtonClass = cn(
  "inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#2563eb] px-6 py-3.5",
  "text-sm font-semibold text-white shadow-lg shadow-blue-200/60",
  "transition-all duration-150 hover:bg-blue-700 hover:shadow-blue-300/60",
  "disabled:cursor-not-allowed disabled:opacity-60",
);

interface FieldGroupProps {
  label: string;
  htmlFor: string;
  right?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
}

export function FieldGroup({ label, htmlFor, right, error, children }: FieldGroupProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={htmlFor} className="text-xs font-semibold uppercase tracking-wider text-slate-600">
          {label}
        </label>
        {right}
      </div>
      {children}
      {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
    </div>
  );
}
