"use client";

import { useEffect, useRef, useState } from 'react';
import { TrendingUp, Users, BarChart3, Download } from 'lucide-react';

const stats = [
  {
    icon: BarChart3,
    value: 1000000,
    display: '1M+',
    label: 'Orders Processed',
    sub: 'Every month, reliably',
  },
  {
    icon: Users,
    value: 150000,
    display: '150K+',
    label: 'Active Clients',
    sub: 'Across India & globally',
  },
  {
    icon: TrendingUp,
    value: 5,
    display: '₹5M+',
    label: 'Monthly Trading Volume',
    sub: 'Processed securely',
    prefix: '₹',
  },
  {
    icon: Download,
    value: 900000,
    display: '900K+',
    label: 'App Downloads',
    sub: 'Android & iOS combined',
  },
];

interface CountUpProps {
  target: number;
  prefix?: string;
  isVisible: boolean;
}

function CountUp({ target, prefix = '', isVisible }: CountUpProps) {
  const [count, setCount] = useState(0);
  const hasRun = useRef(false);

  useEffect(() => {
    if (!isVisible || hasRun.current) return;
    hasRun.current = true;
    const duration = 2000;
    const steps = 60;
    const increment = target / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= target) { setCount(target); clearInterval(timer); }
      else setCount(Math.floor(current));
    }, duration / steps);
    return () => clearInterval(timer);
  }, [isVisible, target]);

  const formatted = () => {
    if (target >= 1000000) return `${prefix}${(count / 1000000).toFixed(1)}M+`;
    if (target >= 1000)    return `${prefix}${(count / 1000).toFixed(0)}K+`;
    return `${prefix}${count}M+`;
  };

  return <span>{isVisible ? formatted() : `${prefix}0`}</span>;
}

export default function Statistics() {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsVisible(true); },
      { threshold: 0.3 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="stats" className="relative">

      {/* ── Dark blue stat band ── */}
      <div ref={sectionRef} className="stat-band py-20 px-6 relative overflow-hidden">
        {/* Background pattern */}
        <div
          className="absolute inset-0 opacity-10 pointer-events-none"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        {/* Glow orbs */}
        <div className="absolute top-0 left-1/4 w-64 h-64 bg-white/5 rounded-full blur-[80px]" />
        <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-white/5 rounded-full blur-[80px]" />

        <div className="max-w-7xl mx-auto relative">
          {/* Header */}
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/15 border border-white/15 mb-5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#E6B839]" />
              <span className="text-xs font-semibold text-white uppercase tracking-widest">Our Numbers</span>
            </div>
            <h2 className="text-3xl md:text-5xl font-bold text-white tracking-tight font-manrope mb-3">
              Trusted by Thousands of Traders
            </h2>
            <p className="text-navy-100/80 text-lg font-light">
              Real numbers that reflect the trust our clients place in us every day.
            </p>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {stats.map((stat, i) => {
              const Icon = stat.icon;
              return (
                <div
                  key={stat.label}
                  className="group text-center p-6 rounded-2xl bg-white/10 border border-white/15 hover:-translate-y-1 hover:bg-white/15 hover:border-white/30 transition-all duration-300 backdrop-blur-sm"
                  style={{ animationDelay: `${i * 0.1}s` }}
                >
                  <div className="w-12 h-12 rounded-xl bg-white/15 border border-white/15 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                    <Icon size={22} className="text-gold-400" />
                  </div>
                  <div className="text-4xl md:text-5xl font-bold text-white font-manrope mb-2">
                    <CountUp target={stat.value} prefix={stat.prefix || ''} isVisible={isVisible} />
                  </div>
                  <div className="text-sm font-semibold text-navy-100 font-manrope">{stat.label}</div>
                  <div className="text-xs text-navy-200/70 mt-1">{stat.sub}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}