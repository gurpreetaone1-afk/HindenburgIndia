"use client";

import Link from 'next/link';
import { Check, ArrowRight } from 'lucide-react';

/**
 * "Account Types" — four tiers, mirroring the reference's plan grid.
 * The middle tier is flagged `featured` and rendered on the navy gradient so it
 * reads as the recommended default, matching the landing page's dark-panel idiom.
 */
type Tier = {
  name: string;
  tagline: string;
  price: string;
  priceNote: string;
  features: string[];
  featured?: boolean;
};

const tiers: Tier[] = [
  {
    name: 'Equity Investor',
    tagline: 'For long-term delivery investors building a portfolio.',
    price: '₹0',
    priceNote: 'per delivery trade',
    features: [
      'Zero brokerage on equity delivery',
      'NSE & BSE cash segment',
      'IPO and mutual fund access',
      'Portfolio and P&L reporting',
      'Email & chat support',
    ],
  },
  {
    name: 'Active Trader',
    tagline: 'For intraday and F&O traders who need speed and margin.',
    price: '₹20',
    priceNote: 'per executed order',
    features: [
      'Flat ₹20 intraday & F&O brokerage',
      'Equity, F&O, currency and commodity',
      'Advanced charting and option chain',
      'Bracket and cover orders',
      'Priority support',
    ],
    featured: true,
  },
  {
    name: 'F&O Pro',
    tagline: 'For high-volume derivatives traders running strategies.',
    price: '₹15',
    priceNote: 'per executed order',
    features: [
      'Reduced brokerage at volume',
      'Strategy builder and payoff charts',
      'Basket and multi-leg orders',
      'Lower margin on hedged positions',
      'Dedicated relationship manager',
    ],
  },
  {
    name: 'HNI / Algo',
    tagline: 'For institutions, algos and serious capital.',
    price: 'Custom',
    priceNote: 'negotiated pricing',
    features: [
      'Negotiated per-order pricing',
      'API access for automated trading',
      'Co-located low-latency routing',
      'Custom margin and risk limits',
      'Named dealing desk',
    ],
  },
];

export default function AccountTypes() {
  return (
    <section id="account-types" className="bg-[#f7f9fc] py-24 md:py-28 px-6 relative overflow-hidden">
      <div className="max-w-7xl mx-auto relative">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gold-50 border border-gold-200 mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#E6B839]" />
            <span className="text-xs font-semibold text-gold-800 uppercase tracking-widest">
              Pricing
            </span>
          </span>

          <h2 className="text-3xl md:text-5xl font-bold text-slate-900 font-manrope tracking-tight leading-[1.1]">
            Account <span className="text-[#1F4677] gold-underline">Types</span>
          </h2>

          <p className="text-slate-500 leading-relaxed mt-7">
            One account opens every segment. Choose the pricing that matches how often you trade —
            you can move between tiers at any time.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={
                t.featured
                  ? 'relative rounded-3xl p-8 flex flex-col premium-shadow'
                  : 'card-light p-8 flex flex-col'
              }
              style={
                t.featured
                  ? { background: 'linear-gradient(135deg, #1F4677 0%, #16314f 100%)' }
                  : undefined
              }
            >
              {t.featured && (
                <span className="absolute -top-3 left-8 rounded-full bg-[#E6B839] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#1F4677]">
                  Most popular
                </span>
              )}

              <h3
                className={`text-lg font-bold font-manrope mb-2 ${
                  t.featured ? 'text-white' : 'text-slate-900'
                }`}
              >
                {t.name}
              </h3>
              <p
                className={`text-sm leading-relaxed mb-6 ${
                  t.featured ? 'text-slate-300' : 'text-slate-500'
                }`}
              >
                {t.tagline}
              </p>

              <div className="mb-6">
                <span
                  className={`text-4xl font-bold font-manrope leading-none ${
                    t.featured ? 'text-[#E6B839]' : 'text-[#1F4677]'
                  }`}
                >
                  {t.price}
                </span>
                <span
                  className={`block text-xs mt-2 ${
                    t.featured ? 'text-slate-400' : 'text-slate-400'
                  }`}
                >
                  {t.priceNote}
                </span>
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <Check
                      size={16}
                      className={`shrink-0 mt-0.5 ${t.featured ? 'text-[#E6B839]' : 'text-[#1F4677]'}`}
                    />
                    <span
                      className={`text-sm leading-relaxed ${
                        t.featured ? 'text-slate-300' : 'text-slate-600'
                      }`}
                    >
                      {f}
                    </span>
                  </li>
                ))}
              </ul>

              <Link
                href="/register"
                className={
                  t.featured
                    ? 'btn-gold inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-bold'
                    : 'inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 px-5 py-3 text-sm font-bold text-[#1F4677] hover:border-[#1F4677] transition-colors'
                }
              >
                Open Account
                <ArrowRight size={14} />
              </Link>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-slate-400 mt-10 max-w-3xl mx-auto leading-relaxed">
          Brokerage shown excludes statutory charges (STT, exchange transaction charges, GST, SEBI
          turnover fees and stamp duty), which are levied at prevailing government rates.
        </p>
      </div>
    </section>
  );
}
