import { redirect } from "next/navigation";

// Bare `/reports` URL — no report has been picked yet. Always land
// on P&L (the most-trafficked view) and let the tab strip take the
// user from there. Avoids a 404 if someone bookmarks `/reports`.
export default function ReportsIndex() {
  redirect("/reports/pnl");
}
