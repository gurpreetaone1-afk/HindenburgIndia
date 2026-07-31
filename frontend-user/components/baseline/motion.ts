/**
 * Framework-agnostic motion primitives for the Baseline landing page.
 *
 * Replaces react-spring / spring-text-engine with a tiny rAF integrator that
 * matches react-spring's `{ tension, friction }` model (mass = 1):
 *
 *     v += (-tension * (x - target) - friction * v) * dt
 *     x += v * dt
 *
 * Everything drives a normalised 0→1 progress; callers lerp their own
 * from→to values off it, which keeps one spring able to animate
 * opacity + translate + scale + rotate together.
 */

export type SpringValues = {
  opacity?: number;
  x?: number;
  y?: number;
  scale?: number;
  rotate?: number;
};

const IDENTITY: Required<SpringValues> = {
  opacity: 1,
  x: 0,
  y: 0,
  scale: 1,
  rotate: 0,
};

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export class Spring {
  private x = 0;
  private v = 0;
  private target = 0;
  private id: number | null = null;

  constructor(
    private readonly k: number,
    private readonly c: number,
    private readonly cb: (t: number) => void,
  ) {}

  set(target: number) {
    this.target = target;
    this.run();
  }

  /** Snap to a value with no animation (used to paint the `from` state). */
  jump(v: number) {
    this.x = this.target = v;
    this.v = 0;
    this.cb(this.x);
  }

  stop() {
    if (this.id !== null) cancelAnimationFrame(this.id);
    this.id = null;
  }

  private run() {
    if (this.id !== null) return;
    const H = 1 / 240; // fixed sub-step keeps the integration stable
    let last = performance.now();

    const step = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 20);
      last = now;
      const steps = Math.max(1, Math.round(dt / H));
      for (let i = 0; i < steps; i++) {
        this.v += (-this.k * (this.x - this.target) - this.c * this.v) * H;
        this.x += this.v * H;
      }
      this.cb(this.x);

      if (
        Math.abs(this.target - this.x) < 0.0005 &&
        Math.abs(this.v) < 0.0005
      ) {
        this.x = this.target;
        this.v = 0;
        this.cb(this.x);
        this.id = null;
        return;
      }
      this.id = requestAnimationFrame(step);
    };

    this.id = requestAnimationFrame(step);
  }
}

/**
 * Builds a painter that lerps `from` → identity as progress goes 0 → 1.
 * Used by every Inview reveal.
 */
export function painter(el: HTMLElement, from: SpringValues) {
  const f = { ...IDENTITY, ...from };
  return (t: number) => {
    el.style.opacity = String(lerp(f.opacity, 1, t));
    el.style.transform =
      `translate3d(${lerp(f.x, 0, t)}px, ${lerp(f.y, 0, t)}px, 0) ` +
      `scale(${lerp(f.scale, 1, t)})` +
      (f.rotate ? ` rotate(${lerp(f.rotate, 0, t)}deg)` : "");
  };
}

/** Builds a painter that lerps between two arbitrary states (hover). */
export function tween(el: HTMLElement, from: SpringValues, to: SpringValues) {
  const F = { ...IDENTITY, ...from };
  const T = { ...IDENTITY, ...to };
  return (t: number) => {
    el.style.opacity = String(lerp(F.opacity, T.opacity, t));
    el.style.transform =
      `translate3d(${lerp(F.x, T.x, t)}px, ${lerp(F.y, T.y, t)}px, 0) ` +
      `scale(${lerp(F.scale, T.scale, t)}) ` +
      `rotate(${lerp(F.rotate, T.rotate, t)}deg)`;
  };
}

export const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Hover motion is disabled at/below the md breakpoint, per the spec. */
export const canHover = () =>
  typeof window !== "undefined" &&
  window.innerWidth > 768 &&
  !prefersReducedMotion();

/**
 * Scroll progress of an element: 0 when its top hits the viewport bottom,
 * 1 when its bottom hits the viewport top. Drives the parallax layers.
 */
export function progressOf(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  const total = r.height + window.innerHeight;
  return clamp01((window.innerHeight - r.top) / total);
}
