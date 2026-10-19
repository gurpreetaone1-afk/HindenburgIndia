"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTheme } from "next-themes";
import {
  Bell,
  BellOff,
  CalendarClock,
  Check,
  Loader2,
  Mail,
  Moon,
  Palette,
  CreditCard,
  KeyRound,
  Play,
  ShieldCheck,
  Sun,
  User,
  Volume2,
  VolumeX,
} from "lucide-react";
import { toast } from "sonner";
import { useAdminAuthStore } from "@/stores/authStore";
import { AdminAuthAPI, SettingsAPI } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/common/PageHeader";
import { cn } from "@/lib/utils";
import { playNotifyPing } from "@/lib/notify-sound";

/**
 * Slimmed-down Platform Settings — operator request was to drop every
 * auto-generated platform.* knob and surface only the three controls
 * an admin actually touches day-to-day:
 *
 *   1. Theme        — light / dark / system, via next-themes
 *   2. Profile      — read-only identity card (name / email / mobile /
 *                     role) pulled from the auth store
 *   3. Notifications — master on/off for the WhatsApp-style live
 *                     toast + ping (deposit / withdrawal request
 *                     events from AdminWsBridge). Persisted in
 *                     localStorage under NOTIFY_KEY so the WsBridge
 *                     can read it without re-mounting.
 *
 * Everything else (platform.name, support_email, currency, …) was
 * noise on a mobile screen and was driving operators away from this
 * page. If those knobs ever need a UI again, give them their own
 * /settings/branding-style page.
 */

const NOTIFY_KEY = "admin.notifications.enabled";

/** Read the persisted notification toggle. Default: ON. Kept local to
 *  the page (not exported) — Next.js App Router only allows the
 *  default page export from a `page.tsx` file. AdminWsBridge defines
 *  its own copy of this helper since it runs even when the settings
 *  page isn't mounted. */
function readNotifyEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const v = window.localStorage.getItem(NOTIFY_KEY);
  return v === null ? true : v === "1";
}

export default function PlatformSettingsPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Platform settings"
        description="Theme, your profile, and live notification preferences."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ThemeCard />
        <ProfileCard />
        <ChangePasswordCard />
        <NotificationsCard />
        <PaymentGatewayCard />
        <MyGatewayCard />
        <WeeklySettlementCard />
      </div>
    </div>
  );
}


// ── Theme ────────────────────────────────────────────────────────────

function ThemeCard() {
  const { resolvedTheme, setTheme, theme: setting } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const current: "light" | "dark" | "system" = mounted
    ? (setting as any) || "system"
    : "system";
  const effective = mounted ? resolvedTheme : "dark";

  const options: { key: "light" | "dark" | "system"; label: string; Icon: typeof Sun }[] = [
    { key: "light",  label: "Light",  Icon: Sun },
    { key: "dark",   label: "Dark",   Icon: Moon },
    { key: "system", label: "System", Icon: Palette },
  ];

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Palette className="size-4 text-primary" /> Theme
        </CardTitle>
        <CardDescription>
          Currently active: <span className="font-semibold capitalize text-foreground">{effective}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {options.map(({ key, label, Icon }) => {
          const active = current === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTheme(key)}
              className={cn(
                "flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors",
                active
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              <Icon className={cn("size-4", active && "text-primary")} />
              <span className="flex-1 text-left font-medium">{label}</span>
              {active && <Check className="size-4 text-primary" />}
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}


// ── Profile ─────────────────────────────────────────────────────────

function ProfileCard() {
  const admin = useAdminAuthStore((s) => s.admin);
  if (!admin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="size-4 text-primary" /> Profile
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Not signed in.</p>
        </CardContent>
      </Card>
    );
  }

  const initials = (admin.full_name || admin.user_code || "?")
    .split(/\s+/)
    .map((s: string) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <User className="size-4 text-primary" /> Profile
        </CardTitle>
        <CardDescription>Signed-in admin identity</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3 rounded-md border border-border bg-card p-3">
          <div className="grid size-12 place-items-center rounded-full bg-primary/15 text-base font-semibold text-primary">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{admin.full_name || "—"}</div>
            <div className="truncate font-mono text-[11px] text-muted-foreground">
              {admin.user_code || "—"}
            </div>
          </div>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
            {admin.role}
          </span>
        </div>

        <ul className="space-y-1.5 text-sm">
          <ProfileRow Icon={Mail} label="Email" value={admin.email || "—"} />
          <ProfileRow
            Icon={ShieldCheck}
            label="Role"
            value={String(admin.role).replace(/_/g, " ")}
          />
        </ul>
      </CardContent>
    </Card>
  );
}

function ProfileRow({
  Icon,
  label,
  value,
}: {
  Icon: typeof User;
  label: string;
  value: string;
}) {
  return (
    <li className="flex items-center gap-3 rounded-md bg-muted/30 px-3 py-2">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <div className="flex-1">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="truncate text-sm font-medium">{value}</div>
      </div>
    </li>
  );
}


// ── Notifications ───────────────────────────────────────────────────

function NotificationsCard() {
  const [enabled, setEnabled] = useState<boolean>(() => readNotifyEnabled());
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  function toggle(v: boolean) {
    setEnabled(v);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(NOTIFY_KEY, v ? "1" : "0");
      // Broadcast to any open admin tab/window so they all flip together.
      window.dispatchEvent(new StorageEvent("storage", { key: NOTIFY_KEY, newValue: v ? "1" : "0" }));
    }
  }

  function testPing() {
    if (!enabled) return;
    playNotifyPing();
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {enabled ? (
            <Bell className="size-4 text-emerald-500" />
          ) : (
            <BellOff className="size-4 text-muted-foreground" />
          )}
          Notifications
        </CardTitle>
        <CardDescription>
          Live toast + ping when a user submits a deposit / withdrawal request.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Master switch — large pill row that's easy to tap on phones */}
        <div className="flex items-center justify-between rounded-md border border-border bg-card p-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">Live alerts</div>
            <div className="text-[11px] text-muted-foreground">
              {enabled ? "On — deposits / withdrawals will ping" : "Off — silent mode"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => toggle(!enabled)}
            aria-pressed={enabled}
            aria-label={enabled ? "Turn notifications off" : "Turn notifications on"}
            className={cn(
              "relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors",
              enabled ? "bg-emerald-500" : "bg-muted",
            )}
          >
            <span
              className={cn(
                "inline-block size-5 transform rounded-full bg-white shadow transition-transform",
                enabled ? "translate-x-6" : "translate-x-1",
              )}
            />
          </button>
        </div>

        {/* Test button — proves the sound permission is granted and the
            file is reachable. Disabled while notifications are off so
            the operator can't ping themselves through a silenced state. */}
        <Button
          type="button"
          variant="outline"
          className="w-full justify-center gap-2"
          disabled={!mounted || !enabled}
          onClick={testPing}
        >
          {enabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          Test sound
        </Button>

        <ul className="space-y-1 text-[11px] text-muted-foreground">
          <li>· Toast pops top-right with the user name + amount.</li>
          <li>· One short ping plays at the same time.</li>
          <li>· Each toast has a "View" button that opens /payments.</li>
          <li>· Setting is saved to this browser only.</li>
        </ul>
      </CardContent>
    </Card>
  );
}


// ── Change password (super admin + every admin / broker) ──────

/**
 * Lets the signed-in admin change their OWN login password. Available to
 * every admin role (super-admin included) — no role gate. Backend expires
 * all of this admin's sessions on success, so we force a re-login.
 */
function ChangePasswordCard() {
  const admin = useAdminAuthStore((s) => s.admin);
  const logout = useAdminAuthStore((s) => s.logout);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  if (!admin) return null;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (next.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }
    if (next !== confirm) {
      toast.error("New password and confirm do not match");
      return;
    }
    setSaving(true);
    try {
      await AdminAuthAPI.changePassword(current, next);
      toast.success("Password changed — please log in again");
      // Backend force-expired every session of this admin — re-login.
      setTimeout(() => {
        void logout();
        if (typeof window !== "undefined") window.location.href = "/login";
      }, 900);
    } catch (err: any) {
      toast.error(err?.message || "Could not change password");
      setSaving(false);
    }
  }

  const inputCls =
    "w-full rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary";

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="size-4 text-primary" /> Change password
        </CardTitle>
        <CardDescription>
          Update your own login password. You will be logged out of all devices.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={submit}>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Current password
            </label>
            <input
              type="password"
              autoComplete="current-password"
              className={inputCls}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              New password
            </label>
            <input
              type="password"
              autoComplete="new-password"
              className={inputCls}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Confirm new password
            </label>
            <input
              type="password"
              autoComplete="new-password"
              className={inputCls}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <Button type="submit" className="w-full justify-center gap-2" disabled={saving}>
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <KeyRound className="size-4" />
            )}
            Update password
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Minimum 8 characters. After changing, log in again with the new password.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}


// ── My gateway (per-admin: online UPI vs manual) ──────────

/**
 * Lets a REGULAR admin (not super) turn their OWN online-deposit gateway
 * ON/OFF. ON → their users deposit via the online UPI gateway; OFF → their
 * users see manual bank transfer only. Persisted on the admin's user doc, so
 * once they switch it OFF it stays OFF until they turn it back ON. Hidden for
 * super admin (they use the pool card above) and when no gateway is wired.
 */
function MyGatewayCard() {
  const admin = useAdminAuthStore((s) => s.admin);
  const isSuperAdmin = admin?.role === "SUPER_ADMIN";
  const [enabled, setEnabled] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [provider, setProvider] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    if (isSuperAdmin) return;
    let alive = true;
    SettingsAPI.myGateway()
      .then((r) => {
        if (!alive) return;
        setEnabled(!!r.enabled);
        setConfigured(!!r.configured);
        setProvider(r.provider || "");
      })
      .catch(() => {})
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [isSuperAdmin]);

  if (isSuperAdmin) return null;

  async function toggle(next: boolean) {
    setToggling(true);
    try {
      await SettingsAPI.setMyGateway(next);
      setEnabled(next);
      toast.success(
        next ? "Online payments ON — your users can pay by UPI" : "Switched to manual bank transfer",
      );
    } catch (e: any) {
      toast.error(e?.message || "Failed to update setting");
    } finally {
      setToggling(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CreditCard className="size-4 text-primary" /> Payment gateway
        </CardTitle>
        <CardDescription>
          Online UPI deposits for your users. Turn OFF to show manual bank
          transfer only — your choice stays until you switch it back.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!loaded ? (
          <div className="text-[11px] text-muted-foreground">Loading…</div>
        ) : !configured ? (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-[11px] text-amber-700 dark:text-amber-300">
            No online gateway is wired for your account yet — your users see
            manual bank transfer. Contact the super admin to enable it.
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-md border border-border bg-card p-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold">
                {enabled ? "Online payments — ON" : "Manual transfer — ON"}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {enabled
                  ? "Your users can pay by UPI and get credited automatically"
                  : "Your users see manual bank transfer only"}
              </div>
            </div>
            <button
              type="button"
              disabled={toggling}
              onClick={() => toggle(!enabled)}
              aria-pressed={enabled}
              className={cn(
                "relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors",
                enabled ? "bg-emerald-500" : "bg-muted",
              )}
            >
              <span
                className={cn(
                  "inline-block size-5 transform rounded-full bg-white shadow transition-transform",
                  enabled ? "translate-x-6" : "translate-x-1",
                )}
              />
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


// ── Payment gateway (super admin's own users) ───────────────────────

/**
 * Online (UPI) deposits for users who sit directly under the super admin.
 * Other admins are switched individually from Admin Management → ⋮ →
 * "Payment gateway". Server-side the whole feature is off when no gateway
 * key is configured, which this card surfaces.
 */
function PaymentGatewayCard() {
  const admin = useAdminAuthStore((s) => s.admin);
  const isSuperAdmin = admin?.role === "SUPER_ADMIN";
  const [enabled, setEnabled] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [autoPayout, setAutoPayout] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    let alive = true;
    SettingsAPI.paymentGateway()
      .then((r) => {
        if (!alive) return;
        setEnabled(!!r.enabled);
        setConfigured(!!r.configured);
        setAutoPayout(!!r.auto_payout);
      })
      .catch(() => {})
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  if (!isSuperAdmin) return null;

  async function togglePayout(next: boolean) {
    setToggling(true);
    try {
      await SettingsAPI.setAutoPayout(next);
      setAutoPayout(next);
      toast.success(next ? "Auto payout enabled" : "Auto payout disabled");
    } catch (e: any) {
      toast.error(e?.message || "Failed to update setting");
    } finally {
      setToggling(false);
    }
  }

  async function toggle(next: boolean) {
    setToggling(true);
    try {
      await SettingsAPI.setPaymentGateway(next);
      setEnabled(next);
      toast.success(next ? "Online payments enabled" : "Online payments disabled");
    } catch (e: any) {
      toast.error(e?.message || "Failed to update setting");
    } finally {
      setToggling(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CreditCard className="size-4 text-primary" /> Payment gateway
        </CardTitle>
        <CardDescription>
          Online UPI deposits (auto-credited on verification). Other admins are
          switched on individually from Admin Management → ⋮.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!configured ? (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-[11px] text-amber-700 dark:text-amber-300">
            No gateway key configured on the server — online payments are off
            for everyone.
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-md border border-border bg-card p-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold">Online payments — my users</div>
              <div className="text-[11px] text-muted-foreground">
                {enabled
                  ? "On — your users can pay by UPI and get credited automatically"
                  : "Off — your users see manual bank transfer only"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => toggle(!enabled)}
              disabled={!loaded || toggling}
              aria-pressed={enabled}
              aria-label={enabled ? "Disable online payments" : "Enable online payments"}
              className={cn(
                "relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:opacity-50",
                enabled ? "bg-emerald-500" : "bg-muted",
              )}
            >
              <span
                className={cn(
                  "inline-block size-5 transform rounded-full bg-white shadow transition-transform",
                  enabled ? "translate-x-6" : "translate-x-1",
                )}
              />
            </button>
          </div>
        )}

        {/* Withdrawals — sends real money the moment you approve, so it is
            off until switched on deliberately. */}
        {configured && (
          <div className="flex items-center justify-between rounded-md border border-border bg-card p-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold">Auto payout — withdrawals</div>
              <div className="text-[11px] text-muted-foreground">
                {autoPayout
                  ? "On — approving a withdrawal sends it to the user's bank / UPI automatically"
                  : "Off — you approve, then transfer the money yourself"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => togglePayout(!autoPayout)}
              disabled={!loaded || toggling}
              aria-pressed={autoPayout}
              aria-label={autoPayout ? "Disable auto payout" : "Enable auto payout"}
              className={cn(
                "relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:opacity-50",
                autoPayout ? "bg-emerald-500" : "bg-muted",
              )}
            >
              <span
                className={cn(
                  "inline-block size-5 transform rounded-full bg-white shadow transition-transform",
                  autoPayout ? "translate-x-6" : "translate-x-1",
                )}
              />
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Weekly settlement ───────────────────────────────────────────────

/**
 * Weekly mark-to-market settlement control. Super-admin only.
 *
 *   • Toggle  — flips the `weekly_settlement.enabled` PlatformSetting via
 *               the backend (kill-switch; default ON).
 *   • Run now — manually triggers the batch for the current ISO week so the
 *               operator can verify it end-to-end before the first scheduled
 *               Saturday. Idempotent on the backend (unique per-week batch).
 *
 * The engine itself runs server-side every Saturday 00:00 IST regardless of
 * this page — this card only exposes the on/off switch + a manual trigger.
 */
const WEEKLY_SETTLEMENT_KEY = "weekly_settlement.enabled";

function WeeklySettlementCard() {
  const admin = useAdminAuthStore((s) => s.admin);
  const [enabled, setEnabled] = useState<boolean>(true);
  const [loaded, setLoaded] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [running, setRunning] = useState(false);

  const role = String(admin?.role || "");
  // Card is visible to ADMIN + SUPER_ADMIN only (brokers / sub-brokers excluded).
  const canSee = role === "SUPER_ADMIN" || role === "ADMIN";
  // The platform-wide auto-run kill-switch is super-admin only; admins get
  // the scoped "Run now" for their own user pool.
  const isSuperAdmin = role === "SUPER_ADMIN";

  useEffect(() => {
    if (!isSuperAdmin) return;
    let alive = true;
    SettingsAPI.platformList("trading")
      .then((rows) => {
        if (!alive) return;
        const row = (rows || []).find((r: any) => r?.key === WEEKLY_SETTLEMENT_KEY);
        // Default ON when the row doesn't exist yet (matches backend default).
        setEnabled(row ? Boolean(row.value) : true);
        setLoaded(true);
      })
      .catch(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [isSuperAdmin]);

  if (!canSee) return null;

  async function toggle(next: boolean) {
    setToggling(true);
    try {
      await SettingsAPI.setWeeklySettlementEnabled(next);
      setEnabled(next);
      toast.success(next ? "Weekly settlement enabled" : "Weekly settlement disabled");
    } catch (e: any) {
      toast.error(e?.message || "Failed to update setting");
    } finally {
      setToggling(false);
    }
  }

  async function runNow() {
    setRunning(true);
    try {
      const res = await SettingsAPI.weeklySettlementRun();
      if ((res as any)?.skipped_reason || (res as any)?.skipped) {
        toast.message("Settlement not run", {
          description: `Reason: ${(res as any)?.reason || (res as any)?.skipped_reason || "disabled / already done"}`,
        });
      } else {
        toast.success(`Settlement ${res.week_key ?? ""} done`, {
          description: `Settled ${res.settled ?? 0} · skipped ${res.skipped ?? 0} · failed ${res.failed ?? 0} (of ${res.total ?? 0})`,
        });
      }
    } catch (e: any) {
      toast.error(e?.message || "Settlement run failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="size-4 text-primary" /> Weekly settlement
        </CardTitle>
        <CardDescription>
          Saturday 00:00 IST: books open-position P&amp;L to wallets and re-opens
          each position at the settlement price.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Platform-wide auto-run switch — SUPER_ADMIN only. */}
        {isSuperAdmin ? (
          <div className="flex items-center justify-between rounded-md border border-border bg-card p-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold">Auto-run weekly</div>
              <div className="text-[11px] text-muted-foreground">
                {enabled ? "On — fires every Saturday (all users)" : "Off — engine paused"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => toggle(!enabled)}
              disabled={!loaded || toggling}
              aria-pressed={enabled}
              aria-label={enabled ? "Disable weekly settlement" : "Enable weekly settlement"}
              className={cn(
                "relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:opacity-50",
                enabled ? "bg-emerald-500" : "bg-muted",
              )}
            >
              <span
                className={cn(
                  "inline-block size-5 transform rounded-full bg-white shadow transition-transform",
                  enabled ? "translate-x-6" : "translate-x-1",
                )}
              />
            </button>
          </div>
        ) : (
          <div className="rounded-md border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground">
            Auto-run is managed platform-wide by the super-admin. You can settle
            <span className="font-medium text-foreground"> your own users </span>
            on demand below.
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          className="w-full justify-center gap-2"
          disabled={running}
          onClick={runNow}
        >
          {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
          {running ? "Running…" : "Run now (my users)"}
        </Button>

        <ul className="space-y-1 text-[11px] text-muted-foreground">
          <li>· Settles only the users you own ({isSuperAdmin ? "your pool" : "your clients & brokers"}).</li>
          <li>· Profit credited / loss debited to each user's wallet.</li>
          <li>· Same side &amp; lots kept; entry price resets, P&amp;L back to 0.</li>
          <li>· "Run now" is idempotent — safe to test before Saturday.</li>
        </ul>
      </CardContent>
    </Card>
  );
}
