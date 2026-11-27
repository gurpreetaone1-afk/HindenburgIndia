"use client";

// Phone-only APK stack screen; tablet / desktop go to /profile.
import { PhoneRoute } from "@/components/apk/wallet/common";
import { ApkSupportScreen } from "@/components/apk/support/SupportScreen";

export default function Page() {
  return (
    <PhoneRoute fallback="/profile">
      <ApkSupportScreen />
    </PhoneRoute>
  );
}
