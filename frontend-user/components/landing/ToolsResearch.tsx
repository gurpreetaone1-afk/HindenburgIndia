"use client";

import { CandlestickChart, Sigma, Bell, Newspaper, Calculator, ScrollText } from 'lucide-react';

/**
 * "Professional Tools & Research" — six-card capability grid.
 */
const tools = [
  {
    icon: CandlestickChart,
    title: 'Advanced charting',
    desc: '100+ indicators, multi-timeframe layouts and drawing tools that persist across devices.',
  },
  {
    icon: Sigma,
    title: 'Option chain & Greeks',
    desc: 'Live option chain with IV, open interest and Greeks so you can price a strategy before entering it.',
  },
  {
    icon: Calculator,
    title: 'Margin & payoff calculators',
    desc: 'Know the exact margin and payoff profile of a multi-leg position before you commit capital.',
  },
  {
    icon: Bell,
    title: 'Price & event alerts',
    desc: 'Trigger alerts on price, volume or open interest and receive them in-app, by email or push.',
  },
  {
    icon: Newspaper,
    title: 'Market news & research',
    desc: 'Curated market news, sector moves and earnings dates surfaced next to the instruments you hold.',
  },
  {
    icon: ScrollText,
    title: 'Reports & tax statements',
    desc: 'Downloadable P&L, ledger and capital-gains statements ready for your CA at year end.',
  },
];

export default function ToolsResearch() {
  return (
    <section className="bg-white py-24 md:py-28 px-6 relative overflow-hidden">
      <div className="absolute top-1/3 -right-20 w-96 h-96 bg-gold-400/10 rounded-full blur-[130px] pointer-events-none" />

      <div className="max-w-7xl mx-auto relative">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gold-50 border border-gold-200 mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#E6B839]" />
            <span className="text-xs font-semibold text-gold-800 uppercase tracking-widest">
              Toolkit
            </span>
          </span>

          <h2 className="text-3xl md:text-5xl font-bold text-slate-900 font-manrope tracking-tight leading-[1.1]">
            Professional <span className="text-[#1F4677] gold-underline">tools &amp; research</span>
          </h2>

          <p className="text-slate-500 leading-relaxed mt-7">
            Everything you need to form a view, size the position and manage it — included with every
            account, at no extra cost.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {tools.map((t) => {
            const Icon = t.icon;
            return (
              <div key={t.title} className="card-light p-8 group">
                <div className="w-12 h-12 rounded-full bg-[#1F4677] flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <Icon size={22} className="text-[#E6B839]" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 font-manrope mb-2.5">{t.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{t.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
