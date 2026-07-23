"use client";

import { Users, Star, ArrowRight } from 'lucide-react';
import { useScrollAnimation, useStaggerAnimation } from './hooks/useScrollAnimation';
import ImageBox from './ImageBox';

const experts = [
  {
    name: 'Rajesh Sharma',
    role: 'Equity & Derivatives Trader',
    avatar: 'RS',
    followers: '48.2K',
    trades: '12,400+',
    returns: '+34.2%',
    rating: 4.9,
    tags: ['NSE', 'Options', 'Swing Trading'],
    color: 'bg-navy-600',
  },
  {
    name: 'Priya Mehta',
    role: 'Forex & Crypto Analyst',
    avatar: 'PM',
    followers: '31.7K',
    trades: '8,900+',
    returns: '+28.6%',
    rating: 4.8,
    tags: ['Forex', 'BTC', 'Technical Analysis'],
    color: 'bg-violet-600',
  },
  {
    name: 'Arjun Kapoor',
    role: 'Commodity & Index Trader',
    avatar: 'AK',
    followers: '22.5K',
    trades: '6,200+',
    returns: '+41.8%',
    rating: 4.7,
    tags: ['Gold', 'Crude Oil', 'NIFTY'],
    color: 'bg-amber-600',
  },
  {
    name: 'Sneha Patel',
    role: 'US Stocks & ETF Specialist',
    avatar: 'SP',
    followers: '19.3K',
    trades: '4,800+',
    returns: '+22.4%',
    rating: 4.9,
    tags: ['US Stocks', 'ETFs', 'Long-term'],
    color: 'bg-emerald-600',
  },
];

const communityStats = [
  { value: '50K+', label: 'Community Members' },
  { value: '200+', label: 'Expert Traders' },
  { value: '1,000+', label: 'Daily Signals' },
  { value: '95%', label: 'Satisfaction Rate' },
];

export default function Community() {
  const { ref: headerRef } = useScrollAnimation();
  const { ref: statsRef }  = useScrollAnimation(0.1);
  const cardsRef           = useStaggerAnimation(0.08, 90);
  const { ref: ctaRef }    = useScrollAnimation(0.1);

  return (
    <section className="py-24 md:py-28 px-6 bg-white relative overflow-hidden">
      <div className="absolute bottom-0 right-0 w-72 h-72 bg-navy-500/4 rounded-full blur-[100px] pointer-events-none" />
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div ref={headerRef} className="scroll-reveal mb-16 text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gold-50 border border-gold-200 mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#E6B839]" />
            <span className="text-xs font-semibold text-[#8a621b] uppercase tracking-widest">Community</span>
          </div>
          <h2 className="text-3xl md:text-5xl font-bold text-slate-900 tracking-tight font-manrope mb-4">
            Learn from Top{' '}
            <span className="text-[#1F4677] gold-underline">Trading Experts</span>
          </h2>
          <p className="text-lg text-slate-500 font-light">
            Join a growing community of professional traders and financial educators who trust our platform.
          </p>
        </div>

        {/* Community product mockup */}
        <div className="max-w-5xl mx-auto mb-14">
          <ImageBox
            ratio="wide"
            variant="dark"
            label="Community & Copy-Trading Feed"
            sublabel="Live signals · leaderboards · chat"
            icon={Users}
            className="premium-shadow"
          />
        </div>

        {/* Community Stats */}
        <div ref={statsRef} className="scroll-reveal grid grid-cols-2 md:grid-cols-4 gap-4 mb-14">
          {communityStats.map((stat) => (
            <div key={stat.label} className="text-center p-5 rounded-2xl bg-slate-50 border border-slate-200 hover:-translate-y-1 hover:border-navy-200 hover:bg-navy-50/30 transition-all duration-300">
              <div className="text-2xl font-bold font-manrope text-[#1F4677]">{stat.value}</div>
              <div className="text-sm text-slate-500 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Expert Cards */}
        <div ref={cardsRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {experts.map((expert) => (
            <div
              key={expert.name}
              className="stagger-child card-light group p-6 flex flex-col gap-4 hover:border-[#1F4677]"
            >
              {/* Avatar & Name */}
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full ${expert.color} flex items-center justify-center text-white font-bold text-sm font-manrope shrink-0`}>
                  {expert.avatar}
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900 font-manrope">{expert.name}</div>
                  <div className="text-xs text-slate-400">{expert.role}</div>
                </div>
              </div>

              {/* Rating */}
              <div className="flex items-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    size={12}
                    className={i < Math.floor(expert.rating) ? 'text-amber-400 fill-amber-400' : 'text-slate-200 fill-slate-200'}
                  />
                ))}
                <span className="text-xs text-slate-500 ml-1">{expert.rating}</span>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center p-2 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="text-xs font-bold text-slate-800">{expert.followers}</div>
                  <div className="text-[10px] text-slate-400">Followers</div>
                </div>
                <div className="text-center p-2 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="text-xs font-bold text-slate-800">{expert.trades}</div>
                  <div className="text-[10px] text-slate-400">Trades</div>
                </div>
                <div className="text-center p-2 rounded-lg bg-emerald-50 border border-emerald-100">
                  <div className="text-xs font-bold text-emerald-600">{expert.returns}</div>
                  <div className="text-[10px] text-slate-400">Returns</div>
                </div>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-1.5">
                {expert.tags.map((tag) => (
                  <span key={tag} className="text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                    {tag}
                  </span>
                ))}
              </div>

              {/* Follow Button */}
              <button className="w-full py-2 rounded-xl border border-[#1F4677]/20 text-[#1F4677] text-xs font-bold uppercase tracking-wider hover:bg-[#1F4677] hover:text-white transition-all group-hover:border-[#1F4677]">
                Follow Expert
              </button>
            </div>
          ))}
        </div>

        {/* Bottom CTA */}
        <div ref={ctaRef} className="scroll-reveal mt-12 text-center">
          <div className="inline-flex items-center gap-3 p-4 pr-6 rounded-full bg-slate-50 border border-slate-200 hover:border-navy-200 hover:bg-navy-50/50 transition-all duration-300 cursor-pointer group">
            <div className="flex -space-x-2">
              {['bg-navy-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500'].map((c, i) => (
                <div key={i} className={`w-8 h-8 rounded-full ${c} border-2 border-white flex items-center justify-center text-white text-xs font-bold`}>
                  {['R', 'P', 'A', 'S'][i]}
                </div>
              ))}
            </div>
            <span className="text-sm font-medium text-slate-600 group-hover:text-slate-900">
              Join <strong className="text-slate-900">50,000+</strong> traders in our community
            </span>
            <ArrowRight size={16} className="text-[#1F4677] group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </div>
    </section>
  );
}