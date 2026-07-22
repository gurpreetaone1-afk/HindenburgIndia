"use client";

import { memo, useEffect, useRef } from "react";
import {
  ChartFullscreenButton,
  useChartFullscreen,
} from "@/components/trading/ChartFullscreen";

interface Props {
  /** TradingView symbol, e.g. "FX:EURUSD", "BINANCE:BTCUSDT", "OANDA:XAUUSD". */
  symbol: string;
  /** "1" | "5" | "15" | "60" | "1D" … (terminal format). Normalised below. */
  interval?: string;
  theme?: "light" | "dark";
  className?: string;
}

// Terminal interval → TradingView widget interval.
function tvInterval(i: string): string {
  const m: Record<string, string> = {
    "1": "1", "3": "3", "5": "5", "15": "15", "30": "30",
    "60": "60", "120": "120", "240": "240",
    "1D": "D", D: "D", "1W": "W", W: "W", "1M": "M",
  };
  return m[i] ?? "5";
}

/**
 * TradingView free **Advanced Chart** widget — renders TradingView's own
 * data feed (not the platform's), so Infoway forex / crypto / metals /
 * energy / indices charts are clean with no feed gaps. Self-contained: it
 * injects the official embed script with a JSON config and re-creates on
 * symbol / interval / theme change. The widget keeps TradingView's
 * attribution as required by their free-widget terms.
 *
 * The free embed has no native fullscreen control, so we add our own toggle
 * (top-right overlay, shared with the licensed chart) that drives the browser
 * Fullscreen API on the wrapper — the autosize widget fills whatever box it's
 * in, including the viewport.
 */
function AdvancedWidget({ symbol, interval = "5", theme = "dark", className = "" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { isFullscreen, toggle } = useChartFullscreen(wrapRef);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    // Fresh container each render so the script re-initialises cleanly.
    host.innerHTML =
      '<div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>';
    const script = document.createElement("script");
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.type = "text/javascript";
    script.innerHTML = JSON.stringify({
      symbol,
      interval: tvInterval(interval),
      theme,
      style: "1", // candles
      locale: "en",
      timezone: "Asia/Kolkata",
      autosize: true,
      hide_side_toolbar: false,
      allow_symbol_change: false,
      save_image: false,
      withdateranges: true,
      details: false,
      calendar: false,
      support_host: "https://www.tradingview.com",
    });
    host.appendChild(script);
    return () => {
      host.innerHTML = "";
    };
  }, [symbol, interval, theme]);

  return (
    <div
      ref={wrapRef}
      className={`relative ${className}`}
      style={{
        height: "100%",
        width: "100%",
        background: theme === "dark" ? "#0a0a0a" : "#ffffff",
      }}
    >
      <ChartFullscreenButton isFullscreen={isFullscreen} onToggle={toggle} />
      <div
        className="tradingview-widget-container"
        ref={ref}
        style={{ height: "100%", width: "100%" }}
      />
    </div>
  );
}

export const TradingViewAdvancedWidget = memo(AdvancedWidget);
