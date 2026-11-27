"use client";

// Ports of apk SettingsScreen, app/settings/theme.tsx and
// app/settings/notifications.tsx. Theme drives the phone shell via
// setApkTheme(). Native-only rows (PIN lock, biometric, network
// diagnostics, language, system theme) have no web equivalent and are
// left out; Two-factor (the web's login security) takes their place.

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  IoContrastOutline,
  IoShieldCheckmarkOutline,
  IoNotificationsOutline,
  IoLogOutOutline,
  IoChevronForward,
  IoMoonOutline,
  IoSunnyOutline,
  IoRadioButtonOn,
  IoRadioButtonOff,
  IoWalletOutline,
} from "react-icons/io5";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { setUserNotificationsEnabled, userNotificationsEnabled } from "@/lib/notify-sound";
import { setApkTheme, useApkTheme } from "@/components/apk/ApkShell";
import { Screen, Header, Toggle } from "@/components/apk/ui";
import { useBrandName } from "@/components/apk/wallet/common";
import { useMe } from "@/components/apk/profile/parts";

export function ApkSettingsScreen() {
  const theme = useApkTheme();
  const brand = useBrandName();
  const twoFa = !!useMe().me?.two_fa_enabled;
  const logout = useAuthStore((s) => s.logout);

  async function confirmLogout() {
    if (!window.confirm("Log out? You'll need to sign in again.")) return;
    try {
      await logout();
    } finally {
      window.location.href = "/login";
    }
  }

  return (
    <Screen padded={false}>
      <div className="px-4">
        <Header title="Settings" back backHref="/profile" />
      </div>
      <div className="px-4 pb-8 pt-2">
        <SettingRow
          icon={<IoContrastOutline size={18} />}
          title="Theme"
          value={theme === "light" ? "Light" : "Dark"}
          href="/settings/theme"
        />
        <SettingRow
          icon={<IoShieldCheckmarkOutline size={18} />}
          title="Two-factor authentication"
          value={twoFa ? "On" : "Off"}
          valueTone={twoFa ? "ok" : undefined}
          href="/2fa"
        />
        <SettingRow icon={<IoNotificationsOutline size={18} />} title="Notification preferences" href="/settings/notifications" />
        <SettingRow icon={<IoLogOutOutline size={18} />} title="Log out" danger onClick={confirmLogout} />
        <div className="mt-5 text-center text-[11px] text-apk-dim">{brand} • v1.0.0</div>
      </div>
    </Screen>
  );
}

function SettingRow({
  icon,
  title,
  subtitle,
  value,
  valueTone,
  right,
  danger,
  href,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  value?: string;
  valueTone?: "ok";
  right?: ReactNode;
  danger?: boolean;
  href?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span
        className={cn(
          "mr-3.5 grid size-9 shrink-0 place-items-center rounded-full border border-apk-border bg-apk-elevated",
          danger ? "text-apk-sell" : "text-apk-muted",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-[15px] font-medium", danger ? "text-apk-sell" : "text-apk-text")}>{title}</span>
        {subtitle ? <span className="mt-0.5 block truncate text-[12px] text-apk-muted">{subtitle}</span> : null}
      </span>
      {right ?? (
        <>
          {value ? <span className={cn("text-[14px] font-medium", valueTone === "ok" ? "text-apk-buy" : "text-apk-muted")}>{value}</span> : null}
          {danger ? null : <IoChevronForward size={18} className="ml-1.5 text-apk-dim" />}
        </>
      )}
    </>
  );
  const cls = "flex w-full items-center border-b border-apk-border px-1 py-3.5 text-left";
  if (href)
    return (
      <Link href={href} className={cls}>
        {body}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cls}>
        {body}
      </button>
    );
  return <div className={cls}>{body}</div>;
}

const THEMES = [
  { mode: "dark", title: "Dark", subtitle: "Easier on the eyes at night", icon: <IoMoonOutline size={18} /> },
  { mode: "light", title: "Light", subtitle: "Clean white interface", icon: <IoSunnyOutline size={18} /> },
] as const;

export function ApkThemeScreen() {
  const theme = useApkTheme();
  const brand = useBrandName();
  return (
    <Screen padded={false}>
      <div className="px-4">
        <Header title="Theme" back backHref="/settings" />
      </div>
      <div className="p-4">
        <p className="mb-3 text-[12px] text-apk-muted">Choose how {brand} should look on this device.</p>
        {THEMES.map((opt) => {
          const selected = theme === opt.mode;
          return (
            <button
              key={opt.mode}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setApkTheme(opt.mode)}
              className={cn(
                "mb-2.5 flex w-full items-center rounded-[14px] border bg-apk-elevated p-3.5 text-left",
                selected ? "border-apk-primary" : "border-apk-border",
              )}
            >
              <span className="mr-3 grid size-9 place-items-center rounded-full bg-apk-surface text-apk-text">{opt.icon}</span>
              <span className="flex-1">
                <span className="block text-[15px] font-semibold text-apk-text">{opt.title}</span>
                <span className="mt-0.5 block text-[12px] text-apk-muted">{opt.subtitle}</span>
              </span>
              {selected ? (
                <IoRadioButtonOn size={22} className="ml-2 text-apk-primary" />
              ) : (
                <IoRadioButtonOff size={22} className="ml-2 text-apk-dim" />
              )}
            </button>
          );
        })}
      </div>
    </Screen>
  );
}

/** The web's one real alert switch: wallet toasts + ping (lib/notify-sound). */
export function ApkNotificationSettingsScreen() {
  const [walletAlerts, setWalletAlerts] = useState(() => userNotificationsEnabled());
  return (
    <Screen padded={false}>
      <div className="px-4">
        <Header title="Notifications" back backHref="/settings" />
      </div>
      <div className="flex flex-col gap-3 p-4">
        <p className="text-[12px] text-apk-muted">Pick which alerts you want to receive on this device.</p>
        <div className="rounded-[14px] border border-apk-border bg-apk-elevated px-3">
          <div className="flex items-center px-1 py-3.5">
            <IoWalletOutline size={20} className="mr-3.5 text-apk-muted" />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium text-apk-text">Wallet alerts</span>
              <span className="mt-0.5 block text-[12px] text-apk-muted">Deposit, withdrawal and fund updates with sound</span>
            </span>
            <Toggle
              value={walletAlerts}
              onChange={(v) => {
                setUserNotificationsEnabled(v);
                setWalletAlerts(v);
              }}
            />
          </div>
        </div>
      </div>
    </Screen>
  );
}
