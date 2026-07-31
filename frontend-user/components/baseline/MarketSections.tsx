"use client";

import Link from "next/link";
import type { MarketPage } from "./marketPages";
import { Head, RevealCard } from "./Sections";
import { useInview } from "./hooks";

/**
 * The body of a segment page (Equity / F&O / Commodities / Indices).
 *
 * Every segment renders the same four sections — spec strip, overview,
 * instruments table, feature cards — from the data in marketPages.ts, so the
 * four pages stay identical in rhythm and only the copy differs.
 */
export default function MarketSections({ segment }: { segment: MarketPage }) {
  return (
    <>
      <section className="bl-section plain tight">
        <dl className="bl-specs">
          {segment.specs.map((s, i) => (
            <SpecCell key={s.l} s={s} i={i} />
          ))}
        </dl>
      </section>

      <section className="bl-section tint">
        <Head
          eyebrow={segment.overview.eyebrow}
          lines={segment.overview.lines}
          lead={segment.overview.body}
        />
      </section>

      <section className="bl-section plain">
        <Head
          eyebrow="Instruments"
          lines={["Top tradable", "instruments"]}
          lead="A sample of what's live in this segment. The full list is searchable inside the terminal."
        />
        {/* The wrapper scrolls, not the page — four columns don't fit a phone. */}
        <div className="bl-table-wrap">
          <table className="bl-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Exchange</th>
                <th>Lot size</th>
                <th>Margin</th>
              </tr>
            </thead>
            <tbody>
              {segment.instruments.map((ins) => (
                <tr key={ins.symbol}>
                  <td className="sym">{ins.symbol}</td>
                  <td>{ins.exchange}</td>
                  <td>{ins.lot}</td>
                  <td>{ins.margin}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bl-section tint">
        <Head
          eyebrow="Why Hindenburg India"
          lines={["Built for how", "you actually trade"]}
        />
        <div className="bl-grid cols-3">
          {segment.features.map((f, i) => (
            <RevealCard key={f.title} i={i}>
              <span className="bl-card-idx">{String(i + 1).padStart(2, "0")}</span>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </RevealCard>
          ))}
        </div>
        <div className="bl-market-cta">
          <Link href="/register" className="bl-pill solid">
            Open account
          </Link>
          <Link href="/pricing" className="bl-pill outline">
            See pricing
          </Link>
        </div>
      </section>
    </>
  );
}

function SpecCell({ s, i }: { s: { v: string; l: string }; i: number }) {
  const ref = useInview<HTMLDivElement>(
    { opacity: 0, y: 24 },
    { delay: i * 90, tension: 180, friction: 24 },
  );
  return (
    <div className="bl-spec" ref={ref}>
      <dt className="bl-sr">{s.l}</dt>
      <dd>
        <span className="bl-spec-v">{s.v}</span>
        <span className="bl-spec-l">{s.l}</span>
      </dd>
    </div>
  );
}
