"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { BrandLogo } from "@/components/layout/BrandLogo";

// Marketing-split layout is wrapped in a Suspense boundary so the inner
// component can read `useSearchParams()` (Next.js 14 requires this).
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<main className="min-h-screen w-full bg-white" />}>
      <AuthLayoutInner>{children}</AuthLayoutInner>
    </Suspense>
  );
}

function AuthLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Admin "Login as user" path — same behaviour as before, render only a
  // centred loader so the user never sees the auth chrome on the way to
  // /dashboard.
  const isImpersonating = !!(
    searchParams?.get("access") && searchParams?.get("refresh")
  );

  if (isImpersonating) {
    return (
      <main className="grid min-h-screen w-full place-items-center bg-white">
        {children}
      </main>
    );
  }

  return (
    <main className="relative min-h-screen w-full overflow-hidden">
      {/* ── Full-bleed background ───────────────────────────────────────────
          Swap this gradient for a real (blurred) image later, e.g.:
          style={{ backgroundImage: "url('/auth-bg.jpg')", backgroundSize: "cover",
                   backgroundPosition: "center" }} */}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(160deg, #0f2238 0%, #16314f 55%, #1F4677 100%)" }}
      />
      <div className="absolute inset-0 bg-black/10 backdrop-blur-[2px]" />

      {/* Page-level Back — top-left over the background, bold + white */}
      <button
        type="button"
        onClick={() => router.back()}
        className="absolute left-5 top-5 z-20 inline-flex items-center gap-2 text-base font-bold text-white transition-opacity hover:opacity-80 sm:left-8 sm:top-7"
      >
        <ArrowLeft className="size-5" />
        Back
      </button>

      {/* ── Centered card ───────────────────────────────────────────────── */}
      <div className="relative z-10 flex min-h-screen items-center justify-center p-4 sm:p-6">
        <div className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] bg-white shadow-2xl lg:grid-cols-2">

          {/* LEFT — login banner image */}
          <div className="relative hidden min-h-[620px] lg:block">
            <img
              src="/login_banner.png"
              alt="Hindenburg India — where smart traders build wealth"
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>

          {/* RIGHT — form column */}
          <div className="flex min-h-[620px] flex-col p-6 sm:p-8">
            {/* Top — brand logo */}
            <div className="mb-5">
              <BrandLogo href="/" size="sm" />
            </div>

            {/* Page content (heading + form) */}
            <div className="flex flex-1 flex-col justify-center">
              <div className="w-full">{children}</div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
