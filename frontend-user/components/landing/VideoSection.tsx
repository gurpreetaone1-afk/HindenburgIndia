"use client";

import { useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';

export default function VideoSection() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.defaultMuted = true;
  }, []);

  const handlePlay = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.play()
      .then(() => setStarted(true))
      .catch((err: unknown) => {
        console.warn('Autoplay blocked:', err);
        v.controls = true;
        setStarted(true);
      });
  };

  return (
    <section
      id="demo"
      className="relative py-20 md:py-28 px-4 sm:px-6 overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, #fff 0%, #eff6ff 50%, #fff 100%)',
      }}
    >
      {/* ── Background decoration ─────────────────────────────────── */}
      <div className="absolute inset-0 pointer-events-none select-none">
        <div
          className="absolute top-1/2 left-1/2 w-[700px] h-[400px] rounded-full opacity-30"
          style={{
            background:
              'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(31,70,119,0.08) 0%, transparent 70%)',
            transform: 'translate(-50%, -50%)',
          }}
        />
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'linear-gradient(rgba(31,70,119,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(31,70,119,0.03) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto">

        {/* ── Section header ────────────────────────────────────────── */}
        <div className="text-center mb-10 md:mb-14">
          {/* Live badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gold-50 border border-gold-200 mb-5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-navy-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#1F4677]" />
            </span>
            <span className="text-xs font-semibold text-[#1F4677] tracking-wide font-manrope uppercase">
              Platform Demo
            </span>
          </div>

          <h2 className="text-3xl md:text-5xl font-bold text-slate-900 font-manrope tracking-tight mb-4">
            See Hindenburg India{' '}
            <span className="text-[#1F4677] gold-underline">in Action</span>
          </h2>
          <p className="text-base md:text-lg text-slate-500 max-w-xl mx-auto leading-relaxed">
            Watch how our platform makes trading simple, fast, and powerful —
            from account setup to your first live trade.
          </p>
        </div>

        {/* ── Video card ────────────────────────────────────────────── */}
        <div
          className="relative rounded-3xl p-[1.5px] premium-shadow"
          style={{
            background:
              'linear-gradient(135deg, rgba(31,70,119,0.22) 0%, rgba(31,70,119,0.06) 45%, rgba(31,70,119,0.16) 100%)',
          }}
        >
          {/* Inner rounded wrapper */}
          <div className="relative rounded-[calc(1.5rem-1.5px)] overflow-hidden bg-black min-h-[220px] md:min-h-[420px]">

            <video
              ref={videoRef}
              className="w-full h-auto block"
              loop
              playsInline
              preload="metadata"
              controls={started}
              onEnded={() => setStarted(false)}
            >
              <source src="/landing/video/video1.mp4" type="video/mp4" />
              Your browser does not support the video tag.
            </video>

            {/* ── Custom play overlay — shown before first play ─────── */}
            {!started && (
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(0,0,0,0.50) 0%, rgba(31,70,119,0.15) 100%)',
                }}
              >
                {/* Outer pulse ring */}
                <div className="relative flex items-center justify-center">
                  <span className="absolute w-24 h-24 rounded-full bg-[#1F4677]/20 animate-ping" />
                  <span className="absolute w-20 h-20 rounded-full bg-[#1F4677]/10" />

                  {/* Play button */}
                  <button
                    aria-label="Play demo video"
                    onClick={handlePlay}
                    className="relative z-10 w-16 h-16 md:w-20 md:h-20 rounded-full bg-[#1F4677] flex items-center justify-center shadow-xl shadow-navy-500/40 hover:scale-110 active:scale-95 transition-transform focus:outline-none focus:ring-4 focus:ring-navy-300"
                  >
                    <Play
                      size={28}
                      className="text-white ml-1"
                      fill="white"
                      strokeWidth={0}
                    />
                  </button>
                </div>

                {/* Label below button */}
                <p className="absolute bottom-6 text-white/70 text-sm font-medium font-manrope tracking-wide">
                  Click to watch the demo
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Trust strip ───────────────────────────────────────────── */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {[
            'Zero Setup Fee',
            'Real-Time Data',
            'Instant Execution',
            'Bank-Grade Security',
          ].map((label) => (
            <div
              key={label}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-slate-200 soft-card"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#E6B839] shrink-0" />
              <span className="text-sm font-medium text-slate-600 font-manrope">
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}