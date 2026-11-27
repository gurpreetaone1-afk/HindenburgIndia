"use client";

// Phone-only reports home (APK app/reports/index.tsx). Tablet / desktop have no such page and are sent to /reports/tradebook.
import { MobileOnly } from "@/components/apk/reports/ReportPage";
import { ApkReportsHome } from "@/components/apk/reports/ReportScreens";

export default function ReportsHomePage() {
  return (
    <MobileOnly desktopHref="/reports/tradebook">
      <ApkReportsHome />
    </MobileOnly>
  );
}
