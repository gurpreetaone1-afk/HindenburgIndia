/**
 * Custom TradingView datafeed adapter.
 *
 * Price source rules (so the chart and the order panel never disagree):
 *  - Crypto  → Binance klines for history, live quote bid/ask mid for the
 *              streaming bar. AllTick (the quote feed) mirrors Binance
 *              closely, so historical Binance bars line up with the live
 *              bid/ask the order panel shows.
 *  - Non-crypto → backend `InstrumentAPI.history` for history, live quote
 *              bid/ask mid for the streaming bar.
 *  - In both modes the streaming bar uses (bid + ask) / 2 from the same
 *    quote endpoint the OrderPanel consumes — so the chart's last candle
 *    always sits between the SELL and BUY prices.
 */
import { InstrumentAPI } from "./api";
import { marketTickBus, type MarketQuote } from "./marketTickBus";

/* ── Resolution mapping ──────────────────────────────────────────── */
const RESOLUTION_MAP: Record<string, string> = {
  "1": "minute",
  "3": "3minute",
  "5": "5minute",
  "15": "15minute",
  "30": "30minute",
  "60": "60minute",
  "1D": "day",
  "1W": "day",
  "1M": "day",
};

const DAYS_FOR_RESOLUTION: Record<string, number> = {
  "1": 2,
  "3": 5,
  "5": 5,
  "15": 15,
  "30": 30,
  "60": 60,
  "1D": 365,
  "1W": 365,
  "1M": 365,
};

const RESOLUTION_TO_BINANCE: Record<string, string> = {
  "1": "1m",
  "3": "3m",
  "5": "5m",
  "15": "15m",
  "30": "30m",
  "60": "1h",
  "240": "4h",
  "1D": "1d",
  "1W": "1w",
  "1M": "1M",
};

const RESOLUTION_TO_SECONDS: Record<string, number> = {
  "1": 60,
  "3": 180,
  "5": 300,
  "15": 900,
  "30": 1800,
  "60": 3600,
  "240": 14400,
  "1D": 86400,
  "1W": 604800,
  "1M": 2592000,
};

/* ── Crypto detection ───────────────────────────────────────────────
 * The chart receives the instrument's `token` as its symbol. For our
 * crypto instruments that token IS the Binance pair (BTCUSDT, ETHUSDT
 * etc.), so we can hand it straight to /api/v3/klines.
 */
const KNOWN_BINANCE_PAIRS = new Set([
  "BTCUSDT", "ETHUSDT", "LTCUSDT", "XRPUSDT", "SOLUSDT",
  "BNBUSDT", "DOGEUSDT", "ADAUSDT", "TRXUSDT", "LINKUSDT",
  "DOTUSDT", "AVAXUSDT", "MATICUSDT", "ATOMUSDT", "NEARUSDT",
  "ARBUSDT", "OPUSDT", "APTUSDT", "SUIUSDT", "PEPEUSDT",
  "SHIBUSDT", "BCHUSDT", "FILUSDT", "TONUSDT", "INJUSDT",
]);

function isCryptoSymbol(token: string, meta?: SymbolMeta): boolean {
  const t = (token || "").toUpperCase();
  if (KNOWN_BINANCE_PAIRS.has(t)) return true;
  const seg = (meta as any)?.segment?.toString().toUpperCase() ?? "";
  const exch = meta?.exchange?.toUpperCase() ?? "";
  // Metals (XAU/XAG/XPT/XPD), energy (USOIL/UKOIL/NATGAS) and most forex
  // pairs end in USD but are NOT crypto — Binance doesn't serve them and
  // the fetch fails with a CORS-y 400. Exclude these explicitly so the
  // chart falls through to the backend history endpoint instead.
  if (/^(XAU|XAG|XPT|XPD)/.test(t)) return false;
  if (/^(USOIL|UKOIL|NATGAS|BRENT|XBR|XTI|XNG)/.test(t)) return false;
  if (seg.includes("FOREX") || seg.includes("COMMODITIES") || seg.includes("ENERGY")) return false;
  if (t.endsWith("USDT")) return true;
  return seg.includes("CRYPTO") || exch === "CRYPTO" || exch === "BINANCE";
}

/** Forex, metals, energy, commodities — trade extended / nearly 24h sessions. */
function isExtendedHoursSymbol(token: string, meta?: SymbolMeta): boolean {
  const t = (token || "").toUpperCase();
  if (/^(XAU|XAG|XPT|XPD)/.test(t)) return true;
  if (/^(USOIL|UKOIL|NATGAS|BRENT|XBR|XTI|XNG)/.test(t)) return true;
  const seg = (meta as any)?.segment?.toString().toUpperCase() ?? "";
  if (seg.includes("FOREX") || seg.includes("COMMODITIES") || seg.includes("ENERGY")) return true;
  // Common forex pairs
  if (/USD|EUR|GBP|JPY|AUD|NZD|CAD|CHF/.test(t) && t.length <= 8 && !t.endsWith("USDT")) return true;
  return false;
}

/** Indian commodity exchanges (MCX / NCDEX) trade IST but with a much
 * wider session than NSE equity. Without this, a GOLD/CRUDE/SILVER
 * future renders a blank gap between yesterday's 15:30 and today's
 * 09:30 because TradingView thinks the market closes at 15:30 (NSE
 * equity hours) when in reality MCX runs until 23:30.
 */
function isMCXSymbol(_token: string, meta?: SymbolMeta): boolean {
  const exch = meta?.exchange?.toUpperCase() ?? "";
  const seg = (meta as any)?.segment?.toString().toUpperCase() ?? "";
  if (exch === "MCX" || exch === "NCDEX") return true;
  // Zerodha sometimes returns "MCX" inside a longer segment string
  // (e.g. "MCX_FUT", "MCX_OPT"). Match on prefix to be safe.
  if (seg.startsWith("MCX") || seg.startsWith("NCDEX")) return true;
  return false;
}

/**
 * Map the Instrument doc's `exchange` field to a user-facing label
 * for the TradingView legend badge.
 *
 * Backend stores the data-provider name in `exchange` for the symbols
 * we mirror through Infoway or Zerodha (eg. crypto / forex / spot
 * metals come through as "INFOWAY"). That vendor name leaks into the
 * chart's top-left legend pill as a colored badge — which the user
 * doesn't want their traders to see. Real exchange names (NSE / BSE /
 * MCX / NFO / BFO / NCDEX) pass through unchanged.
 *
 * Replacement strategy when we see a vendor name:
 *   • Crypto pairs (BTCUSDT / ETHUSDT / *USDT / *USDC / known crypto
 *     bases ending in USD)   → "CRYPTO"
 *   • Spot metals (XAU / XAG / XPT / XPD)            → "METALS"
 *   • Energy (USOIL / UKOIL / NATGAS)                → "ENERGY"
 *   • Indices (SPX500 / NAS100 / US30 / DE40 etc)    → "INDEX"
 *   • Forex pairs (6-letter alpha, common bases)     → "FOREX"
 *   • Fallback                                       → "MARKET"
 */
function friendlyExchange(
  exchange: string | null | undefined,
  segment?: string | null,
  token?: string | null,
  inst?: any,
): string {
  const raw = (exchange || "").trim();
  const up = raw.toUpperCase();
  // Real exchange names pass through. Common Indian exchange codes
  // first, then anything else that ISN'T a known vendor name.
  if (
    up === "NSE" ||
    up === "BSE" ||
    up === "NFO" ||
    up === "BFO" ||
    up === "MCX" ||
    up === "NCDEX" ||
    up === "CDS" ||
    up === "BCD"
  ) {
    return up;
  }
  if (up && up !== "INFOWAY" && up !== "ZERODHA" && up !== "ALLTICK") {
    return raw;
  }

  // We have a vendor name (or empty) — derive a friendly label.
  const seg = (segment || (inst as any)?.segment || "").toString().toUpperCase();
  const tok = (token || "").toString().toUpperCase();

  if (seg.includes("CRYPTO") || isCryptoSymbol(tok, inst as any)) return "CRYPTO";
  if (seg.includes("FOREX") || seg.includes("FX")) return "FOREX";
  if (seg.includes("METAL") || /^X(AU|AG|PT|PD)/.test(tok)) return "METALS";
  if (
    seg.includes("ENERGY") ||
    tok === "USOIL" ||
    tok === "UKOIL" ||
    tok === "NATGAS"
  ) {
    return "ENERGY";
  }
  if (
    seg.includes("INDEX") ||
    seg.includes("INDICES") ||
    /^(SPX|NAS|US30|UK100|DE40|GER40|JPN225|HK50|FRA40|AUS200|EU50)/.test(tok)
  ) {
    return "INDEX";
  }
  // Six-letter alpha tokens are almost always forex pairs (EURUSD,
  // USDJPY, GBPUSD, USDINR, …)
  if (/^[A-Z]{6}$/.test(tok)) return "FOREX";
  return "MARKET";
}

function toBinancePair(token: string): string {
  const t = (token || "").toUpperCase();
  if (KNOWN_BINANCE_PAIRS.has(t)) return t;
  // BTCUSD → BTCUSDT (the form AllTick uses sometimes)
  if (t.endsWith("USD") && !t.endsWith("USDT")) return `${t}T`;
  return t;
}

/* ── Session-window check ────────────────────────────────────────────
 * Returns true when `nowMs` falls inside the symbol's trading hours.
 * The live-tick poller in `subscribeBars` consults this so it doesn't
 * create phantom bars during off-hours.
 *
 * Why this matters: without the gate, the live-tick poller fires every
 * 1 s regardless of session. During the MCX overnight break (23:30 IST
 * → 09:00 IST next day) it would create 5 min × 114 ≈ a hundred flat
 * bars at the previous close, and on the next session's first tick the
 * "lastBar" the gap detector sees is the most-recent off-hours filler
 * (5 min ago), NOT the real prev-session close (9.5 h ago). So the gap
 * detector reports `barsSinceLast = 1` → uses lastBar.close as the new
 * bar's open → the new session's first bar gets stuck opening at the
 * previous trading-day's close and closing at the actual new price,
 * which renders as a giant single candle bridging the overnight price
 * move (the "huge red wick" symptom on GOLD/SILVER charts the user
 * reported).
 *
 * TradingView's session string is "HHMM-HHMM" or "HHMM-HHMM:DAYS" with
 * day codes (Sun=1, Mon=2, ..., Sat=7). Times are in the symbol's
 * `timezone`. We parse both and check the localised "now".
 */
const _SESSION_DAY_OF_WEEK: Record<string, string> = {
  Sun: "1", Mon: "2", Tue: "3", Wed: "4", Thu: "5", Fri: "6", Sat: "7",
};

function isWithinSession(symbolInfo: any, nowMs: number): boolean {
  const session = (symbolInfo?.session || "").toString();
  if (!session || session === "24x7") return true;
  const tz = (symbolInfo?.timezone || "Etc/UTC").toString();

  let hh = "00", mm = "00", weekday = "Mon";
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      weekday: "short",
    });
    for (const p of fmt.formatToParts(new Date(nowMs))) {
      if (p.type === "hour") hh = p.value;
      else if (p.type === "minute") mm = p.value;
      else if (p.type === "weekday") weekday = p.value;
    }
  } catch {
    // Bad timezone string — fail open (count as in-session) so we
    // never lock a chart out due to an unsupported tz.
    return true;
  }
  const nowHM = parseInt(hh, 10) * 100 + parseInt(mm, 10);

  // Session may be a comma-separated list of day-rules:
  //   "0900-1530,1700-2330" → two trading windows on the same day
  //   "0900-2330:23456"     → one window, Mon-Fri only
  // Iterate every clause; in-session if ANY matches.
  for (const clause of session.split(",")) {
    const [range, days] = clause.split(":");
    if (!range) continue;
    const [s, e] = range.split("-");
    if (!s || !e) continue;
    if (days) {
      const code = _SESSION_DAY_OF_WEEK[weekday];
      if (!code || !days.includes(code)) continue;
    }
    const start = parseInt(s, 10);
    const end = parseInt(e, 10);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (start <= end) {
      if (nowHM >= start && nowHM < end) return true;
    } else {
      // Overnight range (e.g., "1700-0500"): valid if past start OR
      // before end.
      if (nowHM >= start || nowHM < end) return true;
    }
  }
  return false;
}

/* ── Types ───────────────────────────────────────────────────────── */
interface SymbolMeta {
  token: string;
  symbol: string;
  name: string;
  exchange: string;
  tick_size: string;
  lot_size: number;
  instrument_type: string;
  segment?: string;
}

interface Subscriber {
  symbolInfo: any;
  resolution: string;
  onTick: (bar: any) => void;
  unsubscribe: (() => void) | null;
  lastBar: any | null;
}

/* ── Binance history fetch ──────────────────────────────────────── */
const _binanceCache = new Map<string, { bars: any[]; ts: number }>();

/* ── Backend history fetch cache ────────────────────────────────────
 * Keyed by `${token}:${interval}:${days}`, 30 s TTL. Without this, every
 * chart swap (or resolution change, or in-place setSymbol) re-fetches
 * candles from the backend — which on a cold backend cache hits Zerodha
 * for another 200-800 ms. With the cache, switching back to a recently-
 * viewed instrument paints instantly from the previous response.
 */
const _backendHistoryCache = new Map<string, { bars: any[]; ts: number }>();
const BACKEND_HISTORY_TTL_MS = 30_000;

async function fetchBinanceKlines(
  pair: string,
  resolution: string,
  from: number,
  to: number
): Promise<any[]> {
  const interval = RESOLUTION_TO_BINANCE[resolution] || "5m";
  const cacheKey = `${pair}:${interval}`;

  const cached = _binanceCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 30_000) {
    return cached.bars.filter((b) => b.time >= from * 1000 && b.time <= to * 1000);
  }

  try {
    const params = new URLSearchParams({
      symbol: pair,
      interval,
      startTime: String(from * 1000),
      endTime: String(to * 1000),
      limit: "1000",
    });
    const resp = await fetch(`https://api.binance.com/api/v3/klines?${params}`);
    if (!resp.ok) return [];
    const data = (await resp.json()) as number[][];
    const bars = data.map((k) => ({
      time: Number(k[0]),
      open: Number(k[1]),
      high: Number(k[2]),
      low: Number(k[3]),
      close: Number(k[4]),
      volume: Number(k[5]),
    }));
    _binanceCache.set(cacheKey, { bars, ts: Date.now() });
    return bars;
  } catch {
    return [];
  }
}

/* ── Synthetic bar fallback ─────────────────────────────────────────
 * Used when neither Binance nor the backend has history for this symbol
 * (e.g. weekly NIFTY options — Zerodha doesn't keep their OHLC). We
 * anchor the candles to the live quote so the chart's last bar matches
 * the BUY/SELL price the user sees in the order panel.
 */
function seededRand(seed: number) {
  let s = Math.abs(seed) % 2147483647;
  if (s === 0) s = 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function generateSyntheticBars(
  symbol: string,
  mid: number,
  spread: number,
  resolution: string,
  from: number,
  to: number
): any[] {
  if (mid <= 0) return [];
  const resSec = RESOLUTION_TO_SECONDS[resolution] ?? 300;
  // Volatility tuned per symbol category — options move a lot more in
  // percentage terms than indices/equities, so give them more wiggle.
  const isOption = /CE$|PE$/i.test(symbol);
  const volPct = isOption ? 0.008 : 0.0005;
  const resFactor = Math.sqrt(resSec / 300);
  const volatility = Math.max(spread * 1.5, mid * volPct * resFactor);

  const nowSec = Math.floor(Date.now() / 1000);
  const toSec = Math.min(to, nowSec);
  const fromAligned = Math.floor(from / resSec) * resSec;
  const toAligned = Math.floor(toSec / resSec) * resSec;
  if (fromAligned >= toAligned) return [];

  const count = Math.min(Math.floor((toAligned - fromAligned) / resSec) + 1, 500);
  const startSec = toAligned - (count - 1) * resSec;

  const seed = symbol.split("").reduce((a, c) => a + c.charCodeAt(0), 0) + Math.floor(startSec / 86400);
  const rand = seededRand(seed);

  const increments = Array.from({ length: count }, () => (rand() - 0.5) * volatility * 2);
  let cumSum = 0;
  const cumSums = increments.map((inc) => {
    cumSum += inc;
    return cumSum;
  });
  const lastCum = cumSums[cumSums.length - 1];
  // Anchor the last bar's close to `mid` so the chart sits exactly on
  // the live quote when subscribeBars takes over.
  const prices = cumSums.map((c) => Math.max(0.01, mid + (c - lastCum)));

  const bars: any[] = [];
  let prev = Math.max(0.01, mid - (cumSums[0] - lastCum));
  for (let i = 0; i < count; i++) {
    const open = prev;
    const close = prices[i];
    bars.push({
      time: (startSec + i * resSec) * 1000,
      open,
      close,
      high: Math.max(open, close) + Math.abs(rand() * volatility * 0.4),
      low: Math.max(0.01, Math.min(open, close) - Math.abs(rand() * volatility * 0.4)),
      volume: Math.floor(rand() * 500) + 50,
    });
    prev = close;
  }
  return bars;
}

/* ── Datafeed class ──────────────────────────────────────────────── */
export class CustomDatafeed {
  private subscribers: Map<string, Subscriber> = new Map();
  private symbolCache: Map<string, SymbolMeta> = new Map();
  private lastHistoryBar: Map<string, any> = new Map();

  onReady(callback: (config: any) => void) {
    setTimeout(() => {
      callback({
        supported_resolutions: ["1", "3", "5", "15", "30", "60", "1D", "1W", "1M"],
        supports_marks: false,
        supports_timescale_marks: false,
        supports_time: true,
      });
    }, 0);
  }

  async searchSymbols(
    userInput: string,
    _exchange: string,
    _symbolType: string,
    onResult: (items: any[]) => void
  ) {
    try {
      const instruments = await InstrumentAPI.search(userInput);
      const items = (instruments ?? []).map((i: any) => {
        const ex = friendlyExchange(i.exchange, i.segment, i.token, i);
        return {
          symbol: `${i.token}`,
          full_name: `${ex}:${i.symbol}`,
          description: i.name || i.symbol,
          exchange: ex,
          ticker: `${i.token}`,
          type: i.instrument_type === "EQ" ? "stock" : "futures",
        };
      });
      onResult(items);
    } catch {
      onResult([]);
    }
  }

  async resolveSymbol(
    symbolName: string,
    onResolve: (info: any) => void,
    onError: (reason: string) => void
  ) {
    try {
      const token = symbolName.split(":").pop() || symbolName;
      const inst = await InstrumentAPI.detail(token);
      if (!inst) {
        onError("Symbol not found");
        return;
      }
      this.symbolCache.set(token, inst);
      const tickSize = parseFloat(inst.tick_size) || 0.05;
      const pricescale = Math.round(1 / tickSize);
      const crypto = isCryptoSymbol(token, inst);
      const extended = isExtendedHoursSymbol(token, inst);
      const mcx = isMCXSymbol(token, inst);
      const is24h = crypto || extended;
      // Pick the session string TradingView uses to mask non-trading
      // hours. The wrong choice paints an "after-hours" gap right where
      // bars actually exist — that's the "chart me gap aa raha hai"
      // symptom on MCX futures.
      //   24h (crypto / forex / spot metals)   → "24x7"
      //   MCX / NCDEX commodities (09:00-23:30) → "0900-2330:23456"
      //   NSE / BSE equity & F&O               → "0915-1530:23456"
      //
      // The ":23456" suffix is the TradingView day-of-week code for
      // Mon-Fri (Sun=1, Sat=7). Without it, the chart paints empty
      // weekend slots between Friday close and Monday open, which the
      // user sees as a horizontal "gap" on Monday's first paint. The
      // suffix tells TradingView to compress weekends out of the time
      // axis the same way it already compresses overnight off-hours.
      const session = is24h
        ? "24x7"
        : mcx
          ? "0900-2330:23456"
          : "0915-1530:23456";
      const timezone = is24h ? "Etc/UTC" : "Asia/Kolkata";
      onResolve({
        name: inst.symbol,
        description: inst.name || inst.symbol,
        type: crypto ? "crypto" : inst.instrument_type === "EQ" ? "stock" : "futures",
        session,
        timezone,
        ticker: token,
        // Replace vendor names (INFOWAY / ZERODHA) leaking through the
        // Instrument doc with a friendlier segment label. NSE / BSE /
        // MCX / NFO / BFO and other real exchange names pass through.
        exchange: friendlyExchange(inst.exchange, inst.segment, token, inst),
        listed_exchange: friendlyExchange(inst.exchange, inst.segment, token, inst),
        minmov: 1,
        pricescale: pricescale > 0 ? pricescale : 20,
        has_intraday: true,
        has_daily: true,
        has_weekly_and_monthly: true,
        supported_resolutions: ["1", "3", "5", "15", "30", "60", "1D", "1W", "1M"],
        volume_precision: crypto ? 4 : 0,
        data_status: "streaming",
      });
    } catch (err: any) {
      onError(err?.message || "Error resolving symbol");
    }
  }

  async getBars(
    symbolInfo: any,
    resolution: string,
    periodParams: any,
    onResult: (bars: any[], meta: any) => void,
    onError: (reason: string) => void
  ) {
    try {
      const token = symbolInfo.ticker || symbolInfo.name;
      const meta = this.symbolCache.get(token);
      const crypto = isCryptoSymbol(token, meta);

      // Crypto history is served by the backend (Infoway feed) — do NOT call
      // Binance directly because their API blocks cross-origin requests from
      // production domains (CORS). Fall through to the backend history path.

      const interval = RESOLUTION_MAP[resolution] || "5minute";
      // Compute the lookback so it covers TradingView's requested window.
      // TradingView paginates backward by calling getBars repeatedly with
      // older `from` timestamps; if we only request the default 5 days, the
      // older pages come back empty and the chart paints blank. Pad +2 days
      // so the window's left edge isn't a hard cut against a weekend.
      const nowSec = Math.floor(Date.now() / 1000);
      const fromSec = periodParams.from || nowSec - 5 * 86400;
      const dynamicDays = Math.max(
        DAYS_FOR_RESOLUTION[resolution] || 5,
        Math.ceil((nowSec - fromSec) / 86400) + 2,
      );

      let candles: any[] = [];
      const histKey = `${token}:${interval}:${dynamicDays}`;
      const cached = _backendHistoryCache.get(histKey);
      if (cached && Date.now() - cached.ts < BACKEND_HISTORY_TTL_MS) {
        candles = cached.bars;
      } else {
        try {
          candles = (await InstrumentAPI.history(token, interval, dynamicDays)) ?? [];
          _backendHistoryCache.set(histKey, { bars: candles, ts: Date.now() });
        } catch {
          candles = [];
        }
      }

      // Map to TradingView's bar shape and sort. NO client-side `from`
      // filter — TradingView handles its own viewport clipping, and our
      // earlier filter was throwing away the whole result when the backend
      // returned bars older than `periodParams.from` on the first paint
      // (the case that left option charts blank).
      //
      // Time field tolerance: every backend source (Zerodha, Yahoo,
      // Binance) is normalised to emit `time` (int Unix seconds) — but
      // we keep a fallback parse for `date` (ISO string) so a stale
      // cached response from before the schema unification still
      // renders instead of silently dropping every bar.
      //
      // Sanity filter on each individual bar:
      //   - all OHLC values must be finite, positive numbers
      //   - high >= low (rejects rows where the feed returned the columns
      //     in the wrong order or one value was zeroed out)
      //   - intra-bar range sanity: min(O,H,L,C) >= 0.5 * max(O,H,L,C).
      //     Catches the per-bar corruption pattern (one OHLC value zeroed
      //     or 10× off) without depending on a window-wide median, so it
      //     doesn't false-positive on stocks that genuinely trended hard
      //     across the lookback (Adani / Bajaj / Tata Motors etc.). The
      //     previous median-based filter clipped legitimate bars at the
      //     edges of strong trends → reported gap.
      //   - timestamp not in the future and not absurdly old (1 year back
      //     is the deepest we ever ask for)
      const nowMs = Date.now();
      const earliestMs = nowMs - 366 * 86400 * 1000;
      const bars = candles
        .map((c: any) => {
          const tsRaw = c?.time;
          let tMs: number;
          if (typeof tsRaw === "number" && Number.isFinite(tsRaw)) {
            // Backend emits int Unix seconds (preferred), so multiply.
            // Guard against accidentally already-ms values: anything >
            // year-2100 in seconds is treated as ms directly.
            tMs = tsRaw > 4_102_444_800 ? tsRaw : tsRaw * 1000;
          } else if (typeof c?.date === "string") {
            tMs = Date.parse(c.date);
          } else {
            tMs = NaN;
          }
          return {
            time: tMs,
            open: Number(c.open),
            high: Number(c.high),
            low: Number(c.low),
            close: Number(c.close),
            volume: Number(c.volume) || 0,
          };
        })
        .filter((b: any) => {
          if (!Number.isFinite(b.time) || !Number.isFinite(b.open) ||
              !Number.isFinite(b.close) || !Number.isFinite(b.high) ||
              !Number.isFinite(b.low)) return false;
          if (b.open <= 0 || b.close <= 0 || b.high <= 0 || b.low <= 0) return false;
          if (b.high < b.low) return false;
          if (b.time < earliestMs || b.time > nowMs + 86400_000) return false;
          // Per-bar OHLC sanity: the smallest of {O,H,L,C} should be at
          // least half the largest. Anything tighter than that is a
          // legitimate big-move bar; anything wider is data corruption
          // (one of the four was zeroed out or mis-decoded).
          const mx = Math.max(b.open, b.high, b.low, b.close);
          const mn = Math.min(b.open, b.high, b.low, b.close);
          if (mn < mx * 0.5) return false;
          return true;
        })
        .sort((a: any, b: any) => a.time - b.time);

      // Filter bars to requested range so TradingView full-update never
      // rejects them with "data should be in the requested range".
      const fromMs = (periodParams.from || 0) * 1000;
      const toMs = (periodParams.to || Math.floor(Date.now() / 1000)) * 1000;
      const filteredBars = bars.filter((b: any) => b.time >= fromMs && b.time <= toMs);

      if (filteredBars.length > 0) {
        const latest = filteredBars[filteredBars.length - 1];
        this.lastHistoryBar.set(token, latest);
        // Sync any live subscribers for this token to the freshly
        // fetched latest bar — but only forward in time, never backward.
        // Without this, after a `resetData()` refetch (periodic or tab-
        // visibility) the live-tick handler is still anchored to the
        // bar it had before the refetch, so its next emitted bar uses
        // the STALE close as its open. That mismatch is what paints a
        // single live candle floating well above (or below) the rest of
        // the freshly-refetched cluster — the symptom flagged in the
        // SILVER26JULFUT screenshot.
        //
        // Binance / Yahoo flicker fix: those upstream providers INCLUDE
        // the in-progress bar in their klines / chart response (the
        // current 5-min slot's running OHLC), while Zerodha returns
        // only SETTLED bars. So on every 60-s periodic refetch the
        // Binance bar for the active slot overwrites whatever the live
        // WS tick handler had accumulated (high/low extremes, latest
        // close), the very next WS tick reverts it back, and the candle
        // body visibly flickers between the two states. When the
        // refetched `latest.time` matches a sub's `lastBar.time` we
        // KEEP the sub's accumulated values for that slot — the live
        // tick handler owns the in-progress bar, the refetch only
        // refreshes the slots BEHIND it.
        for (const sub of this.subscribers.values()) {
          const subToken = sub.symbolInfo?.ticker || sub.symbolInfo?.name;
          if (subToken !== token) continue;
          const subTime = Number(sub.lastBar?.time ?? 0);
          if (latest.time > subTime) {
            sub.lastBar = { ...latest };
          } else if (latest.time === subTime && sub.lastBar) {
            filteredBars[filteredBars.length - 1] = { ...sub.lastBar };
          }
        }
        onResult(filteredBars, { noData: false });
        return;
      }

      // ── Fallback: synthetic candles anchored to the live quote ─────
      // Hit for symbols the backend has no OHLC for (typically weekly
      // NIFTY/BANKNIFTY options whose history Zerodha doesn't keep).
      // Anchor to LTP (same source the live tick handler uses) so the
      // chart's last synthetic candle joins the live stream without a
      // visible jump. Bid/ask are only used to size the candle wicks,
      // not the price level.
      try {
        const from = periodParams.from || Math.floor(Date.now() / 1000) - 30 * 86400;
        const to = periodParams.to || Math.floor(Date.now() / 1000);
        const q = await InstrumentAPI.quote(token);
        const bid = Number(q?.bid ?? NaN);
        const ask = Number(q?.ask ?? NaN);
        const ltp = Number(q?.ltp ?? NaN);
        let anchor = NaN;
        let spread = 0;
        if (Number.isFinite(ltp) && ltp > 0) {
          anchor = ltp;
          spread = Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask > 0
            ? Math.abs(ask - bid)
            : ltp * 0.0005;
        } else if (Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask > 0) {
          anchor = (bid + ask) / 2;
          spread = Math.abs(ask - bid);
        }
        if (anchor > 0) {
          const synth = generateSyntheticBars(token, anchor, spread, resolution, from, to);
          if (synth.length > 0) {
            this.lastHistoryBar.set(token, synth[synth.length - 1]);
            onResult(synth, { noData: false });
            return;
          }
        }
      } catch {
        // ignore — fall through to noData
      }

      onResult([], { noData: true });
    } catch (err: any) {
      onError(err?.message || "Error loading bars");
    }
  }

  subscribeBars(
    symbolInfo: any,
    resolution: string,
    onTick: (bar: any) => void,
    listenerGuid: string
  ) {
    const token = symbolInfo.ticker || symbolInfo.name;
    const barSec = RESOLUTION_TO_SECONDS[resolution] ?? 300;

    // ── Live tick path: shared marketTickBus WebSocket ───────────────
    // Previously this was a 250 ms `setInterval(InstrumentAPI.quote)`
    // HTTP poll. The poller was responsible for the chart visibly
    // lagging Zerodha Kite — Zerodha streams ticks to all their
    // surfaces (Web / app / API) over the same WS at the same rate,
    // so HTTP polling on our side IS the entire latency budget.
    //
    // Switching to the bus collapses the chart's data path onto the
    // exact same `/ws/marketdata` connection the order panel /
    // positions / marketwatch already use. The bus refcounts per-token
    // listeners across all consumers in the tab, so a chart that's
    // viewing the same instrument the user already has open in the
    // order panel reuses the existing subscription — zero extra
    // sockets, zero extra upstream traffic.
    //
    // Real-tick → chart-paint latency: ~1700 ms → ~50-100 ms (Redis
    // pub/sub fan-out + WS frame). The chart now ticks in lockstep
    // with Kite Web.
    const handleTick = (q: MarketQuote) => {
      // Off-hours gate: if the wall-clock has crossed outside the
      // symbol's session, do nothing. Without this we'd keep creating
      // flat bars at the previous close throughout MCX's overnight
      // break (23:30 IST → 09:00 IST), and the next session's first
      // bar would open at the stale prev-day close — exactly the
      // "giant red bar at session open" artefact the user reported.
      // 24x7 sessions (crypto, forex) and unspecified sessions fall
      // through (the helper returns true), so this is a no-op for
      // them.
      if (!isWithinSession(symbolInfo, Date.now())) return;

      const sub = this.subscribers.get(listenerGuid);
      if (!sub) return;

      // Build the live price. The CHART must use the SAME price source
      // as the historical bars or the live candle visually jumps away
      // from the historical series at session boundaries. Both Zerodha
      // historical and Infoway historical (via Yahoo) are LTP-based, so
      // prefer `q.ltp` and only fall back to mid = (bid+ask)/2 when LTP
      // is missing (some pre-market quotes ship only bid/ask).
      //
      // The OrderPanel still reads bid/ask for the BUY/SELL buttons
      // independently — that's correct because orders execute against
      // the bid (sell) / ask (buy), but the CHART represents trade
      // prices, which are LTP. Mixing the two was the root cause of
      // the "historical and live price don't match" complaint.
      const bid = Number(q.bid ?? NaN);
      const ask = Number(q.ask ?? NaN);
      const ltp = Number(q.ltp ?? NaN);
      let price: number;
      // Prefer the bid/ask MID over LTP for the live bar. On thinly-traded
      // contracts (far-month F&O, illiquid options) Kite's last_price stays
      // frozen for seconds between actual trades while the order book keeps
      // moving — so an LTP-based chart looked dead / "tick to tick nahi ho
      // raha" even though the SELL/BUY strip was moving. The mid ticks on
      // every depth change, so the chart now moves in lockstep with the
      // tradeable price the client actually sees. The backend keeps the
      // spread sane (last-good-width overlay), so mid ≈ LTP and the live bar
      // still lines up with the LTP-based historical series. LTP is the
      // fallback for feeds that ship no depth (e.g. some indices).
      if (Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask > 0) {
        price = (bid + ask) / 2;
      } else if (Number.isFinite(ltp) && ltp > 0) {
        price = ltp;
      } else {
        return;
      }

      // Guard against bad ticks corrupting the live bar:
      //   1. Reject non-positive prices (zero / negative LTP that some
      //      feeds emit pre-market or between sessions).
      //   2. Reject obvious outliers — if the tick deviates >10% from
      //      the previous bar's close it's almost certainly a glitch
      //      (mis-decoded packet, stale bid/ask while the other side
      //      is missing, etc.). Without this guard a single bad tick
      //      with `low: 0` produces a candle that wicks all the way
      //      down to the x-axis on the chart.
      //   3. Skip the deviation check when `lastBar` is stale (>= 2 bars
      //      old) — after a long idle period the real price legitimately
      //      may have moved well past 10%, and the gap-fill branch
      //      below will paint intermediate bars to keep the chart
      //      continuous. Without this, the guard would lock the chart
      //      on the stale price forever.
      if (!Number.isFinite(price) || price <= 0) return;
      const now = Math.floor(Date.now() / 1000);
      const barTime = Math.floor(now / barSec) * barSec * 1000;
      const lastBarTime = Number(sub.lastBar?.time ?? 0);
      const barsSinceLast = lastBarTime > 0 ? (barTime - lastBarTime) / (barSec * 1000) : 0;
      const prevClose = Number(sub.lastBar?.close ?? NaN);
      if (barsSinceLast < 2 && Number.isFinite(prevClose) && prevClose > 0) {
        const deviation = Math.abs(price - prevClose) / prevClose;
        if (deviation > 0.1) {
          // Tick is >10% away from the last known good price — skip it.
          // The next tick will usually be sane; persistent deviations
          // (real spikes) will be picked up via the historical refetch
          // on chart resolution change.
          return;
        }
      }

      if (sub.lastBar && sub.lastBar.time === barTime) {
        sub.lastBar = {
          ...sub.lastBar,
          high: Math.max(sub.lastBar.high, price),
          low: Math.min(sub.lastBar.low, price),
          close: price,
          volume: (sub.lastBar.volume || 0) + 1,
        };
        onTick(sub.lastBar);
      } else {
        // ── Gap fill ─────────────────────────────────────────────
        // If the new bar slot is more than 1 bar ahead of `lastBar`,
        // some bar slots in between have nothing. Without filling,
        // the chart shows a visible discontinuity (vertical jump or
        // missing candle column) between the historical series and
        // the live candle — exactly the symptom reported as "candle
        // is not match in chart" / "gap aa raha hai".
        //
        // We:
        //   1. Bust the backend history cache so the next 60-s
        //      `resetData()` refetches fresh bars covering the gap.
        //   2. Emit flat filler bars (O=H=L=C=prevClose) for each
        //      missing slot, so the chart is visually continuous
        //      immediately, even before the resetData arrives.
        //   3. Seed the new live bar's open from prevClose (small
        //      gap) or from the live price (large gap, where the
        //      pre-gap close is too stale to trust).
        if (barsSinceLast >= 2) {
          for (const key of Array.from(_backendHistoryCache.keys())) {
            if (key.startsWith(`${token}:`)) {
              _backendHistoryCache.delete(key);
            }
          }
        }
        // Only fill SMALL intra-session gaps with synthetic bars. A
        // small gap (≤ 3 missing slots, ~15 min on a 5 m chart) is
        // almost always backend-history lag — flat fillers paper over
        // the discontinuity until the next `resetData()` replaces
        // them with real candles. Larger gaps (overnight breaks,
        // weekends, holidays) span thousands of bar slots; emitting
        // fillers there pollutes the X-axis with off-hours flat bars
        // that TradingView's session compressor then has to hide
        // again, and corrupts our own `lastBar` state for the next
        // tick. For large gaps we let the resetData refetch handle
        // it and just open the new live bar at the live price.
        const SMALL_GAP_LIMIT = 3;
        if (
          barsSinceLast >= 2 &&
          barsSinceLast - 1 <= SMALL_GAP_LIMIT &&
          lastBarTime > 0 &&
          Number.isFinite(prevClose) && prevClose > 0
        ) {
          const missing = barsSinceLast - 1;
          for (let i = 1; i <= missing; i++) {
            const fillerTime = lastBarTime + i * barSec * 1000;
            const filler = {
              time: fillerTime,
              open: prevClose,
              high: prevClose,
              low: prevClose,
              close: prevClose,
              volume: 0,
            };
            onTick(filler);
          }
        }
        // Open price by gap size:
        //   • Small gap (≤ SMALL_GAP_LIMIT bars, ~15 min on 5 m): open at
        //     prevClose. Flat fillers above bridge the slots in between,
        //     so the new bar continues naturally from the prev-bar close.
        //   • Large gap (> SMALL_GAP_LIMIT bars, e.g. 5+ min of Zerodha
        //     historical lag): open at LIVE price. Bridging from a stale
        //     prevClose here paints a giant single bar (the
        //     "GOLD26JUNFUT 158,654 → 160,006 wick" artefact the user
        //     reported) — every tick that follows extends the bar's high
        //     but the open stays at the 5-min-old prevClose, so the body
        //     stretches across the entire missed move. Better to draw a
        //     small doji at the live price and let the resetData below
        //     pull in the real bars within 1-2 s.
        const isLargeGap =
          barsSinceLast > SMALL_GAP_LIMIT + 1;
        const open =
          isLargeGap || !Number.isFinite(prevClose) || prevClose <= 0
            ? price
            : prevClose;
        // Ask the chart wrapper to refetch historical immediately when
        // we detect a large gap. The wrapper throttles per-token so a
        // burst of live ticks during a stale-historical window only
        // fires one resetData call, not one per tick.
        if (isLargeGap && typeof window !== "undefined") {
          try {
            window.dispatchEvent(
              new CustomEvent("stock4x:chart-gap", { detail: { token } })
            );
          } catch {
            /* dispatch failures are non-fatal */
          }
        }
        const newBar = {
          time: barTime,
          open,
          high: Math.max(open, price),
          low: Math.min(open, price),
          close: price,
          volume: 1,
        };
        sub.lastBar = newBar;
        onTick(newBar);
      }
    };

    const unsubscribe = marketTickBus.subscribe([token], handleTick);

    // Seed lastBar from the most recent historical bar so TradingView's
    // incremental update logic sees a continuation, not a gap.
    const seedBar = this.lastHistoryBar.get(token) ?? null;
    this.subscribers.set(listenerGuid, {
      symbolInfo,
      resolution,
      onTick,
      unsubscribe,
      lastBar: seedBar ? { ...seedBar } : null,
    });
  }

  unsubscribeBars(listenerGuid: string) {
    const sub = this.subscribers.get(listenerGuid);
    if (sub?.unsubscribe) sub.unsubscribe();
    this.subscribers.delete(listenerGuid);
  }
}
