"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bell,
  CandlestickChart,
  ChevronLeft,
  FileText,
  Home,
  Mail,
  MessageCircle,
  Repeat,
  ScrollText,
  User,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { BinaryAPI } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/layout/BrandLogo";
import {
  buildMailtoUrl,
  buildWhatsappUrl,
  useSupportContacts,
  useSupportBrand,
} from "@/lib/useSupport";

const items = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/terminal", label: "Trading Terminal", icon: CandlestickChart },
  { href: "/binary", label: "Binary Trading", icon: Repeat, demoHide: true },
  // Positions is the unified blotter — Position / Active / Closed /
  // Cancelled / Rejected tabs all live there. The old separate /orders
  // route was folded in per user request: "orders aur position dono
  // ka same kaam hai, bas position section rakho".
  { href: "/positions", label: "Positions", icon: Activity },
  { href: "/wallet", label: "Wallet", icon: Wallet },
  // Hidden for demo (paper) accounts — these read the live ledger /
  // reporting / binary surfaces, which demo accounts don't participate in.
  { href: "/ledger", label: "Ledger", icon: ScrollText, demoHide: true },
  { href: "/reports/pnl", label: "Reports", icon: FileText, demoHide: true },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/profile", label: "Profile", icon: User },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  // Hide "Binary Trading" entirely when binary isn't available to this user
  // (global off, per-user off, or their admin/broker pool isn't enabled).
  const { data: binaryCfg } = useQuery({
    queryKey: ["binary", "settings", ""],
    queryFn: () => BinaryAPI.settings(),
    // Short cache + refetch on focus so an admin enabling/disabling the
    // pool reflects on the user's sidebar when they return to the tab,
    // without a hard reload.
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
  const binaryAvailable = Boolean((binaryCfg as any)?.available);
  const isDemo = Boolean(useAuthStore((s) => s.user?.is_demo));
  const visibleItems = items.filter((it) => {
    if ((it as any).demoHide && isDemo) return false; // hide ledger/reports/binary for demo
    if (it.href === "/binary" && !binaryAvailable) return false;
    return true;
  });
  const { data: support } = useSupportContacts();
  const brand = useSupportBrand();
  const waUrl = buildWhatsappUrl(
    support?.whatsapp,
    `Hi, I need help with my ${brand} account`,
  );
  const mailUrl = buildMailtoUrl(support?.email, {
    subject: `${brand} support request`,
  });
  const hasAnySupport = !!(waUrl || mailUrl);

  return (
    <aside
      className={cn(
        "sticky top-0 z-30 hidden h-screen flex-col border-r border-border bg-card md:flex",
        collapsed ? "w-16" : "w-60"
      )}
    >
      <div className="flex h-14 items-center justify-between gap-2 border-b border-border px-3">
        {collapsed ? (
          <BrandLogo iconOnly size="sm" />
        ) : (
          <BrandLogo size="sm" />
        )}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle sidebar"
          onClick={() => setCollapsed((v) => !v)}
          className="ml-auto"
        >
          <ChevronLeft className={cn("size-4 transition-transform", collapsed && "rotate-180")} />
        </Button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-2 scrollbar-thin">
        {visibleItems.map((it) => {
          const active =
            pathname === it.href ||
            (it.href !== "/dashboard" && pathname?.startsWith(it.href));
          const Icon = it.icon;
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                active
                  ? "bg-primary/10 text-primary shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
                collapsed && "justify-center px-2"
              )}
              aria-current={active ? "page" : undefined}
            >
              {/* Active indicator strip on the left */}
              {active && (
                <span className="absolute inset-y-1.5 left-0 w-1 rounded-r-full bg-primary" />
              )}
              <Icon className={cn("size-4 shrink-0", active && "text-primary")} />
              {!collapsed && <span className="truncate">{it.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Support footer — admin-driven WhatsApp + email. Hidden entirely
          when no contact is configured so the user never sees a dead
          "Need help?" pill. Collapsed sidebar shows two icon-only links
          stacked so the affordance survives the narrow rail too. */}
      {hasAnySupport && (
        <div className="border-t border-border p-3">
          {collapsed ? (
            <div className="flex flex-col items-center gap-2">
              {waUrl && (
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="grid size-9 place-items-center rounded-md bg-[#25D366]/10 text-[#25D366] transition-colors hover:bg-[#25D366]/20"
                  aria-label="WhatsApp support"
                  title="WhatsApp support"
                >
                  <MessageCircle className="size-4" />
                </a>
              )}
              {mailUrl && (
                <a
                  href={mailUrl}
                  className="grid size-9 place-items-center rounded-md bg-primary/10 text-primary transition-colors hover:bg-primary/20"
                  aria-label="Email support"
                  title="Email support"
                >
                  <Mail className="size-4" />
                </a>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Support
              </div>
              {waUrl && (
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-md bg-[#25D366]/10 px-2 py-1.5 text-xs font-medium text-[#25D366] transition-colors hover:bg-[#25D366]/20"
                >
                  <MessageCircle className="size-3.5" />
                  <span className="truncate">{support?.whatsapp || "WhatsApp"}</span>
                </a>
              )}
              {mailUrl && (
                <a
                  href={mailUrl}
                  className="flex items-center gap-2 rounded-md bg-primary/10 px-2 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
                >
                  <Mail className="size-3.5" />
                  <span className="truncate">{support?.email || "Email"}</span>
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
