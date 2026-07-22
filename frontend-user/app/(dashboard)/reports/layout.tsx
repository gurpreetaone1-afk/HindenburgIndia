"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Shared sub-nav for the four report views (P&L / Brokerage / Margin /
 * Tradebook). Without this layout each sub-route was its own island —
 * the sidebar's single "Reports" link landed the user on `/reports/pnl`
 * with no UI affordance to reach the others. The tab strip lives here
 * so every report page inherits it automatically.
 */
const TABS = [
  { href: "/reports/pnl", label: "P&L" },
  { href: "/reports/tradebook", label: "Tradebook" },
  { href: "/reports/brokerage", label: "Brokerage" },
  { href: "/reports/margin", label: "Margin" },
];

export default function ReportsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "";

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-1 overflow-x-auto rounded-md border border-border bg-card p-1 scrollbar-thin">
        {TABS.map((t) => {
          // `startsWith` so deep links like `/reports/pnl?x=y` still
          // highlight the right tab.
          const active = pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={
                "rounded px-3 py-1.5 text-xs font-medium transition-colors " +
                (active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground")
              }
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
