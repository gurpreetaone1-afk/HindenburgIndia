"use client";

// Phone-only margin report (APK app/reports/margin.tsx). Tablet / desktop have no such page and are sent to /reports/tradebook.
import { MobileOnly } from "@/components/apk/reports/ReportPage";
import { ApkMarginScreen } from "@/components/apk/reports/ReportScreens";

export default function MarginReportPage() {
  return (
    <MobileOnly desktopHref="/reports/tradebook">
      <ApkMarginScreen />
    </MobileOnly>
  );
}
