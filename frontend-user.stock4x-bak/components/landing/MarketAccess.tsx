"use client";

import { TrendingUp, Globe, DollarSign, BarChart2, Bitcoin, LayoutDashboard } from 'lucide-react';
import Link from 'next/link';
import { useScrollAnimation, useStaggerAnimation } from './hooks/useScrollAnimation';
import ImageBox from './ImageBox';

const markets = [
  {
    icon: TrendingUp,
    title: 'NSE & Indian Markets',
    desc: 'Trade equities, derivatives, indices, and commodities from leading Indian exchanges.',
    tag: 'NSE · BSE · MCX',
    stats: [{ label: 'Instruments', value: '5,000+' }],
  },
  {
    icon: Globe,
    title: 'Global Indices & Commodities',
    desc: 'Invest in metals, energy, and global benchmark indices.',
    tag: 'GOLD · OIL · S&P 500',
    stats: [{ label: 'Markets', value: '30+' }, { label: 'Leverage', value: '1:100' }],
  },
  {
    icon: DollarSign,
    title: 'Forex Trading',
    desc: 'Trade major, minor, and exotic currency pairs across global sessions.',
    tag: 'EUR/USD · GBP/JPY · USD/INR',
    stats: [{ label: 'Pairs', value: '70+' }],
  },
  {
    icon: BarChart2,
    title: 'US Stocks',
    desc: 'Get exposure to top US-listed companies.',
    tag: 'AAPL · TSLA · NVDA',
    stats: [{ label: 'Stocks', value: '30+' }],
  },
  {
    icon: Bitcoin,
    title: 'Cryptocurrencies',
    desc: 'Buy and trade Bitcoin, Ethereum, and other popular digital assets.',
    tag: 'BTC · ETH · SOL',
    stats: [{ label: 'Coins', value: '200+' }, { label: '24/7', value: 'Trading' }],
  },
];

export default function MarketAccess() {
  const { ref: headerRef } = useScrollAnimation();
  const cardsRef = useStaggerAnimation(0.1, 100);

  return (
    <section id="markets" className="py-28 px-6 bg-white relative overflow-hidden">
      {/* Subtle blue glow background */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-navy-500/4 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto relative">

        {/* Section divider top */}
        <div className="section-divider mb-16" />

        {/* Header */}
        <div ref={headerRef} className="scroll-reveal mb-16 text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gold-50 border border-gold-200 mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#E6B839]" />
            <span className="text-xs font-semibold text-[#8a621b] uppercase tracking-widest">Markets</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 tracking-tight font-manrope mb-4">
            Access Multiple Markets from{' '}
            <span className="text-[#1F4677] gold-underline">One Account</span>
          </h2>
          <p className="text-lg text-slate-500 font-light">
            Diversify your portfolio across asset classes with a single unified platform.
          </p>
        </div>

        {/* Unified terminal mockup */}
        <div className="max-w-5xl mx-auto mb-14">
          <ImageBox
            ratio="wide"
            label="Unified Markets Terminal"
            sublabel="One account · every asset class"
            icon={LayoutDashboard}
            className="premium-shadow"
          />
        </div>

        {/* Market Cards — circular icon style */}
        <div ref={cardsRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
          {markets.map((market) => {
            const Icon = market.icon;
            return (
              <div
                key={market.title}
                className="stagger-child market-circle group flex flex-col items-center text-center p-6 bg-white border border-slate-200 rounded-2xl soft-card hover:-translate-y-1 hover:border-navy-200 transition-all duration-300 cursor-pointer"
              >
                {/* Circular icon */}
                <div className="relative mb-5">
                  {/* Outer ring */}
                  <div className="w-20 h-20 rounded-full border-2 border-navy-100 bg-navy-50/50 flex items-center justify-center group-hover:border-[#1F4677] group-hover:bg-navy-50 transition-all duration-300">
                    {/* Inner circle */}
                    <div className="w-14 h-14 rounded-full bg-[#1F4677] flex items-center justify-center shadow-lg shadow-navy-200 group-hover:scale-110 transition-transform duration-300">
                      <Icon size={24} className="text-white" />
                    </div>
                  </div>
                  {/* Pulse ring on hover */}
                  <div className="absolute inset-0 rounded-full border-2 border-[#1F4677]/30 scale-110 opacity-0 group-hover:opacity-100 group-hover:scale-125 transition-all duration-500" />
                </div>

                {/* Tag */}
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#1F4677] mb-2 bg-navy-50 px-2 py-0.5 rounded-full border border-navy-100">
                  {market.tag}
                </span>

                {/* Title */}
                <h3 className="text-sm font-bold text-slate-900 font-manrope mb-2 leading-snug">
                  {market.title}
                </h3>

                {/* Description */}
                <p className="text-xs text-slate-500 leading-relaxed mb-4">
                  {market.desc}
                </p>

                {/* Stats */}
                <div className="mt-auto flex gap-4 w-full justify-center border-t border-slate-100 pt-4">
                  {market.stats.map((s) => (
                    <div key={s.label} className="text-center">
                      <div className="text-sm font-bold text-slate-900 font-manrope">{s.value}</div>
                      <div className="text-[10px] text-slate-400">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Connecting arrow row below cards */}
        <div className="hidden lg:flex items-center justify-center gap-0 mt-8">
          {markets.map((m, i) => (
            <div key={m.title} className="flex items-center">
              <div className="w-[calc(100%/5)] flex justify-center">
                <div className="w-2 h-2 rounded-full bg-[#1F4677]" />
              </div>
              {i < markets.length - 1 && (
                <div className="flex-1 flex items-center">
                  <div className="h-px flex-1 bg-gradient-to-r from-[#1F4677]/40 to-[#1F4677]/40" />
                  <svg width="8" height="8" viewBox="0 0 8 8" className="text-[#1F4677] shrink-0">
                    <path d="M0 4h6M4 1l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="mt-14 text-center">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-[#1F4677] text-white font-semibold hover:bg-navy-800 transition-all shadow-lg shadow-navy-200 hover:shadow-navy-300 glow-btn font-manrope"
          >
            Open Free Account
            <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 5h6M5 2l3 3-3 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </Link>
        </div>

        {/* Section divider bottom */}
        <div className="section-divider mt-16" />
      </div>
    </section>
  );
}