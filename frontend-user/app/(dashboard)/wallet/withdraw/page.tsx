"use client";

// Phone-only APK stack screen; tablet / desktop go to /wallet.
import { PhoneRoute } from "@/components/apk/wallet/common";
import { ApkWithdrawScreen } from "@/components/apk/wallet/WithdrawScreen";

export default function Page() {
  return (
    <PhoneRoute fallback="/wallet">
      <ApkWithdrawScreen />
    </PhoneRoute>
  );
}
