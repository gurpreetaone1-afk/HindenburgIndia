"use client";

import { useEffect, useRef, useState } from "react";
import { EASE, TRUST_INTERVAL, TRUST_SLIDES } from "./data";
import { useInview, useParallax } from "./hooks";
import { Spring, lerp, prefersReducedMotion } from "./motion";
import { ArrowButton, Dots } from "./ui";

/** Opposing X drift per ghost word, mapped across the section's scroll. */
const GHOST_PARALLAX: [number, number][] = [
  [-3, 3],
  [3, -3],
  [-2, 4],
  [4, -3],
];

/**
 * Trust — the "why traders choose us" carousel. Changing slide re-fires the
 * four ghost-word clip reveals and cross-fades the proof photo.
 */
export default function Trust() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [index, setIndex] = useState(0);

  const badgeRef = useInview<HTMLDivElement>(
    { opacity: 0, scale: 0.9 },
    { tension: 220, friction: 22 },
  );
  const cardRef = useInview<HTMLElement>(
    { opacity: 0, y: 24 },
    { delay: 120, tension: 200, friction: 26 },
  );
  const figureRef = useInview<HTMLDivElement>(
    { opacity: 0, y: 60, scale: 0.92 },
    { tension: 170, friction: 26 },
  );

  useParallax(sectionRef, (p) => {
    wordRefs.current.forEach((w, i) => {
      if (!w) return;
      const [a, b] = GHOST_PARALLAX[i];
      w.style.transform = `translate3d(${lerp(a, b, p)}%, 0, 0)`;
    });
  });

  /** Replays the clip-mask reveal on all four ghost words. */
  const playGhost = () => {
    wordRefs.current.forEach((host) => {
      const clip = host?.querySelector<HTMLElement>(".bl-clip");
      const inner = clip?.firstElementChild as HTMLElement | null;
      if (!clip || !inner) return;
      clip.classList.remove("is-in");
      inner.style.transition = `transform 700ms ${EASE.expo}, opacity 700ms ${EASE.expo}`;
      // Double rAF so the class removal is committed before re-adding it.
      requestAnimationFrame(() => requestAnimationFrame(() => clip.classList.add("is-in")));
    });
  };

  // First reveal, once the section scrolls into view.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          io.unobserve(e.target);
          playGhost();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = (next: number) => {
    const n = (next + TRUST_SLIDES.length) % TRUST_SLIDES.length;
    setIndex(n);
    const img = imgRef.current;
    if (!img || prefersReducedMotion()) return;
    // Cross-fade the photo out and back in around the state change.
    const out = new Spring(260, 26, (t) => {
      img.style.opacity = String(lerp(1, 0, t));
      if (t > 0.995) {
        const inn = new Spring(260, 26, (u) => {
          img.style.opacity = String(u);
        });
        inn.set(1);
      }
    });
    out.set(1);
  };

  /* Auto-advance through all three slides. Gated on visibility so the carousel
     isn't already on slide 3 by the time the section is scrolled to, and keyed
     on `index` so a manual arrow/dot press restarts the full interval instead
     of being cut short by a tick that was already in flight. */
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) setInView(e.isIntersecting);
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!inView || prefersReducedMotion()) return;
    const id = window.setInterval(() => go(index + 1), TRUST_INTERVAL);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, index]);

  // Re-fire the word reveal whenever the slide changes.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    playGhost();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const slide = TRUST_SLIDES[index];

  return (
    <section className="bl-trust" ref={sectionRef} id="trust">
      <div className="bl-trust-badges">
        <div className="bl-pct-badge" ref={badgeRef}>
          <b>99.9%</b>
          <small>Session uptime, every trading day</small>
        </div>
        <article className="bl-badge-card" ref={cardRef}>
          <span className="bl-badge-chip">#01</span>
          <div>
            <h3>Why traders choose Hindenburg India</h3>
            <p>
              From first-time investors to full-time derivatives desks, traders move here because
              the pricing is flat, the fills are fast, and the margin numbers match the calculator.
            </p>
          </div>
        </article>
      </div>

      <h2 className="bl-ghost-heading">
        <span className="bl-ghost-row">
          {[0, 1].map((i) => (
            <span
              key={i}
              className="bl-ghost-word"
              ref={(el) => {
                wordRefs.current[i] = el;
              }}
            >
              <span className="bl-clip">
                <span>{slide.headline[i]}</span>
              </span>
            </span>
          ))}
        </span>
        <span className="bl-ghost-row">
          {[2, 3].map((i) => (
            <span
              key={i}
              className={`bl-ghost-word${i === 2 ? " ink" : ""}`}
              ref={(el) => {
                wordRefs.current[i] = el;
              }}
            >
              <span className="bl-clip">
                <span>{slide.headline[i]}</span>
              </span>
            </span>
          ))}
        </span>
      </h2>

      <div className="bl-trust-figure">
        <div className="bl-trust-figure-anim" ref={figureRef}>
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img ref={imgRef} src={slide.img} alt={slide.alt} loading="lazy" />
            <figcaption>
              <b>{slide.name}</b>
              <small>{slide.role}</small>
            </figcaption>
          </figure>
        </div>
      </div>

      <div className="bl-trust-controls">
        <ArrowButton variant="outline" flip label="Previous slide" onClick={() => go(index - 1)} />
        <Dots count={TRUST_SLIDES.length} active={index} tone="dark" onPick={(i) => go(i)} />
        <ArrowButton variant="solid" label="Next slide" onClick={() => go(index + 1)} />
      </div>
    </section>
  );
}
