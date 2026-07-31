import type { Metadata } from "next";
import PageShell from "@/components/baseline/PageShell";
import {
  ConditionsSection,
  ToolsSection,
  StepsSection,
  FaqSection,
} from "@/components/baseline/Sections";
import Platform from "@/components/baseline/Facilities";

export const metadata: Metadata = {
  title: "Platform",
  description:
    "The Hindenburg India web terminal and mobile app — one order book, live option chain, transparent margin and sub-50ms fills.",
};

export default function PlatformPage() {
  return (
    <PageShell
      eyebrow="Platform"
      titleLines={["One terminal,", "every market"]}
      lead="Multi-chart layouts, a live option chain and one-click orders — on the web and in your pocket, sharing the same positions and the same margin."
    >
      <Platform />
      <ConditionsSection />
      <ToolsSection />
      <StepsSection />
      <FaqSection />
    </PageShell>
  );
}
