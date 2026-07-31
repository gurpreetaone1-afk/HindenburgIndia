"use client";

import { Award } from 'lucide-react';

/**
 * "Recognised across the industry".
 *
 * ⚠️ PLACEHOLDER CONTENT — DO NOT PUBLISH AS-IS.
 * Awards and industry recognition are factual claims about the real world. This
 * file intentionally ships neutral, obviously-unfilled slots rather than
 * invented award names, so nothing false can reach production by accident.
 *
 * To go live: replace each entry below with a recognition you can actually
 * evidence (award name, issuing body, year). If you have none yet, delete the
 * `<Recognition />` line from app/(landing)/page.tsx — the section renders
 * nothing when `RECOGNITIONS` is empty.
 */
type Recognition = { title: string; issuer: string; year: string };

const RECOGNITIONS: Recognition[] = [
  { title: 'Award title', issuer: 'Issuing body', year: 'Year' },
  { title: 'Award title', issuer: 'Issuing body', year: 'Year' },
  { title: 'Award title', issuer: 'Issuing body', year: 'Year' },
  { title: 'Award title', issuer: 'Issuing body', year: 'Year' },
];

export default function Recognition() {
  if (RECOGNITIONS.length === 0) return null;

  return (
    <section className="bg-[#f7f9fc] py-24 md:py-28 px-6 relative overflow-hidden">
      <div className="max-w-7xl mx-auto relative">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gold-50 border border-gold-200 mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#E6B839]" />
            <span className="text-xs font-semibold text-gold-800 uppercase tracking-widest">
              Recognition
            </span>
          </span>

          <h2 className="text-3xl md:text-5xl font-bold text-slate-900 font-manrope tracking-tight leading-[1.1]">
            Recognised across the <span className="text-[#1F4677] gold-underline">industry</span>
          </h2>

          <p className="text-slate-500 leading-relaxed mt-7">
            Independent recognition for the platform, the pricing and the people behind it.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {RECOGNITIONS.map((r, i) => (
            <div key={i} className="card-light p-8 text-center">
              <div className="w-14 h-14 rounded-full bg-gold-50 border border-gold-200 flex items-center justify-center mx-auto mb-6">
                <Award size={24} className="text-[#1F4677]" />
              </div>
              <h3 className="text-base font-bold text-slate-900 font-manrope mb-2">{r.title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{r.issuer}</p>
              <p className="text-xs text-slate-400 mt-2">{r.year}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
