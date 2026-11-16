"use client";

import { useTenantBrand } from "@/lib/branding-context";

/** Marketing footer wordmark: the admin's logo + name on their own domain,
 *  the platform's light wordmark everywhere else. */
export function FooterLogo() {
  const tenant = useTenantBrand();
  if (tenant) {
    return (
      <span className="inline-flex items-center gap-2.5">
        {tenant.logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={tenant.logo} alt="" className="h-12 w-auto max-w-[96px] rounded-lg object-contain" />
        )}
        <span className="font-display text-xl font-bold tracking-tight text-white">{tenant.name}</span>
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo-hindenburg-light.svg"
      alt="Hindenburg India"
      className="h-14 w-auto"
      width={280}
      height={56}
      loading="lazy"
      decoding="async"
    />
  );
}
