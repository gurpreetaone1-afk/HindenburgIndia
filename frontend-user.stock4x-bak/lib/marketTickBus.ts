/**
 * Shared market-data WebSocket connection.
 *
 * Why a singleton: previously every consumer that wanted live ticks
 * (`useMarketStream` for the order panel / positions / marketwatch /
 * option chain, plus the TradingView chart's `subscribeBars` poller)
 * either opened its own WebSocket OR fell back to HTTP polling. With
 * 4-5 panels and an open chart that meant 5 separate WS connections
 * per tab, plus the chart still HTTP-polling every 1 s on top.
 *
 * The bus collapses all of that to ONE WS per browser tab. Components
 * call `marketTickBus.subscribe(tokens, cb)` and get an unsubscribe
 * function back; the bus refcounts per-token listeners and only sends
 * an `unsubscribe` upstream when the LAST listener for a token is
 * gone. The WS itself stays open as long as any token has a listener,
 * and idles out 30 s after the last one detaches.
 *
 * Sticky merge: a tick that arrives without one of its core fields
 * (bid / ask / ltp = 0 or null — happens during the millisecond
 * between a depth refresh and a trade) is merged into the previous
 * tick so consumers never see a one-frame zero. This is the same
 * behaviour the old `useMarketStream` had inline; centralising it in
 * the bus means the chart gets it too.
 *
 * Latest-snapshot replay: when a new consumer subscribes to a token
 * that the bus has already seen, the bus immediately replays the last
 * sticky quote so the consumer paints something on the very first
 * frame instead of waiting up to 1 s for the next upstream tick.
 */

import { WS_URL } from "@/lib/constants";

export type MarketQuote = {
  token: string;
  ltp?: number;
  bid?: number;
  ask?: number;
  change?: number;
  change_pct?: number;
  [key: string]: any;
};

type Listener = (quote: MarketQuote) => void;

function isPositive(x: any): boolean {
  const n = Number(x);
  return Number.isFinite(n) && n > 0;
}

function mergeSticky(prev: MarketQuote | undefined, next: MarketQuote): MarketQuote {
  const merged: MarketQuote = { ...(prev ?? {}), ...next };
  if (!isPositive(next.bid) && isPositive(prev?.bid)) merged.bid = prev!.bid;
  if (!isPositive(next.ask) && isPositive(prev?.ask)) merged.ask = prev!.ask;
  if (!isPositive(next.ltp) && isPositive(prev?.ltp)) merged.ltp = prev!.ltp;
  return merged;
}

class MarketTickBus {
  private ws: WebSocket | null = null;
  private connectAttempt = 0;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private idleCloseTimer: ReturnType<typeof setTimeout> | null = null;

  /** token → set of listener callbacks. */
  private listeners: Map<string, Set<Listener>> = new Map();

  /** token → latest sticky quote (replayed to new subscribers). */
  private sticky: Map<string, MarketQuote> = new Map();

  /**
   * Subscribe to live ticks for the given tokens. Returns an unsubscribe
   * function; call it when the consumer goes away. Safe to call with the
   * same tokens from multiple consumers — refcounted internally.
   */
  subscribe(tokens: string[], cb: Listener): () => void {
    const tokenList = Array.from(new Set(tokens.filter(Boolean).map(String)));
    const newToBus: string[] = [];

    for (const tok of tokenList) {
      let set = this.listeners.get(tok);
      if (!set) {
        set = new Set();
        this.listeners.set(tok, set);
        newToBus.push(tok);
      }
      set.add(cb);
      // Replay latest tick so a brand-new consumer paints immediately.
      const last = this.sticky.get(tok);
      if (last) {
        try {
          cb(last);
        } catch {
          /* consumer error — don't propagate */
        }
      }
    }

    if (newToBus.length > 0) this.sendSubscribe(newToBus);
    this.ensureConnection();

    let unsubscribed = false;
    return () => {
      if (unsubscribed) return;
      unsubscribed = true;
      const goneFromBus: string[] = [];
      for (const tok of tokenList) {
        const set = this.listeners.get(tok);
        if (!set) continue;
        set.delete(cb);
        if (set.size === 0) {
          this.listeners.delete(tok);
          goneFromBus.push(tok);
        }
      }
      if (goneFromBus.length > 0) this.sendUnsubscribe(goneFromBus);
      this.scheduleIdleClose();
    };
  }

  /** Last known quote for a token, or undefined if none received yet. */
  getLast(token: string): MarketQuote | undefined {
    return this.sticky.get(String(token));
  }

  // ── Connection management ──────────────────────────────────────────

  private ensureConnection() {
    if (this.idleCloseTimer) {
      clearTimeout(this.idleCloseTimer);
      this.idleCloseTimer = null;
    }
    if (this.ws) {
      const state = this.ws.readyState;
      if (state === WebSocket.OPEN || state === WebSocket.CONNECTING) return;
    }
    this.connect();
  }

  private connect() {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    if (typeof window === "undefined") return;

    const url = `${WS_URL.replace(/\/$/, "")}/ws/marketdata`;
    // eslint-disable-next-line no-console
    console.info("[market-bus] connecting", url);
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[market-bus] construct failed", err);
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.connectAttempt = 0;
      // Re-send the full live subscription set (covers reconnect after a
      // network blip — the backend forgot us, we have to re-establish).
      const all = Array.from(this.listeners.keys());
      if (all.length > 0) {
        try {
          ws.send(JSON.stringify({ type: "subscribe", tokens: all }));
        } catch {
          /* will retry on next reconnect */
        }
      }
    };

    ws.onmessage = (ev) => {
      let msg: any;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if ((msg?.type === "tick" || msg?.type === "snapshot") && Array.isArray(msg.payload)) {
        for (const q of msg.payload) {
          const tok = String(q?.token ?? q?.symbol ?? "");
          if (!tok) continue;
          const merged = mergeSticky(this.sticky.get(tok), { ...q, token: tok });
          this.sticky.set(tok, merged);
          const set = this.listeners.get(tok);
          if (!set || set.size === 0) continue;
          for (const cb of set) {
            try {
              cb(merged);
            } catch {
              /* consumer error — keep delivering to others */
            }
          }
        }
      }
    };

    ws.onclose = (ev) => {
      this.ws = null;
      // Reconnect only if we still have something to listen for. If
      // every consumer has unsubscribed by the time the close fires,
      // let the connection stay closed until the next subscribe.
      if (this.listeners.size === 0) return;
      // eslint-disable-next-line no-console
      console.warn("[market-bus] closed", { code: ev.code, reason: ev.reason });
      this.scheduleReconnect();
    };

    ws.onerror = (ev) => {
      // eslint-disable-next-line no-console
      console.error("[market-bus] error", ev);
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    };
  }

  private scheduleReconnect() {
    this.connectAttempt += 1;
    const delay = Math.min(15_000, 1_000 * 2 ** Math.min(this.connectAttempt, 4));
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.connectTimer = setTimeout(() => this.connect(), delay);
  }

  private sendSubscribe(tokens: string[]) {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify({ type: "subscribe", tokens }));
    } catch {
      /* the next reconnect will re-send the full set */
    }
  }

  private sendUnsubscribe(tokens: string[]) {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify({ type: "unsubscribe", tokens }));
    } catch {
      /* ignore */
    }
  }

  /**
   * After the last consumer unsubscribes, hold the WS open for 30 s in
   * case another component subscribes shortly after (very common during
   * page navigation — the source page tears down its hooks ~100 ms
   * before the destination page's hooks attach). This avoids a churn
   * of close + reconnect on every page nav.
   */
  private scheduleIdleClose() {
    if (this.listeners.size > 0) return;
    if (this.idleCloseTimer) clearTimeout(this.idleCloseTimer);
    this.idleCloseTimer = setTimeout(() => {
      this.idleCloseTimer = null;
      if (this.listeners.size > 0) return;
      try {
        this.ws?.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }, 30_000);
  }
}

export const marketTickBus = new MarketTickBus();
