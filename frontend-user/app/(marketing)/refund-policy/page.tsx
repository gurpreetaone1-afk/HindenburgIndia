"use client";

import { LegalDoc, type LegalSection } from "@/components/marketing/LegalDoc";
import { useBranding } from "@/lib/branding-context";

export default function RefundPolicyPage() {
  const { branding } = useBranding();
  const brand = (branding?.brand_name || "").trim() || "Hindenburg India";

  const sections: LegalSection[] = [
    {
      heading: "Nature of Funds",
      body: [
        `${brand} is a virtual trading platform that provides technology and platform access only. Money you deposit is credited to your trading wallet and is used by you to place trades based solely on your own decisions.`,
      ],
    },
    {
      heading: "Trading Losses Are Not Refundable",
      body: [
        "Losses arising from your trading activity are the result of your own judgment and decisions and are NOT eligible for refund.",
        `${brand} does not guarantee profits, fixed returns, or any protection against losses. You accept full responsibility for any profits, losses, taxes, or charges arising from your trading.`,
      ],
    },
    {
      heading: "Fees, Charges & Brokerage",
      body: [
        "Once a trade is executed, any associated brokerage, commissions, spreads, taxes, or platform charges are non-refundable.",
      ],
    },
    {
      heading: "Deposits",
      body: [
        "A successful deposit is added to your trading wallet and cannot be reversed on demand. Any usable (withdrawable) balance may instead be withdrawn as described below.",
      ],
    },
    {
      heading: "Failed, Duplicate or Erroneous Payments",
      body: [
        "If an amount is debited from your bank/UPI but not credited to your wallet, or if a duplicate or erroneous payment occurs, please raise a request with support along with the transaction details and proof.",
        "Verified amounts will be refunded to the original payment source, typically within 5–7 business days, subject to the timelines of your bank and payment provider.",
      ],
    },
    {
      heading: "Withdrawals",
      body: [
        "Your withdrawable balance can be withdrawn to your verified bank account or UPI, subject to the minimum/maximum limits, timings, verification, and any charges displayed in the app. Withdrawals are processed only to your own verified account.",
      ],
    },
    {
      heading: "Bonuses & Promotional Credits",
      body: [
        "Any bonuses or promotional credits are governed by their own specific terms, are non-withdrawable except as those terms allow, and are not refundable as cash.",
      ],
    },
    {
      heading: "Chargebacks",
      body: [
        "If you have a concern about a transaction, please contact support first so we can resolve it. Initiating a wrongful chargeback may lead to suspension of your account pending investigation.",
      ],
    },
    {
      heading: "How to Request a Refund",
      body: [
        `To request a refund for an eligible transaction, contact ${brand} support through the options available in the app with your registered details and the relevant transaction reference.`,
      ],
    },
    {
      heading: "Changes to This Policy",
      body: [
        "We may update this Refund Policy from time to time. The latest version will always be available on this page, and continued use of the Platform indicates your acceptance of the updated policy.",
      ],
    },
    {
      heading: "Contact",
      body: [
        `For any questions about this Refund Policy, please reach out to ${brand} support through the contact options available in the app.`,
      ],
    },
  ];

  return (
    <LegalDoc
      title="Refund Policy"
      updated="16 July 2026"
      intro={`This Refund Policy explains how deposits, charges, and withdrawals are handled on ${brand} (the "Platform"). Please read it together with our Terms & Conditions. By using the Platform, you agree to this policy.`}
      sections={sections}
    />
  );
}
