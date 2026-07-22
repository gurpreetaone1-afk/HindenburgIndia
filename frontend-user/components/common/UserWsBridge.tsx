"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/authStore";
import { STORAGE_KEYS, WS_URL } from "@/lib/constants";
import {
  ensureNotificationPermission,
  playNotifyPing,
  showNativeNotification,
  subscribeForWebPush,
} from "@/lib/notify-sound";

/** "₹1,234.56" — absolute value, two decimals. Blank for empty/NaN. */
function fmtINR(raw: string | number | undefined | null): string {
  if (raw === undefined || raw === null || raw === "") return "";
  const n = Number(raw);
  if (!Number.isFinite(n)) return String(raw);
  return `₹${Math.abs(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Maps a wallet pub/sub event to the operator-facing copy. Returns null
 *  for silent reasons (brokerage / margin / P&L) — the trader explicitly
 *  doesn't want a buzz on every fill. */
function walletReasonToToast(
  reason: string | undefined,
  amount: string | undefined,
): { kind: "in" | "out"; title: string; body: string } | null {
  const r = String(reason || "").toUpperCase();
  const n = Number(amount ?? 0);
  const credit = Number.isFinite(n) ? n > 0 : true;
  if (r.includes("DEPOSIT"))
    return { kind: "in", title: "✅ Deposit approved", body: `${fmtINR(amount)} added to your wallet` };
  if (r.includes("WITHDRAW"))
    return { kind: "out", title: "✅ Withdrawal processed", body: `${fmtINR(amount)} sent to your bank` };
  if (r.includes("ADJUST"))
    return credit
      ? { kind: "in", title: "💰 Funds added by admin", body: `${fmtINR(amount)} credited to your wallet` }
      : { kind: "out", title: "⚠️ Funds deducted by admin", body: `${fmtINR(amount)} debited from your wallet` };
  return null;
}

/**
 * Live updates from the backend's per-user pub/sub channels.
 *
 * Opens a single WebSocket to `/ws/user?token=…` (auth via JWT in query
 * because browsers don't allow custom headers on WS handshakes). Whenever
 * the server pushes a `position_update`, `order_update`, `trade_update` or
 * `wallet_update`, we invalidate the matching React Query keys so the
 * affected pages re-render without a manual refresh.
 *
 * Drop this component once near the top of the dashboard tree (e.g. in
 * `app/(dashboard)/layout.tsx`); it renders nothing.
 */
export function UserWsBridge() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!user) return;
    const access =
      typeof window !== "undefined"
        ? window.localStorage.getItem(STORAGE_KEYS.accessToken)
        : null;
    if (!access) return;

    // First-mount: prompt for notifications → if granted, register a
    // Web Push subscription so wallet pings reach a force-stopped PWA.
    void (async () => {
      const ok = await ensureNotificationPermission();
      if (ok) await subscribeForWebPush();
    })();

    let stopped = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    function connect() {
      if (stopped) return;
      const url = `${WS_URL.replace(/\/$/, "")}/ws/user?token=${encodeURIComponent(access ?? "")}`;
      ws = new WebSocket(url);

      ws.onopen = () => {
        attempt = 0;
      };

      ws.onmessage = (ev) => {
        let msg: any;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        switch (msg?.type) {
          case "position_update":
            // Cover EVERY query key that displays position-derived
            // data — without `["positions", "closed"]` an admin edit
            // to a closed trade's realised P&L stayed invisible on
            // the user's Closed tab; the reports + pnl-summary
            // additions guarantee the same for the dashboard tile
            // and the /reports/* pages.
            qc.invalidateQueries({ queryKey: ["positions"] });
            qc.invalidateQueries({ queryKey: ["positions", "open"] });
            qc.invalidateQueries({ queryKey: ["positions", "closed"] });
            qc.invalidateQueries({ queryKey: ["positions", "pnl-summary"] });
            qc.invalidateQueries({ queryKey: ["dashboard"] });
            qc.invalidateQueries({ queryKey: ["wallet"] });
            qc.invalidateQueries({ queryKey: ["reports"] });
            qc.invalidateQueries({ queryKey: ["trades"] });
            break;
          case "order_update":
            qc.invalidateQueries({ queryKey: ["orders"] });
            qc.invalidateQueries({ queryKey: ["orders", "recent"] });
            // Order transitioning to EXECUTED (especially on a
            // squareoff / closing fill) almost always changes the
            // position state too. Without this the positions cache
            // stayed stale until the 3-s background poll, so a 1-s
            // configured re-order close was felt as 2-4 s before
            // the row vanished + the deferred "<symbol> closed"
            // toast fired. Cheap broad invalidate; the next poll
            // tick is debounced by the existing closingPositionIds
            // gate against the 3-s poll, so we don't add flicker.
            qc.invalidateQueries({ queryKey: ["positions"] });
            qc.invalidateQueries({ queryKey: ["positions", "open"] });
            qc.invalidateQueries({ queryKey: ["active-trades"] });
            break;
          case "trade_update":
            qc.invalidateQueries({ queryKey: ["trades"] });
            qc.invalidateQueries({ queryKey: ["reports"] });
            break;
          case "wallet": {
            // Balance-moving event from `_publish_wallet_event`
            // (`user:{id}:wallet`). Refresh wallet/dashboard, then — for
            // the four operator-facing reasons — toast + chime + tray.
            qc.invalidateQueries({ queryKey: ["wallet"] });
            qc.invalidateQueries({ queryKey: ["dashboard"] });
            const p = (msg as any).payload || {};
            const t = walletReasonToToast(p.reason, p.amount);
            if (t) {
              if (t.kind === "in")
                toast.success(t.title, { description: t.body, duration: 7000 });
              else toast.warning(t.title, { description: t.body, duration: 7000 });
              playNotifyPing();
              showNativeNotification(t.title, t.body, {
                tag: `wallet-${String(p.reason || "move").toUpperCase()}`,
                url: "/wallet",
              });
            }
            break;
          }
          case "wallet_update":
            qc.invalidateQueries({ queryKey: ["wallet"] });
            qc.invalidateQueries({ queryKey: ["dashboard"] });
            break;
          case "kyc_update":
            qc.invalidateQueries({ queryKey: ["kyc"] });
            qc.invalidateQueries({ queryKey: ["profile", "me"] });
            break;
          case "binary_settled":
            // Server published this when a BinaryOption transitioned
            // out of OPEN. Active panel sheds the row, History tab
            // gains it, wallet may have just been credited (win/tie).
            qc.invalidateQueries({ queryKey: ["binary", "active"] });
            qc.invalidateQueries({ queryKey: ["binary", "history"] });
            qc.invalidateQueries({ queryKey: ["wallet"] });
            break;
          case "notification_update":
            // Admin broadcast or a system-emitted in-app notification.
            // Invalidate the listing and the unread-count badge so the
            // bell + /notifications page refresh immediately. We don't
            // toast here — the notifications page renders the title /
            // message itself, and the bell badge update is enough of
            // a poke for users to see they have something new.
            qc.invalidateQueries({ queryKey: ["notifications"] });
            qc.invalidateQueries({ queryKey: ["notifications", "unread-count"] });
            break;
          case "bonus_granted":
            toast.success(`Bonus credited: ₹${msg.amount}`);
            qc.invalidateQueries({ queryKey: ["user-bonuses"] });
            qc.invalidateQueries({ queryKey: ["wallet"] });
            break;
          case "bonus_completed":
            toast.success(`Bonus unlocked: ₹${msg.amount} moved to your balance`);
            qc.invalidateQueries({ queryKey: ["user-bonuses"] });
            qc.invalidateQueries({ queryKey: ["wallet"] });
            break;
          case "bonus_cancelled":
          case "bonus_expired":
            qc.invalidateQueries({ queryKey: ["user-bonuses"] });
            qc.invalidateQueries({ queryKey: ["wallet"] });
            break;
          // hello / heartbeat — ignore
        }
      };

      ws.onclose = () => {
        if (stopped) return;
        attempt += 1;
        const delay = Math.min(15_000, 1_000 * 2 ** Math.min(attempt, 4));
        reconnectTimer = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        // Let onclose handle reconnect cadence.
        ws?.close();
      };
    }

    connect();

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [qc, user?.id]);

  return null;
}
