"use client";

// Port of apk portfolio/components/PositionRowV2 + the LivePositionRow
// wrapper. Each OPEN row subscribes to its own token, so a tick re-renders
// that row only; P&L uses the web page's formulas (./logic).

import { memo, type ReactNode } from "react";
import { IoArrowForward, IoClose, IoFlagOutline } from "react-icons/io5";
import { cn, formatPrice } from "@/lib/utils";
import { useMarketStream } from "@/lib/useMarketStream";
import { fmt } from "@/components/apk/ui";
import { ist } from "@/components/apk/orders/shared";
import { activeLive, closedSide, fmtQty, positionLive, resolveSide, tokenOf } from "./logic";

export type RowKind = "position" | "active" | "closed";

const NO_TOKENS: string[] = [];

/** Size pill: "2L · 130" when lots known, else "×130". */
export function sizeLabel(lots: unknown, qty: unknown): string {
  const l = Number(lots);
  return l > 0 ? `${+l.toFixed(2)}L · ${fmtQty(qty)}` : `×${fmtQty(qty)}`;
}

export function rowQty(row: any, kind: RowKind): number {
  return kind === "closed" ? Math.abs(Number(row?.opening_quantity ?? row?.quantity ?? 0)) : Math.abs(Number(row?.quantity ?? 0));
}

/** Live { side, price, pnl } for any row kind (closed = final realized). */
export function useRowLive(row: any, kind: RowKind) {
  const token = kind === "closed" ? "" : tokenOf(row);
  const tick = useMarketStream(token ? [token] : NO_TOKENS).get(token);
  if (kind === "closed") {
    return { side: closedSide(row), price: Number(row?.ltp ?? 0), pnl: Number(row?.realized_pnl ?? 0), tick };
  }
  const live = kind === "active" ? activeLive(row, tick) : positionLive(row, tick);
  return { side: resolveSide(row), ...live, tick };
}

const CLOSE_REASON: Record<string, { label: string; cls: string }> = {
  SL_HIT: { label: "SL HIT", cls: "bg-apk-sell-dim text-apk-sell" },
  TP_HIT: { label: "TP HIT", cls: "bg-apk-buy-dim text-apk-buy" },
  STOP_OUT: { label: "STOP-OUT", cls: "bg-apk-surface text-apk-warn" },
  USER: { label: "USER", cls: "bg-apk-surface text-apk-muted" },
  AUTO: { label: "AUTO", cls: "bg-apk-surface text-apk-muted" },
  ADMIN_CLOSE: { label: "ADMIN", cls: "bg-apk-surface text-apk-muted" },
};

function PositionRowImpl({
  row,
  kind,
  onPress,
  onClose,
  onEditSlTp,
}: {
  row: any;
  kind: RowKind;
  onPress: (row: any, kind: RowKind) => void;
  onClose?: (row: any, kind: RowKind) => void;
  onEditSlTp?: (row: any, kind: RowKind) => void;
}) {
  const { side, price, pnl } = useRowLive(row, kind);
  const isOpen = kind !== "closed";
  const isBuy = side === "BUY";
  const entry = Number(row.avg_price ?? row.price ?? 0);
  const qty = rowQty(row, kind);
  const tone = pnl > 0 ? "text-apk-buy" : pnl < 0 ? "text-apk-sell" : "text-apk-text";
  const deltaPct = entry > 0 ? ((price - entry) / entry) * 100 : 0;
  const ts = kind === "closed" ? (row.closed_at ?? row.opened_at) : kind === "active" ? row.executed_at : row.opened_at;
  const time = ist(ts, { hour: "2-digit", minute: "2-digit", hour12: true });
  const px = (v: number) => formatPrice(v, row.segment_type ?? row.segment, row.exchange);
  const reason = CLOSE_REASON[row.close_reason] ?? { label: "CLOSED", cls: "bg-apk-surface text-apk-dim" };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onPress(row, kind)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onPress(row, kind)}
      className="mx-4 flex cursor-pointer overflow-hidden rounded-xl border border-apk-border bg-apk-elevated"
    >
      <span className={cn("w-[3px] shrink-0", isBuy ? "bg-apk-buy" : "bg-apk-sell")} />
      <div className="flex min-w-0 flex-1 flex-col gap-2.5 px-3.5 py-3">
        {/* Row 1 — side · symbol · size  /  P&L */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span
              className={cn(
                "rounded px-[7px] py-[3px] text-[10px] font-extrabold tracking-[0.7px]",
                isBuy ? "bg-apk-buy-dim text-apk-buy" : "bg-apk-sell-dim text-apk-sell",
              )}
            >
              {side}
            </span>
            <span className="truncate text-[16px] font-bold text-apk-text">{row.symbol}</span>
            <span className="shrink-0 rounded bg-apk-surface px-1.5 py-px text-[10px] font-bold tabular-nums text-apk-muted">
              {sizeLabel(row.lots, qty)}
            </span>
          </div>
          <span className={cn("shrink-0 text-[16px] font-extrabold tabular-nums", tone)}>
            {pnl > 0 ? "+" : ""}
            {fmt(pnl)}
          </span>
        </div>

        {/* Row 2 — ENTRY → BID/ASK with delta % */}
        <div className="flex items-center rounded-lg bg-apk-surface px-3 py-[9px]">
          <div className="flex-1">
            <div className="text-[10px] font-semibold tracking-[0.5px] text-apk-muted">ENTRY</div>
            <div className="mt-[3px] text-[14px] font-bold tabular-nums text-apk-text">{px(entry)}</div>
          </div>
          <IoArrowForward size={13} className="mx-2.5 text-apk-dim" />
          <div className="flex flex-1 flex-col items-end">
            <div className="text-[10px] font-semibold tracking-[0.5px] text-apk-muted">{isBuy ? "BID" : "ASK"}</div>
            <div className="mt-[3px] flex items-baseline">
              <span className={cn("text-[14px] font-bold tabular-nums", tone)}>{px(price)}</span>
              {entry > 0 ? (
                <span className={cn("ml-[5px] text-[11px] font-semibold tabular-nums", tone)}>
                  {deltaPct >= 0 ? "+" : ""}
                  {fmt(deltaPct)}%
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Row 3 — exchange · time  /  actions or close reason */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 shrink items-center text-[11px] font-medium text-apk-muted">
            <span className="truncate">{row.exchange ?? "—"}</span>
            {time ? (
              <>
                <span className="mx-1.5 text-apk-dim">·</span>
                <span className="tabular-nums">{time}</span>
              </>
            ) : null}
          </div>
          {isOpen ? (
            <div className="flex items-center gap-1.5">
              {onEditSlTp ? (
                <ActionButton label="SL · TP" tone="primary" icon={<IoFlagOutline size={11} />} onClick={() => onEditSlTp(row, kind)} />
              ) : null}
              {onClose ? (
                <ActionButton label="CLOSE" tone="sell" icon={<IoClose size={11} />} onClick={() => onClose(row, kind)} />
              ) : null}
            </div>
          ) : (
            <span className={cn("rounded px-2.5 py-[3px] text-[9.5px] font-extrabold tracking-[0.6px]", reason.cls)}>
              {reason.label}
            </span>
          )}
        </div>

        {/* Row 4 — SL / TP chips */}
        {isOpen && (Number(row.stop_loss) > 0 || Number(row.target) > 0) ? (
          <div className="flex gap-1.5">
            {Number(row.stop_loss) > 0 ? <SlTpChip label="SL" value={row.stop_loss} tone="sell" /> : null}
            {Number(row.target) > 0 ? <SlTpChip label="TP" value={row.target} tone="buy" /> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ActionButton({
  label,
  tone,
  icon,
  onClick,
}: {
  label: string;
  tone: "primary" | "sell";
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "flex h-[26px] items-center gap-[5px] rounded-md px-2.5 text-[10.5px] font-extrabold tracking-[0.4px]",
        tone === "primary" ? "bg-apk-primary-dim text-apk-primary" : "bg-apk-sell-dim text-apk-sell",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function SlTpChip({ label, value, tone }: { label: string; value: unknown; tone: "buy" | "sell" }) {
  return (
    <span
      className={cn(
        "flex items-center rounded px-2 py-[3px]",
        tone === "buy" ? "bg-apk-buy-dim text-apk-buy" : "bg-apk-sell-dim text-apk-sell",
      )}
    >
      <span className="mr-[5px] text-[9.5px] font-extrabold tracking-[0.5px]">{label}</span>
      <span className="text-[11px] font-bold tabular-nums">{fmt(Number(value))}</span>
    </span>
  );
}

export const PositionRow = memo(PositionRowImpl);
