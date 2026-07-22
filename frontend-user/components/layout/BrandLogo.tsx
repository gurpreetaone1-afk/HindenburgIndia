"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { isPlatformHost, resolveLogoUrl, useBranding } from "@/lib/branding-context";

interface BrandLogoProps {
  href?: string | null;
  size?: "sm" | "md" | "lg";
  iconOnly?: boolean;
  className?: string;
}

// Renders the Hindenburg India logomark by default. When the BrandingProvider
// has loaded a tenant brand (custom domain visitor, referral link
// landing, or logged-in user under a branded broker) the logo +
// alt-text swap to that brand on the fly. Falls back to the
// platform logo when branding payload has no `logo_url`.
export function BrandLogo({ href = "/dashboard", size = "md", iconOnly = false, className }: BrandLogoProps) {
  const { branding, loading } = useBranding();
  const customLogo = resolveLogoUrl(branding?.logo_url);
  const customName = (branding?.brand_name || "").trim();
  const altText = customName || "Hindenburg India";

  const dims = {
    sm: { w: 110, h: 28 },
    md: { w: 150, h: 38 },
    lg: { w: 200, h: 50 },
  }[size];

  // FOUC guard: on tenant hosts we don't know the brand until the
  // /by-domain fetch resolves. Rather than flashing the platform logo
  // first and snapping to the tenant logo on hydration, reserve the
  // space with an invisible placeholder of the same dimensions.
  // Platform hosts are unaffected — they show the default logo
  // immediately.
  const [tenantSuspectHost, setTenantSuspectHost] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setTenantSuspectHost(!isPlatformHost(window.location.hostname));
  }, []);
  if (loading && tenantSuspectHost && !customLogo) {
    const w = iconOnly ? dims.h : dims.w;
    return (
      <span
        aria-hidden
        className={cn("inline-block", className)}
        style={{ width: `${w}px`, height: `${dims.h}px` }}
      />
    );
  }

  // iconOnly crops to a square thumbnail of just the left chart-arrow
  // tile of the logo (used in tight spots like the mobile auth header).
  // Implemented with object-position + a fixed square frame instead of
  // shipping a second asset.
  const content = iconOnly ? (
    <span
      className={cn(
        "relative inline-block overflow-hidden rounded-md",
        size === "sm" ? "size-6" : size === "lg" ? "size-10" : "size-8",
        className,
      )}
    >
      {customLogo ? (
        // Tenant logo via plain <img>: next/image needs `domains`
        // config for cross-origin and we don't know tenant CDN
        // origins up-front. Plain img + object-fit covers every
        // case.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={customLogo}
          alt={altText}
          className="size-full"
          style={{ objectFit: "cover", objectPosition: "left center" }}
        />
      ) : (
        <Image
          src="/logo1.png"
          alt={altText}
          fill
          priority
          sizes="40px"
          style={{ objectFit: "cover", objectPosition: "left center" }}
        />
      )}
    </span>
  ) : customLogo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={customLogo}
      alt={altText}
      className={cn("select-none", className)}
      style={{ height: `${dims.h}px`, width: "auto" }}
    />
  ) : (
    <Image
      src="/logo1.png"
      alt={altText}
      width={dims.w}
      height={dims.h}
      priority
      className={cn("select-none", className)}
      // Explicit height + width:auto preserves aspect ratio and silences
      // the next/image "modified one dimension only" runtime warning.
      style={{ height: `${dims.h}px`, width: "auto" }}
    />
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex items-center outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">
        {content}
      </Link>
    );
  }
  return content;
}
