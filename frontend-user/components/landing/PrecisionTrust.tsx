"use client";

import { Lock, FileCheck2, Server, UserCheck } from 'lucide-react';

/**
 * "Built on precision & trust" — the security / governance band. Deliberately
 * proof-point led rather than number led, so it doesn't repeat the stats strip
 * higher up the page.
 */
const pillars = [
  {
    icon: Lock,
    title: 'Segregated client funds',
    desc: 'Client money sits in a designated bank account, ring-fenced from the company’s own funds.',
  },
  {
    icon: UserCheck,
    title: 'KYC-verified accounts',
    desc: 'Every account is PAN and Aadhaar verified before it can trade, in line with regulatory norms.',
  },
  {
    icon: Server,
    title: 'Redundant infrastructure',
    desc: 'Failover market-data feeds and replicated databases keep the platform up through a session.',
  },
  {
    icon: FileCheck2,
    title: 'Auditable reporting',
    desc: 'Every order, fill and ledger entry is timestamped and downloadable, so your books always reconcile.',
  },
];

export default function PrecisionTrust() {
  return (
    <section className="stat-band py-24 md:py-28 px-6 relative overflow-hidden">
      <div className="absolute -bottom-24 right-0 w-[460px] h-[460px] bg-[#E6B839]/10 rounded-full blur-[140px] pointer-events-none" />

      <div className="max-w-7xl mx-auto relative grid lg:grid-cols-[1fr_1.1fr] gap-14 lg:gap-20 items-center">
        <div>
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#E6B839]" />
            <span className="text-xs font-semibold text-[#E6B839] uppercase tracking-widest">
              Trust
            </span>
          </span>

          <h2 className="text-3xl md:text-5xl font-bold text-white font-manrope tracking-tight leading-[1.1] mb-7">
            Built on precision &amp; trust
          </h2>

          <p className="text-slate-300 leading-relaxed mb-6">
            A trading platform is only as good as the controls behind it. Ours are boring on purpose —
            segregated funds, verified identities, redundant systems and a paper trail for everything.
          </p>

          <p className="text-slate-400 text-sm leading-relaxed">
            Hindenburg India is a technology platform for market access. Investments in securities
            are subject to market risk; read all scheme-related documents carefully before investing.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-5">
          {pillars.map((p) => {
            const Icon = p.icon;
            return (
              <div
                key={p.title}
                className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm p-7"
              >
                <div className="w-11 h-11 rounded-full bg-[#E6B839] flex items-center justify-center mb-5">
                  <Icon size={20} className="text-[#1F4677]" />
                </div>
                <h3 className="text-base font-bold text-white font-manrope mb-2">{p.title}</h3>
                <p className="text-sm text-slate-300 leading-relaxed">{p.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
