"use client";

import { Zap, Percent, Clock, ShieldCheck } from 'lucide-react';

/**
 * "Fast & Secure Payments" — three headline tiles over a rail of supported
 * funding methods, mirroring the reference's payments band.
 */
const highlights = [
  {
    icon: Percent,
    value: '0%',
    title: 'Deposit fees',
    desc: 'Fund your account from any Indian bank at no cost. What you send is what you can trade.',
  },
  {
    icon: Zap,
    value: 'Instant',
    title: 'UPI deposits',
    desc: 'UPI and net-banking deposits reflect in your trading balance within seconds, not days.',
  },
  {
    icon: Clock,
    value: '24/7',
    title: 'Withdrawal requests',
    desc: 'Raise a withdrawal any time. Payouts settle to your linked bank on the next settlement cycle.',
  },
];

const methods = ['UPI', 'Net Banking', 'NEFT', 'RTGS', 'IMPS', 'Debit Card'];

export default function Payments() {
  return (
    <section className="bg-white py-24 md:py-28 px-6 relative overflow-hidden">
      <div className="max-w-7xl mx-auto relative">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gold-50 border border-gold-200 mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#E6B839]" />
            <span className="text-xs font-semibold text-gold-800 uppercase tracking-widest">
              Funding
            </span>
          </span>

          <h2 className="text-3xl md:text-5xl font-bold text-slate-900 font-manrope tracking-tight leading-[1.1]">
            Fast &amp; secure <span className="text-[#1F4677] gold-underline">payments</span>
          </h2>

          <p className="text-slate-500 leading-relaxed mt-7">
            Money in and money out should never be the slow part of trading. Client funds are held in
            a segregated account, separate from company money.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {highlights.map((h) => {
            const Icon = h.icon;
            return (
              <div key={h.title} className="card-light p-8 text-center">
                <div className="w-14 h-14 rounded-full bg-[#1F4677] flex items-center justify-center mx-auto mb-6">
                  <Icon size={24} className="text-[#E6B839]" />
                </div>
                <div className="text-4xl font-bold text-[#1F4677] font-manrope leading-none mb-3">
                  {h.value}
                </div>
                <h3 className="text-base font-bold text-slate-900 font-manrope mb-2">{h.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{h.desc}</p>
              </div>
            );
          })}
        </div>

        {/* Supported methods rail */}
        <div
          className="rounded-3xl px-8 py-8 premium-shadow"
          style={{ background: 'linear-gradient(135deg, #1F4677 0%, #16314f 100%)' }}
        >
          <div className="flex flex-col lg:flex-row items-center gap-8">
            <div className="flex items-start gap-3 lg:max-w-xs">
              <ShieldCheck size={20} className="text-[#E6B839] shrink-0 mt-0.5" />
              <div>
                <h3 className="text-white font-bold font-manrope mb-1.5">Funds you control</h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Deposits are accepted only from a bank account held in your own name, so payouts
                  can never be routed elsewhere.
                </p>
              </div>
            </div>

            <div className="flex-1 flex flex-wrap justify-center lg:justify-end gap-3">
              {methods.map((m) => (
                <span
                  key={m}
                  className="rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-slate-200"
                >
                  {m}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
