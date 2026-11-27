"use client";

// Phone-only APK stack screen; tablet / desktop go to /wallet.
import { PhoneRoute } from "@/components/apk/wallet/common";
import { ApkTransactionsScreen } from "@/components/apk/wallet/TransactionsScreen";

export default function Page() {
  return (
    <PhoneRoute fallback="/wallet">
      <ApkTransactionsScreen />
    </PhoneRoute>
  );
}
