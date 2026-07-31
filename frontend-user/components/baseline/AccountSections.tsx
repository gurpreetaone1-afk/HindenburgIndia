"use client";

import Link from "next/link";
import { Head, RevealCard } from "./Sections";
import { useLineReveal } from "./hooks";

/**
 * Section blocks shared by the three account pages (Standard / Pro / Demo).
 *
 * These pages all have the same shape — a metric strip, a feature checklist,
 * a set of highlights and a closing CTA — so the layout lives here once and
 * each page supplies only its copy. Everything is built from the Baseline
 * primitives in sections.css, so the pages match the rest of the site.
 */

export type Spec = { value: string; label: string };
export type Highlight = { title: string; body: string };
export type Step = { n: string; title: string; body: string };
export type Action = { label: string; href: string; variant: "light" | "outline" };

/* ── Metric strip — sits directly under the page hero ─────────────────────── */
export function SpecStrip({ items }: { items: Spec[] }) {
  return (
    <section className="bl-section plain tight">
      <div className="bl-specs">
        {items.map((s, i) => (
          <RevealCard key={s.label} i={i} className="bl-spec">
            <span className="bl-spec-v">{s.value}</span>
            <span className="bl-spec-l">{s.label}</span>
          </RevealCard>
        ))}
      </div>
    </section>
  );
}

/* ── Feature checklist ────────────────────────────────────────────────────── */
export function ChecklistSection({
  eyebrow,
  lines,
  lead,
  items,
  tone = "tint",
}: {
  eyebrow: string;
  lines: string[];
  lead?: string;
  items: string[];
  tone?: "plain" | "tint";
}) {
  return (
    <section className={`bl-section ${tone}`}>
      <Head eyebrow={eyebrow} lines={lines} lead={lead} />
      <ul className="bl-checks">
        {items.map((f) => (
          <li className="bl-check" key={f}>
            {f}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── Highlight cards — numbered rather than icon-led, to match the theme ──── */
export function HighlightsSection({
  eyebrow,
  lines,
  lead,
  items,
  tone = "plain",
}: {
  eyebrow: string;
  lines: string[];
  lead?: string;
  items: Highlight[];
  tone?: "plain" | "tint";
}) {
  return (
    <section className={`bl-section ${tone}`}>
      <Head eyebrow={eyebrow} lines={lines} lead={lead} />
      <div className="bl-grid cols-3">
        {items.map((h, i) => (
          <RevealCard key={h.title} i={i}>
            <span className="bl-card-idx">{String(i + 1).padStart(2, "0")}</span>
            <h3>{h.title}</h3>
            <p>{h.body}</p>
          </RevealCard>
        ))}
      </div>
    </section>
  );
}

/* ── Steps band ───────────────────────────────────────────────────────────── */
export function StepsBand({
  eyebrow,
  lines,
  steps,
}: {
  eyebrow: string;
  lines: string[];
  steps: Step[];
}) {
  return (
    <section className="bl-section deep">
      <Head eyebrow={eyebrow} lines={lines} tone="light" />
      <div className="bl-steps">
        {steps.map((s, i) => (
          <RevealCard key={s.n} i={i} className="bl-step">
            <b>{s.n}</b>
            <h3>{s.title}</h3>
            <p>{s.body}</p>
          </RevealCard>
        ))}
      </div>
    </section>
  );
}

/* ── Comparison table ─────────────────────────────────────────────────────── */
export function CompareSection({
  eyebrow,
  lines,
  cols,
  rows,
  highlightCol,
}: {
  eyebrow: string;
  lines: string[];
  cols: string[];
  rows: string[][];
  /** Index of the column belonging to this page — rendered in full ink. */
  highlightCol: number;
}) {
  return (
    <section className="bl-section plain">
      <Head eyebrow={eyebrow} lines={lines} />
      <div className="bl-table-wrap">
        <table className="bl-table">
          <thead>
            <tr>
              {cols.map((c, i) => (
                <th key={c} className={i === highlightCol ? "is-current" : undefined}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row[0]}>
                {row.map((cell, i) => (
                  <td
                    key={cols[i]}
                    className={i === 0 || i === highlightCol ? "sym" : undefined}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ── Closing CTA ──────────────────────────────────────────────────────────── */
export function CtaBand({
  lines,
  lead,
  actions,
  note,
}: {
  lines: string[];
  lead: string;
  actions: Action[];
  note?: string;
}) {
  const ref = useLineReveal<HTMLHeadingElement>({ stagger: 120, duration: 950 });
  return (
    <section className="bl-section deep" style={{ textAlign: "center" }}>
      <div style={{ maxWidth: "44rem", marginInline: "auto" }}>
        <h2 className="bl-h2" ref={ref} style={{ marginTop: 0 }}>
          {lines.map((l) => (
            <span className="bl-line" key={l}>
              <span>{l}</span>
            </span>
          ))}
        </h2>
        <p className="bl-section-lead" style={{ marginInline: "auto" }}>
          {lead}
        </p>
        {/* Class, not inline styles — the mobile rules in sections.css make
            these pills full-width, which an inline style would outrank. */}
        <div className="bl-cta-actions">
          {actions.map((a) => (
            <Link key={a.href + a.label} href={a.href} className={`bl-pill ${a.variant}`}>
              {a.label}
            </Link>
          ))}
        </div>
        {note && (
          <p
            style={{
              fontSize: "0.75rem",
              color: "rgba(255,255,255,0.5)",
              marginTop: "2rem",
              lineHeight: 1.7,
            }}
          >
            {note}
          </p>
        )}
      </div>
    </section>
  );
}
