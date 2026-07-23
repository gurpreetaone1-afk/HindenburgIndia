/**
 * Map a platform instrument to a TradingView symbol for the free Advanced
 * Chart widget (which renders TradingView's OWN data — clean candles, no
 * platform-feed gap).
 *
 * Returns null for instruments that should KEEP the platform-data chart:
 *   • Real Indian exchanges (Zerodha NSE / BSE / NFO / BFO / MCX / NCDEX /
 *     BCD) — our exact contracts aren't on TradingView's free feed.
 *   • Crypto OPTIONS (Bybit) — the platform mark is authoritative.
 *
 * IMPORTANT: "CDS" here is the platform's VIRTUAL exchange for Infoway
 * forex / metals / energy (see infoway_service: forex/metals/energy all
 * sit on virtual exchange CDS) — it is NOT the Indian currency-derivatives
 * segment, so it is intentionally NOT excluded. Those map to OANDA below
 * (the forex/CFD data source on TradingView).
 */

// Metals + energy: Infoway codes → OANDA (TradingView's OANDA broker feed).
const OANDA_MAP: Record<string, string> = {
  XAUUSD: "OANDA:XAUUSD", // gold
  XAGUSD: "OANDA:XAGUSD", // silver
  XPTUSD: "OANDA:XPTUSD", // platinum
  XPDUSD: "OANDA:XPDUSD", // palladium
  USOIL: "OANDA:WTICOUSD", // WTI crude
  WTICOUSD: "OANDA:WTICOUSD",
  XTIUSD: "OANDA:WTICOUSD",
  UKOIL: "OANDA:BCOUSD", // Brent crude
  XBRUSD: "OANDA:BCOUSD",
  BRENT: "OANDA:BCOUSD",
  NATGAS: "OANDA:NATGASUSD",
  XNGUSD: "OANDA:NATGASUSD",
};

// Indices (Infoway, virtual exchange CDS) → OANDA index CFDs. These trade
// extended hours like the platform's instruments, so they match better than
// the cash index. Common codes + aliases.
const INDEX_MAP: Record<string, string> = {
  US30: "OANDA:US30USD", WS30: "OANDA:US30USD", DJ30: "OANDA:US30USD",
  NAS100: "OANDA:NAS100USD", US100: "OANDA:NAS100USD", USTEC: "OANDA:NAS100USD",
  SPX500: "OANDA:SPX500USD", US500: "OANDA:SPX500USD",
  UK100: "OANDA:UK100GBP", FTSE100: "OANDA:UK100GBP",
  DE40: "OANDA:DE30EUR", DE30: "OANDA:DE30EUR", GER40: "OANDA:DE30EUR", GER30: "OANDA:DE30EUR",
  FRA40: "OANDA:FR40EUR", FR40: "OANDA:FR40EUR",
  EU50: "OANDA:EU50EUR", ESP35: "OANDA:ES35EUR", NL25: "OANDA:NL25EUR",
  JPN225: "OANDA:JP225USD", JP225: "OANDA:JP225USD",
  HK50: "OANDA:HK33HKD", HK33: "OANDA:HK33HKD",
  AUS200: "OANDA:AU200AUD", AU200: "OANDA:AU200AUD",
  CHINA50: "OANDA:CN50USD", CN50: "OANDA:CN50USD",
  IN50: "OANDA:IN50USD", INDIA50: "OANDA:IN50USD",
  SG30: "OANDA:SG30SGD",
};

export function toTradingViewSymbol(
  token: string,
  segment?: string | null,
  exchange?: string | null,
  symbol?: string | null,
): string | null {
  const t = (symbol || token || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const seg = (segment || "").toUpperCase();
  const exch = (exchange || "").toUpperCase();
  if (!t) return null;

  // Real Indian exchanges → keep the platform (Zerodha-fed) chart.
  // NOTE: CDS is intentionally absent — it's Infoway forex/metals/energy here.
  if (/^(NSE|BSE|NFO|BFO|MCX|NCDEX|BCD)$/.test(exch)) return null;
  // Crypto options (Bybit) + any currency-derivative OPTION → keep platform.
  if (seg.includes("OPTION")) return null;

  // Metals / energy (Infoway, virtual exchange CDS) → OANDA.
  if (OANDA_MAP[t]) return OANDA_MAP[t];

  // Indices (Infoway, virtual exchange CDS) → OANDA index CFD.
  // Known codes resolve to OANDA; an unmapped INDICES code keeps the
  // platform chart (null) rather than risk an "Invalid symbol".
  if (seg.includes("INDIC") || INDEX_MAP[t]) return INDEX_MAP[t] ?? null;

  // Crypto spot — Infoway lists as USDT/USDC/BUSD (some as bare USD).
  if (seg.includes("CRYPTO") || /(USDT|USDC|BUSD)$/.test(t)) {
    let s = t;
    if (s.endsWith("USD") && !/(USDT|USDC|BUSD)$/.test(s)) s = `${s}T`; // BTCUSD → BTCUSDT
    return `BINANCE:${s}`;
  }

  // Forex (Infoway, virtual exchange CDS) — 6-letter alpha pair / FOREX
  // segment → OANDA. Covers EURUSD, USDJPY, USDINR, crosses, etc.
  if (/^[A-Z]{6}$/.test(t) || seg.includes("FOREX") || seg.includes("FX")) {
    return `OANDA:${t}`;
  }

  // International stocks (Infoway STOCKS) — bare symbol; TradingView resolves
  // the primary listing (AAPL → NASDAQ:AAPL, etc.).
  if (seg.includes("STOCK")) return t;

  return null;
}
