import type { Metadata } from "next";

import "@/components/landing/landing.css";
import FloatingHeader from "@/components/landing/FloatingHeader";
import OptibizHero from "@/components/landing/OptibizHero";
import VideoSection from "@/components/landing/VideoSection";
import HowItWorks from "@/components/landing/HowItWorks";
import InnovatingForIndia from "@/components/landing/InnovatingForIndia";
import Statistics from "@/components/landing/Statistics";
import WhyChooseUs from "@/components/landing/WhyChooseUs";
import AboutStats from "@/components/landing/AboutStats";
import ServicesGrid from "@/components/landing/ServicesGrid";
import AccountTypes from "@/components/landing/AccountTypes";
import TradingPlatform from "@/components/landing/TradingPlatform";
import TradingConditions from "@/components/landing/TradingConditions";
import ToolsResearch from "@/components/landing/ToolsResearch";
import LiveMarketCharts from "@/components/landing/LiveMarketCharts";
import Education from "@/components/landing/Education";
import Payments from "@/components/landing/Payments";
import PrecisionTrust from "@/components/landing/PrecisionTrust";
import VisionMissionValues from "@/components/landing/VisionMissionValues";
import LongTermInvesting from "@/components/landing/LongTermInvesting";
import PartnerProgram from "@/components/landing/PartnerProgram";
import Recognition from "@/components/landing/Recognition";
import Testimonials from "@/components/landing/Testimonials";
import AccountOpening from "@/components/landing/AccountOpening";
import FAQ from "@/components/landing/FAQ";
import FinalCTA from "@/components/landing/FinalCTA";
import Contact from "@/components/landing/Contact";
import Footer from "@/components/landing/Footer";

export const metadata: Metadata = {
  title: "Hindenburg India — India's Modern Multi-Segment Trading Platform",
  description:
    "Trade NSE, BSE, MCX, currency, crypto and global forex on one fast terminal. Flat ₹20 brokerage, real-time risk controls, transparent statutory breakdown.",
};

/**
 * The Hindenburg India trading landing page.
 *
 * "/" now renders the Baseline design template (app/(landing)/page.tsx), so
 * this keeps the trading homepage reachable at /trading.
 *
 * Section order: intro → proof → product → conditions & tools → education &
 * funding → trust & company → partners → conversion. Backgrounds alternate
 * white / #f7f9fc / navy so no two same-toned sections sit next to each other.
 */
export default function TradingHome() {
  return (
    <div className="landing-page min-h-screen bg-white">
      {/* White floating navbar (sticky, overlays the dark hero; h-0 so it
          reserves no space and the dark hero shows behind it) */}
      <div className="sticky top-4 z-50 h-0">
        <FloatingHeader />
      </div>

      {/* ── Intro ─────────────────────────────────────────────────────────── */}
      {/* Hero (dark navy) */}
      <OptibizHero />
      {/* Product video */}
      <VideoSection />
      {/* "How does it work?" + service columns */}
      <HowItWorks />
      {/* India-first positioning */}
      <InnovatingForIndia />

      {/* ── Proof ─────────────────────────────────────────────────────────── */}
      {/* Numbers that speak */}
      <Statistics />
      {/* Why choose Hindenburg India */}
      <WhyChooseUs />
      {/* About + Vision/Mission + stats */}
      <AboutStats />

      {/* ── Product ───────────────────────────────────────────────────────── */}
      {/* Our Services — market cards */}
      <ServicesGrid />
      {/* Account tiers & pricing */}
      <AccountTypes />
      {/* Next-generation trading platform */}
      <TradingPlatform />

      {/* ── Conditions & tools ────────────────────────────────────────────── */}
      <TradingConditions />
      <ToolsResearch />
      <LiveMarketCharts />

      {/* ── Education & funding ───────────────────────────────────────────── */}
      <Education />
      <Payments />

      {/* ── Trust & company ───────────────────────────────────────────────── */}
      <PrecisionTrust />
      <VisionMissionValues />
      <LongTermInvesting />

      {/* ── Partners & social proof ───────────────────────────────────────── */}
      <PartnerProgram />
      <Recognition />
      {/* Social proof */}
      <Testimonials />

      {/* ── Conversion ────────────────────────────────────────────────────── */}
      {/* Open account + 3 simple steps */}
      <AccountOpening />
      <FAQ />
      <FinalCTA />
      {/* Contact our team */}
      <Contact />
      <Footer />
    </div>
  );
}
