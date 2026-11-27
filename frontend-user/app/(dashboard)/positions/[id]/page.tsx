"use client";

// Phone-only position detail (APK app/positions/[id].tsx). Tablet / desktop have no such page and are sent to /positions.
import { MobileOnly } from "@/components/apk/reports/ReportPage";
import { ApkPositionDetailScreen } from "@/components/apk/positions/PositionDetailScreen";

export default function PositionDetailPage() {
  return (
    <MobileOnly desktopHref="/positions">
      <ApkPositionDetailScreen />
    </MobileOnly>
  );
}
