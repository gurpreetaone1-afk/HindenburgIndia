"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Sprout } from "lucide-react";
import { useBranding } from "@/lib/branding-context";
import { API_URL } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Auth shell — split screen.
 *
 * Left: a dark showcase card (own mini nav, gradient glow, social proof and
 * headline) that only appears once there is room for it, from 1024 up.
 * Right: the form column, which is the whole screen on a phone.
 *
 * The card is a sibling of the form rather than a background, so the form
 * column keeps the page's white surface and never has to fight for contrast.
 */

/** Tenant logo tile — falls back to the Sprout glyph until an image loads. */
function BrandTile({ logoSrc, alt }: { logoSrc: string | null; alt: string }) {
  const [imgLoaded, setImgLoaded] = useState(false);
  return (
    <span className="relative grid size-9 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground">
      <Sprout className="size-5" strokeWidth={2.5} />
      {logoSrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoSrc}
          alt={alt}
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgLoaded(false)}
          className={cn(
            "absolute inset-0 rounded-xl bg-card object-contain p-1 transition-opacity",
            imgLoaded ? "opacity-100" : "opacity-0",
          )}
        />
      )}
    </span>
  );
}

/** Social proof avatars. Illustrations, not photographs of real customers. */
const AVATARS = [
  "/avatars/trader-1.svg",
  "/avatars/trader-2.svg",
  "/avatars/trader-3.svg",
  "/avatars/trader-4.svg",
];

/** Exchanges and depositories, in place of the reference's investor logos. */
const BACKED_BY = ["NSE", "BSE", "MCX", "CDSL"];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<main className="min-h-screen w-full bg-background" />}>
      <AuthLayoutInner>{children}</AuthLayoutInner>
    </Suspense>
  );
}

function AuthLayoutInner({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const { branding } = useBranding();
  const tenantName = (branding?.brand_name ?? "").trim();
  const logoSrc = branding?.logo_url ? `${API_URL}${branding.logo_url}` : null;

  // Impersonation handoff renders bare — it's a redirect screen, not a form.
  const isImpersonating = !!(searchParams?.get("access") && searchParams?.get("refresh"));
  if (isImpersonating) {
    return (
      <main className="grid min-h-screen w-full place-items-center bg-background">
        {children}
      </main>
    );
  }

  const brandName = tenantName || "Hindenburg India";

  return (
    <main className="flex min-h-screen w-full bg-background p-3 lg:gap-3 lg:p-4">
      {/* ── Showcase card ─────────────────────────────────────────────── */}
      <aside className="relative hidden w-[46%] max-w-[42rem] shrink-0 flex-col overflow-hidden rounded-[1.75rem] bg-[#050b18] p-8 text-white lg:flex xl:p-10">
        {/* Showcase artwork. The card is far taller than it is wide (~672 x
            1048) while the source is near-square, so `object-cover` crops the
            sides rather than letterboxing. `bg-[#050b18]` above stays as the
            fallback for the moment before it loads. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/login_img.png"
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full object-cover"
        />

        {/* Scrim. The badge, headline and body all sit at the bottom of the
            card, so the opaque end of the gradient is weighted there — without
            it the white text loses contrast wherever the artwork runs light. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#050b18] via-[#050b18]/70 to-[#050b18]/25"
        />

        <div className="relative z-10 mt-auto">
          <div className="inline-flex items-center gap-2.5 rounded-full bg-white/10 py-1.5 pl-1.5 pr-4 ring-1 ring-inset ring-white/15 backdrop-blur-sm">
            <span className="flex -space-x-2">
              {AVATARS.map((src) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={src}
                  src={src}
                  alt=""
                  aria-hidden
                  className="size-6 rounded-full bg-[#dce6f5] ring-2 ring-[#050b18]"
                />
              ))}
            </span>
            <span className="text-xs font-medium text-white/85">Trusted by 5,000+ traders</span>
          </div>

          {/* `text-white` is required, not redundant: the base layer in
              globals.css sets `text-foreground` on every h1–h4, and that
              explicit colour beats the `text-white` inherited from <aside>. */}
          <h2 className="mt-7 max-w-[15ch] text-[2.75rem] font-semibold leading-[1.05] tracking-tight text-white xl:text-[3.25rem]">
            Every Indian market, one account
          </h2>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-white/65">
            Equity, F&amp;O, commodities and currency on NSE, BSE and MCX. Flat ₹20 per order,
            transparent margin, and fills that land in milliseconds.
          </p>
        </div>
      </aside>

      {/* ── Form column ───────────────────────────────────────────────── */}
      <section className="flex min-w-0 flex-1 flex-col px-1 py-6 sm:px-6 lg:px-10 lg:py-10">
        {/* Phone only. On desktop the screen carries no lockup at all; on a
            phone the showcase card is hidden, so this is the sole brand cue
            (and the only way back to the site). */}
        <Link href="/" className="mb-8 inline-flex items-center gap-2.5 lg:hidden">
          <BrandTile logoSrc={logoSrc} alt={brandName} />
          <span className="text-base font-semibold tracking-tight text-foreground">
            {brandName}
          </span>
        </Link>

        <div className="mx-auto flex w-full max-w-[26rem] flex-1 flex-col justify-center">
          {children}
        </div>

        <div className="mx-auto mt-10 w-full max-w-[26rem]">
          <p className="text-xs font-medium text-muted-foreground">Backed by the best</p>
          <div className="mt-3 flex items-center gap-6">
            {BACKED_BY.map((name) => (
              <span
                key={name}
                className="text-lg font-bold tracking-tight text-muted-foreground/45"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
