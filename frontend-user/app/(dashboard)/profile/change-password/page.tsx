"use client";

// Phone-only APK stack screen; tablet / desktop go to /profile.
import { PhoneRoute } from "@/components/apk/wallet/common";
import { ApkChangePasswordScreen } from "@/components/apk/profile/AccountScreens";

export default function Page() {
  return (
    <PhoneRoute fallback="/profile">
      <ApkChangePasswordScreen />
    </PhoneRoute>
  );
}
