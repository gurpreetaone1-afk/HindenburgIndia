"use client";

// Port of apk src/features/trade/components/TopBar.tsx: search pill +
// "Funds" and "Profile" stacked tiles (48 px tall, radius 14).

import type { ReactNode } from "react";
import Link from "next/link";
import { IoSearch, IoWalletOutline, IoPersonOutline } from "react-icons/io5";

function StackedTile({ icon, label, href, badge }: { icon: ReactNode; label: string; href: string; badge?: boolean }) {
  return (
    <Link
      href={href}
      className="relative flex h-12 min-w-[62px] flex-col items-center justify-center rounded-[14px] border border-apk-border bg-apk-elevated px-3 text-apk-text"
    >
      {badge ? <span className="absolute right-2.5 top-[7px] size-[7px] rounded-full bg-apk-sell" /> : null}
      {icon}
      <span className="mt-0.5 text-[10px] font-medium text-apk-muted">{label}</span>
    </Link>
  );
}

export function ApkTopBar({ onSearch, hasProfileBadge }: { onSearch: () => void; hasProfileBadge?: boolean }) {
  return (
    <div className="flex items-center py-2">
      <button
        type="button"
        onClick={onSearch}
        className="mr-2 flex h-12 flex-1 items-center rounded-[14px] border border-apk-border bg-apk-elevated px-3.5 text-left"
      >
        <IoSearch size={16} className="text-apk-muted" />
        <span className="ml-2 text-[13px] text-apk-text">
          Search <span className="text-apk-dim">options</span>
        </span>
      </button>
      <div className="mr-2">
        <StackedTile icon={<IoWalletOutline size={16} />} label="Funds" href="/wallet" />
      </div>
      <StackedTile icon={<IoPersonOutline size={14} />} label="Profile" href="/profile" badge={hasProfileBadge} />
    </div>
  );
}
