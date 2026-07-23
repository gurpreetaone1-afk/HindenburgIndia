"use client";

import { useState, useEffect } from 'react';
import { Menu, X, ArrowRight } from 'lucide-react';
import Link from 'next/link';

const navLinks = [
  { label: 'Home', href: '#home' },
  { label: 'Markets', href: '#markets' },
  { label: 'Platform', href: '#platform' },
  { label: 'Education', href: '#education' },
  { label: 'Tools', href: '#tools' },
  { label: 'Company', href: '#contact' },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      {/* Top gradient blur */}
      <div className="gradient-blur" />

      <header className="fixed top-0 left-0 w-full z-50 pt-5 px-4">
        <nav
          className={`max-w-6xl mx-auto flex items-center justify-between backdrop-blur-xl border rounded-full px-6 py-3 shadow-lg transition-all duration-300 ${
            scrolled
              ? 'bg-white/95 border-slate-200 shadow-slate-200/60'
              : 'bg-white/80 border-slate-200/80'
          }`}
        >
          {/* Logo */}
          <a href="#home" className="flex items-center gap-2 group">
            <img 
              src="/landing/img/logo1.png" 
              alt="Hindenburg India" 
              className="h-8 w-auto group-hover:scale-105 transition-transform duration-300"
            />
          </a>

          {/* Desktop Links */}
          <div className="hidden md:flex items-center gap-7">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors duration-200 relative group"
              >
                {link.label}
                <span className="absolute -bottom-0.5 left-0 w-0 h-px bg-[#1F4677] group-hover:w-full transition-all duration-300" />
              </a>
            ))}
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden md:block text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              Login
            </Link>

            {/* Gold CTA button */}
            <Link
              href="/register"
              className="btn-gold group inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm"
            >
              Open Account
              <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
            </Link>

            {/* Mobile toggle */}
            <button
              className="md:hidden text-slate-500 hover:text-slate-900 transition-colors p-1"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </nav>

        {/* Mobile Menu */}
        <div
          className={`md:hidden max-w-6xl mx-auto mt-2 rounded-2xl border border-slate-200 bg-white/95 backdrop-blur-xl overflow-hidden transition-all duration-300 shadow-lg ${
            mobileOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          <div className="px-6 py-4 flex flex-col gap-4">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors py-1 border-b border-slate-100"
              >
                {link.label}
              </a>
            ))}
            <div className="flex gap-3 pt-2">
              <Link
                href="/login"
                className="flex-1 text-center py-2.5 rounded-full border border-slate-200 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-all"
              >
                Login
              </Link>
              <Link
                href="/register"
                className="flex-1 text-center py-2.5 rounded-full bg-[#1F4677] text-sm font-bold text-white hover:bg-navy-800 transition-all"
              >
                Open Account
              </Link>
            </div>
          </div>
        </div>
      </header>
    </>
  );
}