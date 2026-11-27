// Ports of apk src/shared/utils/format.ts + price.ts helpers used by the
// home / market rows. `fmt()` (en-IN grouped) lives in components/apk/ui.

/** Positive finite number, else null — so `??` falls through 0 / NaN skeleton quotes. */
export function livePrice(v: unknown): number | null {
  const n = Number(v);
  return v != null && Number.isFinite(n) && n > 0 ? n : null;
}

/** APK formatNumber: plain toFixed (no grouping), "—" when missing. */
export function fixed(v: number | null | undefined, dp = 2): string {
  return v == null || !Number.isFinite(v) ? "—" : v.toFixed(dp);
}

/** APK formatSigned: "+1.23" / "-1.23" / "0.00". */
export function signed(v: number | null | undefined, dp = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(dp)}`;
}

/** Display LTP: live tick, else the backend's last-known (Redis mdlast) price. */
export function quoteLtp(q: { ltp?: unknown; last_ltp?: unknown } | undefined): number | null {
  return livePrice(q?.ltp) ?? livePrice(q?.last_ltp);
}
