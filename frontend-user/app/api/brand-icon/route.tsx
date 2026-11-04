import { NextRequest } from "next/server";
import { ImageResponse } from "next/og";

/**
 * Same-origin icon proxy for PWA manifest.
 *
 * Chrome Android prioritises same-origin icons over cross-origin ones.
 * Admin logos live on api.hindenburgindia.live (cross-origin), so Chrome
 * always picked the platform default /icons/icon-192.png instead.
 *
 * This route proxies the admin logo through the Next.js server so the
 * manifest can reference `/api/brand-icon?u=ADM123` (same-origin) and
 * Chrome picks it up as the PWA launcher icon.
 *
 * GET /api/brand-icon?u=<USER_CODE>            raw logo
 * GET /api/brand-icon?u=<USER_CODE>&v=round    PNG: logo filling a circle,
 *                                               transparent corners ("any")
 * GET /api/brand-icon?u=<USER_CODE>&v=maskable PNG: that circle at 78% on the
 *     app background, inside Android's safe zone — Android crops maskable
 *     icons to its own shape, which cut the raw logo's ring and showed its
 *     white corners on the installed app's icon + splash.
 * `&s=192` sizes the PNG (default 512).
 */
const APP_BG = "#0a0a0a"; // manifest background_color

export const dynamic = "force-dynamic";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "");

export async function GET(req: NextRequest) {
  const userCode = (req.nextUrl.searchParams.get("u") || "").trim().toUpperCase();
  if (!userCode || !API_BASE) {
    return new Response("Missing user code", { status: 400 });
  }

  try {
    const brandRes = await fetch(
      `${API_BASE}/api/v1/branding/by-code/${encodeURIComponent(userCode)}`,
      { cache: "no-store", headers: { Accept: "application/json" } },
    );
    if (!brandRes.ok) {
      return new Response("Branding not found", { status: 404 });
    }
    const json = await brandRes.json();
    const logoUrl = json?.data?.logo_url;
    if (!logoUrl) {
      return new Response("No logo configured", { status: 404 });
    }

    const imgRes = await fetch(`${API_BASE}${logoUrl}`, { cache: "no-store" });
    if (!imgRes.ok) {
      return new Response("Logo fetch failed", { status: 502 });
    }

    const contentType = imgRes.headers.get("content-type") || "image/png";
    const buffer = await imgRes.arrayBuffer();

    const variant = req.nextUrl.searchParams.get("v");
    if (variant === "round" || variant === "maskable") {
      const size = req.nextUrl.searchParams.get("s") === "192" ? 192 : 512;
      const d = Math.round(size * (variant === "maskable" ? 0.78 : 1));
      const src = `data:${contentType};base64,${Buffer.from(buffer).toString("base64")}`;
      return new ImageResponse(
        (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: variant === "maskable" ? APP_BG : "transparent",
            }}
          >
            <div
              style={{
                width: d,
                height: d,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "50%",
                overflow: "hidden",
              }}
            >
              {/* 5% larger than the circle: trims the thin margin most
                  round-emblem logos have, same as the web header. */}
              {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
              <img
                src={src}
                width={Math.round(d * 1.05)}
                height={Math.round(d * 1.05)}
                style={{ objectFit: "cover" }}
              />
            </div>
          </div>
        ),
        {
          width: size,
          height: size,
          headers: { "Cache-Control": "public, max-age=3600" },
        },
      );
    }

    return new Response(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return new Response("Proxy error", { status: 500 });
  }
}
