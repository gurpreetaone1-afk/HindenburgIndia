"use client";

// Phone-only APK stack screen; tablet / desktop go to /wallet.
import { PhoneRoute } from "@/components/apk/wallet/common";
import { ApkBankFormScreen } from "@/components/apk/wallet/BankScreens";

export default function Page() {
  return (
    <PhoneRoute fallback="/wallet">
      <ApkBankFormScreen />
    </PhoneRoute>
  );
}
