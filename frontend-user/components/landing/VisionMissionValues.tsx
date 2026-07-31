"use client";

import { Eye, Flag, Scale, Users, Sparkles, HeartHandshake } from 'lucide-react';

/**
 * "Vision, Mission & Values" — six-card grid. Vision and Mission lead on the
 * navy gradient; the four values follow as light cards.
 */
const leads = [
  {
    icon: Eye,
    title: 'Our Vision',
    desc:
      'A market where every Indian — not only institutions — can access professional-grade trading infrastructure at an honest price.',
  },
  {
    icon: Flag,
    title: 'Our Mission',
    desc:
      'Give traders one fast, secure account for every segment, with pricing published up front and withdrawals they never have to chase.',
  },
];

const values = [
  {
    icon: Scale,
    title: 'Transparency',
    desc: 'Costs, margins and risks are stated before you trade — never discovered in a statement afterwards.',
  },
  {
    icon: Users,
    title: 'Trader first',
    desc: 'Product decisions are judged by whether they help you trade better, not by what they earn us.',
  },
  {
    icon: Sparkles,
    title: 'Craft',
    desc: 'Latency, uptime and correctness are features. We treat the boring engineering as the product.',
  },
  {
    icon: HeartHandshake,
    title: 'Integrity',
    desc: 'We say no to practices that trade a customer’s outcome for a short-term number.',
  },
];

export default function VisionMissionValues() {
  return (
    <section className="bg-white py-24 md:py-28 px-6 relative overflow-hidden">
      <div className="max-w-7xl mx-auto relative">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gold-50 border border-gold-200 mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#E6B839]" />
            <span className="text-xs font-semibold text-gold-800 uppercase tracking-widest">
              Who we are
            </span>
          </span>

          <h2 className="text-3xl md:text-5xl font-bold text-slate-900 font-manrope tracking-tight leading-[1.1]">
            Vision, mission &amp; <span className="text-[#1F4677] gold-underline">values</span>
          </h2>

          <p className="text-slate-500 leading-relaxed mt-7">
            What we are building, why we are building it, and the lines we will not cross to get there.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {leads.map((l) => {
            const Icon = l.icon;
            return (
              <div
                key={l.title}
                className="rounded-3xl p-8 md:p-10 premium-shadow"
                style={{ background: 'linear-gradient(135deg, #1F4677 0%, #16314f 100%)' }}
              >
                <div className="w-12 h-12 rounded-full bg-[#E6B839] flex items-center justify-center mb-6">
                  <Icon size={22} className="text-[#1F4677]" />
                </div>
                <h3 className="text-xl font-bold text-white font-manrope mb-3">{l.title}</h3>
                <p className="text-sm text-slate-300 leading-relaxed">{l.desc}</p>
              </div>
            );
          })}
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {values.map((v) => {
            const Icon = v.icon;
            return (
              <div key={v.title} className="card-light p-7">
                <div className="w-11 h-11 rounded-full bg-gold-50 border border-gold-200 flex items-center justify-center mb-5">
                  <Icon size={20} className="text-[#1F4677]" />
                </div>
                <h3 className="text-base font-bold text-slate-900 font-manrope mb-2">{v.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{v.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
