/**
 * Dynamic PWA manifest.
 *
 * Resolution order:
 *   1. `?u=<user_code>` → that admin's branding (referral installs on the
 *      platform domain, before the broker has a custom domain).
 *   2. Otherwise the requesting **Host** header → tenant branding by domain.
 *      This is the load-bearing path for custom-domain white-labels
 *      (e.g. tarundewangan.com): the bare `/manifest.webmanifest` the SSR
 *      `<link rel="manifest">` points to — AND the URL Chrome re-fetches on
 *      its periodic "did the installed app change?" check — now returns the
 *      broker's OWN name/icon instead of the platform default. Without this
 *      the host manifest fell back to "Hindenburg India", so Chrome popped the
 *      "Review name and icon updates → Hindenburg India" warning on a Tarun-Trading
 *      install.
 *   3. Neither matches → platform default.
 *
 * Next 14 routes a single `/manifest.webmanifest` URL; a Route Handler is the
 * only way to read the query string + Host + tenant data at request time.
 */

import { NextResponse } from "next/server";

const PLATFORM_MANIFEST = {
  name: "Hindenburg India",
  short_name: "Hindenburg",
  description:
    "Trade Indian stocks, F&O, commodities, currencies, and crypto with Hindenburg India.",
  start_url: "/dashboard",
  scope: "/",
  display: "standalone",
  orientation: "portrait",
  background_color: "#0a0a0a",
  theme_color: "#0a0a0a",
  categories: ["finance", "business"],
  icons: [
    // Cache-buster `?v=2` forces Android Chrome and any installed PWA to
    // re-fetch the icons instead of serving the placeholder emerald
    // sprout from before the brand-mark switch. Bump again whenever the
    // icon-{size}.png files change in this repo.
    { src: "/icons/icon-192.png?v=2", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icons/icon-512.png?v=2", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icons/icon-maskable-512.png?v=2", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Hosts that are the platform itself (never a white-label) — skip the
// per-domain branding lookup so the default manifest is served directly.
const PLATFORM_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "hindenburgindia.live",
  "www.hindenburgindia.live",
]);

export const dynamic = "force-dynamic"; // never cache — query string + host drive content
export const revalidate = 0;

/** Overlay a resolved brand onto the platform manifest. */
function brandedManifest(brand: any): typeof PLATFORM_MANIFEST {
  const name = String(brand?.brand_name || "").trim();
  const logo = String(brand?.logo_url || "").trim();
  const out = { ...PLATFORM_MANIFEST };
  if (name) {
    out.name = name;
    out.short_name = name.length > 12 ? name.slice(0, 12) : name;
  }
  if (logo) {
    const absoluteLogo = logo.startsWith("http") ? logo : `${API_URL}${logo}`;
    // Install prompt picks the largest icon — the tenant logo isn't
    // necessarily sized for 192/512, but the browser scales it; lesser evil
    // vs a branded install carrying the platform icon.
    out.icons = [
      { src: absoluteLogo, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: absoluteLogo, sizes: "512x512", type: "image/png", purpose: "any" },
    ];
  }
  return out;
}

async function fetchBrand(path: string): Promise<any | null> {
  try {
    const r = await fetch(`${API_URL}${path}`, { cache: "no-store" });
    if (!r.ok) return null;
    const j = await r.json();
    const brand = j?.data ?? null;
    // Only treat as a real tenant when something brandable came back.
    if (!brand || (!brand.brand_name && !brand.logo_url)) return null;
    return brand;
  } catch {
    return null;
  }
}

function json(manifest: object, maxAge: number) {
  return NextResponse.json(manifest, {
    headers: { "Cache-Control": `public, max-age=${maxAge}` },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const userCode = url.searchParams.get("u")?.trim();

  // 1) Explicit ?u=<code> (referral install on the platform domain).
  if (userCode) {
    const brand = await fetchBrand(`/api/v1/branding/by-code/${encodeURIComponent(userCode)}`);
    return json(brand ? brandedManifest(brand) : PLATFORM_MANIFEST, brand ? 120 : 60);
  }

  // 2) Host-based white-label — the custom-domain path. Resolve the tenant by
  //    the requesting domain so the bare manifest URL (and Chrome's update
  //    check) returns the broker's brand, not the platform default.
  const host = (request.headers.get("host") || "").split(":")[0].toLowerCase();
  if (host && !PLATFORM_HOSTS.has(host)) {
    const brand = await fetchBrand(
      `/api/v1/branding/by-domain?domain=${encodeURIComponent(host)}`,
    );
    if (brand) return json(brandedManifest(brand), 120);
  }

  // 3) Platform default.
  return json(PLATFORM_MANIFEST, 300);
}
