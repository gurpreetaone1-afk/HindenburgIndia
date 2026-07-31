"use client";

import { useEffect, useRef, useState } from "react";
import { BRAND, EASE, EXIT_MS, MAX_VISIBLE_MS, MIN_VISIBLE_MS } from "./data";
import { Spring, painter, prefersReducedMotion } from "./motion";
import { BallMark } from "./ui";

/**
 * Navy intro curtain. Holds scroll, fills a 1px progress bar, then slides up
 * and calls `onDone` — which is what flips the hero's `ready` gate.
 */
export default function Loader({ onDone }: { onDone: () => void }) {
  const [gone, setGone] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const markRef = useRef<HTMLSpanElement | null>(null);
  const fillRef = useRef<HTMLDivElement | null>(null);
  const finished = useRef(false);

  useEffect(() => {
    const reduced = prefersReducedMotion();
    const minVisible = reduced ? 200 : MIN_VISIBLE_MS;
    const exitMs = reduced ? 0 : EXIT_MS;

    // Wordmark springs in.
    const mark = markRef.current;
    let markSpring: Spring | null = null;
    if (mark) {
      const paint = painter(mark, { opacity: 0, y: 16 });
      paint(0);
      markSpring = new Spring(200, 22, paint);
      markSpring.set(1);
    }

    // Progress fill: 120ms delay, then MIN_VISIBLE - 120 in easeInOutCubic.
    const fill = fillRef.current;
    if (fill) {
      fill.style.transition = `transform ${Math.max(minVisible - 120, 0)}ms ${EASE.cubic} 120ms`;
      requestAnimationFrame(() => {
        fill.style.transform = "scaleX(1)";
      });
    }

    const finish = () => {
      if (finished.current) return;
      finished.current = true;
      onDone();
      const root = rootRef.current;
      if (root) {
        root.style.transition = `transform ${exitMs}ms ${EASE.cubic}`;
        requestAnimationFrame(() => {
          root.style.transform = "translateY(-105%)";
        });
      }
      window.setTimeout(() => setGone(true), exitMs);
    };

    let countdown = 0;
    let started = false;
    const startCountdown = () => {
      if (started) return;
      started = true;
      countdown = window.setTimeout(finish, minVisible);
    };

    if (document.readyState === "complete") startCountdown();
    else window.addEventListener("load", startCountdown);
    // Force-start if `load` never fires (a stalled image, say).
    const force = window.setTimeout(startCountdown, MAX_VISIBLE_MS);

    return () => {
      window.removeEventListener("load", startCountdown);
      window.clearTimeout(countdown);
      window.clearTimeout(force);
      markSpring?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (gone) return null;

  return (
    <div className="bl-portal bl-loader" ref={rootRef} role="status" aria-live="polite">
      <span className="bl-loader-mark" ref={markRef}>
        <BallMark />
        {BRAND}
      </span>
      <div className="bl-loader-track">
        <div className="bl-loader-fill" ref={fillRef} />
      </div>
    </div>
  );
}
