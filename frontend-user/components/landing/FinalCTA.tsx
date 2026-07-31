"use client";

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

/**
 * "Ready to Invest in Indian Markets?" — closing conversion band that sits
 * between the FAQ and the contact/footer blocks.
 */
export default function FinalCTA() {
  return (
    <section className="section-dark py-20 md:py-24 px-6 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[620px] h-[620px] bg-[#E6B839]/10 rounded-full blur-[150px] pointer-events-none" />

      <div className="max-w-3xl mx-auto relative text-center">
        <h2 className="text-3xl md:text-5xl font-bold text-white font-manrope tracking-tight leading-[1.1] mb-6">
          Ready to invest in Indian markets?
        </h2>

        <p className="text-slate-300 leading-relaxed mb-10 max-w-xl mx-auto">
          Open your account in minutes with PAN and Aadhaar. There is nothing to pay to get started,
          and no minimum balance to keep it open.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/register"
            className="btn-gold inline-flex items-center gap-2 rounded-full px-8 py-4 text-sm font-bold"
          >
            Open free account
            <ArrowRight size={16} />
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 rounded-full border border-white/20 px-8 py-4 text-sm font-bold text-white hover:border-white/50 transition-colors"
          >
            See pricing
          </Link>
        </div>

        <p className="text-xs text-slate-400 mt-9 leading-relaxed">
          Investments in securities are subject to market risk. Read all related documents carefully
          before investing.
        </p>
      </div>
    </section>
  );
}
