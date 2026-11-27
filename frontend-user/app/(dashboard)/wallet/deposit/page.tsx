"use client";

// Phone-only APK stack screen; tablet / desktop go to /wallet.
import { PhoneRoute } from "@/components/apk/wallet/common";
import { ApkDepositScreen } from "@/components/apk/wallet/DepositScreen";

export default function Page() {
  return (
    <PhoneRoute fallback="/wallet">
      <ApkDepositScreen />
    </PhoneRoute>
  );
}
