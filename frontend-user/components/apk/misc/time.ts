import { parseBackendDate } from "@/lib/utils";

/** apk fmtTime: IST "hh:mm:ss am". Backend datetimes without an offset are UTC. */
export function fmtTime(v: string | null | undefined): string {
  const d = parseBackendDate(v);
  return d
    ? d.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })
    : "—";
}
