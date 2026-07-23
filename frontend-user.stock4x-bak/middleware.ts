import { NextResponse, type NextRequest } from "next/server";

// Keep in sync with PLATFORM_HOSTS in lib/branding-context.tsx — these
// are the hostnames where we render the full marketing landing at `/`.
// Tenant hosts (custom domains) get redirected past it.
const PLATFORM_HOSTS = new Set<string>([
  "hindenburgindia.live",
  "www.hindenburgindia.live",
  "admin.hindenburgindia.live",
  "localhost",
  "127.0.0.1",
]);

function isPlatformHost(host: string): boolean {
  if (PLATFORM_HOSTS.has(host.toLowerCase())) return true;
  return /\.(vercel|netlify|fly)\.(app|dev)$/.test(host);
}

// Module-level cache so we don't hit /by-domain on every `/` request.
// Keyed by hostname → { mode: "apex" | "subdomain" | "unknown", at: ms }.
type CacheEntry = { mode: "apex" | "subdomain" | "unknown"; at: number };
const CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

async function resolveMode(host: string, apiBase: string): Promise<CacheEntry["mode"]> {
  const cached = CACHE.get(host);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.mode;
  try {
    const r = await fetch(
      `${apiBase}/api/v1/branding/by-domain?domain=${encodeURIComponent(host)}`,
      { headers: { accept: "application/json" }, cache: "no-store" },
    );
    if (!r.ok) {
      CACHE.set(host, { mode: "unknown", at: Date.now() });
      return "unknown";
    }
    const j = await r.json();
    const sub = j?.data?.app_subdomain || null;
    const mode: CacheEntry["mode"] = sub ? "subdomain" : "apex";
    CACHE.set(host, { mode, at: Date.now() });
    return mode;
  } catch {
    CACHE.set(host, { mode: "unknown", at: Date.now() });
    return "unknown";
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Only intercept the bare root — every other route falls through.
  if (pathname !== "/") return NextResponse.next();

  // Strip port for matching (`tarundewangan.com:3000` → `tarundewangan.com`).
  const host = (req.headers.get("host") || "").split(":")[0].toLowerCase();
  if (!host || isPlatformHost(host)) return NextResponse.next();

  const apiBase =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.API_URL ||
    "https://api.hindenburgindia.live";
  const mode = await resolveMode(host, apiBase);

  // ANY custom-domain mode (apex OR subdomain) → land on /login
  // directly. The custom domain is a broker's branded portal — a
  // visitor on profitfx.in expects to see "ProfitFX login" rather
  // than a generic Hindenburg India marketing landing. Previously only
  // subdomain mode hit this branch; apex mode fell through to the
  // landing, which is what the user (ProfitFX admin) flagged. Both
  // modes now redirect identically; the apex / subdomain distinction
  // is preserved purely for SSL provisioning + DNS record display in
  // the admin Branding page.
  //
  // Only the bare root `/` is redirected — marketing sub-routes
  // (/markets, /education, /features) stay reachable so a broker who
  // explicitly wants to surface those can link to them from their own
  // pages. Unknown-mode hosts (resolveMode returned "unknown" because
  // the by-domain lookup failed) fall through unchanged so we don't
  // accidentally block a brand-new domain whose row hasn't been
  // verified yet.
  if (mode === "apex" || mode === "subdomain") {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url, 307);
  }

  return NextResponse.next();
}

export const config = {
  // Match the root path only — Next.js parses this into a path regex.
  matcher: ["/"],
};
