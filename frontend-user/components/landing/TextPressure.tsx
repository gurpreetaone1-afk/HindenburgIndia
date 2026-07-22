"use client";

import { useEffect, useRef } from 'react';

interface TextPressureProps {
  text?: string;
  minWeight?: number;
  maxWeight?: number;
  minWidth?: number;
  maxWidth?: number;
  minSlant?: number;
  maxSlant?: number;
  maxDistance?: number;
  startDelay?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * TextPressure — Variable Font proximity effect.
 * Characters nearest the cursor expand in weight, width & slant.
 * Uses Roboto Flex (wght 100–900, wdth 25–151, slnt -10–0).
 */
export default function TextPressure({
  text        = 'Trade Beyond',
  minWeight   = 100,
  maxWeight   = 900,
  minWidth    = 60,
  maxWidth    = 130,
  minSlant    = 0,
  maxSlant    = -8,
  maxDistance = 220,
  startDelay  = 0,
  className   = '',
  style       = {},
}: TextPressureProps) {
  const charsRef  = useRef<Array<HTMLSpanElement | null>>([]);
  const mouseRef  = useRef<{ x: number; y: number }>({ x: -9999, y: -9999 });
  const rafRef    = useRef<number | null>(null);

  /* ── Inject Roboto Flex from Google Fonts ─────────────────────────── */
  useEffect(() => {
    const id = 'roboto-flex-link';
    if (!document.getElementById(id)) {
      const link = document.createElement('link');
      link.id   = id;
      link.rel  = 'stylesheet';
      link.href =
        'https://fonts.googleapis.com/css2?family=Roboto+Flex:opsz,wght,wdth@8..144,100..900,25..151&display=swap';
      document.head.appendChild(link);
    }
  }, []);

  /* ── Global mouse tracking ────────────────────────────────────────── */
  useEffect(() => {
    const onMove = (e: MouseEvent) => { mouseRef.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  /* ── rAF animation loop ───────────────────────────────────────────── */
  useEffect(() => {
    const animate = () => {
      const { x: mx, y: my } = mouseRef.current;

      charsRef.current.forEach((el) => {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const cx   = rect.left + rect.width  / 2;
        const cy   = rect.top  + rect.height / 2;
        const dist = Math.sqrt((mx - cx) ** 2 + (my - cy) ** 2);

        /* t = 1 when cursor is ON the char, 0 when at maxDistance */
        const t = Math.max(0, 1 - dist / maxDistance);

        const weight = minWeight + t * (maxWeight - minWeight);
        const width  = minWidth  + t * (maxWidth  - minWidth);
        const slant  = minSlant  + t * (maxSlant  - minSlant);

        el.style.fontVariationSettings =
          `'wght' ${weight.toFixed(1)}, 'wdth' ${width.toFixed(1)}, 'slnt' ${slant.toFixed(2)}`;
      });

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [maxDistance, minWeight, maxWeight, minWidth, maxWidth, minSlant, maxSlant]);

  /* ── Render ───────────────────────────────────────────────────────── */
  return (
    <span
      aria-label={text}
      className={className}
      style={{
        fontFamily: "'Roboto Flex', sans-serif",
        display: 'inline-block',
        ...style,
      }}
    >
      {text.split('').map((char, i) => (
        <span
          key={i}
          ref={(el) => { charsRef.current[i] = el; }}
          style={{
            display: 'inline-block',
            opacity: 0,                          /* hidden until char-reveal fires */
            fontVariationSettings: `'wght' ${minWeight}, 'wdth' ${minWidth}, 'slnt' ${minSlant}`,
            transition: 'font-variation-settings 0.08s ease-out',
            willChange: 'font-variation-settings, opacity',
            animation: 'char-reveal 0.35s ease-out forwards',
            animationDelay: `${startDelay + i * 50}ms`,
          }}
        >
          {char === ' ' ? '\u00A0' : char}
        </span>
      ))}
    </span>
  );
}