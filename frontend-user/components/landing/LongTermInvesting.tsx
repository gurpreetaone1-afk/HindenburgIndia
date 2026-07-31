"use client";

import Link from 'next/link';
import { Check, ArrowRight } from 'lucide-react';
import ImageBox from './ImageBox';

/**
 * "Built for Long-Term Investing" — checklist beside a supporting image,
 * balancing the trader-heavy sections above it.
 */
const points = [
  'Zero brokerage on equity delivery, held for as long as you like',
  'Direct mutual funds with no commission skimmed off your returns',
  'Apply to mainboard and SME IPOs straight from your account',
  'Automatic corporate-action handling for splits, bonuses and dividends',
  'Capital-gains statements generated for every financial year',
  'Consolidated portfolio view across equity, funds and commodities',
];

export default function LongTermInvesting() {
  return (
    <section className="bg-[#f7f9fc] py-24 md:py-28 px-6 relative overflow-hidden">
      <div className="max-w-7xl mx-auto relative grid lg:grid-cols-2 gap-14 lg:gap-20 items-center">
        <div>
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gold-50 border border-gold-200 mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#E6B839]" />
            <span className="text-xs font-semibold text-gold-800 uppercase tracking-widest">
              Investing
            </span>
          </span>

          <h2 className="text-3xl md:text-5xl font-bold text-slate-900 font-manrope tracking-tight leading-[1.1] mb-7">
            Built for <span className="text-[#1F4677] gold-underline">long-term investing</span>
          </h2>

          <p className="text-slate-500 leading-relaxed mb-9">
            Not every account is opened to trade intraday. If you are building a portfolio to hold for
            years, the same account works just as hard — and costs you nothing to hold.
          </p>

          <ul className="space-y-4 mb-10">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-[#1F4677] flex items-center justify-center shrink-0 mt-0.5">
                  <Check size={12} className="text-[#E6B839]" />
                </span>
                <span className="text-sm text-slate-600 leading-relaxed">{p}</span>
              </li>
            ))}
          </ul>

          <Link
            href="/register"
            className="btn-gold inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-bold"
          >
            Start investing
            <ArrowRight size={15} />
          </Link>
        </div>

        <ImageBox
          ratio="auto"
          variant="light"
          src="/image2.png"
          alt="Building a long-term portfolio with Hindenburg India"
          className="w-full h-[340px] md:h-[460px] premium-shadow"
        />
      </div>
    </section>
  );
}
