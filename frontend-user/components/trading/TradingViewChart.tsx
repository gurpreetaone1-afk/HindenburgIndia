"use client";

import { useEffect, useMemo, useRef, useState, memo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CustomDatafeed, pushLiveQuote } from "@/lib/tradingview-datafeed";
import { OrderAPI, PositionAPI, SegmentSettingsAPI } from "@/lib/api";
import { isInstrumentMarketOpen } from "@/lib/marketHours";
import { playBuyTone, playClosedTone, playSellTone } from "@/lib/trade-audio";

interface TradingViewChartProps {
  token: string;
  symbol?: string;
  interval?: string;
  theme?: "light" | "dark";
  className?: string;
  /** Live quote from the terminal's WebSocket stream. When provided, the
   *  chart's real-time bar uses this price instead of REST polling, so
   *  the chart and the order panel always show the same price. */
  quote?: { ltp?: number; bid?: number; ask?: number } | null;
  // ── Trading on the chart (optional — omit to get a plain chart) ──────
  /** Instrument row for this token (segment / exchange / tick size). */
  instrument?: any;
  /** Open positions for THIS token → entry line (display only). */
  positions?: any[];
  /** Pending orders for THIS token → draggable order lines (× cancels). */
  orders?: any[];
  /** Same raw bid / ask / ltp the Order panel gets, so the chart's BUY / SELL
   *  buttons show (and fill at) exactly the Order panel's prices. */
  bid?: number;
  ask?: number;
  ltp?: number;
}

const BUY_COLOR = "#2bca6a";
const SELL_COLOR = "#ec5d6f";
const ORDER_COLOR = "#8e7df0";
const ONE_CLICK_KEY = "setupfx.terminal.oneClick";

const isOptimistic = (x: any) =>
  !!x?._optimistic || String(x?.id ?? "").startsWith("opt");

function TradingViewChartInner({
  token,
  interval = "5",
  theme = "dark",
  className = "",
  quote,
  instrument,
  positions,
  orders,
  bid = 0,
  ask = 0,
  ltp = 0,
}: TradingViewChartProps) {
  const qc = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);
  // Latest token always available to the build effect via ref — that way the
  // build effect only depends on `theme`, and a token change never tears the
  // widget down. (See the dedicated `[token]` effect below.)
  const tokenRef = useRef(token);
  tokenRef.current = token;

  // Push incoming WebSocket quote into the datafeed's live cache so the
  // chart's subscribeBars reads the same price as the order panel.
  useEffect(() => {
    if (!token || !quote) return;
    const ltp = Number(quote.ltp ?? 0);
    const bid = Number(quote.bid ?? 0);
    const ask = Number(quote.ask ?? 0);
    if (ltp > 0 || bid > 0) {
      pushLiveQuote(token, ltp, bid, ask);
    }
  }, [token, quote?.ltp, quote?.bid, quote?.ask]);

  // ── Trading context (instrument rules, prices, one-click) ─────────────
  const trading = !!instrument;
  const seg = String(instrument?.segment ?? "").toUpperCase();
  const exch = String(instrument?.exchange ?? "").toUpperCase();
  const isCrypto = seg.includes("CRYPTO") || exch === "CRYPTO";
  const isForex = seg.includes("FOREX") || seg.includes("FX") || exch === "CDS";
  const product: "MIS" | "NRML" | "CNC" = isCrypto || isForex ? "NRML" : "MIS";
  const tick = Number(instrument?.tick_size) > 0 ? Number(instrument.tick_size) : 0.05;
  const decimals = Math.min(8, (String(tick).split(".")[1] ?? "").length || 2);
  const fmt = (n: number) => n.toFixed(decimals);
  const roundTick = (p: number) => +(Math.round(p / tick) * tick).toFixed(decimals);
  const fmtLots = (n: number) => (isCrypto || isForex ? n.toFixed(2) : String(n));

  // Same query (and cache) the Order panel uses for this token's settings.
  const { data: eff } = useQuery<any>({
    queryKey: ["segment-settings", instrument?.token, "BUY", product],
    queryFn: () => SegmentSettingsAPI.effective(instrument.token, "BUY", product),
    enabled: trading && !!instrument?.token,
    staleTime: 5_000,
  });
  // Lot rules — identical to OrderPanel: `min_lot` = min per order,
  // `order_lot` = max per order (0 = no cap), fractional minimum = step.
  const minLot = Number(eff?.min_lot ?? 1) || 1;
  const maxPerOrder = Number(eff?.order_lot ?? 0) || 0;
  const lotStep = minLot < 1 ? +minLot.toFixed(3) : 1;
  const isIndianExchange = ["NSE", "BSE", "MCX", "NFO", "BFO"].includes(exch);
  const defaultLot = isIndianExchange ? Math.max(1, minLot) : minLot;
  const [lots, setLots] = useState(defaultLot);
  useEffect(() => setLots(defaultLot), [instrument?.token, defaultLot]);

  // Broker spread on the displayed BUY / SELL — mirrors OrderPanel exactly
  // (fixed: ltp ± pips/2; floating: keep the live book unless tighter).
  const spreadPips = Number(eff?.spread_pips ?? 0) || 0;
  const spreadType = String(eff?.spread_type ?? "fixed").toLowerCase();
  let sellPx = bid;
  let buyPx = ask;
  if (spreadPips > 0 && ltp > 0) {
    const liveSpread = bid > 0 && ask > 0 ? ask - bid : 0;
    if (spreadType !== "floating" || liveSpread < spreadPips) {
      buyPx = ltp + spreadPips / 2;
      sellPx = ltp - spreadPips / 2;
    }
  }
  const marketOpen = trading
    ? isInstrumentMarketOpen(instrument?.segment, instrument?.exchange)
    : false;

  // The existing "One Click" switch (Positions header): OFF → confirm first.
  const oneClickRef = useRef(false);
  useEffect(() => {
    try {
      oneClickRef.current = window.localStorage.getItem(ONE_CLICK_KEY) === "1";
    } catch {
      /* ignore */
    }
    const onChange = (e: Event) => {
      oneClickRef.current = !!(e as CustomEvent).detail;
    };
    window.addEventListener("oneclick:change", onChange);
    return () => window.removeEventListener("oneclick:change", onChange);
  }, []);
  const confirmed = (msg: string) => oneClickRef.current || window.confirm(msg);

  // Latest values for the chart callbacks (registered once per widget).
  const live = useRef<any>({});
  live.current = {
    token, instrument, positions: (positions ?? []).filter((p) => !isOptimistic(p)),
    orders: (orders ?? []).filter((o) => !isOptimistic(o)),
    lots, buyPx, sellPx, product, marketOpen, fmt, roundTick, fmtLots, theme,
  };

  // ── Order actions ─────────────────────────────────────────────────────
  function afterTrade() {
    qc.invalidateQueries({ queryKey: ["orders"] });
    qc.invalidateQueries({ queryKey: ["wallet"] });
    setTimeout(() => qc.invalidateQueries({ queryKey: ["positions"] }), 1200);
  }

  async function placeMarket(side: "BUY" | "SELL") {
    const L = live.current;
    const sym = L.instrument?.symbol ?? "";
    if (!L.marketOpen) return toast.error("Market is closed for this instrument.");
    const px = side === "BUY" ? L.buyPx : L.sellPx;
    if (!(px > 0)) return toast.error("No live price yet — try again in a moment.");
    // No confirmation: chart BUY / SELL fire straight away (operator ask).
    if (side === "BUY") playBuyTone();
    else playSellTone();
    const tid = toast.success(`${side} ${L.fmtLots(L.lots)} ${sym} placed`, { duration: 1500 });
    try {
      await OrderAPI.place({
        token: L.instrument.token,
        action: side,
        order_type: "MARKET",
        product_type: L.product,
        lots: L.lots,
        price: 0,
        trigger_price: 0,
        validity: "DAY",
        is_amo: false,
        stop_loss: null,
        target: null,
        expected_price: px,
      });
      afterTrade();
    } catch (e: any) {
      toast.error(e?.message || "Order failed", { id: tid });
    }
  }

  /** Right-click "Buy / Sell @ price": LIMIT on the near side of the market,
   *  STOP (SL-M) beyond it — the same split the Order panel offers. */
  async function placeAt(side: "BUY" | "SELL", rawPrice: number) {
    const L = live.current;
    const sym = L.instrument?.symbol ?? "";
    const price = L.roundTick(rawPrice);
    const ref = side === "BUY" ? L.buyPx : L.sellPx;
    if (!(ref > 0)) return toast.error("No live price yet — try again in a moment.");
    const isLimit = side === "BUY" ? price <= ref : price >= ref;
    const label = isLimit ? "LIMIT" : "STOP";
    if (side === "BUY") playBuyTone();
    else playSellTone();
    try {
      await OrderAPI.place({
        token: L.instrument.token,
        action: side,
        order_type: isLimit ? "LIMIT" : "SL_M",
        product_type: L.product,
        lots: L.lots,
        price: isLimit ? price : 0,
        trigger_price: isLimit ? 0 : price,
        validity: "DAY",
        is_amo: false,
        stop_loss: null,
        target: null,
        expected_price: null,
      });
      toast.success(`${side} ${label} ${L.fmtLots(L.lots)} ${sym} @ ${L.fmt(price)} placed`);
      afterTrade();
    } catch (e: any) {
      toast.error(e?.message || "Order failed");
    }
  }

  function closePosition(p: any) {
    const L = live.current;
    if (!confirmed(`Close this ${L.instrument?.symbol ?? ""} position at market?`)) return;
    playClosedTone();
    PositionAPI.squareoff(String(p.id))
      .then(() => {
        toast.success("Position closed");
        afterTrade();
      })
      .catch((e: any) => toast.error(e?.message || "Could not close position"));
  }

  async function moveOrder(o: any, rawPrice: number) {
    const L = live.current;
    const price = L.roundTick(rawPrice);
    const stop = String(o.order_type).toUpperCase().startsWith("SL");
    try {
      await OrderAPI.modify(String(o.id), stop ? { trigger_price: price } : { price });
      toast.success(`Order moved to ${L.fmt(price)}`);
      qc.invalidateQueries({ queryKey: ["orders"] });
    } catch (e: any) {
      toast.error(e?.message || "Could not modify order");
      void syncLines();
    }
  }

  function cancelOrder(o: any) {
    if (!confirmed("Cancel this pending order?")) return;
    OrderAPI.cancel(String(o.id))
      .then(() => {
        toast.success("Order cancelled");
        qc.invalidateQueries({ queryKey: ["orders"] });
        qc.invalidateQueries({ queryKey: ["wallet"] });
      })
      .catch((e: any) => toast.error(e?.message || "Could not cancel order"));
  }

  // ── Trade lines on the chart ──────────────────────────────────────────
  // This TradingView license is "Advanced Charts": its native order /
  // position lines (createOrderLine / createPositionLine) exist only on the
  // Trading Platform and throw here. So the lines are horizontal-line
  // DRAWINGS we manage ourselves, with a text label:
  //   • entry line — display only (locked)
  //   • pending order lines — drag to change the order price
  const readyRef = useRef(false);
  const shapesRef = useRef<Map<string, { kind: "entry" | "order"; ref: any; price: number }>>(new Map());
  const ownRemovals = useRef<Set<string>>(new Set());
  const moveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const seqRef = useRef(0);

  function chartApi(): any | null {
    try {
      return widgetRef.current?.activeChart() ?? null;
    } catch {
      return null;
    }
  }

  function removeAllShapes() {
    const chart = chartApi();
    for (const eid of shapesRef.current.keys()) {
      ownRemovals.current.add(eid);
      try {
        chart?.removeEntity(eid, { disableUndo: true });
      } catch {
        /* already gone */
      }
    }
    shapesRef.current.clear();
  }

  async function syncLines() {
    if (!widgetRef.current || !readyRef.current) return;
    const seq = ++seqRef.current;
    removeAllShapes();
    const L = live.current;
    const chart = chartApi();
    if (!chart || !L.instrument) return;
    const add = async (
      price: number,
      kind: "entry" | "order",
      ref: any,
      text: string,
      color: string,
      dashed: boolean,
    ) => {
      const fixed = kind === "entry"; // entry line can't be dragged / deleted
      const eid = String(
        await chart.createShape(
          { time: Math.floor(Date.now() / 1000), price },
          {
            shape: "horizontal_line",
            text,
            lock: fixed,
            disableSelection: fixed,
            disableSave: true,
            disableUndo: true,
            showInObjectsTree: false,
            zOrder: "top",
            overrides: {
              linecolor: color,
              textcolor: color,
              linewidth: kind === "entry" ? 2 : 1,
              linestyle: dashed ? 2 : 0,
              showPrice: true,
              horzLabelsAlign: "right",
              vertLabelsAlign: "top",
              fontsize: 11,
              bold: true,
            },
          },
        ),
      );
      if (seq !== seqRef.current) {
        ownRemovals.current.add(eid);
        try {
          chart.removeEntity(eid, { disableUndo: true });
        } catch {
          /* ignore */
        }
        return false;
      }
      shapesRef.current.set(eid, { kind, ref, price });
      return true;
    };
    try {
      for (const p of L.positions) {
        const qty = Number(p.quantity) || 0;
        if (!qty) continue;
        const buy = qty > 0;
        const lotsTxt = L.fmtLots(Math.abs(Number(p.lots) || 0));
        const entryText = `${buy ? "BUY" : "SELL"} ${lotsTxt} · Entry`;
        if (!(await add(Number(p.avg_price), "entry", p, entryText, buy ? BUY_COLOR : SELL_COLOR, false))) return;
      }
      for (const o of L.orders) {
        const stop = String(o.order_type).toUpperCase().startsWith("SL");
        const level = Number(stop ? o.trigger_price : o.price);
        if (!(level > 0)) continue;
        const buy = String(o.action).toUpperCase() === "BUY";
        const text = `${buy ? "BUY" : "SELL"} ${stop ? "STOP" : "LIMIT"} ${L.fmtLots(Number(o.lots) || 0)}`;
        if (!(await add(level, "order", o, text, ORDER_COLOR, true))) return;
      }
    } catch (e) {
      console.error("Trade lines failed:", e);
    }
  }

  /** A line was dragged: act once the drag settles (debounced). */
  function onShapeMoved(eid: string) {
    const info = shapesRef.current.get(eid);
    const chart = chartApi();
    if (!info || !chart) return;
    let price = 0;
    try {
      price = Number(chart.getShapeById(eid).getPoints()[0]?.price);
    } catch {
      return;
    }
    if (!(price > 0) || Math.abs(price - info.price) < tick / 2) return;
    info.price = price;
    if (info.kind === "order") void moveOrder(info.ref, price);
    else void syncLines(); // entry is display-only — put it back
  }

  function onDrawingEvent(id: any, type: string) {
    const eid = String(id);
    if (type === "remove") {
      if (ownRemovals.current.delete(eid)) return;
      const info = shapesRef.current.get(eid);
      if (!info) return;
      shapesRef.current.delete(eid);
      // Our lines are simply drawn back if deleted (close / cancel are
      // explicit right-click actions).
      void syncLines();
      return;
    }
    if (type === "points_changed" || type === "move") {
      if (!shapesRef.current.has(eid)) return;
      clearTimeout(moveTimers.current.get(eid));
      moveTimers.current.set(eid, setTimeout(() => onShapeMoved(eid), 450));
    }
  }

  /** Right-click menu on the chart: buy / sell at that price, set the open
   *  close the open position, or cancel a pending order. */
  function registerContextMenu(w: any) {
    try {
      w.onContextMenu((_t: number, price: number) => {
        const L = live.current;
        if (!L.instrument || !(price > 0)) return [];
        const px = L.roundTick(price);
        const items: any[] = [];
        const buyRef = L.buyPx, sellRef = L.sellPx;
        items.push({
          position: "top",
          text: `Buy ${buyRef > 0 && px > buyRef ? "Stop" : "Limit"} ${L.fmtLots(L.lots)} @ ${L.fmt(px)}`,
          click: () => void placeAt("BUY", px),
        });
        items.push({
          position: "top",
          text: `Sell ${sellRef > 0 && px < sellRef ? "Stop" : "Limit"} ${L.fmtLots(L.lots)} @ ${L.fmt(px)}`,
          click: () => void placeAt("SELL", px),
        });
        const many = L.positions.length > 1;
        for (const p of L.positions) {
          const tag = many ? ` (${Number(p.quantity) > 0 ? "BUY" : "SELL"} ${p.product_type ?? ""})` : "";
          items.push({ position: "top", text: `Close position${tag}`, click: () => closePosition(p) });
        }
        for (const o of L.orders) {
          const stop = String(o.order_type).toUpperCase().startsWith("SL");
          const level = Number(stop ? o.trigger_price : o.price);
          items.push({
            position: "top",
            text: `Cancel ${String(o.action).toUpperCase()} ${stop ? "STOP" : "LIMIT"} @ ${L.fmt(level)}`,
            click: () => cancelOrder(o),
          });
        }
        items.push({ position: "top", text: "-", click: () => undefined });
        return items;
      });
    } catch {
      /* older library build without onContextMenu */
    }
  }

  const fx = useRef({ syncLines, registerContextMenu, onDrawingEvent, removeAllShapes });
  fx.current = { syncLines, registerContextMenu, onDrawingEvent, removeAllShapes };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Stable container id (no token suffix). When the user clicks a new
    // instrument we DON'T rebuild — we just call `activeChart().setSymbol()`
    // on the existing widget, so the id must stay the same across token
    // changes. Including the theme suffix is still safe because a theme
    // flip does rebuild the widget below.
    const containerId = `tv_chart_${theme}`;
    container.id = containerId;

    // Track cancellation so a fast re-render (React strict-mode double-mount,
    // theme flip) doesn't end up initialising a widget on a container that's
    // already been torn down.
    let cancelled = false;

    const loadWidget = () => {
      if (cancelled) return;
      if (!window.TradingView) {
        // Tight 25 ms poll while we wait for the script. With the layout
        // preload most cold loads land on the first iteration; we just
        // need a cheap fallback for the racy script-loaded-but-not-yet-
        // assigned-window window.
        setTimeout(loadWidget, 25);
        return;
      }
      // Verify the container is still in the DOM at the moment we hand it
      // to the widget. Without this check React's effect cleanup can have
      // already removed it, and the widget throws "no such element".
      if (!document.getElementById(containerId)) return;

      if (widgetRef.current) {
        try {
          widgetRef.current.remove();
        } catch {}
        widgetRef.current = null;
      }

      const datafeed = new CustomDatafeed();

      try {
        widgetRef.current = new window.TradingView.widget({
          // Pass the live element reference, not just the id string — even if
          // React swaps containers under us this still resolves correctly.
          container,
          datafeed,
          // Use the ref so a token change that lands between mount and the
          // moment the script finishes loading still picks the latest value.
          symbol: tokenRef.current,
          interval,
          library_path: "/charting_library/",
          locale: "en",
          fullscreen: false,
          autosize: true,
          theme: theme === "dark" ? "dark" : "light",
          timezone: "Asia/Kolkata",
          disabled_features: [
            "use_localstorage_for_settings",
            "header_symbol_search",
            "header_compare",
            "display_market_status",
            "go_to_date",
            "study_templates",
            "chart_storage",
            // Skip the default volume indicator creation — it adds another
            // study (extra getBars + render pass) on every chart init. Users
            // who want volume can add it from the Indicators dialog.
            "create_volume_indicator_by_default",
            // Avoid forcing the volume pane overlay; one less layout calc.
            "volume_force_overlay",
            // Drawing-tools rail hidden on phones — it overlaps the candles
            // on a narrow viewport (operator: "side vale tools mat dikh").
            // Full charting library needs this in disabled_features (the
            // `hide_side_toolbar` widget option is ignored here). Desktop
            // keeps the toolbar.
            ...(typeof window !== "undefined" &&
            window.matchMedia("(max-width: 1023px)").matches
              ? ["left_toolbar"]
              : []),
          ],
          enabled_features: [
            // Pulls the last-bar price label out as a tracked horizontal
            // line on the right-side scale — without this the user can't
            // see where the live price sits relative to the visible range.
            "move_logo_to_main_pane",
            // Show the timeframes toolbar (1D / 5D / 1M / 3M / 6M / YTD / 1Y)
            // along the bottom of the chart on desktop — matches what users
            // see on TradingView.com and Zerodha Kite, gives one-tap access
            // to the common range presets without going through the
            // timeframe dropdown.
            "timeframes_toolbar",
            // Show the symbol + last price legend at the top-left of the
            // chart pane. Already on by default but explicit so a future
            // disabled_features add doesn't accidentally turn it off.
            "header_widget",
            // Bottom-of-pane date scale gets the range selector buttons
            // (1D / 1W / 1M …) — same as TradingView's public chart UI.
            "header_resolutions",
          ],
          overrides: {
            "paneProperties.background": theme === "dark" ? "#131122" : "#ffffff",
            "paneProperties.backgroundType": "solid",
            "paneProperties.vertGridProperties.color": theme === "dark" ? "#1e1c30" : "#e9e9ea",
            "paneProperties.horzGridProperties.color": theme === "dark" ? "#1e1c30" : "#e9e9ea",
            "scalesProperties.backgroundColor": theme === "dark" ? "#131122" : "#ffffff",
            "scalesProperties.textColor": theme === "dark" ? "#8a86a8" : "#555",
            "scalesProperties.lineColor": theme === "dark" ? "#1e1c30" : "#e0e0e0",
            "mainSeriesProperties.candleStyle.upColor": "#2bca6a",
            "mainSeriesProperties.candleStyle.downColor": "#ec5d6f",
            "mainSeriesProperties.candleStyle.wickUpColor": "#2bca6a",
            "mainSeriesProperties.candleStyle.wickDownColor": "#ec5d6f",
            "mainSeriesProperties.candleStyle.borderUpColor": "#2bca6a",
            "mainSeriesProperties.candleStyle.borderDownColor": "#ec5d6f",
            // Horizontal price line at the last close — the key signal the
            // user lost without it ("price move dikh nahi raha"). Dashed
            // purple to match the app's accent colour so it stands apart
            // from the candle wicks.
            "mainSeriesProperties.priceLineVisible": true,
            "mainSeriesProperties.priceLineColor": "#8e7df0",
            "mainSeriesProperties.priceLineWidth": 1,
            "mainSeriesProperties.showCountdown": true,
            // High-watermark crosshair so price reads are obvious as the
            // user hovers across candles.
            "paneProperties.crossHairProperties.color": theme === "dark" ? "#8a86a8" : "#555",
            "paneProperties.crossHairProperties.style": 2,
          },
          loading_screen: {
            backgroundColor: theme === "dark" ? "#131122" : "#ffffff",
            foregroundColor: theme === "dark" ? "#8e7df0" : "#3b82f6",
          },
          custom_css_url: "",
        });

        // Once the chart is initialised, tighten the right-offset so the
        // candle stream fills the pane (default is ~10 bars of future
        // whitespace which is what was making the chart look squashed
        // to the right edge), and force a layout pass against the live
        // container size — autosize alone doesn't catch a parent that
        // grows AFTER the widget mounted.
        try {
          const w = widgetRef.current;
          w.onChartReady?.(() => {
            try {
              w.activeChart().setRightOffset(5);
            } catch {}
            // Force-fit the widget to the current container bounds the
            // moment the chart is ready. `autosize: true` watches the
            // iframe's own size, not the parent flex container — on
            // first mount the parent often grows from 0 → final size
            // AFTER the widget initialises, leaving the iframe stuck
            // at its initial (tiny) dimensions. Explicit resize here
            // kicks it into the actual layout. This is the fix for
            // "chart bahut chhota dikh raha hai" on mobile.
            try {
              const rect = container.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                w.resize?.(rect.width, rect.height);
              }
            } catch {}
            // Trading on the chart: right-click menu + position / order lines.
            if (widgetRef.current !== w) return;
            readyRef.current = true;
            fx.current.registerContextMenu(w);
            try {
              w.subscribe("drawing_event", (id: any, type: string) =>
                fx.current.onDrawingEvent(id, type),
              );
            } catch {}
            void fx.current.syncLines();
          });
        } catch {}
      } catch (err) {
        console.error("TradingView widget init error:", err);
      }
    };

    // Load the TradingView standalone script if not already loaded.
    // The terminal route layout preloads this via `next/script` so on most
    // navigations the script is already in flight (or fully loaded) by the
    // time we get here — we still keep the manual injection as a fallback
    // for direct entry / cold cache.
    // Match both src patterns Next.js can produce: the raw `/charting_…`
    // tag we inject ourselves, and any tag carrying that path (Next's
    // <Script> emits an absolute URL on some builds).
    const alreadyInjected = !!document.querySelector(
      'script[src*="charting_library.standalone.js"]',
    );
    if (window.TradingView) {
      // Script fully loaded already (via the layout preload) — skip the
      // polling round-trip entirely and init the widget on the same tick.
      loadWidget();
    } else if (alreadyInjected) {
      // Script tag exists but is still downloading — start the poll loop;
      // first iteration will catch it the moment `window.TradingView` is
      // assigned.
      loadWidget();
    } else {
      const script = document.createElement("script");
      script.src = "/charting_library/charting_library.standalone.js";
      script.async = true;
      script.onload = loadWidget;
      document.head.appendChild(script);
    }

    // TV's autosize watches the iframe size, but when the *parent flex
    // container* resizes (laptop → external monitor, panel toggle, window
    // drag across screens) the embedded iframe sometimes keeps the stale
    // dimensions until the next mouse interaction. ResizeObserver forces
    // a relayout in lockstep with the container — the actual fix for the
    // "chart har screen pe alag dikh raha hai" complaint.
    const ro = new ResizeObserver(() => {
      const w = widgetRef.current;
      if (!w) return;
      try {
        // resize(width, height) re-fits the chart to the new bounds; both
        // dimensions are read live so it works on any screen size.
        const rect = container.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          w.resize?.(rect.width, rect.height);
        }
      } catch {}
    });
    ro.observe(container);

    return () => {
      cancelled = true;
      ro.disconnect();
      readyRef.current = false;
      shapesRef.current.clear(); // drawings die with the widget
      ownRemovals.current.clear();
      moveTimers.current.forEach(clearTimeout);
      moveTimers.current.clear();
      if (widgetRef.current) {
        try {
          widgetRef.current.remove();
        } catch {}
        widgetRef.current = null;
      }
    };
    // Intentionally [theme] only: changing the token swaps the symbol on the
    // live widget (effect below) instead of tearing it down and rebuilding.
    // Recreating cost ~500 ms-1 s per click (script poll + resolveSymbol +
    // getBars + TV init) — the dominant complaint about "chart slow load".
    // Interval changes are handled by their own effect further down.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  // ── Token change: in-place symbol swap ────────────────────────────
  // When the user clicks a new instrument we keep the existing widget and
  // ask TradingView to load the new symbol — skipping the loading screen,
  // widget init, datafeed reconstruction, and ResizeObserver re-wire. Only
  // resolveSymbol + getBars happen, which is the irreducible minimum work
  // any chart needs on a token change.
  useEffect(() => {
    const w = widgetRef.current;
    if (!w || !token) return;
    try {
      w.onChartReady(() => {
        try {
          // Re-draw the trade lines once the new symbol has loaded.
          fx.current.removeAllShapes();
          w.activeChart().setSymbol(token, () => void fx.current.syncLines());
        } catch (e) {
          // setSymbol can throw if the widget was torn down mid-flight.
          console.error("TradingView setSymbol failed:", e);
        }
      });
    } catch {}
  }, [token]);

  // Handle interval changes
  useEffect(() => {
    if (widgetRef.current) {
      try {
        widgetRef.current.onChartReady(() => {
          widgetRef.current.activeChart().setResolution(interval);
        });
      } catch {}
    }
  }, [interval]);

  // Re-draw lines only when the SHAPE of positions / orders changes (new or
  // closed trade, SL/TP moved, order price changed) — not on every tick.
  const lineKey = useMemo(
    () =>
      JSON.stringify([
        token,
        (positions ?? []).filter((p) => !isOptimistic(p)).map((p) => [p.id, p.quantity, p.avg_price]),
        (orders ?? []).filter((o) => !isOptimistic(o)).map((o) => [o.id, o.price, o.trigger_price, o.lots, o.order_type, o.action]),
      ]),
    [token, positions, orders],
  );
  useEffect(() => {
    void syncLines();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineKey]);

  return (
    <div
      // `absolute inset-0` forces the container to fill its (relative)
      // parent regardless of flex / intrinsic-size quirks — that's the
      // robust fix for the "chart faat raha" symptom where TradingView's
      // iframe got stuck at its initial small bounds because the parent
      // chart wrapper was reporting 0 × 0 at widget-init time. The
      // parent in `terminal/page.tsx` is `relative` + has a definite
      // `h-[calc(100vh-13rem)]` on mobile, so this absolute child gets
      // the same definite size and TV's autosize has a real bounding
      // box to fit into. Inline style + Tailwind class both included so
      // the rule still applies if a stray utility class disables `inset`.
      style={{ position: "absolute", inset: 0 }}
      className={`block ${className}`}
    >
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />

      {/* One-click BUY / SELL on the chart (desktop; phones keep their own
          bottom bar). Same prices + lot rules as the Order panel; fires
          immediately, no confirmation. */}
      {trading && (
        <div className="pointer-events-none absolute inset-x-0 top-[42px] z-10 hidden justify-center lg:flex">
          <div className="pointer-events-auto flex items-stretch gap-1 rounded-md border border-border bg-card/90 p-0.5 shadow-sm backdrop-blur">
            <button
              type="button"
              disabled={!marketOpen}
              onClick={() => void placeMarket("SELL")}
              title={marketOpen ? "Sell at market" : "Market closed"}
              className="flex min-w-[84px] flex-col items-center justify-center rounded px-2 py-0.5 leading-tight text-white disabled:opacity-40"
              style={{ background: SELL_COLOR }}
            >
              <span className="text-[9px] font-bold tracking-wider">SELL</span>
              <span className="font-tabular text-[12px] font-semibold">{sellPx > 0 ? fmt(sellPx) : "—"}</span>
            </button>
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => setLots((x) => +Math.max(minLot, x - lotStep).toFixed(3))}
                className="h-full w-6 text-sm text-muted-foreground hover:text-foreground"
                aria-label="Decrease lots"
              >
                −
              </button>
              <span className="min-w-[38px] text-center font-tabular text-[12px] font-semibold text-foreground" title="Lots">
                {fmtLots(lots)}
              </span>
              <button
                type="button"
                onClick={() =>
                  setLots((x) => {
                    const v = +(x + lotStep).toFixed(3);
                    return maxPerOrder > 0 ? Math.min(maxPerOrder, v) : v;
                  })
                }
                className="h-full w-6 text-sm text-muted-foreground hover:text-foreground"
                aria-label="Increase lots"
              >
                +
              </button>
            </div>
            <button
              type="button"
              disabled={!marketOpen}
              onClick={() => void placeMarket("BUY")}
              title={marketOpen ? "Buy at market" : "Market closed"}
              className="flex min-w-[84px] flex-col items-center justify-center rounded px-2 py-0.5 leading-tight text-white disabled:opacity-40"
              style={{ background: BUY_COLOR }}
            >
              <span className="text-[9px] font-bold tracking-wider">BUY</span>
              <span className="font-tabular text-[12px] font-semibold">{buyPx > 0 ? fmt(buyPx) : "—"}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Add TradingView type declaration
declare global {
  interface Window {
    TradingView: any;
  }
}

export const TradingViewChart = memo(TradingViewChartInner);
