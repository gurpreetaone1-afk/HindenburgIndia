"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Clock, Timer } from "lucide-react";

interface Props {
  /** ISO date / datetime string from the instrument doc. */
  expiry?: string | null;
  /** Segment used to look up the IST market-close time. Mirrors the
   *  backend's `_close_time_for_segment` mapping in
   *  app/services/expiry_squareoff.py — keep them in sync. */
  segment?: string | null;
}

/** When the auto-close is this many minutes away (or fewer), the
 *  banner flips from a static "auto close at HH:MM IST" line to a
 *  live ticking countdown — the last-hour heads-up. */
const COUNTDOWN_WINDOW_MIN = 60;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Mirror of the backend `_close_time_for_segment`. */
function closeTimeForSegment(seg?: string | null): string {
  const s = (seg ?? "").toUpperCase();
  if (s.startsWith("MCX")) return "23:30";
  if (s.startsWith("CDS") || s === "FOREX") return "17:00";
  if (s.startsWith("CRYPTO")) return "23:55";
  if (s === "STOCKS" || s === "INDICES") return "21:00";
  if (s.startsWith("NSE") || s.startsWith("BSE") || s.startsWith("NFO") || s.startsWith("BFO")) return "15:30";
  return "15:30";
}

/** "Today" / "Tomorrow" / null when expiry is further out (or past). */
function expiryProximity(raw?: string | null): "today" | "tomorrow" | null {
  if (!raw) return null;
  // Take date portion only — instrument.expiry is stored as date.
  const s = String(raw).slice(0, 10);
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  // Compare in IST. We construct an IST-zoned date, then derive
  // year/month/day-of-IST-today the same way (via toLocaleDateString
  // with the IST timezone) so the comparison is calendar-aligned
  // regardless of the browser's locale.
  const expiry = new Date(Date.UTC(y, m - 1, d));
  const today = new Date();
  const todayIst = new Date(
    today.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
  );
  todayIst.setHours(0, 0, 0, 0);
  const tomorrowIst = new Date(todayIst);
  tomorrowIst.setDate(tomorrowIst.getDate() + 1);
  const expiryMs = expiry.getTime();
  if (expiryMs === todayIst.getTime()) return "today";
  if (expiryMs === tomorrowIst.getTime()) return "tomorrow";
  return null;
}

function formatExpiryShort(raw?: string | null): string {
  if (!raw) return "";
  const s = String(raw).slice(0, 10);
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return s;
  return `${String(d).padStart(2, "0")}-${MONTHS[m - 1]}-${y}`;
}

/** Minutes from now until today's `HH:MM IST` close. Negative when
 *  the close has already passed. Null when the input is malformed. */
function minutesUntilIstCloseToday(closeHHMM: string): number | null {
  try {
    const [hh, mm] = closeHHMM.split(":").map(Number);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
    const nowIst = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
    );
    const closeIst = new Date(nowIst);
    closeIst.setHours(hh, mm, 0, 0);
    return Math.round((closeIst.getTime() - nowIst.getTime()) / 60_000);
  } catch {
    return null;
  }
}

/** Live ticking minutes-until-close that re-renders every 30 s while
 *  the auto-close is inside the countdown window. Outside the
 *  window (or on non-today rows) it just returns null and the
 *  banner falls back to its static "auto close at HH:MM IST"
 *  copy. */
function useLiveMinutesUntilClose(
  closeHHMM: string,
  active: boolean,
): number | null {
  const [minutes, setMinutes] = useState<number | null>(() =>
    active ? minutesUntilIstCloseToday(closeHHMM) : null,
  );
  useEffect(() => {
    if (!active) {
      setMinutes(null);
      return;
    }
    // Recompute every 30 s — fine-grained enough that the user
    // perceives the number ticking down without re-rendering the
    // whole order panel every second.
    setMinutes(minutesUntilIstCloseToday(closeHHMM));
    const t = setInterval(() => {
      setMinutes(minutesUntilIstCloseToday(closeHHMM));
    }, 30_000);
    return () => clearInterval(t);
  }, [closeHHMM, active]);
  return minutes;
}

/** Render the countdown copy. Below 1 min → "<1 min"; below 60 min →
 *  "in N min"; otherwise → an `HH:MM` left form. */
function formatCountdown(minutes: number): string {
  if (minutes <= 0) return "any moment";
  if (minutes < 1) return "<1 min";
  if (minutes < 60) return `in ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `in ${h}h ${m}m`;
}

/**
 * Sticky pill warning the trader that the instrument they're looking
 * at expires today or tomorrow. Today → red with the IST close time
 * (matches the auto-squareoff trigger in `expiry_squareoff.py`).
 * Tomorrow → amber heads-up so the trader doesn't open a fresh NRML
 * carry that'll get force-flattened the next day.
 *
 * Returns null when the instrument has no expiry or expires more than
 * one IST day from now — i.e. the strip is invisible 99% of the time
 * and only screams on the days the trader actually needs to know.
 */
export function ExpiryBanner({ expiry, segment }: Props) {
  const proximity = expiryProximity(expiry);
  const closeAt = closeTimeForSegment(segment);

  // Live ticking countdown — only active when expiry is TODAY (no
  // point tracking minutes-to-close for a contract that doesn't
  // close today). The hook returns null outside the window so the
  // banner falls back to the static "auto close at HH:MM IST" copy.
  const liveMinutes = useLiveMinutesUntilClose(
    closeAt,
    proximity === "today",
  );
  const inCountdown =
    proximity === "today" &&
    liveMinutes !== null &&
    liveMinutes <= COUNTDOWN_WINDOW_MIN;

  if (!proximity) return null;

  const isToday = proximity === "today";
  const Icon = inCountdown ? Timer : isToday ? AlertCircle : Clock;
  const tone = isToday
    ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300"
    : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  const label = isToday ? "Expires today" : "Expires tomorrow";

  return (
    <div
      className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[11px] font-medium ${tone}`}
      role="status"
      aria-live={inCountdown ? "polite" : "off"}
    >
      <Icon className={`size-3.5 shrink-0 ${inCountdown ? "animate-pulse" : ""}`} />
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span>{label}</span>
        <span className="opacity-80">
          {formatExpiryShort(expiry)} ·{" "}
          {inCountdown ? (
            <>
              auto closes <span className="font-semibold">{formatCountdown(liveMinutes!)}</span>{" "}
              ({closeAt} IST)
            </>
          ) : (
            <>auto close at {closeAt} IST</>
          )}
        </span>
      </div>
    </div>
  );
}
