"use client";

/**
 * Device fingerprint collector — Phase 5 of the User Risk Analysis
 * platform.
 *
 * Collects a stable, deterministic signal vector from the browser +
 * hardware, hashes it client-side (SHA256), and ships hash + raw
 * signals to `/api/v1/user/auth/fingerprint`. The same browser on
 * the same machine produces the same hash, so the admin's
 * linked-accounts probe can detect "two user accounts sharing one
 * device" — the strongest single signal in the multi-account abuse
 * detection arsenal.
 *
 * Signal vector (concatenation order MIRRORS the backend's
 * `device_fingerprint_service.server_side_hash`; reorder ONLY if you
 * also update the backend reference in the same commit):
 *
 *   userAgent | platform | language | timezone | screen |
 *   colorDepth | pixelRatio | hardwareConcurrency | deviceMemory |
 *   touchPoints | canvasHash | webglVendor | webglRenderer |
 *   audioHash | fonts | cookieEnabled
 *
 * NOT collected (deliberately): IP (server-side), incognito flag
 * (unreliable across browsers), battery (deprecated API), WebRTC
 * local IP (privacy nightmare, blocked in modern browsers anyway).
 */

import { AuthAPI } from "@/lib/api";

interface FingerprintSignals {
  userAgent: string;
  platform: string;
  language: string;
  timezone: string;
  screen: string;
  colorDepth: number;
  pixelRatio: number;
  hardwareConcurrency: number;
  deviceMemory: number | null;
  touchPoints: number;
  canvasHash: string;
  webglVendor: string;
  webglRenderer: string;
  audioHash: string;
  fonts: string[];
  cookieEnabled: boolean;
}

/**
 * Canvas fingerprint — paints a fixed glyph + gradient onto a hidden
 * canvas and hashes the resulting pixel data. Different GPUs / OS-
 * level font rendering / browser bug-for-bug compat produces subtly
 * different output → strong differentiator with no privacy footprint
 * beyond device identity.
 */
function computeCanvasHash(): string {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 280;
    canvas.height = 60;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.textBaseline = "top";
    ctx.font = "16px Arial";
    ctx.fillStyle = "#f60";
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("Hindenburg India fp 0123456789!@#$%^&*", 2, 15);
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.fillText("Hindenburg India fp 0123456789!@#$%^&*", 4, 17);
    return canvas.toDataURL().slice(-128);
  } catch {
    return "";
  }
}

/**
 * WebGL renderer + vendor strings. Surface stable hardware identity
 * — on Apple Silicon you get "Apple GPU"; on an RTX 4070 laptop you
 * get the full Nvidia chipset name. Massive differentiator across
 * machines, irrelevant within one.
 */
function computeWebglIdentity(): { vendor: string; renderer: string } {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      (canvas.getContext("webgl") ||
        canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return { vendor: "", renderer: "" };
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const vendor = dbg
      ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL))
      : String(gl.getParameter(gl.VENDOR));
    const renderer = dbg
      ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER));
    return { vendor, renderer };
  } catch {
    return { vendor: "", renderer: "" };
  }
}

/**
 * Audio fingerprint — uses an OfflineAudioContext to render a fixed
 * oscillator + compressor pipeline and hashes the resulting buffer.
 * Sensitive to CPU / OS audio stack differences. Wrapped in a
 * Promise + timeout so a hostile browser that hangs the audio
 * context can't lock the fingerprint forever.
 */
function computeAudioHash(): Promise<string> {
  return new Promise<string>((resolve) => {
    let resolved = false;
    const settle = (v: string) => {
      if (!resolved) {
        resolved = true;
        resolve(v);
      }
    };
    setTimeout(() => settle(""), 1000);
    try {
      const AudioCtx =
        (window as any).OfflineAudioContext ||
        (window as any).webkitOfflineAudioContext;
      if (!AudioCtx) return settle("");
      const ctx = new AudioCtx(1, 44100, 44100);
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(10000, ctx.currentTime);
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.setValueAtTime(-50, ctx.currentTime);
      comp.knee.setValueAtTime(40, ctx.currentTime);
      comp.ratio.setValueAtTime(12, ctx.currentTime);
      comp.attack.setValueAtTime(0, ctx.currentTime);
      comp.release.setValueAtTime(0.25, ctx.currentTime);
      osc.connect(comp);
      comp.connect(ctx.destination);
      osc.start(0);
      ctx.startRendering();
      ctx.oncomplete = (ev: any) => {
        try {
          const buf = ev.renderedBuffer.getChannelData(0);
          let sum = 0;
          for (let i = 4500; i < 5000; i++) sum += Math.abs(buf[i]);
          settle(sum.toFixed(6));
        } catch {
          settle("");
        }
      };
    } catch {
      settle("");
    }
  });
}

/**
 * Probe a fixed list of common fonts via canvas width measurement.
 * Browsers render a fallback font when the requested one is absent,
 * producing different glyph widths — we detect "installed" by
 * comparing the rendered width against a baseline fallback. The
 * set is the most-distinctive 16 from the standard 200-font CSS
 * fingerprinting list, picked for low collision in the Indian
 * user base.
 */
function detectFonts(): string[] {
  const BASELINE_FONTS = ["monospace", "sans-serif", "serif"];
  const CANDIDATES = [
    "Arial",
    "Verdana",
    "Helvetica",
    "Times New Roman",
    "Courier New",
    "Comic Sans MS",
    "Tahoma",
    "Georgia",
    "Impact",
    "Trebuchet MS",
    "Lucida Console",
    "Segoe UI",
    "Roboto",
    "Inter",
    "SF Pro Display",
    "Noto Sans",
  ];
  try {
    const span = document.createElement("span");
    span.style.cssText =
      "position:absolute;left:-9999px;visibility:hidden;font-size:72px;";
    span.textContent = "mmmmmmmmmmlli";
    document.body.appendChild(span);
    const baseline: Record<string, { w: number; h: number }> = {};
    for (const b of BASELINE_FONTS) {
      span.style.fontFamily = b;
      baseline[b] = {
        w: span.offsetWidth,
        h: span.offsetHeight,
      };
    }
    const installed: string[] = [];
    for (const f of CANDIDATES) {
      let detected = false;
      for (const b of BASELINE_FONTS) {
        span.style.fontFamily = `"${f}",${b}`;
        const w = span.offsetWidth;
        const h = span.offsetHeight;
        if (w !== baseline[b].w || h !== baseline[b].h) {
          detected = true;
          break;
        }
      }
      if (detected) installed.push(f);
    }
    document.body.removeChild(span);
    return installed;
  } catch {
    return [];
  }
}

/**
 * SHA256 in pure browser via Web Crypto. Backend's
 * `server_side_hash` produces the IDENTICAL output given the same
 * signals — that's the whole point of the canonical
 * concatenation order.
 */
async function sha256Hex(s: string): Promise<string> {
  const data = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest("SHA-256", data);
  const arr = Array.from(new Uint8Array(buf));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Build the full fingerprint signal vector + the canonical SHA256
 * hash. Returns both so the caller (`collectAndSubmit`) can POST
 * them together for backend storage.
 */
export async function buildFingerprint(): Promise<{
  hash: string;
  signals: FingerprintSignals;
}> {
  const nav = window.navigator;
  const scr = window.screen;
  const webgl = computeWebglIdentity();
  const audioHash = await computeAudioHash();

  const signals: FingerprintSignals = {
    userAgent: String(nav.userAgent || ""),
    platform: String(nav.platform || ""),
    language: String(nav.language || ""),
    timezone:
      (Intl && Intl.DateTimeFormat
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : "") || "",
    screen: `${scr.width}x${scr.height}@${scr.colorDepth}`,
    colorDepth: scr.colorDepth || 0,
    pixelRatio: Number(window.devicePixelRatio || 1),
    hardwareConcurrency: Number(nav.hardwareConcurrency || 0),
    deviceMemory: Number((nav as any).deviceMemory ?? null),
    touchPoints: Number(nav.maxTouchPoints || 0),
    canvasHash: computeCanvasHash(),
    webglVendor: webgl.vendor,
    webglRenderer: webgl.renderer,
    audioHash,
    fonts: detectFonts(),
    cookieEnabled: Boolean(nav.cookieEnabled),
  };

  // Canonical ordering — MUST match server_side_hash on the backend.
  const ORDER: (keyof FingerprintSignals)[] = [
    "userAgent",
    "platform",
    "language",
    "timezone",
    "screen",
    "colorDepth",
    "pixelRatio",
    "hardwareConcurrency",
    "deviceMemory",
    "touchPoints",
    "canvasHash",
    "webglVendor",
    "webglRenderer",
    "audioHash",
    "fonts",
    "cookieEnabled",
  ];
  const parts = ORDER.map((k) => {
    const v = signals[k];
    if (v == null) return "";
    if (Array.isArray(v)) return v.join(",");
    return String(v);
  });
  const hash = await sha256Hex(parts.join("|"));
  return { hash, signals };
}

/**
 * Fire-and-forget — build the fingerprint, POST it, swallow any
 * error so the caller's auth flow never blocks. Called from the
 * login mutation's onSuccess.
 */
export async function collectAndSubmitFingerprint(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const { hash, signals } = await buildFingerprint();
    // Cast — FingerprintSignals is a specific interface; the API
    // client expects the generic Record<string, unknown> shape.
    await AuthAPI.fingerprint({
      hash,
      signals: signals as unknown as Record<string, unknown>,
    });
  } catch {
    // Intentional — fingerprint registration is best-effort.
  }
}
