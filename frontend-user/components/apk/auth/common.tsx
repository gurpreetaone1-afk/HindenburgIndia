"use client";

// Ports of apk src/features/auth/components/AuthHero.tsx and
// src/shared/ui/OtpInput.tsx, plus the phone auth scope (auth pages sit
// outside the dashboard's ApkShell). Brand lockup is white-label: the
// tenant's logo + name when one is resolved, else the platform mark.

import { useEffect, useState, type ReactNode } from "react";
import { useBranding } from "@/lib/branding-context";
import { API_URL, APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { HindenburgMark } from "@/components/layout/HindenburgMark";
import { Header, Spinner } from "@/components/apk/ui";

/** `.apk` scope for (auth) pages on phones — same theme + page bg as ApkShell. */
export function ApkAuthScope({ children }: { children: ReactNode }) {
  // Same "apk-theme" key ApkShell reads. Not imported from ApkShell so the
  // auth bundle doesn't pull in the order-ticket provider it mounts.
  const [theme] = useState<"dark" | "light">(() => {
    try {
      // Light unless the user picked dark — same default as ApkShell.
      return localStorage.getItem("apk-theme") === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });
  useEffect(() => {
    const el = document.documentElement;
    const prev = el.style.backgroundColor;
    el.style.backgroundColor = theme === "light" ? "#ffffff" : "#0d0d0d";
    return () => {
      el.style.backgroundColor = prev;
    };
  }, [theme]);
  return <div className={cn("apk min-h-[100dvh]", theme === "light" && "apk-light")}>{children}</div>;
}

/** apk <Screen> + optional back <Header title="" back />. */
export function AuthScreen({ back, backHref = "/login", children }: { back?: boolean; backHref?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-apk-bg px-4 pt-3">
      {back ? <Header title="" back backHref={backHref} /> : null}
      {children}
    </div>
  );
}

export function AuthHero({ title, subtitle }: { title: string; subtitle?: string }) {
  const { branding } = useBranding();
  const tenant = (branding?.brand_name ?? "").trim();
  const logo = branding?.logo_url ? `${API_URL}${branding.logo_url}` : null;
  const words = (tenant || APP_NAME).toUpperCase().split(" ");
  // Platform wordmark: last word green ("HINDENBURG INDIA"), as in the app.
  const tail = !tenant && words.length > 1 ? words.pop() : null;
  return (
    <div className="mb-8 flex flex-col gap-5">
      <div className="flex flex-col items-center gap-2.5">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt={tenant || "Logo"} className="size-16 rounded-2xl object-cover" />
        ) : (
          <HindenburgMark className="size-16" />
        )}
        <div className="text-center text-[20px] font-extrabold tracking-[0.5px] text-apk-text">
          {words.join(" ")}
          {tail ? <span className="text-[#22c55e]"> {tail}</span> : null}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-[28px] font-bold leading-tight tracking-normal text-apk-text">{title}</h1>
        {subtitle ? <p className="text-[16px] text-apk-muted">{subtitle}</p> : null}
      </div>
    </div>
  );
}

/** Six 56 px boxes with a dot per digit; one real input on top takes focus. */
export function OtpInput({
  value,
  onChange,
  length = 6,
  label = "Verification code",
}: {
  value: string;
  onChange: (v: string) => void;
  length?: number;
  label?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div className="relative">
      <div className="flex gap-3" aria-hidden>
        {Array.from({ length }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "flex h-14 flex-1 items-center justify-center rounded-xl border-[1.5px] bg-apk-elevated",
              focused && i === value.length ? "border-apk-primary" : "border-apk-border",
            )}
          >
            {i < value.length ? <span className="size-2.5 rounded-full bg-apk-text" /> : null}
          </div>
        ))}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, length))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-label={label}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={length}
        autoFocus
        className="absolute inset-0 size-full bg-transparent text-[16px] text-transparent caret-transparent opacity-0 outline-none"
      />
    </div>
  );
}

/** Login splash (impersonation hand-off / session restore). */
export function AuthSplash({ subtitle }: { subtitle: string }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-apk-bg text-center">
      <span className="text-apk-primary">
        <Spinner />
      </span>
      <div className="text-[14px] font-medium text-apk-text">Signing you in…</div>
      <div className="text-[12px] text-apk-muted">{subtitle}</div>
    </div>
  );
}

/** apk GradientButton proportions (18 px padding, radius 14, 16 px label, left→right). */
export const AUTH_CTA = "rounded-[14px] bg-gradient-to-r py-[18px] text-[16px]";

/** RHF Controller field → props for the apk <Input> (which takes no ref). */
export function fieldProps(field: { name: string; value?: string; onChange: (e: unknown) => void; onBlur: () => void }) {
  return { name: field.name, value: field.value ?? "", onChange: field.onChange, onBlur: field.onBlur };
}
