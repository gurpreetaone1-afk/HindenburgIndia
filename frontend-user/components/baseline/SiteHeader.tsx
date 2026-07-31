"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_LINKS } from "./data";
import { Brand } from "./ui";

/**
 * Site header — sits above the hero card, in the white page margin.
 *
 * Left: brand + primary nav. Right: Login and Open Account. Below 768px the
 * nav collapses into the burger, which opens the shared MenuOverlay.
 *
 * Groups (Trading, Platforms) open on hover and on click/keyboard — hover
 * alone is unusable on a touch-capable laptop and unreachable by keyboard.
 */
export default function SiteHeader({ onOpenMenu }: { onOpenMenu: () => void }) {
  const pathname = usePathname();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const navRef = useRef<HTMLElement | null>(null);

  // Any click outside the nav, or Escape, closes the open dropdown.
  useEffect(() => {
    if (!openGroup) return;
    const onDown = (e: MouseEvent) => {
      if (!navRef.current?.contains(e.target as Node)) setOpenGroup(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenGroup(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openGroup]);

  // Route change closes it — the panel would otherwise survive the navigation.
  useEffect(() => {
    setOpenGroup(null);
  }, [pathname]);

  const isActive = (item: (typeof NAV_LINKS)[number]) => {
    if (item.href === "/") return pathname === "/";
    if (pathname === item.href || pathname.startsWith(`${item.href}/`)) return true;
    return (item.children ?? []).some(
      (c) => pathname === c.href || pathname.startsWith(`${c.href}/`),
    );
  };

  return (
    <header className="bl-site-header">
      <div className="bl-sh-left">
        <Link href="/" className="bl-sh-brand" aria-label="Hindenburg India — home">
          <Brand />
        </Link>
        <nav className="bl-sh-nav" aria-label="Primary" ref={navRef}>
          {NAV_LINKS.map((l) =>
            l.children ? (
              <div
                key={l.href}
                className={`bl-sh-group${openGroup === l.label ? " is-open" : ""}`}
                onMouseEnter={() => setOpenGroup(l.label)}
                onMouseLeave={() => setOpenGroup(null)}
              >
                <button
                  type="button"
                  className={`bl-sh-navlink bl-sh-trigger${isActive(l) ? " is-active" : ""}`}
                  aria-expanded={openGroup === l.label}
                  onClick={() => setOpenGroup(openGroup === l.label ? null : l.label)}
                >
                  {l.label}
                  <svg viewBox="0 0 12 12" aria-hidden="true">
                    <path
                      d="M2.5 4.5 6 8l3.5-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>

                <div className="bl-sh-dropdown" role="menu" aria-label={l.label}>
                  {l.children.map((c) => (
                    <Link key={c.href} href={c.href} role="menuitem">
                      <span className="bl-sh-dd-label">{c.label}</span>
                      {c.desc ? <span className="bl-sh-dd-desc">{c.desc}</span> : null}
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              <Link
                key={l.href}
                href={l.href}
                className={`bl-sh-navlink${isActive(l) ? " is-active" : ""}`}
              >
                {l.label}
              </Link>
            ),
          )}
        </nav>
      </div>

      <div className="bl-sh-right">
        <Link className="bl-sh-login" href="/login">
          Login
        </Link>
        <Link className="bl-sh-signup" href="/register">
          Open Account
        </Link>
        <button className="bl-sh-burger" type="button" aria-label="Open menu" onClick={onOpenMenu}>
          <i />
          <i />
        </button>
      </div>
    </header>
  );
}
