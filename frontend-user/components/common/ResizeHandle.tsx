"use client";

// Drag-to-resize for the terminal's desktop sections (market list, order
// panel, positions strip). Until the user drags, `custom` is false and the
// caller keeps its original responsive sizing; after a drag the size sticks
// (localStorage, per browser). While dragging, a full-screen shield keeps the
// pointer away from the TradingView iframe — an iframe swallows mouse moves,
// which would otherwise drop the drag halfway across the chart.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { cn } from "@/lib/utils";

type Limit = number | (() => number);
const lim = (v: Limit) => (typeof v === "function" ? v() : v);

export function useDragSize(key: string, target: RefObject<HTMLElement>, min: Limit, max: Limit) {
  const [size, setSize] = useState(0);
  const [custom, setCustom] = useState(false);
  const [dragging, setDragging] = useState(false);
  const sizeRef = useRef(0);
  sizeRef.current = size;

  useEffect(() => {
    try {
      const v = Number(window.localStorage.getItem(key));
      if (v > 0) {
        setSize(Math.min(lim(max), Math.max(lim(min), v)));
        setCustom(true);
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  /** axis "x" resizes width, "y" height. dir +1: dragging right/down grows
   *  the section; -1: dragging left/up grows it. */
  function start(e: ReactPointerEvent, axis: "x" | "y", dir: 1 | -1) {
    const el = target.current;
    if (!el || e.button !== 0) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    const base = axis === "x" ? r.width : r.height;
    const from = axis === "x" ? e.clientX : e.clientY;
    const lo = lim(min), hi = lim(max);
    const shield = document.createElement("div");
    shield.style.cssText = `position:fixed;inset:0;z-index:9999;cursor:${axis === "x" ? "col-resize" : "row-resize"}`;
    document.body.appendChild(shield);
    setDragging(true);
    setCustom(true);
    setSize(Math.round(base));
    const move = (ev: PointerEvent) => {
      const d = (axis === "x" ? ev.clientX : ev.clientY) - from;
      setSize(Math.min(hi, Math.max(lo, Math.round(base + dir * d))));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      shield.remove();
      setDragging(false);
      try {
        window.localStorage.setItem(key, String(sizeRef.current));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return { size, custom, dragging, start };
}

/** Thin desktop-only grab bar; position it with `className` on an edge of a
 *  `relative` section. Shows a primary line on hover. */
export function ResizeHandle({
  axis,
  onPointerDown,
  className,
  title = "Drag to resize",
}: {
  axis: "x" | "y";
  onPointerDown: (e: ReactPointerEvent) => void;
  className?: string;
  title?: string;
}) {
  return (
    <div
      role="separator"
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
      title={title}
      onPointerDown={onPointerDown}
      className={cn(
        "group absolute z-[5] hidden touch-none select-none lg:block",
        axis === "x" ? "top-0 h-full w-2 cursor-col-resize" : "left-0 h-2 w-full cursor-row-resize",
        className,
      )}
    >
      <div
        className={cn(
          "absolute rounded-full bg-transparent transition-colors group-hover:bg-primary/60",
          axis === "x" ? "inset-y-0 left-1/2 w-0.5 -translate-x-1/2" : "inset-x-0 top-1/2 h-0.5 -translate-y-1/2",
        )}
      />
    </div>
  );
}
