"use client";

// Web ports of the APK's shared primitives (hindenburg indian apk/src/shared/
// ui + shared/components). Same sizes / radii / colours as the React Native
// originals; colours come from the `apk-*` Tailwind tokens (globals.css
// `.apk`). Screens under components/apk/** build on these.

import { useEffect, useState, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes } from "react";
import { useRouter } from "next/navigation";
import { IoChevronBack, IoDocumentsOutline, IoEyeOffOutline, IoEyeOutline, IoClose } from "react-icons/io5";
import { cn } from "@/lib/utils";

/** Screen — `<Screen>`: full-height page, 16 px side padding, 12 px top. */
export function Screen({ children, padded = true, className }: { children: ReactNode; padded?: boolean; className?: string }) {
  return (
    <div className={cn("flex min-h-[calc(100dvh-var(--apk-tabbar,0px))] flex-col bg-apk-bg", padded && "px-4 pt-3", className)}>
      {children}
    </div>
  );
}

/** Header — title (20 px semibold), optional subtitle, back chevron, right slot. */
export function Header({
  title,
  subtitle,
  back,
  backHref = "/dashboard",
  right,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  backHref?: string;
  right?: ReactNode;
}) {
  const router = useRouter();
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex min-w-0 items-center gap-3">
        {back ? (
          <button
            type="button"
            aria-label="Back"
            onClick={() => (window.history.length > 1 ? router.back() : router.push(backHref))}
            className="-m-2 p-2 text-apk-text"
          >
            <IoChevronBack size={24} />
          </button>
        ) : null}
        <div className="min-w-0">
          <div className="truncate text-[20px] font-semibold leading-tight text-apk-text">{title}</div>
          {subtitle ? <div className="text-[12px] text-apk-muted">{subtitle}</div> : null}
        </div>
      </div>
      {right}
    </div>
  );
}

/** Card — bgElevated, radius 12, 16 px padding, 1 px border. */
export function Card({
  children,
  padded = true,
  bordered = true,
  className,
  onClick,
}: {
  children: ReactNode;
  padded?: boolean;
  bordered?: boolean;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn("rounded-xl bg-apk-elevated", padded && "p-4", bordered && "border border-apk-border", onClick && "cursor-pointer", className)}
    >
      {children}
    </div>
  );
}

/** Chip — pill; active = inverted (text bg / inverse fg). */
export function Chip({
  label,
  active,
  leading,
  size = "md",
  onClick,
  className,
}: {
  label: string;
  active?: boolean;
  leading?: ReactNode;
  size?: "sm" | "md";
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center rounded-full font-medium",
        size === "sm" ? "px-3 py-2 text-[12px]" : "px-[18px] py-3 text-[14px]",
        active ? "bg-apk-text text-apk-inverse" : "border border-apk-border bg-apk-chip text-apk-text",
        className,
      )}
    >
      {leading ? <span className="mr-1.5 inline-flex">{leading}</span> : null}
      {label}
    </button>
  );
}

export interface TabItem {
  key: string;
  label: string;
}

/** Tabs — "underline" (17 px, 2 px bar) or "pill" (segmented, bgSurface active). */
export function Tabs({
  items,
  activeKey,
  onChange,
  variant = "underline",
  className,
}: {
  items: TabItem[];
  activeKey: string;
  onChange: (key: string) => void;
  variant?: "underline" | "pill";
  className?: string;
}) {
  if (variant === "pill") {
    return (
      <div className={cn("flex gap-2 rounded-full bg-apk-elevated p-1", className)}>
        {items.map((it) => {
          const active = it.key === activeKey;
          return (
            <button
              key={it.key}
              type="button"
              onClick={() => onChange(it.key)}
              className={cn(
                "flex-1 rounded-full py-2.5 text-[14px]",
                active ? "bg-apk-surface font-semibold text-apk-text" : "text-apk-muted",
              )}
            >
              {it.label}
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div className={cn("flex gap-6", className)}>
      {items.map((it) => {
        const active = it.key === activeKey;
        return (
          <button key={it.key} type="button" onClick={() => onChange(it.key)} className="py-2.5 text-left">
            <span className={cn("text-[17px]", active ? "font-semibold text-apk-text" : "text-apk-muted")}>{it.label}</span>
            {active ? <span className="mt-1.5 block h-0.5 rounded-sm bg-apk-text" /> : null}
          </button>
        );
      })}
    </div>
  );
}

type BtnVariant = "primary" | "buy" | "sell" | "ghost" | "danger";

/** Button — radius 8, semibold label; buy/primary use inverse text. */
export function Button({
  label,
  variant = "primary",
  size = "md",
  loading,
  leadingIcon,
  fullWidth,
  disabled,
  className,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  label: string;
  variant?: BtnVariant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  leadingIcon?: ReactNode;
  fullWidth?: boolean;
}) {
  const tone: Record<BtnVariant, string> = {
    primary: "bg-apk-primary text-apk-inverse",
    buy: "bg-apk-buy text-apk-inverse",
    sell: "bg-apk-sell text-apk-text",
    danger: "bg-apk-sell text-apk-text",
    ghost: "border border-apk-border bg-transparent text-apk-text",
  };
  const pad = { sm: "py-2", md: "py-3", lg: "py-4" }[size];
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center rounded-lg px-4 font-semibold disabled:opacity-40",
        size === "sm" ? "text-[12px]" : "text-[14px]",
        pad,
        tone[variant],
        fullWidth && "w-full",
        className,
      )}
    >
      {loading ? (
        <Spinner />
      ) : (
        <>
          {leadingIcon ? <span className="mr-2 inline-flex">{leadingIcon}</span> : null}
          {label}
        </>
      )}
    </button>
  );
}

/** GradientButton — the violet → pink → orange CTA. */
export function GradientButton({
  label,
  className,
  loading,
  disabled,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & { label: string; loading?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      className={cn(
        "inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-br from-apk-grad-from via-apk-grad-via to-apk-grad-to py-3.5 text-[15px] font-semibold text-white disabled:opacity-50",
        className,
      )}
    >
      {loading ? <Spinner /> : label}
    </button>
  );
}

type BadgeTone = "neutral" | "buy" | "sell" | "warn" | "info" | "primary";

/** Badge — small rounded-6 label. */
export function Badge({ label, tone = "neutral", size = "sm", className }: { label: string; tone?: BadgeTone; size?: "sm" | "md"; className?: string }) {
  const cls: Record<BadgeTone, string> = {
    neutral: "bg-apk-surface text-apk-muted",
    buy: "bg-apk-buy-dim text-apk-buy",
    sell: "bg-apk-sell-dim text-apk-sell",
    warn: "bg-[#7c2d12] text-apk-warn",
    info: "bg-[#1e3a8a] text-apk-info",
    primary: "bg-apk-primary text-white",
  };
  return (
    <span
      className={cn(
        "inline-block self-start rounded-md font-semibold",
        size === "sm" ? "px-2 py-[3px] text-[10px]" : "px-2.5 py-[5px] text-[12px]",
        cls[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}

/** EmptyState — 36 px dim icon, heading, muted description. */
export function EmptyState({ icon, title, description }: { icon?: ReactNode; title: string; description?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <span className="text-apk-dim">{icon ?? <IoDocumentsOutline size={36} />}</span>
      <div className="mt-3 text-[20px] font-bold text-apk-text">{title}</div>
      {description ? <div className="text-[14px] text-apk-muted">{description}</div> : null}
    </div>
  );
}

/** Toggle — 44×26 switch, primary when on. */
export function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      disabled={disabled}
      onClick={() => onChange(!value)}
      className={cn("h-[26px] w-11 shrink-0 rounded-full p-[3px] disabled:opacity-50", value ? "bg-apk-primary" : "bg-apk-surface")}
    >
      <span className={cn("block size-5 rounded-full bg-white transition-transform", value && "translate-x-[18px]")} />
    </button>
  );
}

/** Input — label above, bgElevated field, password eye, error in sell. */
export function Input({
  label,
  error,
  hint,
  trailing,
  type,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string; hint?: string; trailing?: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const isPassword = type === "password";
  return (
    <div className="flex flex-col gap-1">
      {label ? <label className="ml-1 text-[12px] text-apk-muted">{label}</label> : null}
      <div className={cn("flex items-center rounded-lg border bg-apk-elevated px-3", error ? "border-apk-sell" : "border-apk-border")}>
        <input
          {...rest}
          type={isPassword && visible ? "text" : type}
          autoCapitalize="none"
          autoCorrect="off"
          className={cn("min-w-0 flex-1 bg-transparent py-3 text-[14px] text-apk-text outline-none placeholder:text-apk-dim", className)}
        />
        {isPassword ? (
          <button type="button" onClick={() => setVisible((v) => !v)} className="pl-2 text-apk-muted" aria-label="Show password">
            {visible ? <IoEyeOffOutline size={20} /> : <IoEyeOutline size={20} />}
          </button>
        ) : null}
        {trailing}
      </div>
      {error ? <div className="ml-1 text-[12px] text-apk-sell">{error}</div> : hint ? <div className="ml-1 text-[12px] text-apk-dim">{hint}</div> : null}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn("inline-block size-5 animate-spin rounded-full border-2 border-current border-t-transparent", className)} />;
}

/** Loader — centred spinner (RN ActivityIndicator). */
export function Loader() {
  return (
    <div className="flex flex-1 items-center justify-center py-10 text-apk-muted">
      <Spinner />
    </div>
  );
}

/**
 * Sheet — bottom sheet (the RN app's Modal / bottom-sheet pattern): dim
 * overlay, rounded-top bgElevated panel, slides up, Esc / overlay closes.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div
        className={cn(
          "apk-sheet relative max-h-[90dvh] overflow-y-auto rounded-t-2xl border-t border-apk-border bg-apk-elevated pb-[max(16px,env(safe-area-inset-bottom))] animate-in slide-in-from-bottom duration-200",
          className,
        )}
      >
        <div className="sticky top-0 z-10 bg-apk-elevated px-4 pt-2">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-apk-border-strong" />
          {title ? (
            <div className="flex items-center justify-between pb-2">
              <div className="text-[16px] font-semibold text-apk-text">{title}</div>
              <button type="button" onClick={onClose} aria-label="Close" className="-m-2 p-2 text-apk-muted">
                <IoClose size={22} />
              </button>
            </div>
          ) : null}
        </div>
        <div className="px-4">{children}</div>
      </div>
    </div>
  );
}

/** Indian-format number with fixed decimals and tabular digits. */
export function fmt(n: number | string | null | undefined, dp = 2): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
