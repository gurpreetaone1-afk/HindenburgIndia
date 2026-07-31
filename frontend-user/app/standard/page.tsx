import type { Metadata } from "next";
import PageShell from "@/components/baseline/PageShell";
import {
  ChecklistSection,
  CompareSection,
  CtaBand,
  SpecStrip,
} from "@/components/baseline/AccountSections";

export const metadata: Metadata = {
  title: "Standard Account — Demat + Trading for Everyone | Hindenburg India",
  description:
    "A complete Demat + trading account with access to Equity, Intraday, F&O and Commodities across NSE, BSE & MCX. Open your Standard Account in 5 minutes.",
};

const SPECS = [
  { value: "5 min", label: "Account opening" },
  { value: "All", label: "Segments" },
  { value: "7000+", label: "Stocks" },
  { value: "T+1", label: "Settlement" },
];

const FEATURES = [
  "Demat + trading account (CDSL/NSDL)",
  "Trade Equity, F&O, Commodities & IPO",
  "Real-time NSE, BSE & MCX data",
  "Add funds via UPI / Net Banking",
  "Educational content & tutorials",
  "24x7 customer support",
  "Transparent terms, no hidden conditions",
  "Mobile trading apps",
];

const COMPARE = {
  cols: ["Feature", "Standard", "Pro", "Paper"],
  rows: [
    ["Equity delivery", "Included", "Included", "Virtual"],
    ["Intraday & F&O", "Included", "Included", "Virtual"],
    ["Commodities (MCX)", "Included", "Included", "Virtual"],
    ["Live option chain", "Yes", "Yes", "Yes"],
    ["Advanced charts", "Yes", "Yes", "Yes"],
    ["GTT & basket orders", "Yes", "Yes", "Yes"],
    ["API / algo access", "—", "Included", "—"],
    ["Margin", "SPAN + Exposure", "SPAN + Exposure", "SPAN + Exposure"],
    ["Support", "24x7", "Priority 24x7", "24x7"],
  ],
};

export default function StandardAccountPage() {
  return (
    <PageShell
      eyebrow="For everyday investors & retail traders"
      titleLines={["Standard", "Account"]}
      lead="Start your investing journey with Hindenburg India. A complete Demat + trading account with access to Equity, Intraday, F&O and Commodities across NSE, BSE & MCX."
    >
      <SpecStrip items={SPECS} />

      <ChecklistSection
        eyebrow="What's included"
        lines={["Everything in", "the Standard account"]}
        lead="One account, every segment — with no tiering on the tools you get to use."
        items={FEATURES}
      />

      <CompareSection
        eyebrow="Compare"
        lines={["How the account", "types compare"]}
        cols={COMPARE.cols}
        rows={COMPARE.rows}
        highlightCol={1}
      />

      <CtaBand
        lines={["Ready to start", "investing?"]}
        lead="Open your Standard Account today and start trading across NSE, BSE & MCX."
        actions={[
          { label: "Open Standard account", href: "/register", variant: "light" },
          { label: "Try paper trading first", href: "/demo", variant: "outline" },
        ]}
        note="Investments in securities market are subject to market risks. Read all the related documents carefully before investing."
      />
    </PageShell>
  );
}
