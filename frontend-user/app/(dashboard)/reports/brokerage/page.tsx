"use client";

// Phone-only brokerage report (APK app/reports/brokerage.tsx). Tablet / desktop have no such page and are sent to /reports/tradebook.
import { MobileOnly } from "@/components/apk/reports/ReportPage";
import { ApkBrokerageScreen } from "@/components/apk/reports/ReportScreens";

export default function BrokerageReportPage() {
  return (
    <MobileOnly desktopHref="/reports/tradebook">
      <ApkBrokerageScreen />
    </MobileOnly>
  );
}
