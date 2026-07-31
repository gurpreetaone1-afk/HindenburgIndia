"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { COLLECTION_INTERVAL, HERO, IMG, MARKET_TICKS, TRADER_AVATARS } from "./data";
import { useInview, useLineReveal, useParallax, useWordReveal } from "./hooks";
import { Spring, lerp, prefersReducedMotion } from "./motion";
import { Dots } from "./ui";

/**
 * Hero — full-bleed navy card with the parallax market photo, the giant
 * word-by-word headline, the primary CTAs and two glass cards (a rotating
 * index ticker and a proof card).
 * Every entrance here is gated on `ready` (the loader finishing).
 */
export default function Hero({
  ready,
  onOpenModal,
}: {
  ready: boolean;
  onOpenModal: () => void;
}) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const plateRef = useRef<HTMLDivElement | null>(null);

  const titleRef = useWordReveal<HTMLHeadingElement>(HERO.title, {
    stagger: 140,
    duration: 1100,
    gate: ready,
  });
  const taglineRef = useLineReveal<HTMLParagraphElement>({
    base: 350,
    stagger: 110,
    duration: 900,
    gate: ready,
  });
  const ctaRef = useInview<HTMLDivElement>(
    { opacity: 0, y: 20 },
    { delay: 620, tension: 200, friction: 26, gate: ready },
  );
  const tickerRef = useInview<HTMLDivElement>(
    { opacity: 0, y: 28 },
    { delay: 700, tension: 200, friction: 26, gate: ready },
  );
  const proofRef = useInview<HTMLElement>(
    { opacity: 0, y: 28 },
    { delay: 820, tension: 200, friction: 26, gate: ready },
  );

  useParallax(sectionRef, (p) => {
    const el = plateRef.current;
    if (el) el.style.transform = `translate3d(0, ${lerp(0, 12, p)}%, 0)`;
  });

  /* ── Index ticker carousel ───────────────────────────────────────────── */
  const [tick, setTick] = useState(0);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const tickRef = useRef(0);
  tickRef.current = tick;
  const swapping = useRef(false);

  const goTick = (next: number) => {
    const card = cardRef.current;
    const n = (next + MARKET_TICKS.length) % MARKET_TICKS.length;
    if (!card || prefersReducedMotion()) {
      setTick(n);
      return;
    }
    if (swapping.current) return;
    swapping.current = true;

    const out = new Spring(210, 24, (t) => {
      card.style.opacity = String(lerp(1, 0, t));
      card.style.transform = `translate3d(0, ${lerp(0, 16, t)}px, 0) scale(${lerp(1, 0.96, t)})`;
      if (t > 0.995) {
        setTick(n);
        const inn = new Spring(210, 24, (u) => {
          card.style.opacity = String(u);
          card.style.transform = `translate3d(0, ${lerp(16, 0, u)}px, 0) scale(${lerp(0.96, 1, u)})`;
          if (u > 0.995) swapping.current = false;
        });
        inn.set(1);
      }
    });
    out.set(1);
  };

  useEffect(() => {
    if (!ready || prefersReducedMotion()) return;
    const id = window.setInterval(() => goTick(tickRef.current + 1), COLLECTION_INTERVAL);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const t = MARKET_TICKS[tick];

  return (
    <section className="bl-hero" ref={sectionRef} id="home">
      <div className="bl-hero-plate">
        <div className="bl-hero-plate-inner" ref={plateRef}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={IMG.hero}
            alt="Indian markets trading desk"
            fetchPriority="high"
          />
        </div>
      </div>
      <div className="bl-hero-veil" />

      <div className="bl-hero-title-wrap">
        <h1 className="bl-hero-title" ref={titleRef}>
          {HERO.title}
        </h1>
      </div>

      <div className="bl-hero-bottom">
        <div className="bl-hero-lead">
          <p className="bl-hero-tagline" ref={taglineRef}>
            {HERO.taglineLines.map((l) => (
              <span className="bl-line" key={l}>
                <span>{l}</span>
              </span>
            ))}
          </p>
          <p className="bl-hero-kicker">{HERO.kicker}</p>
          <div className="bl-hero-ctas" ref={ctaRef}>
            <Link href="/register" className="bl-pill light">
              Open free account
            </Link>
            <button className="bl-pill outline" style={{ color: "#fff", borderColor: "rgba(255,255,255,0.4)" }} onClick={onOpenModal}>
              Talk to us
            </button>
          </div>
        </div>

        <div className="bl-hero-cluster">
          <div className="bl-collection" ref={tickerRef}>
            <div className="bl-glass bl-coll-card" ref={cardRef}>
              <div className="bl-tick" style={{ flex: 1 }}>
                <span className="bl-tick-sym">{t.symbol}</span>
                <span className="bl-tick-name">{t.name}</span>
                <span className="bl-tick-last">{t.last}</span>
                <span className={`bl-tick-chg ${t.up ? "up" : "down"}`}>
                  {t.up ? "▲" : "▼"} {t.change}
                </span>
              </div>
            </div>
            <Dots count={MARKET_TICKS.length} active={tick} tone="light" onPick={(i) => goTick(i)} />
          </div>

          <article className="bl-glass bl-traders" ref={proofRef}>
            <div className="bl-traders-left">
              <span className="bl-traders-value">5,000+</span>
              <div className="bl-traders-avatars" aria-hidden="true">
                {TRADER_AVATARS.map((src) => (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img key={src} src={src} alt="" loading="lazy" />
                ))}
              </div>
              <span className="bl-traders-caption">Traders on the platform</span>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={IMG.proof} alt="Trader reviewing positions" loading="lazy" />
          </article>
        </div>
      </div>
    </section>
  );
}
