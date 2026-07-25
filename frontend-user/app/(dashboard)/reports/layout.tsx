import { ReactNode } from "react";

// Reports now has a single page (Tradebook download), so the old tab
// nav (P&L / Tradebook / Brokerage / Margin) was removed. Layout just
// renders the child page.
export default function ReportsLayout({ children }: { children: ReactNode }) {
  return <div className="space-y-4">{children}</div>;
}
