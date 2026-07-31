"use client";

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, TrendingUp, TrendingDown } from 'lucide-react';

/**
 * "Live Market Charts" — index switcher with a sparkline preview.
 *
 * NOTE: the series below are illustrative shapes, not a live feed. The landing
 * page is public and unauthenticated, so it deliberately does not call the
 * market-data API. To make this genuinely live, subscribe to `/ws/marketdata`
 * and replace `points` / `last` / `changePct` on each index.
 */
type Index = {
  symbol: string;
  name: string;
  last: string;
  change: string;
  changePct: number;
  points: number[];
};

const INDICES: Index[] = [
  {
    symbol: 'NIFTY 50',
    name: 'NSE benchmark index',
    last: '24,318.45',
    change: '+182.30',
    changePct: 0.75,
    points: [42, 44, 41, 46, 45, 49, 47, 52, 55, 53, 58, 61, 59, 64, 68],
  },
  {
    symbol: 'SENSEX',
    name: 'BSE benchmark index',
    last: '79,842.10',
    change: '+521.65',
    changePct: 0.66,
    points: [38, 40, 39, 43, 46, 44, 48, 47, 51, 54, 52, 57, 60, 58, 63],
  },
  {
    symbol: 'BANK NIFTY',
    name: 'NSE banking index',
    last: '51,204.85',
    change: '-268.40',
    changePct: -0.52,
    points: [66, 64, 67, 62, 60, 63, 58, 56, 59, 54, 52, 55, 50, 48, 46],
  },
  {
    symbol: 'GOLD',
    name: 'MCX gold futures',
    last: '72,540',
    change: '+318',
    changePct: 0.44,
    points: [45, 47, 46, 50, 52, 51, 55, 57, 56, 60, 62, 61, 65, 67, 69],
  },
];

/** Builds an SVG polyline path from a 0–100 series across a 600×180 viewBox. */
function toPath(points: number[]) {
  const w = 600;
  const h = 180;
  const step = w / (points.length - 1);
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(1)} ${(h - (p / 100) * h).toFixed(1)}`)
    .join(' ');
}

export default function LiveMarketCharts() {
  const [active, setActive] = useState(0);
  const idx = INDICES[active];
  const up = idx.changePct >= 0;
  const stroke = up ? '#4ade80' : '#f87171';

  return (
    <section className="section-dark py-24 md:py-28 px-6 relative overflow-hidden">
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-[#E6B839]/10 rounded-full blur-[140px] pointer-events-none" />

      <div className="max-w-7xl mx-auto relative">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#E6B839]" />
            <span className="text-xs font-semibold text-[#E6B839] uppercase tracking-widest">
              Markets
            </span>
          </span>

          <h2 className="text-3xl md:text-5xl font-bold text-white font-manrope tracking-tight leading-[1.1]">
            Live market charts
          </h2>

          <p className="text-slate-300 leading-relaxed mt-7">
            Track the indices that move your portfolio, with the same charts you get inside the
            terminal.
          </p>
        </div>

        <div className="rounded-3xl bg-white/5 border border-white/10 backdrop-blur-sm p-6 md:p-8 premium-shadow">
          {/* Index switcher */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
            {INDICES.map((i, n) => {
              const isActive = n === active;
              const positive = i.changePct >= 0;
              return (
                <button
                  key={i.symbol}
                  onClick={() => setActive(n)}
                  aria-pressed={isActive}
                  className={`text-left rounded-2xl px-5 py-4 border transition-colors ${
                    isActive
                      ? 'bg-[#1F4677] border-[#E6B839]/50'
                      : 'bg-white/[0.03] border-white/10 hover:border-white/25'
                  }`}
                >
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    {i.symbol}
                  </div>
                  <div className="text-lg font-bold text-white font-manrope leading-none">
                    {i.last}
                  </div>
                  <div
                    className={`mt-2 inline-flex items-center gap-1 text-xs font-semibold ${
                      positive ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {positive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                    {i.change} ({positive ? '+' : ''}
                    {i.changePct}%)
                  </div>
                </button>
              );
            })}
          </div>

          {/* Sparkline */}
          <div className="rounded-2xl bg-[#0f2238]/60 border border-white/5 p-6">
            <div className="flex items-baseline justify-between mb-5">
              <div>
                <div className="text-sm font-bold text-white font-manrope">{idx.symbol}</div>
                <div className="text-xs text-slate-400 mt-1">{idx.name}</div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-white font-manrope leading-none">
                  {idx.last}
                </div>
                <div
                  className={`text-xs font-semibold mt-1.5 ${up ? 'text-green-400' : 'text-red-400'}`}
                >
                  {idx.change} ({up ? '+' : ''}
                  {idx.changePct}%)
                </div>
              </div>
            </div>

            <svg
              viewBox="0 0 600 180"
              preserveAspectRatio="none"
              className="w-full h-[180px]"
              role="img"
              aria-label={`${idx.symbol} intraday trend`}
            >
              <defs>
                <linearGradient id={`fill-${active}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
                  <stop offset="100%" stopColor={stroke} stopOpacity="0" />
                </linearGradient>
              </defs>
              {[0, 45, 90, 135, 180].map((y) => (
                <line key={y} x1="0" y1={y} x2="600" y2={y} stroke="#ffffff" strokeOpacity="0.06" />
              ))}
              <path
                d={`${toPath(idx.points)} L 600 180 L 0 180 Z`}
                fill={`url(#fill-${active})`}
                stroke="none"
              />
              <path
                d={toPath(idx.points)}
                fill="none"
                stroke={stroke}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <div className="mt-7 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-slate-400 leading-relaxed">
              Chart shapes shown are indicative. Live quotes are available inside the terminal after
              you sign in.
            </p>
            <Link
              href="/terminal"
              className="btn-gold shrink-0 inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-bold"
            >
              Open the terminal
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
