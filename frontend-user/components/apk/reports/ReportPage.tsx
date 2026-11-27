"use client";

// Ports of apk reports/components/ReportPage (+ ReportRow) and shared/ui/Row,
// plus the PDF pill and a guard for phone-only routes.

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IoChevronForward, IoDownloadOutline } from "react-icons/io5";
import { API_URL, STORAGE_KEYS } from "@/lib/constants";
import { useIsMobile } from "@/lib/useIsMobile";
import { cn } from "@/lib/utils";
import { Card, Header, Screen, Spinner } from "@/components/apk/ui";
import { LabeledLoader } from "@/components/apk/orders/shared";

/** Phone-only route: renders on phones, sends tablet / desktop to `desktopHref`. */
export function MobileOnly({ desktopHref, children }: { desktopHref: string; children: ReactNode }) {
  const isMobile = useIsMobile();
  const router = useRouter();
  useEffect(() => {
    if (!isMobile) router.replace(desktopHref);
  }, [isMobile, router, desktopHref]);
  return isMobile ? <>{children}</> : null;
}

export type PdfKind = "pnl" | "tradebook" | "brokerage" | "tax" | "margin";

// Download flow COPIED from components/common/ReportPdfButton.tsx (fetch with
// the JWT → blob → server filename); only the button is the app's PDF pill.
function PdfPill({ kind, params, disabled }: { kind: PdfKind; params?: Record<string, string | number | undefined>; disabled?: boolean }) {
  const [downloading, setDownloading] = useState(false);

  async function onDownload() {
    setDownloading(true);
    try {
      const qs = params
        ? "?" +
          Object.entries(params)
            .filter(([, v]) => v !== undefined && v !== "")
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
            .join("&")
        : "";
      const token = window.localStorage.getItem(STORAGE_KEYS.accessToken);
      const res = await fetch(`${API_URL}/api/v1/user/reports/${kind}/pdf${qs}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const disp = res.headers.get("Content-Disposition") || "";
      const match = /filename="?([^"]+)"?/i.exec(disp);
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const filename = match?.[1] ?? `hindenburg_${kind}_${stamp}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 0);
      toast.success("PDF downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't download PDF");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onDownload}
      disabled={disabled || downloading}
      className="ml-2 flex items-center rounded-full border border-apk-border bg-apk-elevated px-3 py-[7px] text-apk-primary disabled:opacity-60"
    >
      {downloading ? <Spinner className="mr-1.5 size-3.5" /> : <IoDownloadOutline size={14} className="mr-1.5" />}
      <span className="text-[11px] font-bold tracking-[0.4px]">{downloading ? "Building…" : "PDF"}</span>
    </button>
  );
}

export function ReportPage({
  title,
  isLoading,
  isError,
  errorMessage,
  empty,
  emptyHint,
  download,
  backHref = "/reports",
  children,
}: {
  title: string;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  empty?: boolean;
  emptyHint?: string;
  download?: { kind: PdfKind; params?: Record<string, string | number | undefined> };
  backHref?: string;
  children: ReactNode;
}) {
  return (
    <Screen padded={false}>
      <div className="flex items-center px-4">
        <div className="min-w-0 flex-1">
          <Header title={title} back backHref={backHref} />
        </div>
        {download ? <PdfPill kind={download.kind} params={download.params} disabled={isLoading} /> : null}
      </div>
      <div className="flex flex-col gap-2.5 p-4 pb-8">
        {isLoading ? (
          <LabeledLoader label={`Loading ${title.toLowerCase()}…`} />
        ) : isError ? (
          <Card>
            <span className="text-[14px] text-apk-sell">{errorMessage ?? `Couldn't load ${title}`}</span>
          </Card>
        ) : empty ? (
          <div className="py-12 text-center text-[14px] text-apk-muted">{emptyHint ?? "No data yet"}</div>
        ) : (
          children
        )}
      </div>
    </Screen>
  );
}

const TONE = { default: "text-apk-text", buy: "text-apk-buy", sell: "text-apk-sell", muted: "text-apk-muted" } as const;

export function ReportRow({ label, value, tone = "default" }: { label: string; value: string; tone?: keyof typeof TONE }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-[12px] text-apk-muted">{label}</span>
      <span className={cn("text-[14px] font-semibold tabular-nums", TONE[tone])}>{value}</span>
    </div>
  );
}

export function SectionCaption({ children }: { children: ReactNode }) {
  return <div className="ml-1 mt-1.5 text-[11px] text-apk-muted">{children}</div>;
}

/** apk shared/ui/Row — icon · title/subtitle · right label · chevron. */
export function ListRow({
  icon,
  title,
  subtitle,
  rightLabel,
  rightNode,
  divider,
  onClick,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  rightLabel?: string;
  rightNode?: ReactNode;
  divider?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      {icon ? <span className="mr-3.5 text-apk-muted">{icon}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium text-apk-text">{title}</span>
        {subtitle ? <span className="mt-0.5 block text-[12px] text-apk-muted">{subtitle}</span> : null}
      </span>
      {rightNode ?? (rightLabel ? <span className="text-[14px] tabular-nums text-apk-muted">{rightLabel}</span> : null)}
      {onClick && !rightNode ? <IoChevronForward size={18} className="ml-1.5 text-apk-dim" /> : null}
    </>
  );
  const cls = cn("flex w-full items-center px-1 py-3.5 text-left", divider && "border-b border-apk-border");
  return onClick ? (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}
