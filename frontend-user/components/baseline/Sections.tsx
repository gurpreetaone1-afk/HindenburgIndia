"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  ACCOUNTS,
  CONDITIONS,
  COURSES,
  FAQS,
  PAYMENTS,
  PAYMENT_METHODS,
  PARTNER_SLABS,
  STEPS,
  STATS,
  TESTIMONIALS,
  TOOLS,
  TRUST_PILLARS,
  VALUES,
} from "./data";
import { useInview, useLineReveal } from "./hooks";
import { Eyebrow, PillButton } from "./ui";

/* ══════════════════════════════════════════════════════════════════════════
   Shared section header — eyebrow + stacked-line title + optional lead
   ══════════════════════════════════════════════════════════════════════════ */
export function Head({
  eyebrow,
  lines,
  lead,
  tone = "dark",
}: {
  eyebrow: string;
  lines: string[];
  lead?: string;
  tone?: "dark" | "light";
}) {
  const ref = useLineReveal<HTMLHeadingElement>({ stagger: 120, duration: 950 });
  return (
    <div className="bl-section-head">
      <Eyebrow tone={tone}>{eyebrow}</Eyebrow>
      <h2 className="bl-h2" ref={ref}>
        {lines.map((l) => (
          <span className="bl-line" key={l}>
            <span>{l}</span>
          </span>
        ))}
      </h2>
      {lead && <p className="bl-section-lead">{lead}</p>}
    </div>
  );
}

/** A card that rises in on scroll. */
export function RevealCard({
  children,
  i,
  className = "bl-card",
}: {
  children: React.ReactNode;
  i: number;
  className?: string;
}) {
  const ref = useInview<HTMLDivElement>(
    { opacity: 0, y: 30 },
    { delay: i * 90, tension: 185, friction: 26 },
  );
  return (
    <div className={className} ref={ref}>
      {children}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   NUMBERS THAT SPEAK
   ══════════════════════════════════════════════════════════════════════════ */
export function NumbersSection() {
  return (
    <section className="bl-stats">
      <Eyebrow tone="light">By the numbers</Eyebrow>
      <StatsTitle />
      <dl>
        {STATS.map((s, i) => (
          <StatCell key={s.l} s={s} i={i} />
        ))}
      </dl>
    </section>
  );
}

function StatsTitle() {
  const ref = useLineReveal<HTMLHeadingElement>({ stagger: 120, duration: 950 });
  return (
    <h2 className="bl-h2" ref={ref}>
      <span className="bl-line">
        <span>Numbers that</span>
      </span>
      <span className="bl-line">
        <span>speak for us</span>
      </span>
    </h2>
  );
}

function StatCell({ s, i }: { s: (typeof STATS)[number]; i: number }) {
  const ref = useInview<HTMLDivElement>(
    { opacity: 0, y: 30 },
    { delay: i * 110, tension: 180, friction: 24 },
  );
  return (
    <div className="bl-stat" ref={ref}>
      <dt className="bl-sr">{s.l}</dt>
      <dd>
        <span className="bl-stat-v">{s.v}</span>
        <span className="bl-stat-l">{s.l}</span>
      </dd>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   ACCOUNT TYPES
   ══════════════════════════════════════════════════════════════════════════ */
export function AccountsSection() {
  return (
    <section className="bl-section tint" id="accounts">
      <Head
        eyebrow="Pricing"
        lines={["Account types", "for every trader"]}
        lead="One account opens every segment. Pick the pricing that matches how often you trade — you can move between tiers at any time."
      />
      <div className="bl-plans">
        {ACCOUNTS.map((a, i) => (
          <RevealCard key={a.name} i={i} className={`bl-plan${a.featured ? " featured" : ""}`}>
            <h3>{a.name}</h3>
            <p className="tag">{a.tagline}</p>
            <div className="price">{a.price}</div>
            <div className="note">{a.note}</div>
            <ul>
              {a.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <div className="cta">
              <Link href="/register" className={`bl-pill ${a.featured ? "light" : "outline"}`}>
                Open account
              </Link>
            </div>
          </RevealCard>
        ))}
      </div>
      <p className="bl-plan-note">
        Brokerage excludes statutory charges (STT, exchange transaction charges, GST, SEBI turnover
        fees and stamp duty), which are levied at prevailing government rates.
      </p>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   TRADING CONDITIONS
   ══════════════════════════════════════════════════════════════════════════ */
export function ConditionsSection() {
  return (
    <section className="bl-section plain" id="conditions">
      <Head
        eyebrow="Execution"
        lines={["Professional", "trading conditions"]}
        lead="The conditions that decide whether a strategy is profitable — published up front, identical for every account."
      />
      <div className="bl-rows">
        {CONDITIONS.map((c, i) => (
          <RevealCard key={c.title} i={i} className="bl-row">
            <div className="bl-row-body">
              <h3>{c.title}</h3>
              <p>{c.desc}</p>
            </div>
            <div className="bl-row-metric">
              <b>{c.metric}</b>
              <small>{c.metricLabel}</small>
            </div>
          </RevealCard>
        ))}
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   TOOLS & RESEARCH
   ══════════════════════════════════════════════════════════════════════════ */
export function ToolsSection() {
  return (
    <section className="bl-section tint" id="tools">
      <Head
        eyebrow="Toolkit"
        lines={["Professional tools", "and research"]}
        lead="Everything you need to form a view, size the position and manage it — included with every account, at no extra cost."
      />
      <div className="bl-grid cols-3">
        {TOOLS.map((t, i) => (
          <RevealCard key={t.title} i={i}>
            <span className="bl-card-idx">{String(i + 1).padStart(2, "0")}</span>
            <h3>{t.title}</h3>
            <p>{t.desc}</p>
          </RevealCard>
        ))}
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   EDUCATION
   ══════════════════════════════════════════════════════════════════════════ */
export function EducationSection() {
  return (
    <section className="bl-section plain" id="learn">
      <Head
        eyebrow="Education centre"
        lines={["Start your", "learning journey"]}
        lead="Structured lessons written by traders, not marketers. Free with every account."
      />
      <div className="bl-grid cols-3">
        {COURSES.map((c, i) => (
          <RevealCard key={c.title} i={i}>
            <span className="bl-card-idx">{c.tag}</span>
            <h3>{c.title}</h3>
            <p>{c.desc}</p>
          </RevealCard>
        ))}
      </div>
      <div style={{ marginTop: "2.5rem" }}>
        <Link href="/learn" className="bl-pill outline">
          Browse all lessons
        </Link>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PAYMENTS
   ══════════════════════════════════════════════════════════════════════════ */
export function PaymentsSection() {
  return (
    <section className="bl-section tint" id="payments">
      <Head
        eyebrow="Funding"
        lines={["Fast and secure", "payments"]}
        lead="Money in and money out should never be the slow part of trading. Client funds are held in a segregated account, separate from company money."
      />
      <div className="bl-grid cols-3">
        {PAYMENTS.map((p, i) => (
          <RevealCard key={p.title} i={i}>
            <div className="bl-card-metric">{p.v}</div>
            <h3 style={{ marginTop: "1.25rem" }}>{p.title}</h3>
            <p>{p.desc}</p>
          </RevealCard>
        ))}
      </div>
      <div className="bl-chips">
        {PAYMENT_METHODS.map((m) => (
          <span className="bl-chip" key={m}>
            {m}
          </span>
        ))}
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   BUILT ON PRECISION & TRUST
   ══════════════════════════════════════════════════════════════════════════ */
export function TrustPillarsSection() {
  return (
    <section className="bl-section deep" id="trust-pillars">
      <Head
        eyebrow="Trust"
        tone="light"
        lines={["Built on precision", "and trust"]}
        lead="A trading platform is only as good as the controls behind it. Ours are boring on purpose — segregated funds, verified identities, redundant systems and a paper trail for everything."
      />
      <div className="bl-grid cols-4">
        {TRUST_PILLARS.map((p, i) => (
          <RevealCard key={p.title} i={i}>
            <h3>{p.title}</h3>
            <p>{p.desc}</p>
          </RevealCard>
        ))}
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   VISION, MISSION & VALUES
   ══════════════════════════════════════════════════════════════════════════ */
export function ValuesSection() {
  return (
    <section className="bl-section plain" id="values">
      <Head
        eyebrow="Who we are"
        lines={["Vision, mission", "and values"]}
        lead="What we are building, why we are building it, and the lines we will not cross to get there."
      />
      <div className="bl-grid cols-4">
        {VALUES.map((v, i) => (
          <RevealCard key={v.title} i={i}>
            <h3>{v.title}</h3>
            <p>{v.desc}</p>
          </RevealCard>
        ))}
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PARTNER PROGRAM
   ══════════════════════════════════════════════════════════════════════════ */
export function PartnerSection() {
  return (
    <section className="bl-section deep" id="partner">
      <div className="bl-split">
        <Head
          eyebrow="Partners"
          tone="light"
          lines={["Authorised", "partner program"]}
          lead="Already advising traders and investors? Introduce them to Hindenburg India and earn a transparent share of the revenue they generate."
        />
        <div>
          <div className="bl-slabs">
            {PARTNER_SLABS.map((s) => (
              <div className="bl-slab" key={s.clients}>
                <span>{s.clients}</span>
                <b>{s.share}</b>
              </div>
            ))}
          </div>
          <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.55)", marginTop: "1.5rem", lineHeight: 1.7 }}>
            Slabs are indicative and confirmed in your partner agreement. Payouts are made monthly
            against the previous month&apos;s net brokerage.
          </p>
          <div style={{ marginTop: "2rem" }}>
            <Link href="/partner" className="bl-pill light">
              Become a partner
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   START TRADING IN 3 SIMPLE STEPS
   ══════════════════════════════════════════════════════════════════════════ */
export function StepsSection() {
  return (
    <section className="bl-section deep" id="steps">
      <Head
        eyebrow="Getting started"
        tone="light"
        lines={["Start trading in", "three simple steps"]}
      />
      <div className="bl-steps">
        {STEPS.map((s, i) => (
          <RevealCard key={s.n} i={i} className="bl-step">
            <b>{s.n}</b>
            <h3>{s.title}</h3>
            <p>{s.desc}</p>
          </RevealCard>
        ))}
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   TESTIMONIALS
   ══════════════════════════════════════════════════════════════════════════ */
export function TestimonialsSection() {
  return (
    <section className="bl-section plain" id="testimonials">
      <Head eyebrow="What traders say" lines={["Trusted by", "Indian traders"]} />
      <div className="bl-grid cols-3">
        {TESTIMONIALS.map((t, i) => (
          <RevealCard key={t.name} i={i}>
            <span className="bl-tquote" aria-hidden="true">
              &ldquo;
            </span>
            <blockquote style={{ fontSize: "1rem", lineHeight: 1.7, marginTop: "0.75rem" }}>
              {t.quote}
            </blockquote>
            <div style={{ borderTop: "1px solid var(--hairline)", paddingTop: "1rem", marginTop: "1.5rem" }}>
              <b style={{ fontWeight: 500, display: "block" }}>{t.name}</b>
              <small style={{ fontSize: "0.8125rem", color: "var(--ink-soft)" }}>{t.role}</small>
            </div>
          </RevealCard>
        ))}
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   FAQ — accordion
   ══════════════════════════════════════════════════════════════════════════ */
function FaqItem({ f, i }: { f: (typeof FAQS)[number]; i: number }) {
  const [open, setOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const toggle = () => {
    const body = bodyRef.current;
    setOpen((v) => !v);
    if (!body) return;
    // Animate to the measured height rather than `auto`, which can't transition.
    if (!open) body.style.height = `${body.scrollHeight}px`;
    else body.style.height = "0px";
  };

  return (
    <div className={`bl-faq-item${open ? " open" : ""}`}>
      <button className="bl-faq-q" onClick={toggle} aria-expanded={open}>
        {f.q}
        <span className="bl-faq-sign" aria-hidden="true" />
      </button>
      <div className="bl-faq-a" ref={bodyRef}>
        <p>{f.a}</p>
      </div>
    </div>
  );
}

export function FaqSection() {
  return (
    <section className="bl-section tint" id="faq">
      <Head eyebrow="Questions" lines={["Frequently asked", "questions"]} />
      <div className="bl-faq">
        {FAQS.map((f, i) => (
          <FaqItem key={f.q} f={f} i={i} />
        ))}
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   FINAL CTA
   ══════════════════════════════════════════════════════════════════════════ */
export function FinalCta({ onOpenModal }: { onOpenModal: () => void }) {
  const ref = useLineReveal<HTMLHeadingElement>({ stagger: 120, duration: 950 });
  return (
    <section className="bl-section deep" id="get-started" style={{ textAlign: "center" }}>
      <div style={{ maxWidth: "44rem", marginInline: "auto" }}>
        <h2 className="bl-h2" ref={ref} style={{ marginTop: 0 }}>
          <span className="bl-line">
            <span>Ready to invest in</span>
          </span>
          <span className="bl-line">
            <span>Indian markets?</span>
          </span>
        </h2>
        <p className="bl-section-lead" style={{ marginInline: "auto" }}>
          Open your account with PAN and Aadhaar in minutes. Nothing to pay to get started, and no
          minimum balance to keep it open.
        </p>
        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            justifyContent: "center",
            flexWrap: "wrap",
            marginTop: "2.5rem",
          }}
        >
          <Link href="/register" className="bl-pill light">
            Open free account
          </Link>
          <PillButton variant="outline" withArrow={false} onClick={onOpenModal}>
            Talk to us
          </PillButton>
        </div>
        <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.5)", marginTop: "2rem", lineHeight: 1.7 }}>
          Investments in securities are subject to market risk. Read all related documents carefully
          before investing.
        </p>
      </div>
    </section>
  );
}
