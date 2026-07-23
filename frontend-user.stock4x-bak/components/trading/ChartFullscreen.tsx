"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

/**
 * Browser Fullscreen-API toggle shared by BOTH chart renderers — the free
 * TradingView Advanced Chart widget (Infoway forex/crypto/metals/energy/
 * indices) and the licensed charting library (Zerodha segments + Bybit crypto
 * options). One hook + one button so the fullscreen control looks and behaves
 * identically no matter which chart is on screen. Tracks `fullscreenchange`
 * so the icon stays correct even when the user exits with Esc.
 */
export function useChartFullscreen(targetRef: RefObject<HTMLElement>) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () =>
      setIsFullscreen(document.fullscreenElement === targetRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [targetRef]);

  const toggle = useCallback(() => {
    const el = targetRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen?.();
    } else {
      void el.requestFullscreen?.();
    }
  }, [targetRef]);

  return { isFullscreen, toggle };
}

export function ChartFullscreenButton({
  isFullscreen,
  onToggle,
}: {
  isFullscreen: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
      aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
      className="absolute right-2 top-2 z-20 flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-black/60 text-gray-300 backdrop-blur transition-colors hover:bg-black/80 hover:text-white"
    >
      {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
    </button>
  );
}
