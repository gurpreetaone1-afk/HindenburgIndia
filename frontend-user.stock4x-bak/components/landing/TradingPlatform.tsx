"use client";

import { Monitor, Smartphone, Globe, Apple, CheckCircle2, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useScrollAnimation } from './hooks/useScrollAnimation';
import ImageBox from './ImageBox';

const platforms = [
  { icon: Smartphone, label: 'Android',     sub: 'Google Play',      color: 'text-[#1F4677]', bg: 'bg-navy-50',    border: 'border-navy-100' },
  { icon: Apple,      label: 'iOS',          sub: 'App Store',        color: 'text-[#1F4677]', bg: 'bg-navy-50',    border: 'border-navy-100' },
  { icon: Monitor,    label: 'Windows',      sub: 'Desktop App',      color: 'text-[#1F4677]', bg: 'bg-navy-50',    border: 'border-navy-100' },
  { icon: Globe,      label: 'Web Browser',  sub: 'No Install Needed',color: 'text-[#1F4677]', bg: 'bg-navy-50',    border: 'border-navy-100' },
];

const features = [
  'Real-time market data & live charts',
  'One-click order placement',
  'Advanced technical indicators',
  'Portfolio tracking & P&L reports',
  'Price alerts & push notifications',
  'Multi-account management',
];

export default function TradingPlatform() {
  const { ref: leftRef }  = useScrollAnimation(0.1);
  const { ref: rightRef } = useScrollAnimation(0.1);

  return (
    <section id="platform" className="py-24 md:py-28 px-6 bg-white overflow-hidden relative">
      {/* Decorative glow */}
      <div className="absolute top-1/2 right-0 w-80 h-80 bg-navy-500/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

          {/* Left: Content */}
          <div ref={leftRef} className="scroll-reveal-left">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gold-50 border border-gold-200 mb-5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#E6B839]" />
              <span className="text-xs font-semibold text-[#8a621b] uppercase tracking-widest">Platform</span>
            </div>

            <h2 className="text-3xl md:text-5xl font-bold text-slate-900 tracking-tight font-manrope mb-5 leading-tight">
              A Powerful Trading Platform{' '}
              <span className="text-[#1F4677] gold-underline">Built for Performance</span>
            </h2>

            <p className="text-lg text-slate-500 mb-8 leading-relaxed">
              Trade anytime, anywhere with our fully integrated web and mobile platform.
              Monitor markets in real time and execute trades with precision.
            </p>

            {/* Feature checklist */}
            <ul className="space-y-3 mb-10">
              {features.map((f) => (
                <li key={f} className="flex items-center gap-3">
                  <CheckCircle2 size={18} className="text-[#1F4677] shrink-0" />
                  <span className="text-sm text-slate-600">{f}</span>
                </li>
              ))}
            </ul>

            {/* Available On */}
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Download Now:</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {platforms.map((p) => {
                  const Icon = p.icon;
                  return (
                  <div
                    key={p.label}
                    className={`flex flex-col items-center gap-2 p-4 rounded-2xl border ${p.border} ${p.bg} hover:-translate-y-1 hover:border-navy-200 hover:shadow-md transition-all duration-300 cursor-pointer group`}
                  >
                      <Icon size={22} className={p.color} />
                      <div className="text-center">
                        <div className="text-xs font-bold text-slate-800">{p.label}</div>
                        <div className="text-[10px] text-slate-400">{p.sub}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Trade on major platforms */}
              <div className="mt-8">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Trade on major platforms</h3>
                <div className="flex flex-wrap gap-3 mt-6">
                  {['cTrader', 'MT5', 'MT4', 'Web'].map((logo) => (
                    <ImageBox
                      key={logo}
                      ratio="auto"
                      variant="blue"
                      label={logo}
                      rounded="rounded-2xl"
                      className="w-20 h-20"
                    />
                  ))}
                </div>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed mb-2">
              Charting on the platform uses{' '}
              <a
                href="#tradingview-charts-notice"
                className="text-[#1F4677] hover:underline font-medium"
              >
                TradingView
              </a>
              — see footer for third‑party terms and attribution.
            </p>

            <Link
              href="/register"
              className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#1F4677] hover:gap-3 transition-all"
            >
              Get Started Free <ArrowRight size={16} />
            </Link>
          </div>

          {/* Right: Mock Dashboard */}
          <div ref={rightRef} className="scroll-reveal-right relative float-anim">
            {/* Outer glow */}
            <div className="absolute inset-0 bg-navy-100/40 rounded-3xl blur-3xl scale-95" />

            {/* Dashboard Card */}
            <div className="relative bg-white border border-slate-200 rounded-3xl premium-shadow overflow-hidden">
              {/* Top bar */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-amber-400" />
                  <div className="w-3 h-3 rounded-full bg-emerald-400" />
                </div>
                <div className="text-xs text-slate-400 font-mono">Hindenburg India — Dashboard</div>
                <div className="w-16 h-2 bg-slate-200 rounded-full" />
              </div>

              {/* Dashboard body */}
              <div className="p-5 space-y-4">
                {/* Portfolio summary */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Portfolio Value', value: '₹4,82,340', change: '+2.4%', up: true },
                    { label: "Today's P&L", value: '+₹11,240', change: '+2.4%', up: true },
                    { label: 'Available Margin', value: '₹1,20,000', change: '', up: true },
                  ].map((item) => (
                    <div key={item.label} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                      <div className="text-[10px] text-slate-400 mb-1">{item.label}</div>
                      <div className="text-sm font-bold text-slate-900 font-manrope">{item.value}</div>
                      {item.change && (
                        <div className={`text-[10px] font-semibold mt-0.5 ${item.up ? 'text-emerald-600' : 'text-red-500'}`}>
                          {item.change}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Chart mock */}
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-xs font-bold text-slate-700">NIFTY 50</div>
                      <div className="text-lg font-bold text-slate-900 font-manrope">22,456.80</div>
                    </div>
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-100">
                      +1.24%
                    </span>
                  </div>
                  {/* SVG Chart */}
                  <svg viewBox="0 0 300 80" className="w-full h-16">
                    <defs>
                      <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#1F4677" stopOpacity="0.15" />
                        <stop offset="100%" stopColor="#1F4677" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M0 60 L30 55 L60 50 L90 45 L120 48 L150 35 L180 30 L210 25 L240 20 L270 15 L300 10"
                      fill="none"
                      stroke="#1F4677"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <path
                      d="M0 60 L30 55 L60 50 L90 45 L120 48 L150 35 L180 30 L210 25 L240 20 L270 15 L300 10 L300 80 L0 80 Z"
                      fill="url(#chartGrad)"
                    />
                  </svg>
                </div>

                {/* Watchlist */}
                <div className="space-y-2">
                  {[
                    { name: 'RELIANCE', price: '₹2,934', change: '+0.76%', up: true },
                    { name: 'TCS', price: '₹3,812', change: '-0.32%', up: false },
                    { name: 'HDFC BANK', price: '₹1,642', change: '+1.12%', up: true },
                  ].map((stock) => (
                    <div key={stock.name} className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50 border border-slate-100">
                      <span className="text-xs font-bold text-slate-700">{stock.name}</span>
                      <span className="text-xs font-semibold text-slate-900">{stock.price}</span>
                      <span className={`text-xs font-bold ${stock.up ? 'text-emerald-600' : 'text-red-500'}`}>
                        {stock.change}
                      </span>
                      <button className="text-[10px] font-bold text-white bg-[#1F4677] px-2.5 py-1 rounded-md hover:bg-navy-800 transition-colors">
                        BUY
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Floating badge */}
            <div className="absolute -bottom-4 -left-4 bg-white border border-slate-200 rounded-2xl px-4 py-3 premium-shadow flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                <CheckCircle2 size={16} className="text-emerald-600" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800">Order Executed</div>
                <div className="text-[10px] text-slate-400">NIFTY 50 · 10 lots · ₹22,456</div>
              </div>
            </div>

            {/* Floating stat */}
            <div className="absolute -top-4 -right-4 bg-[#1F4677] rounded-2xl px-4 py-3 premium-shadow">
              <div className="text-[10px] text-navy-100 mb-0.5">Today's Gain</div>
              <div className="text-sm font-bold text-white font-manrope">+₹11,240</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}