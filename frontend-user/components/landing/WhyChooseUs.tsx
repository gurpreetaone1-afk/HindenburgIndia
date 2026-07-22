"use client";

import {
  BadgeDollarSign, BarChart2, Zap, Layers, ShieldCheck,
  HeadphonesIcon, LayoutDashboard, BookOpen, Wallet
} from 'lucide-react';
import Link from 'next/link';
import { useScrollAnimation, useStaggerAnimation } from './hooks/useScrollAnimation';

const features = [
  { icon: BadgeDollarSign, title: 'Transparent Pricing',         desc: 'Flat ₹20 per order. No hidden charges, ever.' },
  { icon: BarChart2,       title: 'Advanced Trading Tools',       desc: 'Professional-grade charts, indicators, and technical analysis tools.' },
  { icon: Zap,             title: 'Lightning Fast Execution',     desc: 'Instant order processing with minimal latency across all markets.' },
  { icon: Layers,          title: '5,000+ Trading Instruments',   desc: 'Diversify your portfolio effortlessly across asset classes.' },
  { icon: ShieldCheck,     title: 'Secure & Encrypted Platform',  desc: 'Multi-layer security for complete account safety and data protection.' },
  { icon: HeadphonesIcon,  title: 'Dedicated Customer Support',   desc: 'Expert assistance available 24/7 via chat, email, and phone.' },
  { icon: LayoutDashboard, title: 'Beginner-Friendly Interface',  desc: 'Easy navigation with powerful functionality for all skill levels.' },
  { icon: BookOpen,        title: 'Daily Market Insights',        desc: 'Expert research, analysis reports, and trading signals every day.' },
  { icon: Wallet,          title: 'Instant Fund Transfer',        desc: 'Quick deposits and withdrawals with UPI, Net Banking, and cards.' },
];

export default function WhyChooseUs() {
  const { ref: headerRef } = useScrollAnimation();
  const cardsRef = useStaggerAnimation(0.08, 70);

  return (
    <section id="tools" className="py-28 px-6 bg-[#f7f9fc] relative overflow-hidden">
      {/* Decorative blue corner accent */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-navy-500/5 rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-navy-500/4 rounded-full blur-[60px] pointer-events-none" />

      <div className="max-w-7xl mx-auto relative">

        {/* Header */}
        <div ref={headerRef} className="scroll-reveal mb-16 text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gold-50 border border-gold-200 mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#E6B839]" />
            <span className="text-xs font-semibold text-[#8a621b] uppercase tracking-widest">Why Us</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 tracking-tight font-manrope mb-4">
            Why Traders Prefer{' '}
            <span className="text-[#1F4677] gold-underline">Our Platform</span>
          </h2>
          <p className="text-lg text-slate-500 font-light">
            Everything you need to trade confidently — built into one powerful platform.
          </p>
        </div>

        {/* Features Grid */}
        <div ref={cardsRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="stagger-child group bg-white border border-slate-200 rounded-3xl p-7 flex flex-col gap-4 soft-card hover:-translate-y-1 hover:border-navy-200 transition-all duration-300 cursor-pointer"
              >
                {/* Icon — always blue */}
                <div className="inline-flex p-3 rounded-2xl bg-navy-50 border border-navy-100 w-fit group-hover:bg-[#1F4677] group-hover:border-[#1F4677] transition-all duration-300">
                  <Icon size={22} className="text-[#1F4677] group-hover:text-white transition-colors duration-300" />
                </div>

                {/* Content */}
                <div>
                  <h3 className="text-base font-bold text-slate-900 font-manrope mb-1.5">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{feature.desc}</p>
                </div>

                {/* Bottom accent line on hover */}
                <div className="h-0.5 w-0 group-hover:w-full bg-[#1F4677] transition-all duration-500 rounded-full mt-auto opacity-30" />
              </div>
            );
          })}
        </div>

        {/* Bottom CTA */}
        <div className="mt-14 text-center">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-[#1F4677] text-white font-semibold hover:bg-navy-800 transition-all shadow-lg shadow-navy-200 hover:shadow-navy-300 glow-btn font-manrope"
          >
            Start Trading Today
            <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 5h6M5 2l3 3-3 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}