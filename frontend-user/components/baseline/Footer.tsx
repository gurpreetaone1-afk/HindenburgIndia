"use client";

import Link from "next/link";
import { CONTACT, FOOTER_COLUMNS, SOCIALS } from "./data";
import { useInview, useLineReveal } from "./hooks";
import { Brand, Eyebrow, PillButton } from "./ui";

export default function Footer({ onOpenModal }: { onOpenModal: () => void }) {
  const ctaRef = useLineReveal<HTMLParagraphElement>({ stagger: 120, duration: 950 });
  const pillRef = useInview<HTMLDivElement>(
    { opacity: 0, y: 20 },
    { delay: 150, tension: 200, friction: 24 },
  );

  return (
    <footer className="bl-footer" id="contact">
      <div className="bl-foot-cta">
        <div>
          <Eyebrow tone="light">Get started</Eyebrow>
          <p ref={ctaRef}>
            <span className="bl-line">
              <span>Ready to</span>
            </span>
            <span className="bl-line">
              <span>trade?</span>
            </span>
          </p>
        </div>
        {/* Label says "Open an account", so it goes to registration. The
            callback form is still reachable from the hero and the menu. */}
        <div ref={pillRef} className="bl-foot-cta-actions">
          <Link href="/register" className="bl-pill light">
            Open an account
          </Link>
          <PillButton variant="outline" withArrow={false} onClick={onOpenModal}>
            Talk to us
          </PillButton>
        </div>
      </div>

      <div className="bl-foot-cols">
        <div className="bl-foot-brand">
          <Brand />
          <p className="bl-foot-blurb">
            A multi-segment Indian trading platform — equity, F&amp;O, commodities and currency on
            one account, with flat pricing and transparent margin.
          </p>
          <address className="bl-foot-addr">
            <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
            <a href={`tel:${CONTACT.phone.replace(/[^\d+]/g, "")}`}>{CONTACT.phone}</a>
            <span className="muted">{CONTACT.address}</span>
          </address>
        </div>

        {FOOTER_COLUMNS.map((col) => (
          <nav className="bl-foot-col" key={col.title} aria-label={col.title}>
            <h3>{col.title}</h3>
            <ul>
              {col.links.map((l) => (
                <li key={l.label}>
                  <Link href={l.href}>{l.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="bl-foot-bottom">
        <span>© 2026 Hindenburg India. All rights reserved.</span>
        <nav aria-label="Social">
          {SOCIALS.filter((s) => s.href).map((s) => (
            <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer">
              {s.label}
            </a>
          ))}
        </nav>
        <nav aria-label="Legal">
          <Link href="/privacy">Privacy</Link>
          <Link href="/legal/terms">Terms</Link>
        </nav>
      </div>

      <p
        style={{
          marginTop: "2rem",
          fontSize: "0.6875rem",
          color: "rgba(255,255,255,0.45)",
          lineHeight: 1.7,
          maxWidth: "60rem",
        }}
      >
        Investments in securities are subject to market risk; read all related documents carefully
        before investing. Brokerage will not exceed the SEBI-prescribed maximum.
      </p>
    </footer>
  );
}
