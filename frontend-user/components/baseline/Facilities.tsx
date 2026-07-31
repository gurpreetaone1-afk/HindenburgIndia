"use client";

import { PLATFORMS } from "./data";
import { useHoverSpring, useInview, useLineReveal, useWordFade } from "./hooks";
import { TerminalMark } from "./ui";

const BODY =
  "One order book across web and mobile — the same charts, the same margin, the same positions, wherever you happen to be trading from.";

function PlatformTile({ c, i }: { c: (typeof PLATFORMS)[number]; i: number }) {
  const revealRef = useInview<HTMLDivElement>(
    { opacity: 0, y: 48 },
    { delay: i * 140, tension: 180, friction: 26 },
  );
  const { triggerRef, targetRef } = useHoverSpring<HTMLElement, HTMLImageElement>(
    { scale: 1 },
    { scale: 1.03 },
    300,
    22,
  );

  return (
    <div className="bl-fac-card" ref={revealRef}>
      <figure className={`bl-fac-tile bl-tone-${c.tone}`} ref={triggerRef}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={targetRef} src={c.img} alt={c.alt} loading="lazy" />
        <figcaption>
          <b>{c.name}</b>
          <small>{c.desc}</small>
        </figcaption>
      </figure>
    </div>
  );
}

/** Next-generation trading platform. */
export default function Platform() {
  const iconRef = useInview<HTMLSpanElement>(
    { opacity: 0, scale: 0.85 },
    { tension: 240, friction: 20 },
  );
  const titleRef = useLineReveal<HTMLHeadingElement>({ stagger: 120, duration: 950 });
  const bodyRef = useWordFade<HTMLParagraphElement>(BODY, {
    stagger: 28,
    delay: 250,
    duration: 700,
  });

  return (
    <section className="bl-facilities" id="platform">
      <div className="bl-fac-grid">
        <div className="bl-fac-intro">
          {/* Drawn mark, not a photo — a stock image here read as a broken
              thumbnail next to the headline. */}
          <span className="bl-fac-icon" ref={iconRef} aria-hidden="true">
            <TerminalMark />
          </span>
          <h2 className="bl-h2" ref={titleRef} style={{ marginTop: "1.5rem" }}>
            <span className="bl-line">
              <span>Next-generation</span>
            </span>
            <span className="bl-line">
              <span>trading platform</span>
            </span>
          </h2>
          <p className="bl-fac-body" ref={bodyRef}>
            {BODY}
          </p>
        </div>

        <div className="bl-fac-cards">
          {PLATFORMS.map((c, i) => (
            <PlatformTile key={c.name} c={c} i={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
