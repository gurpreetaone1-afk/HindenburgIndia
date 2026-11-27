"use client";

// Port of apk src/features/notifications/screens/NotificationsScreen.tsx.
// Data logic is the web notifications page's (["notifications"] key, same
// mark-read / mark-all calls and toasts). The backend sends both the web
// (`is_read` / `message`) and app (`read` / `body`) field names.

import { useEffect, useState, type ComponentType } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  IoAlarmOutline,
  IoCashOutline,
  IoClose,
  IoInformationCircleOutline,
  IoMegaphoneOutline,
  IoNotificationsOffOutline,
  IoNotificationsOutline,
  IoShieldCheckmarkOutline,
  IoSwapVerticalOutline,
  IoTrendingUpOutline,
} from "react-icons/io5";
import { NotificationsAPI } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Header, Loader, Screen } from "@/components/apk/ui";
import { fmtTime } from "./time";

type IconT = ComponentType<{ size?: number }>;
const ICON: Record<string, IconT> = {
  ORDER: IoSwapVerticalOutline,
  POSITION: IoTrendingUpOutline,
  WALLET: IoCashOutline,
  ALERT: IoAlarmOutline,
  KYC: IoShieldCheckmarkOutline,
  SYSTEM: IoInformationCircleOutline,
  MARKETING: IoMegaphoneOutline,
};

const isRead = (n: any) => !!(n.is_read ?? n.read);
const bodyOf = (n: any): string | null => n.message ?? n.body ?? null;

export function ApkNotificationsScreen() {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: ["notifications"], queryFn: () => NotificationsAPI.list() });
  const [selected, setSelected] = useState<any | null>(null);
  const rows = data ?? [];
  const hasUnread = rows.some((r: any) => !isRead(r));

  async function markAll() {
    try {
      await NotificationsAPI.markAllRead();
      toast.success("All marked read");
      qc.invalidateQueries({ queryKey: ["notifications"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function markOne(id: string) {
    try {
      await NotificationsAPI.markRead(id);
      qc.invalidateQueries({ queryKey: ["notifications"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <Screen padded={false}>
      <div className="px-4">
        <Header
          title="Notifications"
          back
          right={
            hasUnread ? (
              <button type="button" onClick={markAll} className="text-[12px] font-semibold text-apk-primary">
                Mark all read
              </button>
            ) : undefined
          }
        />
      </div>
      <div className="px-4 pb-8">
        {isLoading ? (
          <Loader />
        ) : isError ? (
          <div className="py-16 text-center text-[14px] text-apk-muted">Couldn&apos;t load notifications.</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 py-16">
            <span className="text-apk-dim">
              <IoNotificationsOffOutline size={40} />
            </span>
            <div className="text-[14px] text-apk-muted">You&apos;re all caught up</div>
          </div>
        ) : (
          rows.map((n: any) => {
            const read = isRead(n);
            const Icon = ICON[n.type] ?? IoNotificationsOutline;
            const body = bodyOf(n);
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  if (!read) markOne(n.id);
                  setSelected(n);
                }}
                className={cn(
                  "flex w-full items-start gap-3 border-b border-apk-border px-1 py-3.5 text-left",
                  !read && "bg-apk-primary/[0.06]",
                )}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-apk-elevated text-apk-text">
                  <Icon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("line-clamp-2 text-[14px] text-apk-text", read ? "font-medium" : "font-bold")}>{n.title}</span>
                  {body ? <span className="mt-0.5 line-clamp-2 text-[12px] text-apk-muted">{body}</span> : null}
                  <span className="mt-1 block text-[11px] text-apk-dim">{fmtTime(n.created_at)}</span>
                </span>
                {!read ? <span className="mt-1.5 size-2 shrink-0 rounded-full bg-apk-primary" /> : null}
              </button>
            );
          })
        )}
      </div>
      {selected ? <DetailModal n={selected} onClose={() => setSelected(null)} /> : null}
    </Screen>
  );
}

function DetailModal({ n, onClose }: { n: any; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const Icon = ICON[n.type] ?? IoNotificationsOutline;
  const body = bodyOf(n);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 px-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={n.title}
        onClick={(e) => e.stopPropagation()}
        className="flex w-full flex-col gap-2.5 rounded-[18px] border border-apk-border bg-apk-bg p-4"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-1 items-center gap-2">
            <span className="grid size-[34px] shrink-0 place-items-center rounded-full bg-apk-elevated text-apk-text">
              <Icon size={17} />
            </span>
            <span className="flex-1 text-[16px] font-extrabold text-apk-text">{n.title}</span>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="text-apk-muted">
            <IoClose size={22} />
          </button>
        </div>
        {body ? <div className="text-[14px] leading-[21px] text-apk-text">{body}</div> : null}
        <div className="mt-0.5 text-[11px] text-apk-dim">{fmtTime(n.created_at)}</div>
      </div>
    </div>
  );
}
