"use client";

// Phone-only P&L report (APK app/reports/pnl.tsx). Tablet / desktop have no such page and are sent to /reports/tradebook.
import { MobileOnly } from "@/components/apk/reports/ReportPage";
import { ApkPnlScreen } from "@/components/apk/reports/ReportScreens";

export default function PnlReportPage() {
  return (
    <MobileOnly desktopHref="/reports/tradebook">
      <ApkPnlScreen />
    </MobileOnly>
  );
}
