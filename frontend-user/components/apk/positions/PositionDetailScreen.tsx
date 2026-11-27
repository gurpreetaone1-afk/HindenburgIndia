"use client";

// Phone port of apk portfolio/screens/PositionDetailScreen.tsx. Like the
// app it reads the cached open / closed lists (there is no single-position
// endpoint). Open rows use the web live P&L (./logic); closed rows' backend
// `realized_pnl` is GROSS (positions.py FIFO rows), so Net = realized − charges.

import type { ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { IoAlertCircleOutline, IoArrowBack, IoTrendingUp } from "react-icons/io5";
import { cn, parseBackendDate } from "@/lib/utils";
import { useMarketStream } from "@/lib/useMarketStream";
import { fmt, Screen } from "@/components/apk/ui";
import { ist } from "@/components/apk/orders/shared";
import { useClosedPositions, useOpenPositions } from "./data";
import { closedSide, positionLive, resolveSide, tokenOf } from "./logic";

const NO_TOKENS: string[] = [];

const signed = (n: number) => `${n > 0 ? "+" : ""}${fmt(n)}`;
const toneOf = (n: number) => (n > 0 ? "text-apk-buy" : n < 0 ? "text-apk-sell" : undefined);
const dateTime = (v?: string | null) =>
  ist(v, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) ||
  "—";

function fmtDuration(fromIso?: string | null, toIso?: string | null): string {
  if (!fromIso) return "—";
  const a = parseBackendDate(fromIso)?.getTime() ?? NaN;
  const b = toIso ? (parseBackendDate(toIso)?.getTime() ?? NaN) : Date.now();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "—";
  const sec = Math.max(0, Math.floor((b - a) / 1000));
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const CLOSE_REASON: Record<string, string> = {
  SL_HIT: "Stop-loss hit",
  TP_HIT: "Target hit",
  STOP_OUT: "Stop-out (risk)",
  USER: "Closed by user",
  AUTO: "Auto squareoff",
};

export function ApkPositionDetailScreen() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(String(params?.id ?? ""));
  const openQ = useOpenPositions();
  const closedQ = useClosedPositions();
  const position =
    (openQ.data ?? []).find((p) => p.id === id) ??
    closedQ.data?.pages.flatMap((p) => p.items).find((p) => p.id === id) ??
    null;

  const isClosed = position?.status === "CLOSED";
  const token = position && !isClosed ? tokenOf(position) : "";
  const tick = useMarketStream(token ? [token] : NO_TOKENS).get(token);

  if (!position) {
    return (
      <Screen padded={false}>
        <DetailHeader title="Position" />
        <div className="flex flex-1 flex-col items-center justify-center px-4 text-apk-muted">
          <IoAlertCircleOutline size={28} />
          <div className="mt-1.5 text-[12px]">
            {openQ.isPending || closedQ.isPending ? "Loading position…" : "Position not found"}
          </div>
        </div>
      </Screen>
    );
  }

  const side = isClosed ? closedSide(position) : resolveSide(position);
  const sizeQty = Math.abs(Number(isClosed ? (position.opening_quantity ?? position.quantity) : position.quantity) || 0);
  const lotSize = Number(position.lot_size ?? 0) || 0;
  const lots =
    !isClosed && position.lots != null ? Number(position.lots) : lotSize > 0 ? sizeQty / lotSize : null;

  const live = positionLive(position, tick);
  const entry = Number(position.avg_price) || 0;
  const ltp = isClosed ? Number(position.ltp) || 0 : live.price;
  const realized = Number(position.realized_pnl) || 0;
  const unrealized = isClosed ? 0 : live.pnl;
  const charges = Number(position.charges ?? 0) || 0;
  const grossPnl = isClosed ? realized : unrealized + realized;
  const netPnl = isClosed ? realized - charges : unrealized + realized;

  const margin = Number(position.margin_used ?? 0) || 0;
  const isUSD = position.currency_quote === "USD";
  const openRate = Number(position.open_usd_inr_rate ?? 0) || 0;
  const curRate = Number(position.current_usd_inr_rate ?? 0) || 0;
  const sl = Number(position.stop_loss) > 0 ? Number(position.stop_loss) : null;
  const tp = Number(position.target) > 0 ? Number(position.target) : null;
  const sideTone = side === "BUY" ? "border-apk-buy bg-apk-buy-dim text-apk-buy" : "border-apk-sell bg-apk-sell-dim text-apk-sell";

  return (
    <Screen padded={false}>
      <DetailHeader title="Position detail" />
      <div className="flex flex-col gap-3.5 px-4 pb-6 pt-3">
        <div className="rounded-xl border border-apk-border bg-apk-elevated p-4">
          <div className="flex items-center gap-2.5">
            <Pill label={side} cls={sideTone} />
            <div className="line-clamp-2 min-w-0 flex-1 text-[18px] font-extrabold text-apk-text">{position.symbol}</div>
            <Pill
              label={isClosed ? "CLOSED" : "OPEN"}
              cls={isClosed ? "border-apk-border bg-apk-surface text-apk-muted" : "border-apk-buy bg-apk-buy-dim text-apk-buy"}
            />
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-apk-muted">
            {[position.exchange, position.product_type, isUSD ? "USD-quoted" : null].filter(Boolean).map((t, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 ? <span className="font-normal text-apk-dim">·</span> : null}
                {t}
              </span>
            ))}
          </div>
          <div className="mt-3.5">
            <div className="text-[11px] font-bold tracking-[0.5px] text-apk-muted">
              {isClosed ? "NET P&L (REALIZED)" : "NET P&L"}
            </div>
            <div className={cn("mt-0.5 text-[28px] font-extrabold tabular-nums", toneOf(netPnl) ?? "text-apk-muted")}>
              {signed(netPnl)}
            </div>
          </div>
        </div>

        <DetailCard title="Prices">
          <InfoRow label="Entry price" value={fmt(entry)} />
          <InfoRow label={isClosed ? "Exit / last price" : "Live price (LTP)"} value={fmt(ltp)} />
          {isUSD ? (
            <>
              <InfoRow label="USD ⁄ INR (open)" value={openRate > 0 ? fmt(openRate, 4) : "—"} />
              <InfoRow
                label={isClosed ? "USD ⁄ INR (close)" : "USD ⁄ INR (current)"}
                value={curRate > 0 ? fmt(curRate, 4) : "—"}
              />
            </>
          ) : null}
        </DetailCard>

        <DetailCard title="Quantity">
          <InfoRow label="Lots" value={lots != null && lots > 0 ? fmt(lots, lots % 1 === 0 ? 0 : 4) : "—"} />
          <InfoRow label="Lot size" value={lotSize > 0 ? String(lotSize) : "—"} />
        </DetailCard>

        <DetailCard title="P&L breakdown">
          {isClosed ? (
            <>
              <InfoRow label="Gross P&L" value={signed(grossPnl)} tone={toneOf(grossPnl)} />
              <InfoRow
                label="Brokerage / charges"
                value={charges > 0 ? `−${fmt(charges)}` : "—"}
                tone={charges > 0 ? "text-apk-sell" : undefined}
              />
              <InfoRow label="Net P&L" value={signed(netPnl)} tone={toneOf(netPnl)} />
            </>
          ) : (
            <>
              <InfoRow label="Unrealized P&L" value={signed(unrealized)} tone={toneOf(unrealized)} />
              <InfoRow label="Realized P&L" value={signed(realized)} tone={toneOf(realized)} />
              <InfoRow
                label="Brokerage / charges"
                value={charges > 0 ? `−${fmt(charges)}` : "—"}
                tone={charges > 0 ? "text-apk-sell" : undefined}
              />
            </>
          )}
          {margin > 0 ? <InfoRow label="Margin used" value={fmt(margin)} /> : null}
        </DetailCard>

        {sl != null || tp != null ? (
          <DetailCard title="Risk legs">
            <InfoRow label="Stop-loss" value={sl != null ? fmt(sl) : "—"} tone={sl != null ? "text-apk-sell" : undefined} />
            <InfoRow label="Target" value={tp != null ? fmt(tp) : "—"} tone={tp != null ? "text-apk-buy" : undefined} />
          </DetailCard>
        ) : null}

        <DetailCard title="Timeline">
          <InfoRow label="Opened at" value={dateTime(position.opened_at)} plain />
          {isClosed ? <InfoRow label="Closed at" value={dateTime(position.closed_at)} plain /> : null}
          <InfoRow label="Hold duration" value={fmtDuration(position.opened_at, position.closed_at)} plain />
          {isClosed ? (
            <InfoRow
              label="Close reason"
              value={position.close_reason ? (CLOSE_REASON[position.close_reason] ?? position.close_reason) : "Not closed"}
              plain
            />
          ) : null}
        </DetailCard>

        <DetailCard title="Identifiers">
          <InfoRow label="Position ID" value={position.id} small />
          {position.instrument_token ? <InfoRow label="Instrument token" value={position.instrument_token} small /> : null}
          {position.segment_type ? <InfoRow label="Segment" value={position.segment_type} plain /> : null}
        </DetailCard>

        {position.instrument_token ? (
          <Link
            href={`/terminal?token=${encodeURIComponent(position.instrument_token)}`}
            className="mt-1 flex items-center justify-center gap-2 rounded-xl border border-apk-primary bg-apk-primary-dim py-3.5 text-[14px] font-bold text-apk-primary"
          >
            <IoTrendingUp size={16} />
            View chart for {position.symbol}
          </Link>
        ) : null}
      </div>
    </Screen>
  );
}

function DetailHeader({ title }: { title: string }) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-2.5 border-b border-apk-border bg-apk-bg px-4 py-3">
      <button
        type="button"
        aria-label="Back"
        onClick={() => (window.history.length > 1 ? router.back() : router.push("/positions"))}
        className="-m-1 p-1 text-apk-text"
      >
        <IoArrowBack size={22} />
      </button>
      <div className="min-w-0 flex-1 truncate text-[17px] font-bold text-apk-text">{title}</div>
    </div>
  );
}

function DetailCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-apk-border bg-apk-elevated py-1">
      <div className="px-3.5 pb-1.5 pt-2.5 text-[11px] font-extrabold tracking-[0.6px] text-apk-muted">
        {title.toUpperCase()}
      </div>
      <div>{children}</div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  tone,
  small,
  plain,
}: {
  label: string;
  value: string;
  tone?: string;
  /** Long ids: xs, one line. */
  small?: boolean;
  /** Not a number (no tabular digits). */
  plain?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-apk-border px-3.5 py-[9px]">
      <span className="shrink-0 text-[11px] font-semibold text-apk-muted">{label}</span>
      <span
        className={cn(
          "min-w-0 text-right font-bold",
          small ? "truncate text-[11px]" : "text-[12px]",
          !plain && "tabular-nums",
          tone ?? "text-apk-text",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function Pill({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={cn("rounded-full border px-2 py-[3px] text-[10px] font-extrabold tracking-[0.6px]", cls)}>
      {label}
    </span>
  );
}
