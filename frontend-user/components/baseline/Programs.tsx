"use client";

import Link from "next/link";
import { MARKETS } from "./data";
import { useHoverSpring, useInview, useLineReveal } from "./hooks";
import { ArrowIcon, Eyebrow } from "./ui";

/** Indian markets access — the numbered segment list. */
function MarketRow({ p, i }: { p: (typeof MARKETS)[number]; i: number }) {
  const revealRef = useInview<HTMLSpanElement>(
    { opacity: 0, y: 26 },
    { delay: i * 90, tension: 190, friction: 26 },
  );
  const { triggerRef, targetRef } = useHoverSpring<HTMLAnchorElement, HTMLSpanElement>(
    { x: 0, opacity: 0.55 },
    { x: 8, opacity: 1 },
    300,
    20,
  );

  return (
    <li>
      <Link className="bl-prog-row" href={p.href} ref={triggerRef}>
        <span ref={revealRef} style={{ display: "block" }}>
          <span className="bl-prog-inner">
            <span className="bl-prog-idx">{p.n}</span>
            <span className="bl-prog-body">
              <h3>{p.name}</h3>
              <p>{p.desc}</p>
            </span>
            <span className="bl-prog-arrow" ref={targetRef}>
              <ArrowIcon />
            </span>
          </span>
        </span>
      </Link>
    </li>
  );
}

export default function Markets() {
  const titleRef = useLineReveal<HTMLHeadingElement>({ stagger: 120, duration: 950 });

  return (
    <section className="bl-programs" id="markets">
      <Eyebrow>Indian markets access</Eyebrow>
      <h2 className="bl-h2" ref={titleRef}>
        <span className="bl-line">
          <span>Every segment,</span>
        </span>
        <span className="bl-line">
          <span>one account</span>
        </span>
      </h2>

      <ul>
        {MARKETS.map((p, i) => (
          <MarketRow key={p.n} p={p} i={i} />
        ))}
      </ul>
    </section>
  );
}
