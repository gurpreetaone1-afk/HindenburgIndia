import type { Metadata } from "next";
import PageShell from "@/components/baseline/PageShell";
import {
  ChecklistSection,
  CtaBand,
  HighlightsSection,
  SpecStrip,
  StepsBand,
} from "@/components/baseline/AccountSections";

export const metadata: Metadata = {
  title: "Paper / Virtual Trading — Practice Risk-Free on NSE, BSE & MCX | Hindenburg India",
  description:
    "Practise on live NSE, BSE & MCX prices with virtual funds — no real money, learn risk-free. No KYC required to start paper trading.",
};

const SPECS = [
  { value: "Included", label: "Virtual funds" },
  { value: "Not needed", label: "KYC" },
  { value: "Unlimited", label: "Duration" },
  { value: "All", label: "Platforms" },
];

const FEATURES = [
  "Identical to the live trading environment",
  "Live NSE, BSE & MCX prices",
  "Trade Equity, F&O & Commodities",
  "Practice with virtual funds",
  "No KYC or PAN required to start",
  "Test trading strategies risk-free",
  "Unlimited resets",
  "Learn platform features",
];

const STEPS = [
  { n: "01", title: "Sign up", body: "Create your paper trading account in seconds." },
  { n: "02", title: "Choose segment", body: "Pick Equity, F&O or Commodities." },
  { n: "03", title: "Start trading", body: "Practice with virtual funds." },
];

const WHY = [
  {
    title: "Learn risk-free",
    body: "Practice strategies on Nifty, Bank Nifty, Reliance, TCS and more without risking real money.",
  },
  {
    title: "Real market conditions",
    body: "Live NSE, BSE & MCX prices, identical to a real trading account.",
  },
  {
    title: "Unlimited resets",
    body: "Reset your virtual account at any time and start fresh with virtual funds.",
  },
];

export default function DemoPage() {
  return (
    <PageShell
      eyebrow="Paper / virtual trading"
      titleLines={["Practice risk-free", "with virtual funds"]}
      lead="Practise on live NSE, BSE & MCX prices with virtual funds — no real money, learn risk-free. No KYC required."
    >
      <SpecStrip items={SPECS} />

      <ChecklistSection
        eyebrow="Features"
        lines={["What paper", "trading gives you"]}
        lead="The same terminal, the same prices and the same order types — with none of the risk."
        items={FEATURES}
      />

      <StepsBand
        eyebrow="Get started"
        lines={["Up and running", "in three steps"]}
        steps={STEPS}
      />

      <HighlightsSection
        eyebrow="Why paper trading"
        lines={["Why traders", "practise first"]}
        items={WHY}
      />

      <CtaBand
        lines={["Ready when", "you are"]}
        lead="When you're confident with paper trading, open a live Demat + trading account and start investing for real."
        actions={[
          { label: "Start paper trading", href: "/register", variant: "light" },
          { label: "View live accounts", href: "/standard", variant: "outline" },
        ]}
        note="Investments in securities market are subject to market risks. Read all the related documents carefully before investing."
      />
    </PageShell>
  );
}
