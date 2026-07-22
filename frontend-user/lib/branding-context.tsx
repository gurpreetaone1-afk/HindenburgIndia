"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { API_URL, STORAGE_KEYS } from "@/lib/constants";

export interface BrandingPayload {
  user_code: string | null;
  full_name?: string | null;
  brand_name: string | null;
  logo_url: string | null;
  custom_domain?: string | null;
  custom_domain_status?: string | null;
  public_demo_enabled?: boolean;
  public_demo_balance?: number;
}

interface Ctx {
  branding: BrandingPayload | null;
  loading: boolean;
}

const BrandingCtx = createContext<Ctx>({ branding: null, loading: true });

// Static platform-host allowlist. EVERY production deploy must update
// this list. NEVER inject `window.location.hostname` here — every
// tenant domain would self-classify as platform and the
// `/by-domain` lookup would be skipped, leaving the tenant on
// platform branding (the historical "branding default on tenant
// domain" bug).
const PLATFORM_HOSTS = new Set<string>([
  "hindenburgindia.live",
  "www.hindenburgindia.live",
  "admin.hindenburgindia.live",
  "localhost",
  "127.0.0.1",
]);

export function isPlatformHost(host: string): boolean {
  if (PLATFORM_HOSTS.has(host.toLowerCase())) return true;
  // Common preview platforms — Vercel / Netlify / Fly previews of
  // platform builds (`*.vercel.app`, `*.netlify.app`, `*.fly.dev`).
  return /\.(vercel|netlify|fly)\.(app|dev)$/.test(host);
}

/**
 * Applies the branding to the document chrome:
 *   - title
 *   - favicon (MUTATE href in place — never replace the React-owned
 *     <link> node, that crashes Next's metadata reconciler)
 *   - manifest pointer (so PWA "install" picks up tenant identity)
 */
function applyBrandingChrome(brand: BrandingPayload) {
  if (typeof document === "undefined") return;
  const name = (brand.brand_name || "").trim();
  if (name) document.title = name;

  const logo = brand.logo_url
    ? brand.logo_url.startsWith("http")
      ? brand.logo_url
      : `${API_URL}${brand.logo_url}`
    : null;

  if (logo) {
    // Mutate the existing icon link in place rather than replacing
    // the node. Next.js' metadata system OWNS the original
    // <link rel="icon"> — cloneNode / replaceWith on it crashes the
    // reconciler with "Cannot read properties of null (reading
    // 'removeChild')". Setting href is safe.
    const existing = document.head.querySelector(
      'link[rel="icon"]',
    ) as HTMLLinkElement | null;
    if (existing) existing.href = logo;
    // Also drop a branding-owned link with a stable id so future
    // re-applies update only OUR node, never React's.
    const ours = document.head.querySelector(
      "link[data-stock4x-branding-icon]",
    ) as HTMLLinkElement | null;
    if (ours) {
      ours.href = logo;
    } else {
      const link = document.createElement("link");
      link.rel = "icon";
      link.href = logo;
      link.setAttribute("data-stock4x-branding-icon", "1");
      document.head.appendChild(link);
    }
  }

  // Manifest swap — point to dynamic per-tenant manifest so the OS
  // install picks up the broker's name + logo (not platform's).
  if (brand.user_code) {
    const manifest = document.head.querySelector(
      'link[rel="manifest"]',
    ) as HTMLLinkElement | null;
    const dynamicHref = `/manifest.webmanifest?u=${encodeURIComponent(brand.user_code)}`;
    if (manifest) {
      manifest.href = dynamicHref;
    } else {
      const link = document.createElement("link");
      link.rel = "manifest";
      link.href = dynamicHref;
      document.head.appendChild(link);
    }
  }
}

async function fetchBrandingByCode(code: string): Promise<BrandingPayload | null> {
  try {
    const r = await fetch(
      `${API_URL}/api/v1/branding/by-code/${encodeURIComponent(code)}`,
      { credentials: "omit" },
    );
    if (!r.ok) return null;
    const j = await r.json();
    return j?.data ?? null;
  } catch {
    return null;
  }
}

async function fetchBrandingByDomain(domain: string): Promise<BrandingPayload | null> {
  try {
    const r = await fetch(
      `${API_URL}/api/v1/branding/by-domain?domain=${encodeURIComponent(domain)}`,
      { credentials: "omit" },
    );
    if (!r.ok) return null;
    const j = await r.json();
    return j?.data ?? null;
  } catch {
    return null;
  }
}

async function fetchMyBranding(token: string): Promise<BrandingPayload | null> {
  try {
    const r = await fetch(`${API_URL}/api/v1/user/branding/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j?.data ?? null;
  } catch {
    return null;
  }
}

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const [branding, setBranding] = useState<BrandingPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const ref = params.get("ref")?.trim();
        const host = window.location.hostname;
        let payload: BrandingPayload | null = null;

        if (ref) {
          // Referral link wins — admin shared this URL to attribute
          // signups to themselves.
          payload = await fetchBrandingByCode(ref);
        } else if (!isPlatformHost(host)) {
          // Tenant domain — look up by hostname.
          payload = await fetchBrandingByDomain(host);
        } else {
          // Platform host: if logged in, swap chrome for the user's own
          // brand-bearing admin. If NOT logged in (e.g. the login page),
          // still fetch the platform payload so the super-admin's public
          // "Try Demo" config reaches the login button — brand stays the
          // platform default (brand_name is null there).
          const tok =
            window.localStorage.getItem(STORAGE_KEYS.accessToken) || null;
          payload = tok
            ? await fetchMyBranding(tok)
            : await fetchBrandingByDomain(host);
        }

        if (!cancelled && payload) {
          setBranding(payload);
          // Only rewrite favicon/title/manifest when a real brand came back;
          // the platform "Try Demo" payload has no brand and must not blank
          // out the default Hindenburg India chrome.
          if (payload.brand_name || payload.logo_url) applyBrandingChrome(payload);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <BrandingCtx.Provider value={{ branding, loading }}>
      {children}
    </BrandingCtx.Provider>
  );
}

export function useBranding(): Ctx {
  return useContext(BrandingCtx);
}

/** Resolve the absolute URL the user-side `<img src>` should use for
 *  a logo. Empty/null → caller renders the default platform icon. */
export function resolveLogoUrl(logoUrl?: string | null): string | null {
  if (!logoUrl) return null;
  if (logoUrl.startsWith("http")) return logoUrl;
  return `${API_URL}${logoUrl}`;
}
