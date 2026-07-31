"use client";

import { useEffect, useRef } from "react";
import { Spring, canHover, tween } from "./motion";
import type { SpringValues } from "./motion";

/* ══════════════════════════════════════════════════════════════════════════
   ICONS
   ══════════════════════════════════════════════════════════════════════════ */
export function BallMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M4.8 5.6A9 9 0 0 0 4.8 18.4" />
      <path d="M19.2 5.6a9 9 0 0 1 0 12.8" />
    </svg>
  );
}

/** Candlestick chart — the platform section's mark. */
export function TerminalMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 20h18" />
      <path d="M7.5 5v3.5M7.5 15.5V19" />
      <rect x="5.5" y="8.5" width="4" height="7" rx="1" />
      <path d="M16.5 3v2.5M16.5 14.5V17" />
      <rect x="14.5" y="5.5" width="4" height="9" rx="1" />
    </svg>
  );
}

export function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Hover helper — a spring between two states, disabled on touch/≤768px.
   ══════════════════════════════════════════════════════════════════════════ */
function useHoverOn(
  triggerRef: React.MutableRefObject<HTMLElement | null>,
  targetRef: React.MutableRefObject<HTMLElement | null>,
  from: SpringValues,
  to: SpringValues,
  tension: number,
  friction: number,
) {
  useEffect(() => {
    const trigger = triggerRef.current;
    const target = targetRef.current;
    if (!trigger || !target) return;

    const paint = tween(target, from, to);
    paint(0);
    if (!canHover()) return;

    const spring = new Spring(tension, friction, paint);
    const enter = () => spring.set(1);
    const leave = () => spring.set(0);
    trigger.addEventListener("mouseenter", enter);
    trigger.addEventListener("mouseleave", leave);
    trigger.addEventListener("focusin", enter);
    trigger.addEventListener("focusout", leave);
    return () => {
      trigger.removeEventListener("mouseenter", enter);
      trigger.removeEventListener("mouseleave", leave);
      trigger.removeEventListener("focusin", enter);
      trigger.removeEventListener("focusout", leave);
      spring.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/* ══════════════════════════════════════════════════════════════════════════
   EYEBROW / BRAND
   ══════════════════════════════════════════════════════════════════════════ */
export function Eyebrow({ children, tone = "dark" }: { children: React.ReactNode; tone?: "dark" | "light" }) {
  return <span className={`bl-eyebrow${tone === "light" ? " light" : ""}`}>{children}</span>;
}

export function Brand() {
  return (
    <span className="bl-brand">
      <BallMark />
      Hindenburg India
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PILL BUTTON — trailing arrow springs x:0→5 on hover
   ══════════════════════════════════════════════════════════════════════════ */
export function PillButton({
  children,
  variant = "solid",
  withArrow = true,
  type = "button",
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  variant?: "light" | "solid" | "outline";
  withArrow?: boolean;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
}) {
  const btnRef = useRef<HTMLElement | null>(null);
  const iconRef = useRef<HTMLElement | null>(null);

  useHoverOn(btnRef, iconRef, { x: 0 }, { x: 5 }, 320, 20);

  return (
    <button
      ref={btnRef as React.RefObject<HTMLButtonElement>}
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`bl-pill ${variant}`}
    >
      {children}
      {withArrow && (
        <span ref={iconRef as React.RefObject<HTMLSpanElement>} style={{ display: "grid", placeItems: "center" }}>
          <ArrowIcon />
        </span>
      )}
    </button>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   ARROW BUTTON (carousel) — icon scales 1→1.15 on hover.
   The prev arrow is the same glyph mirrored, so the scale has to compose
   with scaleX(-1) instead of replacing it.
   ══════════════════════════════════════════════════════════════════════════ */
export function ArrowButton({
  variant,
  flip,
  label,
  onClick,
}: {
  variant: "outline" | "solid";
  flip?: boolean;
  label: string;
  onClick: () => void;
}) {
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const wrapRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const trigger = btnRef.current;
    const target = wrapRef.current;
    if (!trigger || !target) return;

    const paint = (t: number) => {
      target.style.transform = `scale(${1 + 0.15 * t})${flip ? " scaleX(-1)" : ""}`;
    };
    paint(0);
    if (!canHover()) return;

    const spring = new Spring(320, 18, paint);
    const enter = () => spring.set(1);
    const leave = () => spring.set(0);
    trigger.addEventListener("mouseenter", enter);
    trigger.addEventListener("mouseleave", leave);
    return () => {
      trigger.removeEventListener("mouseenter", enter);
      trigger.removeEventListener("mouseleave", leave);
      spring.stop();
    };
  }, [flip]);

  return (
    <button ref={btnRef} className={`bl-arrow-btn ${variant}`} aria-label={label} onClick={onClick}>
      <span ref={wrapRef} style={{ display: "grid", placeItems: "center" }}>
        <ArrowIcon />
      </span>
    </button>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   ICON BUTTON — X that rotates 0→90deg on hover
   ══════════════════════════════════════════════════════════════════════════ */
export function CloseButton({
  onClick,
  className = "bl-icon-btn",
  label = "Close",
}: {
  onClick: () => void;
  className?: string;
  label?: string;
}) {
  const btnRef = useRef<HTMLElement | null>(null);
  const wrapRef = useRef<HTMLElement | null>(null);

  useHoverOn(btnRef, wrapRef, { rotate: 0 }, { rotate: 90 }, 300, 18);

  return (
    <button
      ref={btnRef as React.RefObject<HTMLButtonElement>}
      className={className}
      aria-label={label}
      onClick={onClick}
    >
      <span ref={wrapRef as React.RefObject<HTMLSpanElement>} style={{ display: "grid", placeItems: "center" }}>
        <XIcon />
      </span>
    </button>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   CAROUSEL DOTS
   ══════════════════════════════════════════════════════════════════════════ */
export function Dots({
  count,
  active,
  tone,
  onPick,
}: {
  count: number;
  active: number;
  tone: "dark" | "light";
  onPick: (i: number) => void;
}) {
  return (
    <div className={`bl-dots ${tone}`}>
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          aria-label={`Go to slide ${i + 1}`}
          aria-current={i === active ? "true" : undefined}
          onClick={() => onPick(i)}
        >
          <span />
        </button>
      ))}
    </div>
  );
}
