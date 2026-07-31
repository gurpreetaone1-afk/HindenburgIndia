/**
 * Hindenburg India — homepage content.
 *
 * All copy is Indian-markets trading: NSE / BSE / MCX segments, INR pricing,
 * PAN + Aadhaar onboarding and SEBI statutory charges. Presentation comes from
 * the design system in baseline.css.
 * Nothing here is fetched — it's all fixed marketing copy.
 */

/**
 * Imagery comes from the project's own `public/` folder rather than the design
 * template's stock photos, so the page ships Hindenburg India's pictures.
 * Swap these paths to change the visuals site-wide.
 */
export const IMG = {
  hero: "/hero_banner1.png",
  proof: "/image2.png",
  /* Platform tiles — supplied at 1086x1448, i.e. exactly the 3:4 the tile
     crops to, so `object-fit: cover` has nothing to cut off. */
  webTerminal: "/img_card1.png",
  mobileApp: "/img_card2.png",
  slide1: "/card1.png",
  slide2: "/card2.png",
  slide3: "/card3.png",
} as const;

/**
 * Social-proof avatars on the hero card. These are deliberately ILLUSTRATIONS,
 * not photographs — the card claims "5,000+ traders on the platform", and
 * photos of real faces there would read as identifiable real customers.
 * Replace with licensed portraits only if you have consent to use them.
 */
export const TRADER_AVATARS = [
  "/avatars/trader-1.svg",
  "/avatars/trader-2.svg",
  "/avatars/trader-3.svg",
  "/avatars/trader-4.svg",
] as const;

/* ── Adaptive rem grid ──────────────────────────────────────────────────── */
export const FONT_BASE = 16;
export const BASE_W = 1920;
export const COEF = 0.6666;

/* ── Loader ─────────────────────────────────────────────────────────────── */
export const MIN_VISIBLE_MS = 1400;
export const MAX_VISIBLE_MS = 2600;
export const EXIT_MS = 850;

/* ── Carousels ──────────────────────────────────────────────────────────── */
export const COLLECTION_INTERVAL = 3800;
/* Slower than the hero ticker: each Trust slide also replays four oversized
   word reveals, which need time to land before the next slide starts. */
export const TRUST_INTERVAL = 6000;

export const EASE = {
  expo: "cubic-bezier(0.16, 1, 0.3, 1)", // easeOutExpo
  quart: "cubic-bezier(0.25, 1, 0.5, 1)", // easeOutQuart
  cubic: "cubic-bezier(0.65, 0, 0.35, 1)", // easeInOutCubic
} as const;

export const BRAND = "Hindenburg India";

/* ══════════════════════════════════════════════════════════════════════════
   HERO
   ══════════════════════════════════════════════════════════════════════════ */
export const HERO = {
  title: "Trade Every Market",
  taglineLines: ["Real Capital,", "Real Control"] as const,
  kicker: "Your trading edge deserves real capital — not your savings.",
};

/** Rotating market chips in the hero's glass card. */
export type MarketTick = {
  symbol: string;
  name: string;
  last: string;
  change: string;
  up: boolean;
};

export const MARKET_TICKS: MarketTick[] = [
  { symbol: "NIFTY 50", name: "NSE benchmark", last: "24,318.45", change: "+0.75%", up: true },
  { symbol: "SENSEX", name: "BSE benchmark", last: "79,842.10", change: "+0.66%", up: true },
  { symbol: "BANK NIFTY", name: "NSE banking", last: "51,204.85", change: "-0.52%", up: false },
];

/* ══════════════════════════════════════════════════════════════════════════
   WHY CHOOSE — carousel with oversized ghost words
   ══════════════════════════════════════════════════════════════════════════ */
export type TrustSlide = {
  headline: [string, string, string, string];
  img: string;
  name: string;
  role: string;
  alt: string;
};

export const TRUST_SLIDES: TrustSlide[] = [
  {
    headline: ["Flat", "Honest", "Zero", "Brokerage"],
    img: IMG.slide1,
    name: "₹20 per order",
    role: "Intraday & F&O",
    alt: "Trader reviewing an order book",
  },
  {
    headline: ["Faster", "Fills", "Lower", "Slippage"],
    img: IMG.slide2,
    name: "Sub-50ms fills",
    role: "In-house matching",
    alt: "Market data on screen",
  },
  {
    headline: ["Every", "Segment", "One", "Account"],
    img: IMG.slide3,
    name: "NSE · BSE · MCX",
    role: "Equity, F&O, currency",
    alt: "Multi-market watchlist",
  },
];

/* ══════════════════════════════════════════════════════════════════════════
   NUMBERS THAT SPEAK
   ══════════════════════════════════════════════════════════════════════════ */
export const STATS = [
  { v: "99.9%", l: "Session uptime" },
  { v: "500+", l: "Tradable instruments" },
  { v: "5,000+", l: "Active traders" },
  { v: "₹20", l: "Flat per order" },
];

/* ══════════════════════════════════════════════════════════════════════════
   SEGMENT ROUTES — single source of truth
   The "Every segment, one account" rows and the Trading dropdown both point
   here, so a row and its menu entry can never drift onto different pages.
   ══════════════════════════════════════════════════════════════════════════ */
export const SEGMENT_ROUTES = {
  equity: "/equity",
  fno: "/futures-options",
  commodities: "/commodities",
  indices: "/indices",
} as const;

/* ══════════════════════════════════════════════════════════════════════════
   INDIAN MARKETS ACCESS — numbered list
   ══════════════════════════════════════════════════════════════════════════ */
export const MARKETS = [
  {
    n: "01",
    name: "Equity Delivery & Intraday",
    desc: "NSE and BSE cash segment with zero brokerage on delivery.",
    href: SEGMENT_ROUTES.equity,
  },
  {
    n: "02",
    name: "Futures & Options",
    desc: "Index and stock derivatives with live Greeks and a strategy builder.",
    href: SEGMENT_ROUTES.fno,
  },
  {
    n: "03",
    name: "Commodities (MCX)",
    desc: "Gold, silver, crude and base metals on a single margin pool.",
    href: SEGMENT_ROUTES.commodities,
  },
  {
    n: "04",
    name: "Currency & Indices",
    desc: "INR pairs and global index exposure alongside your equity book.",
    href: SEGMENT_ROUTES.indices,
  },
];

/* ══════════════════════════════════════════════════════════════════════════
   ACCOUNT TYPES
   ══════════════════════════════════════════════════════════════════════════ */
export const ACCOUNTS = [
  {
    name: "Equity Investor",
    price: "₹0",
    note: "per delivery trade",
    tagline: "For long-term investors building a portfolio.",
    features: [
      "Zero brokerage on equity delivery",
      "NSE & BSE cash segment",
      "IPO and mutual fund access",
      "Portfolio and P&L reporting",
    ],
    featured: false,
  },
  {
    name: "Active Trader",
    price: "₹20",
    note: "per executed order",
    tagline: "For intraday and F&O traders who need speed.",
    features: [
      "Flat ₹20 intraday & F&O brokerage",
      "Equity, F&O, currency, commodity",
      "Advanced charting & option chain",
      "Bracket and cover orders",
    ],
    featured: true,
  },
  {
    name: "F&O Pro",
    price: "₹15",
    note: "per executed order",
    tagline: "For high-volume derivatives strategies.",
    features: [
      "Reduced brokerage at volume",
      "Strategy builder & payoff charts",
      "Basket and multi-leg orders",
      "Lower margin on hedged positions",
    ],
    featured: false,
  },
  {
    name: "HNI / Algo",
    price: "Custom",
    note: "negotiated pricing",
    tagline: "For institutions, algos and serious capital.",
    features: [
      "Negotiated per-order pricing",
      "API access for automation",
      "Custom margin and risk limits",
      "Named dealing desk",
    ],
    featured: false,
  },
];

/* ══════════════════════════════════════════════════════════════════════════
   PLATFORM — two tiles
   ══════════════════════════════════════════════════════════════════════════ */
export const PLATFORMS = [
  {
    tone: "clay" as const,
    img: IMG.webTerminal,
    name: "Web Terminal",
    desc: "Multi-chart layouts, option chain and one-click orders in the browser.",
    alt: "Web trading terminal",
  },
  {
    tone: "blue" as const,
    img: IMG.mobileApp,
    name: "Mobile App",
    desc: "The full order book, positions and funds in your pocket.",
    alt: "Mobile trading app",
  },
];

/* ══════════════════════════════════════════════════════════════════════════
   PROFESSIONAL TRADING CONDITIONS
   ══════════════════════════════════════════════════════════════════════════ */
export const CONDITIONS = [
  {
    title: "Low-latency execution",
    desc: "Orders match in-house on a co-located engine, so fills land in milliseconds.",
    metric: "< 50 ms",
    metricLabel: "median fill",
  },
  {
    title: "Transparent margin",
    desc: "Span + exposure margin is published per contract before you place the order.",
    metric: "Up to 5x",
    metricLabel: "intraday leverage",
  },
  {
    title: "One ledger, every segment",
    desc: "Margin released in one segment is immediately usable in another.",
    metric: "4",
    metricLabel: "segments",
  },
  {
    title: "Built-in risk controls",
    desc: "Margin-call alerts, configurable stop-out and square-off protection.",
    metric: "24/7",
    metricLabel: "monitoring",
  },
];

/* ══════════════════════════════════════════════════════════════════════════
   TOOLS & RESEARCH
   ══════════════════════════════════════════════════════════════════════════ */
export const TOOLS = [
  { title: "Advanced charting", desc: "100+ indicators, multi-timeframe layouts, saved across devices." },
  { title: "Option chain & Greeks", desc: "Live IV, open interest and Greeks so you can price a strategy first." },
  { title: "Margin calculators", desc: "Exact margin and payoff for any multi-leg position before you commit." },
  { title: "Price & event alerts", desc: "Trigger on price, volume or open interest — in-app, email or push." },
  { title: "Market news", desc: "Curated news and earnings dates next to the instruments you hold." },
  { title: "Reports & tax statements", desc: "Downloadable P&L, ledger and capital-gains statements." },
];

/* ══════════════════════════════════════════════════════════════════════════
   EDUCATION
   ══════════════════════════════════════════════════════════════════════════ */
export const COURSES = [
  { tag: "Beginner", title: "Markets 101", desc: "How Indian markets work, from order types to settlement cycles." },
  { tag: "Intermediate", title: "Options Foundations", desc: "Payoffs, Greeks and the strategies that actually hold up." },
  { tag: "Advanced", title: "Risk & Position Sizing", desc: "Sizing, stops and drawdown control for consistent traders." },
];

/* ══════════════════════════════════════════════════════════════════════════
   PAYMENTS
   ══════════════════════════════════════════════════════════════════════════ */
export const PAYMENTS = [
  { v: "0%", title: "Deposit fees", desc: "Fund from any Indian bank at no cost." },
  { v: "Instant", title: "UPI deposits", desc: "Reflects in your trading balance within seconds." },
  { v: "24/7", title: "Withdrawal requests", desc: "Raise any time; settles on the next cycle." },
];

export const PAYMENT_METHODS = ["UPI", "Net Banking", "NEFT", "RTGS", "IMPS", "Debit Card"];

/* ══════════════════════════════════════════════════════════════════════════
   TRUST / VALUES
   ══════════════════════════════════════════════════════════════════════════ */
export const TRUST_PILLARS = [
  { title: "Segregated client funds", desc: "Client money sits in a designated bank account, ring-fenced from company funds." },
  { title: "KYC-verified accounts", desc: "Every account is PAN and Aadhaar verified before it can trade." },
  { title: "Redundant infrastructure", desc: "Failover market-data feeds and replicated databases keep sessions up." },
  { title: "Auditable reporting", desc: "Every order, fill and ledger entry is timestamped and downloadable." },
];

export const VALUES = [
  { title: "Transparency", desc: "Costs, margins and risks stated before you trade — never discovered later." },
  { title: "Trader first", desc: "Decisions judged by whether they help you trade better." },
  { title: "Craft", desc: "Latency, uptime and correctness are features, not afterthoughts." },
  { title: "Integrity", desc: "No practices that trade your outcome for a short-term number." },
];

/* ══════════════════════════════════════════════════════════════════════════
   PARTNER PROGRAM
   ══════════════════════════════════════════════════════════════════════════ */
export const PARTNER_SLABS = [
  { clients: "1 – 25 clients", share: "25%" },
  { clients: "26 – 100 clients", share: "35%" },
  { clients: "101 – 500 clients", share: "45%" },
  { clients: "500+ clients", share: "Custom" },
];

/* ══════════════════════════════════════════════════════════════════════════
   3 SIMPLE STEPS
   ══════════════════════════════════════════════════════════════════════════ */
export const STEPS = [
  { n: "01", title: "Open your account", desc: "PAN and Aadhaar, fully online. Most accounts are approved same day." },
  { n: "02", title: "Add funds", desc: "UPI or net banking from a bank account in your own name." },
  { n: "03", title: "Start trading", desc: "Every segment unlocked from one balance, on web or mobile." },
];

/* ══════════════════════════════════════════════════════════════════════════
   TESTIMONIALS
   ══════════════════════════════════════════════════════════════════════════ */
export const TESTIMONIALS = [
  {
    quote: "Fills are quick and the margin numbers actually match what the calculator said. That's rare.",
    name: "Priya Anand",
    role: "F&O trader, Chennai",
  },
  {
    quote: "Moved my whole delivery portfolio over for the zero brokerage and stayed for the reporting.",
    name: "Lukas Menon",
    role: "Long-term investor, Kochi",
  },
  {
    quote: "One balance across equity, F&O and MCX means I stop juggling margin between apps.",
    name: "Dana Kulkarni",
    role: "Multi-segment trader, Pune",
  },
];

/* ══════════════════════════════════════════════════════════════════════════
   FAQ
   ══════════════════════════════════════════════════════════════════════════ */
export const FAQS = [
  {
    q: "What do I need to open an account?",
    a: "PAN, Aadhaar linked to your mobile number, and a bank account in your own name. The whole flow is online and most accounts are approved the same day.",
  },
  {
    q: "What does it actually cost to trade?",
    a: "Zero brokerage on equity delivery, and a flat ₹20 per executed order for intraday, F&O, currency and commodity. Statutory charges (STT, exchange fees, GST, SEBI turnover fees and stamp duty) are levied at prevailing government rates on top.",
  },
  {
    q: "Which segments can I trade?",
    a: "Equity cash on NSE and BSE, equity and index derivatives, currency, and commodities on MCX — all from a single account and a single margin pool.",
  },
  {
    q: "How fast are withdrawals?",
    a: "You can raise a withdrawal request at any time. Payouts settle to your linked bank account on the next settlement cycle.",
  },
  {
    q: "Is my money safe?",
    a: "Client funds are held in a designated bank account, segregated from company money. Deposits are accepted only from a bank account held in your own name, so payouts can never be routed elsewhere.",
  },
];

/* ══════════════════════════════════════════════════════════════════════════
   NAVIGATION
   ══════════════════════════════════════════════════════════════════════════ */
/**
 * Primary navigation. Items with `children` render as a hover/click dropdown
 * in the desktop header; `href` is still the landing page for the group, so
 * the parent stays clickable and the active state has something to match on.
 */
export type NavItem = {
  label: string;
  href: string;
  children?: { label: string; href: string; desc?: string }[];
};

export const NAV_LINKS: NavItem[] = [
  { label: "Home", href: "/" },
  {
    label: "Trading",
    href: "/markets",
    children: [
      { label: "Equity", href: SEGMENT_ROUTES.equity, desc: "NSE & BSE delivery and intraday" },
      { label: "Futures & Options", href: SEGMENT_ROUTES.fno, desc: "Index and stock derivatives" },
      { label: "Commodities", href: SEGMENT_ROUTES.commodities, desc: "Gold, silver, crude on MCX" },
      { label: "Indices", href: SEGMENT_ROUTES.indices, desc: "Index and currency exposure" },
    ],
  },
  {
    label: "Platforms",
    href: "/platform",
    children: [
      { label: "Standard", href: "/standard", desc: "Demat + trading across every segment" },
      { label: "Pro", href: "/pro", desc: "Priority support, API and algo access" },
      { label: "Demo", href: "/demo", desc: "Practise on live prices with virtual funds" },
    ],
  },
  { label: "Accounts", href: "/pricing" },
  { label: "Education", href: "/education" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

/* The burger overlay renders NAV_LINKS directly — groups become accordions
   there — so there is no second, flattened list to keep in sync. */

export const FOOTER_COLUMNS = [
  {
    title: "Markets",
    links: [
      { label: "Equity", href: "/equity" },
      { label: "Futures & Options", href: "/futures-options" },
      { label: "Commodities", href: "/commodities" },
      { label: "Indices", href: "/indices" },
    ],
  },
  {
    title: "Platform",
    links: [
      { label: "Web Terminal", href: "/web-terminal" },
      { label: "Pricing", href: "/pricing" },
      { label: "Features", href: "/features" },
      { label: "Security", href: "/security" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Partner Program", href: "/partner" },
      { label: "Contact", href: "/contact" },
      { label: "FAQ", href: "/faq" },
    ],
  },
];

/**
 * Social profiles. These were "#x" / "#linkedin" placeholders that navigated
 * nowhere. A link with an empty `href` is now SKIPPED rather than rendered
 * dead — paste the real profile URLs below to switch each one back on.
 */
export const SOCIALS: { label: string; href: string }[] = [
  { label: "X", href: "" },
  { label: "LinkedIn", href: "" },
  { label: "YouTube", href: "" },
  { label: "Instagram", href: "" },
];

export const CONTACT = {
  email: "support@hindenburgindia.com",
  phone: "+91 22 4890 1200",
  address: "Nariman Point, Mumbai 400021",
};
