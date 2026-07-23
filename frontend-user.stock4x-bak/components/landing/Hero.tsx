"use client";

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, TrendingUp, TrendingDown, Zap, ShieldCheck, BarChart2, Users } from 'lucide-react';
import Link from 'next/link';
import TextPressure from './TextPressure';

/* ── Ticker data ─────────────────────────────────────────────────────────── */
const tickers = [
  { symbol: 'NIFTY 50',  price: '22,456.80', change: '+1.24%', up: true  },
  { symbol: 'SENSEX',    price: '73,852.40', change: '+0.98%', up: true  },
  { symbol: 'BTC/USD',   price: '$67,420',   change: '+2.31%', up: true  },
  { symbol: 'EUR/USD',   price: '1.0842',    change: '-0.12%', up: false },
  { symbol: 'GOLD',      price: '₹71,240',   change: '+0.45%', up: true  },
  { symbol: 'RELIANCE',  price: '₹2,934',    change: '+0.76%', up: true  },
  { symbol: 'TCS',       price: '₹3,812',    change: '-0.32%', up: false },
  { symbol: 'CRUDE OIL', price: '$82.40',    change: '+1.10%', up: true  },
];

/* ── Bottom feature strip ────────────────────────────────────────────────── */
const features = [
  { icon: Zap,        title: 'Flat ₹20 Brokerage',  desc: 'Transparent flat fee, no hidden charges' },
  { icon: BarChart2,  title: 'Instant Execution',   desc: 'Ultra-low latency order processing'   },
  { icon: ShieldCheck,title: 'Secure Platform',     desc: '256-bit encrypted & 2FA protected'  },
  { icon: Users,      title: '150K+ Active Traders',desc: 'Trusted by professionals worldwide'   },
];

export default function Hero() {
  const tickerRef = useRef<HTMLDivElement | null>(null);
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    const el = tickerRef.current;
    if (!el) return;
    el.innerHTML += el.innerHTML;
  }, []);

  useEffect(() => {
    const id = setInterval(() => setAnimKey((k) => k + 1), 3500);
    return () => clearInterval(id);
  }, []);

  return (
    <section
      id="home"
      className="relative min-h-screen flex flex-col overflow-hidden bg-white"
      style={{ background: 'linear-gradient(180deg, #fff 0%, #f0f9ff 60%, #fff 100%)' }}
    >
      {/* ── 3D Arc / Dome background — centered at section midpoint ─────── */}
      <div className="absolute inset-0 pointer-events-none select-none overflow-hidden">

        {/* Central glow burst — breathing */}
        <div
          className="absolute top-1/2 left-1/2 w-[600px] h-[600px] rounded-full"
          style={{
            background: 'radial-gradient(ellipse 60% 60% at 50% 50%, rgba(31,70,119,0.18) 0%, rgba(31,70,119,0.07) 45%, transparent 70%)',
            animation: 'glow-breathe 5s ease-in-out infinite',
          }}
        />

        {/* Arc ring 1 — outermost, slow pulse */}
        <div
          className="absolute top-1/2 left-1/2 w-[110vw] h-[110vw] max-w-[1100px] max-h-[1100px] rounded-full"
          style={{
            border: '1.5px solid rgba(31,70,119,0.10)',
            background: 'transparent',
            animation: 'ring-pulse 8s ease-in-out infinite',
            animationDelay: '0s',
          }}
        />

        {/* Arc ring 2 — slow CW rotation */}
        <div
          className="absolute top-1/2 left-1/2 w-[85vw] h-[85vw] max-w-[860px] max-h-[860px] rounded-full"
          style={{
            border: '1.5px solid rgba(31,70,119,0.16)',
            background: 'transparent',
            animation: 'ring-rotate-cw 40s linear infinite',
          }}
        />

        {/* Arc ring 3 — main glowing ring, pulse */}
        <div
          className="absolute top-1/2 left-1/2 w-[65vw] h-[65vw] max-w-[660px] max-h-[660px] rounded-full"
          style={{
            border: '2px solid rgba(31,70,119,0.26)',
            background: 'radial-gradient(ellipse 70% 70% at 50% 50%, rgba(31,70,119,0.07) 0%, transparent 70%)',
            boxShadow: '0 0 60px 10px rgba(31,70,119,0.06)',
            animation: 'ring-pulse 6s ease-in-out infinite',
            animationDelay: '1s',
          }}
        />

        {/* Arc ring 4 — CCW rotation */}
        <div
          className="absolute top-1/2 left-1/2 w-[46vw] h-[46vw] max-w-[480px] max-h-[480px] rounded-full"
          style={{
            border: '2px solid rgba(31,70,119,0.32)',
            background: 'radial-gradient(ellipse 60% 60% at 50% 50%, rgba(31,70,119,0.09) 0%, transparent 65%)',
            boxShadow: '0 0 40px 6px rgba(31,70,119,0.08)',
            animation: 'ring-rotate-ccw 28s linear infinite',
          }}
        />

        {/* Arc ring 5 — innermost, fast pulse */}
        <div
          className="absolute top-1/2 left-1/2 w-[28vw] h-[28vw] max-w-[300px] max-h-[300px] rounded-full"
          style={{
            border: '2px solid rgba(31,70,119,0.42)',
            background: 'radial-gradient(ellipse 50% 50% at 50% 50%, rgba(31,70,119,0.14) 0%, transparent 60%)',
            boxShadow: '0 0 30px 4px rgba(31,70,119,0.12)',
            animation: 'ring-pulse 4s ease-in-out infinite',
            animationDelay: '2s',
          }}
        />

        {/* Dot accents */}
        <div className="absolute top-[30%] left-[18%] w-2 h-2 rounded-full bg-[#1F4677]/35 shadow-[0_0_8px_rgba(31,70,119,0.5)]" />
        <div className="absolute top-[25%] left-[35%] w-1.5 h-1.5 rounded-full bg-[#E6B839]/25 shadow-[0_0_6px_rgba(31,70,119,0.4)]" />
        <div className="absolute top-[30%] right-[18%] w-2 h-2 rounded-full bg-[#1F4677]/35 shadow-[0_0_8px_rgba(31,70,119,0.5)]" />
        <div className="absolute top-[25%] right-[35%] w-1.5 h-1.5 rounded-full bg-[#E6B839]/25 shadow-[0_0_6px_rgba(31,70,119,0.4)]" />

        {/* Subtle grid */}
        <div
          className="absolute inset-0 opacity-15"
          style={{
            backgroundImage:
              'linear-gradient(rgba(31,70,119,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(31,70,119,0.05) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
      </div>

      {/* ── Main content — shifted slightly below center ─────────────────── */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 pt-24">

        {/* H1 — TextPressure variable font effect */}
        <h1
          className="text-5xl md:text-7xl tracking-tight text-center leading-[1.1] mb-10 animate-fade-up select-none"
          style={{ animationDelay: '0.2s' }}
        >
          <TextPressure
            key={`line1-${animKey}`}
            text="Trade Beyond"
            minWeight={300}
            maxWeight={900}
            minWidth={75}
            maxWidth={130}
            minSlant={0}
            maxSlant={-6}
            maxDistance={250}
            className="text-slate-900 block"
            style={{ fontSize: 'inherit', lineHeight: 'inherit' }}
          />
          <TextPressure
            key={`line2-${animKey}`}
            text="Global Limits"
            minWeight={300}
            maxWeight={900}
            minWidth={75}
            maxWidth={130}
            minSlant={0}
            maxSlant={-6}
            maxDistance={250}
            startDelay={600}
            className="text-[#1F4677] block"
            style={{ fontSize: 'inherit', lineHeight: 'inherit' }}
          />
        </h1>

        {/* CTA — appears after all 25 chars have revealed (25×50 + 350 ≈ 1.6s) */}
        <div
          className="flex items-center justify-center animate-fade-up"
          style={{ animationDelay: '1.6s' }}
        >
          <Link
            href="/register"
            className="inline-flex items-center gap-2 px-10 py-4 rounded-full bg-[#1F4677] text-white font-bold text-sm hover:bg-navy-800 transition-all shadow-lg shadow-navy-200 hover:shadow-navy-300 font-manrope"
          >
            Start Trading
            <ArrowRight size={16} />
          </Link>
        </div>

      </div>

      {/* ── Bottom feature strip ─────────────────────────────────────────── */}
      <div className="relative z-10 border-t-2 border-slate-100 bg-white/80 backdrop-blur-sm">
        {/* Ticker above feature strip */}
        <div className="border-b border-slate-100 overflow-hidden py-2.5">
          <div ref={tickerRef} className="flex gap-10 marquee-track whitespace-nowrap w-max">
            {tickers.map((t, i) => (
              <div key={i} className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-bold text-slate-700 font-manrope">{t.symbol}</span>
                <span className="text-xs text-slate-500">{t.price}</span>
                <span className={`flex items-center gap-0.5 text-xs font-semibold ${t.up ? 'text-emerald-600' : 'text-[#1F4677]'}`}>
                  {t.up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                  {t.change}
                </span>
                <span className="text-slate-200">|</span>
              </div>
            ))}
          </div>
        </div>

        {/* 4-column feature strip */}
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 divide-x-2 divide-slate-100">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="flex items-center gap-3 px-6 py-5 group hover:bg-navy-50/50 transition-colors">
                <div className="w-9 h-9 rounded-lg bg-navy-50 border border-navy-100 flex items-center justify-center shrink-0 group-hover:bg-[#1F4677] group-hover:border-[#1F4677] transition-all">
                  <Icon size={16} className="text-[#1F4677] group-hover:text-white transition-colors" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 font-manrope leading-tight">{f.title}</div>
                  <div className="text-[10px] text-slate-400 leading-tight mt-0.5">{f.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}