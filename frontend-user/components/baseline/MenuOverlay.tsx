"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { NAV_LINKS, SOCIALS } from "./data";
import { Spring, painter } from "./motion";
import { Brand, CloseButton, PillButton } from "./ui";

/**
 * Fullscreen navy menu. Mounted only while open so the link stagger replays
 * on every open; `pointer-events` still gate it during the exit spring.
 */
export default function MenuOverlay({
  open,
  onClose,
  onOpenModal,
  onScrollTo,
}: {
  open: boolean;
  onClose: () => void;
  onOpenModal: () => void;
  onScrollTo: (hash: string) => void;
}) {
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const linkRefs = useRef<(HTMLElement | null)[]>([]);
  /** Which group is expanded — one at a time, so the column stays short. */
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  // Every open starts collapsed; a group left expanded from last time would
  // push the rest of the nav off a short screen before it is even read.
  useEffect(() => {
    if (!open) setOpenGroup(null);
  }, [open]);

  useEffect(() => {
    const backdrop = backdropRef.current;
    const panel = panelRef.current;
    if (!backdrop || !panel) return;

    const backdropSpring = new Spring(260, 30, (t) => {
      backdrop.style.opacity = String(t);
    });
    const panelPaint = painter(panel, { opacity: 0, y: -24 });
    const panelSpring = new Spring(220, 28, panelPaint);

    const linkSprings = linkRefs.current.map((a) => {
      if (!a) return null;
      const paint = painter(a, { opacity: 0, y: 28 });
      paint(0);
      return new Spring(200, 26, paint);
    });

    if (open) {
      panelPaint(0);
      backdropSpring.set(1);
      panelSpring.set(1);
      linkSprings.forEach((s, i) => {
        if (s) window.setTimeout(() => s.set(1), 120 + i * 70);
      });
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      backdropSpring.stop();
      panelSpring.stop();
      linkSprings.forEach((s) => s?.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div className="bl-portal bl-menu is-open" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="bl-menu-backdrop" ref={backdropRef} onClick={onClose} />
      <div className="bl-menu-panel" ref={panelRef}>
        <div className="bl-menu-inner">
          <div className="bl-menu-top">
            <Brand />
            <CloseButton onClick={onClose} label="Close menu" />
          </div>

          <nav className="bl-menu-nav" aria-label="Menu">
            {NAV_LINKS.map((l, i) =>
              l.children ? (
                /* Groups collapse here rather than linking straight to the hub
                   — on a phone the sub-pages have nowhere else to surface. */
                <div
                  key={l.href}
                  className={`bl-menu-group${openGroup === l.label ? " is-open" : ""}`}
                  ref={(el) => {
                    linkRefs.current[i] = el;
                  }}
                >
                  <button
                    type="button"
                    className="bl-menu-trigger"
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

                  {/* 0fr → 1fr animates to the content's own height, which a
                      max-height guess can't do without clipping or lag. */}
                  <div className="bl-menu-sub">
                    <div>
                      <Link href={l.href} onClick={onClose}>
                        {l.label} overview
                      </Link>
                      {l.children.map((c) => (
                        <Link key={c.href} href={c.href} onClick={onClose}>
                          {c.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <Link
                  key={l.href}
                  href={l.href}
                  className="bl-menu-link"
                  ref={(el) => {
                    linkRefs.current[i] = el;
                  }}
                  onClick={() => onClose()}
                >
                  {l.label}
                </Link>
              ),
            )}
          </nav>

          <div className="bl-menu-bottom">
            {/* Account actions live here on phones — below 769 the header keeps
                only the brand and the burger, so this is the one place a mobile
                visitor can reach Open account / Login from. */}
            <div className="bl-menu-actions">
              <Link href="/register" className="bl-pill light" onClick={onClose}>
                Open account
              </Link>
              <Link href="/login" className="bl-menu-login" onClick={onClose}>
                Login
              </Link>
              <PillButton
                variant="outline"
                withArrow={false}
                onClick={() => {
                  onClose();
                  window.setTimeout(onOpenModal, 220);
                }}
              >
                Talk to us
              </PillButton>
            </div>
            <nav className="bl-menu-social" aria-label="Social">
              {SOCIALS.filter((s) => s.href).map((s) => (
                <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer">
                  {s.label}
                </a>
              ))}
            </nav>
          </div>
        </div>
      </div>
    </div>
  );
}
