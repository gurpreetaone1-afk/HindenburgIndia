"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getAccessToken } from "@/lib/api";
import { WS_URL } from "@/lib/constants";

/**
 * Per-CONSUMER cap on live token subscriptions (unchanged behaviour: a panel
 * asking for more streams its first 70 and toasts once).
 */
const MAX_SUBSCRIPTIONS = 70;
/**
 * Whole-tab cap — the union of every panel's tokens on the ONE shared socket.
 * Mirrors the backend `WS_MAX_SUBSCRIPTIONS_PER_CONN`.
 */
const MAX_SOCKET_TOKENS = 250;
/** Keep the socket this long after the last panel unmounts, so moving
 *  between pages re-uses it instead of reconnecting. */
const LINGER_MS = 15_000;

export type MarketQuote = {
  token: string;
  ltp?: number;
  bid?: number;
  ask?: number;
  change?: number;
  change_pct?: number;
  [key: string]: any;
};

/**
 * Display refresh is coalesced per panel to ~100 ms. The WS itself still
 * receives every upstream tick, so data freshness is preserved.
 */
const DISPLAY_THROTTLE_MS = 100;

// Heartbeat: send a ping this often. The server replies {type:"pong"},
// which also resets the staleness watchdog below.
const HEARTBEAT_MS = 15_000;
// If no inbound message arrives within this window the socket is treated
// as a zombie — iOS Safari PWAs keep a connection in readyState OPEN
// after a suspend while it silently stops delivering data. Force-close +
// reconnect instead of trusting it.
const STALE_TIMEOUT_MS = 35_000;

// ── One shared /ws/marketdata socket per browser tab ────────────────────
// Every panel used to open its own socket on mount and close it on unmount
// (~920 connects per 5 min across users), and each socket costs the backend
// an auth + spread lookup, a snapshot per subscribe and a 5 s snapshot pump.
// Now all panels share one socket: tokens are ref-counted (subscribed while
// any panel wants them) and ticks are fanned out to the panels that asked.

type Listener = (tokens: string[]) => void;

const S = {
  ws: null as WebSocket | null,
  refs: new Map<string, number>(), // token → number of panels wanting it
  sent: new Set<string>(), // tokens subscribed on the current socket
  sticky: new Map<string, MarketQuote>(), // last good quote per token
  listeners: new Set<Listener>(),
  consumers: 0,
  attempt: 0,
  lastMsgAt: 0,
  reconnectTimer: null as ReturnType<typeof setTimeout> | null,
  heartbeatTimer: null as ReturnType<typeof setInterval> | null,
  lingerTimer: null as ReturnType<typeof setTimeout> | null,
  windowHooked: false,
};

function isPositive(x: any): boolean {
  const n = Number(x);
  return Number.isFinite(n) && n > 0;
}

/**
 * Sticky merge: if bid / ask / ltp arrives as 0 / null / NaN keep the previous
 * non-zero value (illiquid options legitimately skip a side for one tick; the
 * position P&L used to jump to LTP-based for that tick and snap back).
 */
function mergeSticky(prev: MarketQuote | undefined, next: MarketQuote): MarketQuote {
  const merged: MarketQuote = { ...(prev ?? {}), ...next };
  if (!isPositive(next.bid) && isPositive(prev?.bid)) merged.bid = prev!.bid;
  if (!isPositive(next.ask) && isPositive(prev?.ask)) merged.ask = prev!.ask;
  if (!isPositive(next.ltp) && isPositive(prev?.ltp)) merged.ltp = prev!.ltp;
  return merged;
}

function send(msg: object): boolean {
  const ws = S.ws;
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  try {
    ws.send(JSON.stringify(msg));
    return true;
  } catch {
    return false;
  }
}

let syncQueued = false;
/** Coalesce: a panel that unmounts + remounts in the same render (list rows
 *  re-keyed on refresh) nets to zero and sends nothing, instead of an
 *  unsubscribe + subscribe pair that makes the server rebuild snapshots. */
function scheduleSync() {
  if (syncQueued) return;
  syncQueued = true;
  setTimeout(() => {
    syncQueued = false;
    syncSubscriptions();
  }, 0);
}

/** Bring the socket's subscription set in line with the ref-counted union. */
function syncSubscriptions() {
  const desired = new Set<string>();
  for (const tok of S.refs.keys()) {
    if (desired.size >= MAX_SOCKET_TOKENS) break;
    desired.add(tok);
  }
  if (desired.size > 0) ensureOpen();
  if (!S.ws || S.ws.readyState !== WebSocket.OPEN) return; // onopen re-syncs
  const toRemove = [...S.sent].filter((t) => !desired.has(t));
  const toAdd = [...desired].filter((t) => !S.sent.has(t));
  // Unsubscribe first so the freed slots count before the new batch.
  if (toRemove.length && send({ type: "unsubscribe", tokens: toRemove })) {
    for (const t of toRemove) {
      S.sent.delete(t);
      S.sticky.delete(t); // no longer streaming → its cached quote goes stale
    }
  }
  if (toAdd.length && send({ type: "subscribe", tokens: toAdd })) {
    for (const t of toAdd) S.sent.add(t);
  }
}

function stopHeartbeat() {
  if (S.heartbeatTimer) {
    clearInterval(S.heartbeatTimer);
    S.heartbeatTimer = null;
  }
}

function startHeartbeat() {
  stopHeartbeat();
  S.lastMsgAt = Date.now();
  S.heartbeatTimer = setInterval(() => {
    const ws = S.ws;
    if (!ws) return;
    if (Date.now() - S.lastMsgAt > STALE_TIMEOUT_MS) {
      try {
        ws.close(); // onclose schedules the reconnect
      } catch {
        /* noop */
      }
      return;
    }
    send({ type: "ping" });
  }, HEARTBEAT_MS);
}

function applyTicks(snaps: any[]) {
  const changed: string[] = [];
  for (const q of snaps) {
    const tok = String(q?.token ?? "");
    if (!tok) continue;
    S.sticky.set(tok, mergeSticky(S.sticky.get(tok), q as MarketQuote));
    changed.push(tok);
  }
  if (changed.length) for (const l of S.listeners) l(changed);
}

function connect() {
  if (S.reconnectTimer) {
    clearTimeout(S.reconnectTimer);
    S.reconnectTimer = null;
  }
  // iOS Safari PWA: close any existing socket before opening a new one
  // to avoid leaking a frozen connection after the app was backgrounded.
  const old = S.ws;
  S.ws = null;
  if (old) {
    old.onclose = null;
    try {
      old.close();
    } catch {
      /* noop */
    }
  }
  S.sent.clear();
  const base = `${WS_URL.replace(/\/$/, "")}/ws/marketdata`;
  const jwt = getAccessToken();
  const url = jwt ? `${base}?token=${encodeURIComponent(jwt)}` : base;
  // eslint-disable-next-line no-console
  console.info("[market-ws] connecting", base);
  const ws = new WebSocket(url);
  S.ws = ws;

  ws.onopen = () => {
    S.attempt = 0;
    startHeartbeat();
    S.sent.clear();
    syncSubscriptions();
  };

  ws.onmessage = (ev) => {
    S.lastMsgAt = Date.now();
    let msg: any;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    if ((msg?.type === "tick" || msg?.type === "snapshot") && Array.isArray(msg.payload)) {
      applyTicks(msg.payload);
    } else if (msg?.type === "error" && msg?.code === "subscription_limit") {
      toast.error(
        msg.message ||
          `Subscription limit reached (${MAX_SOCKET_TOKENS}). Close some panels or remove symbols from your watchlist.`,
        { duration: 5000 },
      );
    }
  };

  ws.onclose = (ev) => {
    if (S.ws !== ws) return; // superseded by a newer socket
    stopHeartbeat();
    S.ws = null;
    S.sent.clear();
    if (S.consumers === 0) return; // nobody listening — stay closed
    S.attempt += 1;
    const delay = Math.min(15_000, 1_000 * 2 ** Math.min(S.attempt, 4));
    // eslint-disable-next-line no-console
    console.warn("[market-ws] closed", { code: ev.code, reason: ev.reason, retryInMs: delay });
    S.reconnectTimer = setTimeout(connect, delay);
  };

  ws.onerror = (ev) => {
    // eslint-disable-next-line no-console
    console.error("[market-ws] error", ev);
    try {
      ws.close();
    } catch {
      /* noop */
    }
  };
}

function ensureOpen() {
  if (S.ws || S.reconnectTimer) return; // open / connecting / waiting to retry
  connect();
}

function hookWindowOnce() {
  if (S.windowHooked || typeof window === "undefined") return;
  S.windowHooked = true;
  // iOS Safari PWA suspends sockets when backgrounded / locked: reconnect, or
  // re-subscribe (fresh snapshot) when coming back.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || S.consumers === 0) return;
    const ws = S.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      S.attempt = 0;
      connect();
      return;
    }
    const list = [...S.sent];
    if (list.length && !(send({ type: "unsubscribe", tokens: list }) && send({ type: "subscribe", tokens: list }))) {
      connect();
    }
  });
  window.addEventListener("online", () => {
    if (S.consumers === 0) return;
    S.attempt = 0;
    connect();
  });
}

function acquireConsumer() {
  hookWindowOnce();
  S.consumers += 1;
  if (S.lingerTimer) {
    clearTimeout(S.lingerTimer);
    S.lingerTimer = null;
  }
}

function releaseConsumer(tokens: Iterable<string>) {
  for (const t of tokens) {
    const n = (S.refs.get(t) ?? 0) - 1;
    if (n > 0) S.refs.set(t, n);
    else S.refs.delete(t);
  }
  S.consumers = Math.max(0, S.consumers - 1);
  scheduleSync();
  if (S.consumers === 0 && !S.lingerTimer) {
    S.lingerTimer = setTimeout(() => {
      S.lingerTimer = null;
      if (S.consumers > 0) return;
      if (S.reconnectTimer) {
        clearTimeout(S.reconnectTimer);
        S.reconnectTimer = null;
      }
      stopHeartbeat();
      const ws = S.ws;
      S.ws = null;
      S.sent.clear();
      S.sticky.clear(); // don't paint minutes-old prices on the next mount
      if (ws) {
        ws.onclose = null;
        try {
          ws.close();
        } catch {
          /* noop */
        }
      }
    }, LINGER_MS);
  }
}

/**
 * Live market-data stream for the given tokens. Returns a `{token → quote}`
 * map that updates as ticks arrive (throttled to ~100 ms per panel). All
 * panels in the tab share one auto-reconnecting `/ws/marketdata` socket.
 */
export function useMarketStream(tokens: string[]): Map<string, MarketQuote> {
  const [quotes, setQuotes] = useState<Map<string, MarketQuote>>(new Map());
  const mineRef = useRef<Set<string>>(new Set());
  // Last requested-list length we saw, so we only toast on the EDGE.
  const lastRequestedLenRef = useRef(0);
  const tokensKey = tokens.join(",");

  // Register this panel with the shared socket for its lifetime.
  useEffect(() => {
    const dirty = new Set<string>();
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      flushTimer = null;
      if (dirty.size === 0) return;
      const drained = [...dirty];
      dirty.clear();
      setQuotes((prev) => {
        const next = new Map(prev);
        for (const tok of drained) {
          const q = S.sticky.get(tok);
          if (q) next.set(tok, q);
        }
        return next;
      });
    };
    const listener: Listener = (changed) => {
      for (const tok of changed) if (mineRef.current.has(tok)) dirty.add(tok);
      if (dirty.size && flushTimer === null) flushTimer = setTimeout(flush, DISPLAY_THROTTLE_MS);
    };
    acquireConsumer();
    S.listeners.add(listener);
    return () => {
      S.listeners.delete(listener);
      if (flushTimer) clearTimeout(flushTimer);
      const mine = mineRef.current;
      mineRef.current = new Set();
      releaseConsumer(mine);
    };
  }, []);

  // Diff this panel's tokens into the shared ref-counts whenever they change.
  useEffect(() => {
    const requested = tokens.filter(Boolean);
    const trimmed = requested.slice(0, MAX_SUBSCRIPTIONS);
    const droppedCount = requested.length - trimmed.length;
    if (droppedCount > 0 && requested.length > lastRequestedLenRef.current) {
      toast.error(
        `Subscription limit reached (${MAX_SUBSCRIPTIONS}). ${droppedCount} symbol${droppedCount > 1 ? "s" : ""} will not stream — remove some from your watchlist to add new ones.`,
        { duration: 5000 },
      );
    }
    lastRequestedLenRef.current = requested.length;

    const next = new Set(trimmed);
    const prev = mineRef.current;
    for (const t of next) if (!prev.has(t)) S.refs.set(t, (S.refs.get(t) ?? 0) + 1);
    for (const t of prev) {
      if (next.has(t)) continue;
      const n = (S.refs.get(t) ?? 0) - 1;
      if (n > 0) S.refs.set(t, n);
      else S.refs.delete(t);
    }
    mineRef.current = next;

    // A token another panel is streaming RIGHT NOW paints immediately from
    // the shared cache instead of waiting for the next tick / snapshot.
    const cached = [...next].filter((t) => !prev.has(t) && S.sent.has(t) && S.sticky.has(t));
    if (cached.length) {
      setQuotes((prevMap) => {
        const m = new Map(prevMap);
        for (const t of cached) m.set(t, S.sticky.get(t)!);
        return m;
      });
    }
    scheduleSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokensKey]);

  return quotes;
}
