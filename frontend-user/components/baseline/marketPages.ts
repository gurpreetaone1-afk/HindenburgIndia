/**
 * Segment pages — Equity, F&O, Commodities, Indices.
 *
 * These four routes used to live under app/(marketing)/ in the older "mp"
 * marketing theme. The copy is carried over unchanged; only the presentation
 * moved to the Baseline design system so the whole site reads as one theme.
 *
 * Add a segment by adding an entry here and a two-line page that renders
 * <MarketPage segment={MARKET_PAGES.<key>} />.
 */

export type MarketPage = {
  /** Route slug — also the key used by the page file. */
  slug: string;
  /** Small label above the hero title. */
  eyebrow: string;
  /** Hero headline, one entry per rendered line. */
  titleLines: string[];
  lead: string;
  /** SEO. */
  metaTitle: string;
  metaDescription: string;
  /** Four-up figure strip under the hero. */
  specs: { v: string; l: string }[];
  /** "Why this segment" prose. */
  overview: { eyebrow: string; lines: string[]; body: string };
  /** Instruments table. */
  instruments: { symbol: string; exchange: string; lot: string; margin: string }[];
  /** Three feature cards. */
  features: { title: string; desc: string }[];
};

const EQUITY: MarketPage = {
  slug: "equity",
  eyebrow: "Equity",
  titleLines: ["Invest in stocks", "on NSE & BSE"],
  lead: "Buy and sell shares of India's leading companies with lightning-fast order execution and a fully online experience.",
  metaTitle: "Equity — Invest in Stocks on NSE & BSE",
  metaDescription:
    "Buy and sell shares of India's leading companies with lightning-fast execution. Equity delivery & intraday on NSE and BSE, T+1 settlement, 100% online.",
  specs: [
    { v: "NSE / BSE", l: "Exchanges" },
    { v: "7,000+", l: "Listed stocks" },
    { v: "T+1", l: "Settlement" },
    { v: "100% online", l: "Account opening" },
  ],
  overview: {
    eyebrow: "Why equity",
    lines: ["Own the companies", "you believe in"],
    body: "Trade equity delivery and intraday across NSE and BSE. Open a Demat account with CDSL/NSDL and own shares of blue-chip companies like Reliance, TCS, HDFC Bank and Infosys. T+1 settlement, advanced charts and real-time market depth — all from a single, fully online platform.",
  },
  instruments: [
    { symbol: "RELIANCE", exchange: "NSE / BSE", lot: "1 share", margin: "Delivery & intraday" },
    { symbol: "TCS", exchange: "NSE / BSE", lot: "1 share", margin: "Delivery & intraday" },
    { symbol: "HDFCBANK", exchange: "NSE / BSE", lot: "1 share", margin: "Delivery & intraday" },
    { symbol: "INFY", exchange: "NSE / BSE", lot: "1 share", margin: "Delivery & intraday" },
    { symbol: "SBIN", exchange: "NSE / BSE", lot: "1 share", margin: "Delivery & intraday" },
    { symbol: "ITC", exchange: "NSE / BSE", lot: "1 share", margin: "Delivery & intraday" },
  ],
  features: [
    {
      title: "Delivery & intraday",
      desc: "Build a long-term portfolio with equity delivery, or trade actively with intraday positions — all on one platform.",
    },
    {
      title: "Fast T+1 settlement",
      desc: "Shares and funds settle in your Demat account on a T+1 cycle, so your holdings are never locked up for long.",
    },
    {
      title: "Advanced charts & research",
      desc: "Decide with TradingView-style charts, market depth and live NSE & BSE data feeds.",
    },
  ],
};

const FUTURES_OPTIONS: MarketPage = {
  slug: "futures-options",
  eyebrow: "NSE F&O",
  titleLines: ["Futures & options", "on the NFO segment"],
  lead: "Trade index and stock derivatives on the NSE F&O segment with a live option chain and transparent SPAN + Exposure margins.",
  metaTitle: "Futures & Options on NFO — Nifty, Bank Nifty & Stock F&O",
  metaDescription:
    "Trade index and stock derivatives on the NSE F&O segment with a live option chain and transparent SPAN + Exposure margins. Weekly and monthly expiries.",
  specs: [
    { v: "NSE F&O", l: "Segment" },
    { v: "200+", l: "F&O contracts" },
    { v: "Every week", l: "Weekly expiry" },
    { v: "SPAN + Exposure", l: "Margin" },
  ],
  overview: {
    eyebrow: "Overview",
    lines: ["Derivatives with", "margins you can see"],
    body: "Trade Nifty 50, Bank Nifty and single-stock futures and options on the NSE Futures & Options segment. Use a live option chain and choose weekly or monthly expiries. Margin follows SEBI's SPAN + Exposure framework — the real exchange-mandated margin you need to carry a position, published before you place the order.",
  },
  instruments: [
    { symbol: "NIFTY (FUT/OPT)", exchange: "NFO", lot: "75", margin: "SPAN + Exposure" },
    { symbol: "BANKNIFTY (FUT/OPT)", exchange: "NFO", lot: "30", margin: "SPAN + Exposure" },
    { symbol: "FINNIFTY (FUT/OPT)", exchange: "NFO", lot: "65", margin: "SPAN + Exposure" },
    { symbol: "RELIANCE FUT", exchange: "NFO", lot: "500", margin: "SPAN + Exposure" },
    { symbol: "HDFCBANK FUT", exchange: "NFO", lot: "550", margin: "SPAN + Exposure" },
    { symbol: "INFY FUT", exchange: "NFO", lot: "400", margin: "SPAN + Exposure" },
  ],
  features: [
    {
      title: "Futures & options",
      desc: "Trade index and single-stock futures and options across the NSE F&O segment from one streamlined platform.",
    },
    {
      title: "Live option chain",
      desc: "Analyse strikes, open interest and Greeks with a real-time option chain across weekly and monthly expiries.",
    },
    {
      title: "Transparent SPAN + Exposure",
      desc: "Margins follow SEBI's SPAN + Exposure framework, so you always know the exact capital a position requires.",
    },
  ],
};

const COMMODITIES: MarketPage = {
  slug: "commodities",
  eyebrow: "MCX",
  titleLines: ["Trade commodities", "on MCX"],
  lead: "Diversify your portfolio with gold, silver, crude oil and more on the Multi Commodity Exchange of India.",
  metaTitle: "Trade Commodities on MCX — Gold, Silver & Crude Oil",
  metaDescription:
    "Diversify with Gold, Silver, Crude Oil and more on the Multi Commodity Exchange of India. Transparent SPAN + Exposure margins and extended evening sessions.",
  specs: [
    { v: "MCX", l: "Exchange" },
    { v: "15+", l: "Commodities" },
    { v: "SPAN + Exposure", l: "Margin" },
    { v: "9 AM – 11:30 PM", l: "Market hours" },
  ],
  overview: {
    eyebrow: "Overview",
    lines: ["A hedge against", "equity volatility"],
    body: "Commodities diversify a portfolio and hedge against inflation. Trade precious metals like gold and silver, and energy contracts like crude oil and natural gas on the MCX. Transparent SPAN + Exposure margins, and access to Indian commodity futures from 9 AM to 11:30 PM.",
  },
  instruments: [
    { symbol: "GOLD", exchange: "MCX", lot: "100 grams", margin: "SPAN + Exposure" },
    { symbol: "SILVER", exchange: "MCX", lot: "30 kg", margin: "SPAN + Exposure" },
    { symbol: "CRUDEOIL", exchange: "MCX", lot: "100 barrels", margin: "SPAN + Exposure" },
    { symbol: "NATURALGAS", exchange: "MCX", lot: "1250 mmBtu", margin: "SPAN + Exposure" },
    { symbol: "COPPER", exchange: "MCX", lot: "2500 kg", margin: "SPAN + Exposure" },
    { symbol: "GOLDM (Gold Mini)", exchange: "MCX", lot: "10 grams", margin: "SPAN + Exposure" },
  ],
  features: [
    {
      title: "Precious metals",
      desc: "Access MCX gold, silver and their mini contracts with transparent SPAN + Exposure margins.",
    },
    {
      title: "Energy markets",
      desc: "Trade crude oil and natural gas futures on MCX with real-time pricing through the extended evening session.",
    },
    {
      title: "Portfolio diversification",
      desc: "Hedge against equity volatility and inflation by adding MCX commodities to your book.",
    },
  ],
};

const INDICES: MarketPage = {
  slug: "indices",
  eyebrow: "Indices",
  titleLines: ["Trade India's", "top indices"],
  lead: "Get exposure to Nifty 50, Bank Nifty and Sensex through index futures and options on NSE and BSE.",
  metaTitle: "Indices — Trade Nifty 50, Bank Nifty & Sensex",
  metaDescription:
    "Get exposure to Nifty 50, Bank Nifty and Sensex through index futures & options on NSE and BSE. Weekly & monthly expiries, transparent SPAN + Exposure margins.",
  specs: [
    { v: "NSE / BSE", l: "Exchanges" },
    { v: "10+", l: "Indices" },
    { v: "SPAN + Exposure", l: "Margin" },
    { v: "Weekly & monthly", l: "Expiries" },
  ],
  overview: {
    eyebrow: "Overview",
    lines: ["One position,", "the whole market"],
    body: "Take a view on entire sectors or on the Indian market itself. Trade Nifty 50, Bank Nifty, Fin Nifty and Sensex index futures and options on NSE and BSE, with weekly and monthly expiries and exchange-mandated SPAN + Exposure margins.",
  },
  instruments: [
    { symbol: "NIFTY 50", exchange: "NFO", lot: "75", margin: "SPAN + Exposure" },
    { symbol: "BANK NIFTY", exchange: "NFO", lot: "30", margin: "SPAN + Exposure" },
    { symbol: "FIN NIFTY", exchange: "NFO", lot: "65", margin: "SPAN + Exposure" },
    { symbol: "SENSEX", exchange: "BFO (BSE)", lot: "20", margin: "SPAN + Exposure" },
    { symbol: "NIFTY MIDCAP", exchange: "NFO", lot: "120", margin: "SPAN + Exposure" },
    { symbol: "BANKEX", exchange: "BFO (BSE)", lot: "30", margin: "SPAN + Exposure" },
  ],
  features: [
    {
      title: "Broad market exposure",
      desc: "Trade Nifty 50, Bank Nifty, Fin Nifty and Sensex to take a position on entire sectors and the Indian market.",
    },
    {
      title: "Transparent margins",
      desc: "Carry index positions on SEBI's SPAN + Exposure margins — exchange-mandated and predictable.",
    },
    {
      title: "Weekly & monthly expiries",
      desc: "Choose weekly contracts for short-term strategies or monthly ones for a longer index view.",
    },
  ],
};

export const MARKET_PAGES = {
  equity: EQUITY,
  futuresOptions: FUTURES_OPTIONS,
  commodities: COMMODITIES,
  indices: INDICES,
} as const;
