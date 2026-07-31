"use client";

import Link from 'next/link';
import { Landmark, ShieldCheck, ArrowRight } from 'lucide-react';

/**
 * "Innovating for Indian markets" — two-card intro band that sits between the
 * hero/video and the numbers strip. Establishes the India-first positioning
 * before any product detail.
 */
const pillars = [
  {
    icon: Landmark,
    title: 'Built for Indian markets',
    desc:
      'NSE, BSE and MCX segments, INR settlement, and an order book tuned to Indian market hours — not a global platform bolted onto India.',
  },
  {
    icon: ShieldCheck,
    title: 'Innovating with discipline',
    desc:
      'Segregated client funds, transparent margin rules and audited reporting. New features ship only once they clear our risk review.',
  },
];

export default function InnovatingForIndia() {
  return (
    <section className="bg-white py-24 md:py-28 px-6 relative overflow-hidden">
      <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-[520px] h-[520px] bg-gold-400/10 rounded-full blur-[130px] pointer-events-none" />

      <div className="max-w-7xl mx-auto relative">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gold-50 border border-gold-200 mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#E6B839]" />
            <span className="text-xs font-semibold text-gold-800 uppercase tracking-widest">
              Why we exist
            </span>
          </span>

          <h2 className="text-3xl md:text-5xl font-bold text-slate-900 font-manrope tracking-tight leading-[1.1]">
            Innovating for <span className="text-[#1F4677] gold-underline">Indian markets</span>
          </h2>

          <p className="text-slate-500 leading-relaxed mt-7">
            Most trading platforms treat India as an afterthought. We started here — building
            execution, margining and settlement around how Indian traders actually work.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {pillars.map((p) => {
            const Icon = p.icon;
            return (
              <div key={p.title} className="card-light p-8 md:p-10">
                <div className="w-12 h-12 rounded-full bg-[#1F4677] flex items-center justify-center mb-6">
                  <Icon size={22} className="text-[#E6B839]" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 font-manrope mb-3">{p.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{p.desc}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-10 text-center">
          <Link
            href="/about"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#1F4677] hover:gap-3 transition-all"
          >
            Read our story <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </section>
  );
}
