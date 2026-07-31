"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Lenis from "lenis";

import "./baseline.css";
import "./sections.css";
import ContactModal from "./ContactModal";
import Platform from "./Facilities";
import Footer from "./Footer";
import Hero from "./Hero";
import Loader from "./Loader";
import MenuOverlay from "./MenuOverlay";
import Markets from "./Programs";
import SiteHeader from "./SiteHeader";
import Trust from "./Trust";
import {
  AccountsSection,
  ConditionsSection,
  EducationSection,
  FaqSection,
  FinalCta,
  NumbersSection,
  PartnerSection,
  PaymentsSection,
  StepsSection,
  TestimonialsSection,
  ToolsSection,
  TrustPillarsSection,
  ValuesSection,
} from "./Sections";
import { useAdaptiveGrid } from "./hooks";

/**
 * Hindenburg India homepage.
 *
 * Section order follows the reference layout: hero → why choose → numbers →
 * markets → account types → platform → conditions → tools → education →
 * payments → trust → values → partner → steps → testimonials → FAQ → CTA →
 * footer. Backgrounds alternate white / surface / navy so no two same-toned
 * sections sit next to each other.
 *
 * Owns the cross-section state: whether the intro has finished (`ready` gates
 * every hero entrance) and the two overlays.
 */
export default function BaselineLanding() {
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const lenisRef = useRef<Lenis | null>(null);

  useAdaptiveGrid();

  useEffect(() => {
    window.scrollTo(0, 0);
    const lenis = new Lenis({ smoothWheel: true });
    lenisRef.current = lenis;

    let id = 0;
    const raf = (t: number) => {
      lenis.raf(t);
      id = requestAnimationFrame(raf);
    };
    id = requestAnimationFrame(raf);

    // The adaptive grid drives the root font-size; scope it to this page.
    document.documentElement.classList.add("bl-scale");

    return () => {
      cancelAnimationFrame(id);
      lenis.destroy();
      lenisRef.current = null;
      document.documentElement.classList.remove("bl-scale");
    };
  }, []);

  /* Scroll lock — loader, menu and modal all share it. */
  const locked = !ready || menuOpen || modalOpen;
  useEffect(() => {
    const html = document.documentElement;
    if (locked) {
      lenisRef.current?.stop();
      html.style.position = "relative";
      html.style.overflow = "hidden";
      html.style.height = "100%";
    } else {
      lenisRef.current?.start();
      html.style.removeProperty("position");
      html.style.removeProperty("overflow");
      html.style.removeProperty("height");
    }
    return () => {
      html.style.removeProperty("position");
      html.style.removeProperty("overflow");
      html.style.removeProperty("height");
    };
  }, [locked]);

  const scrollTo = useCallback((hash: string) => {
    const el = document.querySelector(hash);
    if (!el) return;
    const lenis = lenisRef.current;
    if (lenis) lenis.scrollTo(el as HTMLElement);
    else el.scrollIntoView({ behavior: "smooth" });
  }, []);

  const openModal = useCallback(() => setModalOpen(true), []);

  return (
    <>
      <main className="bl-root">
        <SiteHeader onOpenMenu={() => setMenuOpen(true)} />
        <Hero ready={ready} onOpenModal={openModal} />

        {/* Why traders choose us — ghost-word carousel */}
        <Trust />
        {/* Numbers that speak */}
        <NumbersSection />
        {/* Indian markets access */}
        <Markets />
        {/* Account types & pricing */}
        <AccountsSection />
        {/* Next-generation trading platform */}
        <Platform />
        {/* Professional trading conditions */}
        <ConditionsSection />
        {/* Professional tools & research */}
        <ToolsSection />
        {/* Education centre */}
        <EducationSection />
        {/* Fast & secure payments */}
        <PaymentsSection />
        {/* Built on precision & trust */}
        <TrustPillarsSection />
        {/* Vision, mission & values */}
        <ValuesSection />
        {/* Authorised partner program */}
        <PartnerSection />
        {/* Start trading in 3 simple steps */}
        <StepsSection />
        {/* What traders say */}
        <TestimonialsSection />
        {/* FAQ */}
        <FaqSection />
        {/* Closing CTA */}
        <FinalCta onOpenModal={openModal} />

        <Footer onOpenModal={openModal} />
      </main>

      <MenuOverlay
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onOpenModal={openModal}
        onScrollTo={scrollTo}
      />

      <ContactModal open={modalOpen} onClose={() => setModalOpen(false)} />

      <Loader onDone={() => setReady(true)} />
    </>
  );
}
