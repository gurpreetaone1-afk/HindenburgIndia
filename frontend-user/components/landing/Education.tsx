"use client";

import { BookOpen, Clock, ArrowRight, TrendingUp, DollarSign, BarChart2, Shield } from 'lucide-react';
import { useScrollAnimation, useStaggerAnimation } from './hooks/useScrollAnimation';
import ImageBox from './ImageBox';

const articles = [
  {
    icon: TrendingUp,
    category: 'Stocks',
    title: "Beginner's Guide to Stock Trading",
    desc: 'Learn the fundamentals of stock markets, how to read charts, and place your first trade with confidence.',
    readTime: '8 min read',
    level: 'Beginner',
    levelColor: 'text-emerald-600 bg-emerald-50 border-emerald-100',
    color: 'text-navy-600',
    bg: 'bg-navy-50',
    border: 'border-navy-100',
  },
  {
    icon: DollarSign,
    category: 'Forex',
    title: 'Understanding Forex Markets',
    desc: 'Discover how currency pairs work, what drives exchange rates, and how to profit from forex movements.',
    readTime: '10 min read',
    level: 'Intermediate',
    levelColor: 'text-amber-600 bg-amber-50 border-amber-100',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-100',
  },
  {
    icon: BarChart2,
    category: 'Derivatives',
    title: 'Options Trading Basics',
    desc: 'Understand calls, puts, strike prices, and expiry dates. Master the building blocks of options trading.',
    readTime: '12 min read',
    level: 'Intermediate',
    levelColor: 'text-amber-600 bg-amber-50 border-amber-100',
    color: 'text-violet-600',
    bg: 'bg-violet-50',
    border: 'border-violet-100',
  },
  {
    icon: Shield,
    category: 'Strategy',
    title: 'Risk Management Strategies',
    desc: 'Protect your capital with proven risk management techniques including stop-loss, position sizing, and diversification.',
    readTime: '9 min read',
    level: 'Advanced',
    levelColor: 'text-red-600 bg-red-50 border-red-100',
    color: 'text-[#1F4677]',
    bg: 'bg-navy-50',
    border: 'border-navy-100',
  },
];

export default function Education() {
  const { ref: headerRef } = useScrollAnimation();
  const cardsRef           = useStaggerAnimation(0.08, 90);
  const { ref: bannerRef } = useScrollAnimation(0.1);

  return (
    <section id="education" className="py-24 md:py-28 px-6 bg-[#f7f9fc] relative overflow-hidden">
      <div className="absolute top-0 left-0 w-64 h-64 bg-navy-500/4 rounded-full blur-[80px] pointer-events-none" />
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div ref={headerRef} className="scroll-reveal mb-16 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gold-50 border border-gold-200 mb-5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#E6B839]" />
              <span className="text-xs font-semibold text-[#8a621b] uppercase tracking-widest">Education</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 tracking-tight font-manrope mb-4">
              Quick Trading Guides{' '}
              <span className="text-[#1F4677] gold-underline">&amp; Insights</span>
            </h2>
            <p className="text-lg text-slate-500 font-light">
              Sharpen your trading skills with expert-written guides, tutorials, and market analysis.
            </p>
          </div>
          <a
            href="#"
            className="shrink-0 inline-flex items-center gap-2 text-sm font-semibold text-[#1F4677] hover:gap-3 transition-all"
          >
            View All Articles <ArrowRight size={16} />
          </a>
        </div>

        {/* Article Cards */}
        <div ref={cardsRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {articles.map((article) => {
            const Icon = article.icon;
            return (
              <div
                key={article.title}
                className="stagger-child card-light group flex flex-col overflow-hidden hover:-translate-y-1 hover:border-navy-200 transition-all duration-300"
              >
                {/* Thumbnail placeholder */}
                <ImageBox
                  ratio="video"
                  rounded="rounded-none"
                  label={article.category}
                  icon={article.icon}
                />

                <div className="p-6 flex flex-col gap-4 flex-1">
                  {/* Icon & Category */}
                  <div className="flex items-center justify-between">
                    <div className="inline-flex p-2.5 rounded-xl bg-navy-50 border border-navy-100">
                      <Icon size={18} className="text-[#1F4677]" />
                    </div>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border ${article.levelColor}`}>
                      {article.level}
                    </span>
                  </div>

                  {/* Category tag */}
                  <span className={`text-[10px] font-bold uppercase tracking-widest ${article.color}`}>
                    {article.category}
                  </span>

                  {/* Title */}
                  <h3 className="text-base font-semibold text-slate-900 font-manrope leading-snug group-hover:text-[#1F4677] transition-colors">
                    {article.title}
                  </h3>

                  {/* Description */}
                  <p className="text-sm text-slate-500 leading-relaxed flex-1">{article.desc}</p>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <Clock size={12} />
                      {article.readTime}
                    </div>
                    <button className={`flex items-center gap-1 text-xs font-semibold ${article.color} group-hover:gap-2 transition-all`}>
                      Read More <ArrowRight size={12} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Masterclass Banner */}
        <div ref={bannerRef} className="scroll-reveal mt-10 p-8 rounded-2xl bg-gradient-to-r from-[#1F4677] to-navy-700 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
              <BookOpen size={26} className="text-white" />
            </div>
            <div>
              <div className="text-white font-bold text-lg font-manrope">Free Trading Masterclass</div>
              <div className="text-white/80 text-sm mt-0.5">
                Join 10,000+ traders who have completed our free online trading course.
              </div>
            </div>
          </div>
          <a
            href="#"
            className="shrink-0 px-7 py-3 rounded-full bg-white text-[#1F4677] font-bold text-sm hover:bg-navy-50 transition-all shadow-lg"
          >
            Enroll Free →
          </a>
        </div>
      </div>
    </section>
  );
}