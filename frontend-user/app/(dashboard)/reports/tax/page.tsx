"use client";

// Phone-only tax report (APK app/reports/tax.tsx). Tablet / desktop have no such page and are sent to /reports/tradebook.
import { MobileOnly } from "@/components/apk/reports/ReportPage";
import { ApkTaxScreen } from "@/components/apk/reports/ReportScreens";

export default function TaxReportPage() {
  return (
    <MobileOnly desktopHref="/reports/tradebook">
      <ApkTaxScreen />
    </MobileOnly>
  );
}
