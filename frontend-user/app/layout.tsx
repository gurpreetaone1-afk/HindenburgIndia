import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import { Providers } from "./providers";
import { PwaRegister } from "@/components/common/PwaRegister";
import { ThemeColorSync } from "@/components/common/ThemeColorSync";
import "./globals.css";

// Inter is what ChatGPT / Linear / Vercel / Stripe / most modern fintech
// dashboards use. Self-hosted via `next/font` so no extra request hits
// fonts.googleapis at runtime — the .woff2 ships from /_next/static and
// the font-display: swap behaviour comes free with the helper. The full
// 400/500/600/700 range covers every body / button / heading / numeric
// weight used across the app.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

// Platform-owned user hosts — always show the Hindenburg India brand. Custom
// tenant domains (e.g. profitfx.in, app.profitfx.in) fall through to the
// per-domain branding lookup below.
const PLATFORM_HOSTS = new Set([
  "hindenburgindia.live",
  "www.hindenburgindia.live",
  "localhost",
  "127.0.0.1",
]);

function resolveLogoAbsolute(logo: string | null | undefined): string | null {
  const path = (logo || "").trim();
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (!path.startsWith("/uploads/")) return null;
  if (!API_URL) return path;
  try {
    return new URL(path, API_URL).toString();
  } catch {
    return null;
  }
}

interface BrandingPayload {
  brand_name?: string | null;
  full_name?: string | null;
  logo_url?: string | null;
  custom_domain?: string | null;
}

async function fetchTenantBrand(host: string): Promise<BrandingPayload | null> {
  if (!host || PLATFORM_HOSTS.has(host)) return null;
  // Preview deploys (Vercel, Netlify, Fly) — no tenant lookup.
  if (/\.(vercel|netlify|fly)\.(app|dev)$/.test(host)) return null;
  if (!API_URL) return null;
  try {
    const r = await fetch(
      `${API_URL}/api/v1/branding/by-domain?domain=${encodeURIComponent(host)}`,
      // 5-minute Next data cache. A brand edit propagates within that
      // window; without this we'd hit the API on every link-preview
      // scrape from every chat app crawler.
      { next: { revalidate: 300 } },
    );
    if (!r.ok) return null;
    const j = await r.json();
    const payload = j?.data as BrandingPayload | null;
    if (!payload) return null;
    if (!payload.brand_name && !payload.logo_url) return null;
    return payload;
  } catch {
    return null;
  }
}

const PLATFORM_TITLE = "Hindenburg India — Indian Trading Platform";
const PLATFORM_DESC =
  "Trade Indian stocks, F&O, commodities, currencies, and crypto with Hindenburg India — fast, transparent, dark-themed.";

export async function generateMetadata(): Promise<Metadata> {
  const h = headers();
  const rawHost = h.get("host") || "";
  const host = rawHost.split(":")[0].toLowerCase();
  const brand = await fetchTenantBrand(host);

  // Bits that are identical regardless of branding (PWA / Apple /
  // translate-opt-out). We splat these in below so the tenant variant
  // and platform variant stay in sync.
  const sharedBase: Partial<Metadata> = {
    applicationName: brand?.brand_name?.trim() || "Hindenburg India",
    appleWebApp: {
      capable: true,
      title: brand?.brand_name?.trim() || "Hindenburg India",
      statusBarStyle: "black-translucent",
    },
    manifest: "/manifest.webmanifest",
    other: {
      google: "notranslate",
      "google-site-verification": "",
    },
  };

  if (brand) {
    const label =
      (brand.brand_name || brand.full_name || "").trim() || "Trading";
    const title = `${label} — Trading Platform`;
    const description = `Trade with ${label} — fast, transparent, dark-themed.`;
    const logoAbs = resolveLogoAbsolute(brand.logo_url);
    return {
      ...sharedBase,
      title: { default: title, template: `%s · ${label}` },
      description,
      icons: { icon: logoAbs || "/icon.png" },
      openGraph: {
        type: "website",
        title,
        description,
        siteName: label,
        ...(logoAbs ? { images: [{ url: logoAbs }] } : {}),
      },
      twitter: {
        card: "summary",
        title,
        description,
        ...(logoAbs ? { images: [logoAbs] } : {}),
      },
    };
  }

  // Platform default.
  return {
    ...sharedBase,
    title: { default: PLATFORM_TITLE, template: "%s · Hindenburg India" },
    description: PLATFORM_DESC,
    icons: { icon: "/icon.png" },
    openGraph: {
      type: "website",
      title: PLATFORM_TITLE,
      description: PLATFORM_DESC,
      siteName: "Hindenburg India",
    },
    twitter: {
      card: "summary",
      title: PLATFORM_TITLE,
      description: PLATFORM_DESC,
    },
  };
}

export const viewport: Viewport = {
  // Match the OS chrome (Android status bar / Chrome address bar) to
  // the app's current theme instead of the brand emerald everywhere.
  // The two media-keyed entries let the BROWSER pick the right one
  // when there's no user-set theme; the <ThemeColorSync> client
  // component below overrides this in real time when the user flips
  // light/dark from Profile → Preferences so the top safe-area band
  // never stays green on a light-theme app screen.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  width: "device-width",
  initialScale: 1,
  // Lock pinch-zoom / double-tap-zoom on mobile so the installed PWA
  // (and the mobile browser view) feels like a native shell — user
  // spec: "zoom in zoom out mat ho". Desktop browsers ignore these,
  // accessibility users can still use Ctrl/Cmd-+/- which `userScalable`
  // doesn't block.
  maximumScale: 1,
  minimumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // `translate="no"` on <html> is the canonical W3C signal to all
  // translation engines (Chrome, Edge, Safari, third-party widgets)
  // that the page must not be auto-translated. Combined with the
  // <meta name="google" content="notranslate" /> in metadata.other,
  // it prevents the "Translate page?" popup from showing on refresh
  // — important because mistranslated trading labels (BUY → kharidein)
  // would be unsafe.
  return (
    <html lang="en" translate="no" suppressHydrationWarning className={inter.variable}>
      <body className="font-sans antialiased">
        <PwaRegister />
        <ThemeColorSync />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
