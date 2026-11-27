"use client";

// Ports of apk shared/ui/Row, shared/ui/Avatar, profile/components/
// ProfileSection + AccountFields, and the `me` query the desktop profile
// page uses (same key, seed and poll).

import type { ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { IoChevronForward, IoLockClosed } from "react-icons/io5";
import { ProfileAPI } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";

/** Same query as app/(dashboard)/profile/page.tsx, seeded from the login user. */
export function useMe() {
  const storeUser = useAuthStore((s) => s.user);
  const q = useQuery({
    queryKey: ["me"],
    queryFn: () => ProfileAPI.me(),
    initialData: storeUser ? (storeUser as any) : undefined,
    initialDataUpdatedAt: 0,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 30_000,
  });
  return { ...q, me: (q.data ?? storeUser) as any };
}

export function Avatar({ name, size = 80 }: { name?: string | null; size?: number }) {
  const initial = name?.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-apk-avatar font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initial}
    </span>
  );
}

export function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="rounded-[14px] border border-apk-border bg-apk-elevated p-3">
      {title ? <div className="mb-1 px-1 text-[14px] font-semibold text-apk-text">{title}</div> : null}
      {children}
    </div>
  );
}

/** Row — icon, title (15), subtitle (12 muted), right slot / chevron. */
export function Row({
  icon,
  title,
  subtitle,
  right,
  divider,
  href,
  external,
  onClick,
  tone,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: ReactNode;
  right?: ReactNode;
  divider?: boolean;
  href?: string;
  external?: boolean;
  onClick?: () => void;
  tone?: "sell";
}) {
  const body = (
    <>
      {icon ? <span className={cn("mr-3.5 inline-flex", tone === "sell" ? "text-apk-sell" : "text-apk-muted")}>{icon}</span> : null}
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-[15px] font-medium", tone === "sell" ? "text-apk-sell" : "text-apk-text")}>{title}</span>
        {subtitle ? <span className="mt-0.5 block truncate text-[12px] text-apk-muted">{subtitle}</span> : null}
      </span>
      {right ?? <IoChevronForward size={18} className="ml-1.5 shrink-0 text-apk-dim" />}
    </>
  );
  const cls = cn("flex w-full items-center px-1 py-3.5 text-left", divider && "border-b border-apk-border");
  if (href && external)
    return (
      <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className={cls}>
        {body}
      </a>
    );
  if (href)
    return (
      <Link href={href} className={cls}>
        {body}
      </Link>
    );
  return (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  );
}

const FIELD = "flex items-center rounded-lg border border-apk-border bg-apk-elevated px-3 py-3.5";

/** Locked value — not editable from the app. */
export function ReadOnlyField({ label, value, icon }: { label: string; value: ReactNode; icon: ReactNode }) {
  return (
    <div>
      <div className="mb-1 ml-1 text-[12px] text-apk-muted">{label}</div>
      <div className={cn(FIELD, "opacity-[0.85]")}>
        <span className="mr-2.5 inline-flex text-apk-muted">{icon}</span>
        <span className="min-w-0 flex-1 truncate text-[15px] text-apk-text">{value}</span>
        <IoLockClosed size={12} className="text-apk-dim" />
      </div>
    </div>
  );
}

/** Same look as ReadOnlyField, but opens a flow. */
export function ActionField({
  label,
  value,
  icon,
  hint,
  right,
  href,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  hint?: string;
  right?: ReactNode;
  href: string;
}) {
  return (
    <div>
      <div className="mb-1 ml-1 text-[12px] text-apk-muted">{label}</div>
      <Link href={href} className={FIELD}>
        <span className="mr-2.5 inline-flex text-apk-muted">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] text-apk-text">{value}</span>
          {hint ? <span className="mt-0.5 block text-[11px] text-apk-dim">{hint}</span> : null}
        </span>
        {right}
        <IoChevronForward size={16} className="ml-1.5 text-apk-dim" />
      </Link>
    </div>
  );
}
