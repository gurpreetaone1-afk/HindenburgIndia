"use client";

// Phone-only APK stack screen; tablet / desktop go to /profile.
import { PhoneRoute } from "@/components/apk/wallet/common";
import { ApkThemeScreen } from "@/components/apk/settings/SettingsScreens";

export default function Page() {
  return (
    <PhoneRoute fallback="/profile">
      <ApkThemeScreen />
    </PhoneRoute>
  );
}
