import type { Metadata } from "next";
import PageShell from "@/components/baseline/PageShell";
import MarketSections from "@/components/baseline/MarketSections";
import { StepsSection, FaqSection } from "@/components/baseline/Sections";
import { MARKET_PAGES } from "@/components/baseline/marketPages";

const seg = MARKET_PAGES.futuresOptions;

export const metadata: Metadata = {
  title: seg.metaTitle,
  description: seg.metaDescription,
};

export default function FuturesOptionsPage() {
  return (
    <PageShell eyebrow={seg.eyebrow} titleLines={[...seg.titleLines]} lead={seg.lead}>
      <MarketSections segment={seg} />
      <StepsSection />
      <FaqSection />
    </PageShell>
  );
}
