"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Lenis from "lenis";

import "./baseline.css";
import "./sections.css";
import ContactModal from "./ContactModal";
import Footer from "./Footer";
import MenuOverlay from "./MenuOverlay";
import SiteHeader from "./SiteHeader";
import { useAdaptiveGrid, useLineReveal } from "./hooks";
import { Eyebrow } from "./ui";

/**
 * Shared chrome for the inner (menu) pages — the same header, menu overlay,
 * contact modal and footer as the homepage, minus the intro loader.
 *
 * Pages pass their own hero copy and render their sections as children.
 */
export default function PageShell({
  eyebrow,
  titleLines,
  lead,
  children,
}: {
  eyebrow: string;
  titleLines: string[];
  lead: string;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const lenisRef = useRef<Lenis | null>(null);
  const titleRef = useLineReveal<HTMLHeadingElement>({ stagger: 110, duration: 950 });

  useAdaptiveGrid();

  useEffect(() => {
    const lenis = new Lenis({ smoothWheel: true });
    lenisRef.current = lenis;
    let id = 0;
    const raf = (t: number) => {
      lenis.raf(t);
      id = requestAnimationFrame(raf);
    };
    id = requestAnimationFrame(raf);
    document.documentElement.classList.add("bl-scale");
    return () => {
      cancelAnimationFrame(id);
      lenis.destroy();
      lenisRef.current = null;
      document.documentElement.classList.remove("bl-scale");
    };
  }, []);

  const locked = menuOpen || modalOpen;
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
    if (el) lenisRef.current?.scrollTo(el as HTMLElement);
  }, []);

  const openModal = useCallback(() => setModalOpen(true), []);

  return (
    <>
      <main className="bl-root">
        {/* Outside .bl-page-hero — the header reads in ink on the white page
            margin, and that section is navy. */}
        <SiteHeader onOpenMenu={() => setMenuOpen(true)} />

        <section className="bl-page-hero">
          <Eyebrow tone="light">{eyebrow}</Eyebrow>
          <h1 ref={titleRef as React.RefObject<HTMLHeadingElement>}>
            {titleLines.map((l) => (
              <span className="bl-line" key={l}>
                <span>{l}</span>
              </span>
            ))}
          </h1>
          <p>{lead}</p>
        </section>

        {children}

        <Footer onOpenModal={openModal} />
      </main>

      <MenuOverlay
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onOpenModal={openModal}
        onScrollTo={scrollTo}
      />
      <ContactModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
