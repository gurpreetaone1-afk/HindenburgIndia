"use client";

// Phone shell = the APK's (tabs)/_layout.tsx: bottom tab bar Home · Market ·
// [Trade gradient button] · Orders · Positions, shown only on those five
// routes (stack screens like Wallet / Profile hide it, as in the app). Wraps
// everything in `.apk` so the apk-* colour tokens apply.

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IoHome,
  IoHomeOutline,
  IoStatsChart,
  IoStatsChartOutline,
  IoReader,
  IoReaderOutline,
  IoPieChart,
  IoPieChartOutline,
  IoSwapVertical,
} from "react-icons/io5";
import { cn } from "@/lib/utils";
import { ApkTradeSheetProvider } from "@/components/apk/trade/TradeSheetProvider";

const TABS = [
  { href: "/dashboard", label: "Home", on: IoHome, off: IoHomeOutline },
  { href: "/marketwatch", label: "Market", on: IoStatsChart, off: IoStatsChartOutline },
  { href: "/terminal", label: "Trade", on: IoSwapVertical, off: IoSwapVertical },
  { href: "/orders", label: "Orders", on: IoReader, off: IoReaderOutline },
  { href: "/positions", label: "Positions", on: IoPieChart, off: IoPieChartOutline },
] as const;

// 48 px bar + 8 px clearance above the home indicator (apk NAV_CLEARANCE).
export const APK_TABBAR_HEIGHT = "calc(56px + env(safe-area-inset-bottom))";

// Light / dark choice, as the app's Settings → Theme stores it. Light (white)
// is the phone-web default (operator, 2026-11-27); "dark" only when the user
// picked it. Anything that changes it calls setApkTheme().
const THEME_KEY = "apk-theme";
const THEME_EVENT = "apk-theme-change";

export function setApkTheme(theme: "dark" | "light") {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {}
  window.dispatchEvent(new Event(THEME_EVENT));
}

function readTheme(): "dark" | "light" {
  try {
    return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function subscribeTheme(cb: () => void) {
  window.addEventListener(THEME_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(THEME_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useApkTheme(): "dark" | "light" {
  return useSyncExternalStore(subscribeTheme, readTheme, () => "light");
}

function isActive(pathname: string | null, href: string) {
  return pathname === href || !!pathname?.startsWith(href + "/");
}

export function ApkShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const theme = useApkTheme();
  // Tab bar only on the five tab roots; deeper routes (/positions/<id>) are
  // stack screens without it, as in the app.
  const showTabs = TABS.some((t) => pathname === t.href);

  // Page background behind the shell (iOS overscroll, short pages) must be
  // the app colour, not the web theme's white.
  useEffect(() => {
    const el = document.documentElement;
    const prev = el.style.backgroundColor;
    el.style.backgroundColor = theme === "light" ? "#ffffff" : "#0d0d0d";
    return () => {
      el.style.backgroundColor = prev;
    };
  }, [theme]);

  return (
    <div
      className={cn("apk min-h-[100dvh]", theme === "light" && "apk-light")}
      style={{ ["--apk-tabbar" as string]: showTabs ? APK_TABBAR_HEIGHT : "0px", paddingBottom: "var(--apk-tabbar)" }}
    >
      <ApkTradeSheetProvider>{children}</ApkTradeSheetProvider>
      {showTabs ? (
        <nav
          className="fixed inset-x-0 bottom-0 z-40 border-t border-apk-border bg-apk-bg"
          style={{ paddingBottom: "calc(8px + env(safe-area-inset-bottom))" }}
        >
          <ul className="grid h-12 grid-cols-5 pt-1">
            {TABS.map((t) => {
              const active = isActive(pathname, t.href);
              if (t.href === "/terminal") {
                return (
                  <li key={t.href}>
                    <Link href={t.href} className="flex flex-col items-center">
                      <span className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-apk-grad-from via-apk-grad-via to-apk-grad-to text-white">
                        <IoSwapVertical size={16} />
                      </span>
                      <span className="mt-0.5 text-[10.5px] font-medium text-apk-muted">Trade</span>
                    </Link>
                  </li>
                );
              }
              const Icon = active ? t.on : t.off;
              return (
                <li key={t.href}>
                  <Link
                    href={t.href}
                    className={cn("flex flex-col items-center py-0.5", active ? "text-apk-text" : "text-apk-muted")}
                  >
                    <Icon size={22} />
                    <span className="mt-px text-[10px] font-medium">{t.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
