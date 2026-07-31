import type { Metadata } from "next";
import PageShell from "@/components/baseline/PageShell";
import {
  ChecklistSection,
  CtaBand,
  HighlightsSection,
  SpecStrip,
} from "@/components/baseline/AccountSections";

export const metadata: Metadata = {
  title: "Pro / Active Trader Account — Priority Support & API Access | Hindenburg India",
  description:
    "An account built for high-volume F&O and intraday traders — priority support, advanced tools and API/algo access designed for serious traders.",
};

const SPECS = [
  { value: "Priority", label: "Support" },
  { value: "All", label: "Segments" },
  { value: "Yes", label: "API / algo" },
  { value: "SPAN + Exp", label: "Margin" },
];

const FEATURES = [
  "Priority 24x7 support",
  "Built for high-volume F&O & intraday traders",
  "Advanced charting & option-chain tools",
  "Dedicated relationship manager",
  "Faster order execution",
  "Premium market research",
  "Detailed F&O & margin analytics",
  "Exclusive market insights",
];

const HIGHLIGHTS = [
  {
    title: "Dedicated manager",
    body: "A personal relationship manager who understands your trading needs and provides tailored support.",
  },
  {
    title: "Advanced tools",
    body: "Pro charting, option-chain and basket orders to manage your Nifty, Bank Nifty and stock F&O positions.",
  },
  {
    title: "Faster execution",
    body: "Quick, reliable order execution across intraday, F&O and commodity, built for high-volume traders.",
  },
];

export default function ProAccountPage() {
  return (
    <PageShell
      eyebrow="For active & high-volume traders"
      titleLines={["Pro /", "Active Trader"]}
      lead="An account built for high-volume F&O and intraday traders — priority support, advanced tools and API/algo access designed for serious traders."
    >
      <SpecStrip items={SPECS} />

      <ChecklistSection
        eyebrow="Premium"
        lines={["What a Pro", "account adds"]}
        lead="Everything in Standard, plus the support, analytics and access that high-volume trading needs."
        items={FEATURES}
      />

      <HighlightsSection
        eyebrow="Why Pro"
        lines={["Built for", "serious traders"]}
        items={HIGHLIGHTS}
      />

      <CtaBand
        lines={["Elevate your", "trading"]}
        lead="Trade smarter. Open a Pro / Active Trader account and get advanced tools with priority support."
        actions={[
          { label: "Open Pro account", href: "/register", variant: "light" },
          { label: "Compare accounts", href: "/standard", variant: "outline" },
        ]}
        note="Investments in securities market are subject to market risks. Read all the related documents carefully before investing."
      />
    </PageShell>
  );
}
