"use client";

import { memo, useEffect, useRef } from "react";

interface Props {
  /** The REAL price (from the store/feed). */
  value: number | null | undefined;
  /** Formats a (possibly interpolated) number into the shown string. */
  format: (n: number) => string;
  /** Smoothly roll the shown number to the target over ~150ms. */
  glide?: boolean;
  /** Briefly tint the TEXT green/red on change (auto-returns to base colour). */
  flash?: boolean;
  className?: string;
  placeholder?: string;
}

const GLIDE_MS = 150;

// Display-ONLY animated price. Rolls the SHOWN number to each new REAL value
// over ~150ms (re-targets mid-glide) so a ~1 tick/s feed feels fluid, and can
// flash the text green/red on change. Painted IMPERATIVELY (ref.textContent) so
// React never re-renders per frame — no render storm even with many instances.
//
// HARD RULE: purely visual. Never writes to any store/state; order execution,
// P&L, margin and SL/TP all keep reading the REAL value elsewhere.
function AnimatedPriceImpl({
  value,
  format,
  glide = true,
  flash = true,
  className,
  placeholder = "—",
}: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const fmt = useRef(format);
  fmt.current = format;
  const from = useRef<number | null>(null);
  const to = useRef<number | null>(null);
  const shown = useRef<number | null>(null);
  const start = useRef(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (el == null) return;
    if (value == null || !Number.isFinite(value)) {
      if (to.current == null) el.textContent = placeholder;
      return;
    }
    const prev = to.current;
    if (prev == null || !glide) {
      from.current = value;
      to.current = value;
      shown.current = value;
      el.textContent = fmt.current(value);
      return;
    }
    if (value === prev) return;
    if (flash) {
      el.classList.remove("ap-up", "ap-down");
      void el.offsetWidth; // reflow → restart the keyframe
      el.classList.add(value > prev ? "ap-up" : "ap-down");
    }
    from.current = shown.current ?? prev;
    to.current = value;
    start.current = performance.now();
    if (raf.current != null) cancelAnimationFrame(raf.current);
    const step = (now: number) => {
      const t = Math.min(1, (now - start.current) / GLIDE_MS);
      const e = 1 - Math.pow(1 - t, 3); // easeOutCubic
      const a = from.current as number;
      const b = to.current as number;
      const v = t < 1 ? a + (b - a) * e : b;
      shown.current = v;
      el.textContent = fmt.current(v);
      if (t < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }, [value, glide, flash, placeholder]);

  useEffect(
    () => () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
    },
    [],
  );

  // Childless span; painted imperatively so React never re-renders per frame.
  return <span ref={ref} className={className} suppressHydrationWarning />;
}

export const AnimatedPrice = memo(AnimatedPriceImpl);
