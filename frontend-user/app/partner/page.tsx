import type { Metadata } from "next";
import PageShell from "@/components/baseline/PageShell";
import {
  PartnerSection,
  TrustPillarsSection,
  StepsSection,
  FaqSection,
} from "@/components/baseline/Sections";

export const metadata: Metadata = {
  title: "Partner Program",
  description:
    "Introduce traders to Hindenburg India and earn a transparent share of the brokerage they generate, with a live partner dashboard.",
};

export default function PartnerPage() {
  return (
    <PageShell
      eyebrow="Partners"
      titleLines={["Grow with", "Hindenburg India"]}
      lead="Already advising traders and investors? Introduce them to us and earn an ongoing, transparent share of the revenue they generate — tracked live in a partner dashboard."
    >
      <PartnerSection />
      <TrustPillarsSection />
      <StepsSection />
      <FaqSection />
    </PageShell>
  );
}
