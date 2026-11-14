import { NextResponse, type NextRequest } from "next/server";
import { API_URL } from "@/lib/constants";

// Login-only white-label sites (admin's "Signup & demo on your site" = OFF):
// send "/", /register and /demo straight to /login on the server, so the
// platform landing page never flashes before the client-side check runs.
const PLATFORM = /^(www\.)?hindenburgindia\.live$|^localhost$|^127\.0\.0\.1$/;
const TTL_MS = 60_000;
const signupOn = new Map<string, { on: boolean; at: number }>();

async function isSignupOn(host: string): Promise<boolean> {
  const hit = signupOn.get(host);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.on;
  let on = true; // unknown / unreachable → behave as before
  try {
    const r = await fetch(`${API_URL}/api/v1/branding/by-domain?domain=${encodeURIComponent(host)}`, {
      cache: "no-store",
    });
    if (r.ok) on = (await r.json())?.data?.signup_enabled !== false;
  } catch {
    /* keep default */
  }
  signupOn.set(host, { on, at: Date.now() });
  return on;
}

export async function middleware(req: NextRequest) {
  const host = (req.headers.get("host") || "").split(":")[0].toLowerCase();
  if (!host || PLATFORM.test(host) || (await isSignupOn(host))) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/", "/register/:path*", "/demo/:path*"] };
