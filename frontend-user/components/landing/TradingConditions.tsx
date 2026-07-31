"use client";

import { Gauge, Layers3, ShieldAlert, Wallet } from 'lucide-react';

/**
 * "Professional Trading Conditions" — the execution-quality band. Rendered as
 * wide rows (not a card grid) so it reads as a spec sheet rather than marketing,
 * matching the reference's row treatment.
 */
const conditions = [
  {
    icon: Gauge,
    title: 'Low-latency execution',
    desc:
      'Orders are matched in-house on a co-located engine, so fills land in milliseconds instead of queueing behind a third-party router.',
    metric: '< 50 ms',
    metricLabel: 'median fill time',
  },
  {
    icon: Wallet,
    title: 'Transparent margin',
    desc:
      'Span + exposure margin is published per contract before you place the order. No surprise intraday calls or hidden haircuts.',
    metric: 'Up to 5x',
    metricLabel: 'intraday leverage',
  },
  {
    icon: Layers3,
    title: 'Every segment, one ledger',
    desc:
      'Equity, F&O, currency and commodity settle into a single wallet, so margin released in one segment is usable in another.',
    metric: '4',
    metricLabel: 'segments, one account',
  },
  {
    icon: ShieldAlert,
    title: 'Built-in risk management',
    desc:
      'Automatic margin-call alerts, configurable stop-out levels and square-off protection keep positions inside your risk limits.',
    metric: '24/7',
    metricLabel: 'automated monitoring',
  },
];

export default function TradingConditions() {
  return (
    <section className="bg-[#f7f9fc] py-24 md:py-28 px-6 relative overflow-hidden">
      <div className="max-w-7xl mx-auto relative">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gold-50 border border-gold-200 mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#E6B839]" />
            <span className="text-xs font-semibold text-gold-800 uppercase tracking-widest">
              Execution
            </span>
          </span>

          <h2 className="text-3xl md:text-5xl font-bold text-slate-900 font-manrope tracking-tight leading-[1.1]">
            Professional <span className="text-[#1F4677] gold-underline">trading conditions</span>
          </h2>

          <p className="text-slate-500 leading-relaxed mt-7">
            The conditions that decide whether a strategy is profitable — published up front, the
            same for every account.
          </p>
        </div>

        <div className="space-y-4">
          {conditions.map((c) => {
            const Icon = c.icon;
            return (
              <div
                key={c.title}
                className="card-light p-6 md:p-8 flex flex-col md:flex-row md:items-center gap-6"
              >
                <div className="w-12 h-12 rounded-full bg-[#1F4677] flex items-center justify-center shrink-0">
                  <Icon size={22} className="text-[#E6B839]" />
                </div>

                <div className="flex-1">
                  <h3 className="text-lg font-bold text-slate-900 font-manrope mb-1.5">
                    {c.title}
                  </h3>
                  <p className="text-sm text-slate-500 leading-relaxed max-w-2xl">{c.desc}</p>
                </div>

                <div className="md:text-right md:pl-8 md:border-l md:border-slate-100 shrink-0">
                  <div className="text-2xl md:text-3xl font-bold text-[#1F4677] font-manrope leading-none">
                    {c.metric}
                  </div>
                  <div className="text-xs text-slate-400 mt-2">{c.metricLabel}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
