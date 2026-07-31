"use client";

import { useEffect, useRef } from "react";
import {
  BASE_W,
  COEF,
  EASE,
  FONT_BASE,
} from "./data";
import {
  Spring,
  SpringValues,
  canHover,
  painter,
  prefersReducedMotion,
  progressOf,
  tween,
} from "./motion";

/* ══════════════════════════════════════════════════════════════════════════
   Adaptive rem grid
   Below 1920 the CSS media queries drive the root font-size; above it we
   interpolate upward so the layout keeps growing on large displays.
   ══════════════════════════════════════════════════════════════════════════ */
export function useAdaptiveGrid() {
  useEffect(() => {
    const apply = () => {
      const reduction = ((BASE_W - window.innerWidth) / BASE_W) * 100 * COEF;
      const size = FONT_BASE - (FONT_BASE * reduction) / 100;
      if (size > FONT_BASE) {
        document.documentElement.style.fontSize = `${size}px`;
      } else {
        document.documentElement.style.removeProperty("font-size");
      }
    };
    apply();
    window.addEventListener("resize", apply);
    return () => {
      window.removeEventListener("resize", apply);
      document.documentElement.style.removeProperty("font-size");
    };
  }, []);
}

/* ══════════════════════════════════════════════════════════════════════════
   Inview spring reveal — plays once, after an optional delay
   ══════════════════════════════════════════════════════════════════════════ */
export function useInview<T extends HTMLElement = HTMLDivElement>(
  from: SpringValues,
  opts: { delay?: number; tension?: number; friction?: number; gate?: boolean } = {},
) {
  const ref = useRef<T | null>(null);
  const { delay = 0, tension = 200, friction = 26, gate = true } = opts;
  const played = useRef(false);

  // Paint the `from` state synchronously so nothing flashes at full opacity.
  useEffect(() => {
    const el = ref.current;
    if (!el || played.current) return;
    painter(el, from)(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || !gate || played.current) return;

    const paint = painter(el, from);
    const spring = new Spring(tension, friction, paint);

    const play = () => {
      if (played.current) return;
      played.current = true;
      window.setTimeout(() => spring.set(1), delay);
    };

    // Already on screen (common for the hero once the loader lifts).
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight && r.bottom > 0) {
      play();
      return () => spring.stop();
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          io.unobserve(e.target);
          play();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      spring.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate]);

  return ref;
}

/* ══════════════════════════════════════════════════════════════════════════
   Hover spring — trigger element drives, target element paints.
   Disabled on touch / ≤768px / reduced-motion.
   ══════════════════════════════════════════════════════════════════════════ */
export function useHoverSpring<
  Trigger extends HTMLElement = HTMLElement,
  Target extends HTMLElement = HTMLElement,
>(from: SpringValues, to: SpringValues, tension: number, friction: number) {
  const triggerRef = useRef<Trigger | null>(null);
  const targetRef = useRef<Target | null>(null);

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

  return { triggerRef, targetRef };
}

/* ══════════════════════════════════════════════════════════════════════════
   Clip-mask LINE reveal — lines are authored as
   <span class="bl-line"><span>text</span></span>
   ══════════════════════════════════════════════════════════════════════════ */
type LineOpts = {
  base?: number;
  stagger?: number;
  duration?: number;
  ease?: keyof typeof EASE;
  gate?: boolean;
};

export function useLineReveal<T extends HTMLElement = HTMLHeadingElement>(
  opts: LineOpts = {},
) {
  const ref = useRef<T | null>(null);
  const {
    base = 0,
    stagger = 120,
    duration = 950,
    ease = "expo",
    gate = true,
  } = opts;
  const played = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !gate || played.current) return;

    const play = () => {
      if (played.current) return;
      played.current = true;
      el.querySelectorAll<HTMLElement>(".bl-line").forEach((line, i) => {
        const inner = line.firstElementChild as HTMLElement | null;
        if (!inner) return;
        const d = base + i * stagger;
        inner.style.transition =
          `transform ${duration}ms ${EASE[ease]} ${d}ms, ` +
          `opacity ${duration}ms ${EASE[ease]} ${d}ms`;
        requestAnimationFrame(() => line.classList.add("is-in"));
      });
    };

    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight && r.bottom > 0) {
      play();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          io.unobserve(e.target);
          play();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate]);

  return ref;
}

/* ══════════════════════════════════════════════════════════════════════════
   Clip-mask WORD reveal — splits the element's text into per-word clip boxes
   ══════════════════════════════════════════════════════════════════════════ */
export function useWordReveal<T extends HTMLElement = HTMLHeadingElement>(
  text: string,
  opts: { stagger?: number; duration?: number; ease?: keyof typeof EASE; gate?: boolean } = {},
) {
  const ref = useRef<T | null>(null);
  const { stagger = 140, duration = 1100, ease = "expo", gate = true } = opts;
  const played = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Build the clip boxes once.
    if (!el.dataset.built) {
      el.dataset.built = "1";
      const words = text.trim().split(/\s+/);
      el.textContent = "";
      words.forEach((w, i) => {
        const clip = document.createElement("span");
        clip.className = "bl-clip";
        const inner = document.createElement("span");
        inner.textContent = w;
        clip.appendChild(inner);
        el.appendChild(clip);
        if (i < words.length - 1) el.appendChild(document.createTextNode(" "));
      });
    }
  }, [text]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !gate || played.current) return;
    played.current = true;
    el.querySelectorAll<HTMLElement>(".bl-clip").forEach((clip, i) => {
      const inner = clip.firstElementChild as HTMLElement | null;
      if (!inner) return;
      inner.style.transition =
        `transform ${duration}ms ${EASE[ease]} ${i * stagger}ms, ` +
        `opacity ${duration}ms ${EASE[ease]} ${i * stagger}ms`;
      requestAnimationFrame(() => clip.classList.add("is-in"));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate]);

  return ref;
}

/* ══════════════════════════════════════════════════════════════════════════
   Word fade + rise (no clip) — the facilities body copy
   ══════════════════════════════════════════════════════════════════════════ */
export function useWordFade<T extends HTMLElement = HTMLParagraphElement>(
  text: string,
  opts: { stagger?: number; delay?: number; duration?: number } = {},
) {
  const ref = useRef<T | null>(null);
  const { stagger = 28, delay = 250, duration = 700 } = opts;
  const played = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || el.dataset.built) return;
    el.dataset.built = "1";
    const words = text.trim().split(/\s+/);
    el.textContent = "";
    words.forEach((w, i) => {
      const s = document.createElement("span");
      s.className = "bl-fade-word";
      s.textContent = w;
      el.appendChild(s);
      if (i < words.length - 1) el.appendChild(document.createTextNode(" "));
    });
  }, [text]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const play = () => {
      if (played.current) return;
      played.current = true;
      el.querySelectorAll<HTMLElement>(".bl-fade-word").forEach((w, i) => {
        const d = delay + i * stagger;
        w.style.transition =
          `transform ${duration}ms ${EASE.quart} ${d}ms, ` +
          `opacity ${duration}ms ${EASE.quart} ${d}ms`;
        requestAnimationFrame(() => w.classList.add("is-in"));
      });
    };
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          io.unobserve(e.target);
          play();
        }
      },
      { threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return ref;
}

/* ══════════════════════════════════════════════════════════════════════════
   Scroll parallax — maps a section's scroll progress (0→1) onto a painter
   that runs every frame. Skipped entirely under reduced-motion.
   ══════════════════════════════════════════════════════════════════════════ */
export function useParallax(
  sectionRef: React.MutableRefObject<HTMLElement | null>,
  apply: (progress: number) => void,
) {
  const applyRef = useRef(apply);
  applyRef.current = apply;

  useEffect(() => {
    if (prefersReducedMotion()) return;
    let id = 0;
    const tick = () => {
      const el = sectionRef.current;
      if (el) applyRef.current(progressOf(el));
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export { prefersReducedMotion };
