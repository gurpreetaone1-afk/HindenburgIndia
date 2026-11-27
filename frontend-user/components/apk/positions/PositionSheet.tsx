"use client";

// Port of apk portfolio/components/PositionTradeSheet + InlineTradePanel.
// Exit uses the web close logic (parent passes squareoff / exitActive);
// partial close is ClosePositionDialog's logic (usePositionActions().closeLots);
// BUY / SELL hand off to the shared order ticket (useApkTradeSheet), which
// owns lots / Market-Limit entry and order placement.

import { useState } from "react";
import { IoExitOutline, IoSwapHorizontal } from "react-icons/io5";
import { cn, formatPrice } from "@/lib/utils";
import { fmt, Sheet } from "@/components/apk/ui";
import { useApkTradeSheet } from "@/components/apk/trade/TradeSheetProvider";
import type { PartialCloseTarget } from "./data";
import { fmtQty, tokenOf } from "./logic";
import { rowQty, sizeLabel, useRowLive, type RowKind } from "./PositionRow";

function fmtTickTime(ts: unknown): string {
  const n = Number(ts);
  if (!(n > 0)) return "—";
  const d = new Date(n > 1e12 ? n : n * 1000);
  return d.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

export function PositionSheet({
  row,
  kind,
  onClose,
  onExit,
  closeLots,
}: {
  row: any;
  kind: Exclude<RowKind, "closed">;
  onClose: () => void;
  onExit: () => void;
  closeLots: (target: PartialCloseTarget, lots: number) => boolean;
}) {
  const ticket = useApkTradeSheet();
  const { side, pnl, tick: q } = useRowLive(row, kind);
  const qty = rowQty(row, kind);
  const seg = row.segment_type ?? row.segment;
  const px = (v: number) => (v > 0 ? formatPrice(v, seg, row.exchange) : "—");
  const bid = Number(q?.bid ?? q?.ltp ?? 0);
  const ask = Number(q?.ask ?? q?.ltp ?? 0);

  const openLots = Number(row.lots ?? 0);
  const canPartial = kind === "position" && openLots > 0 && !String(row.id).startsWith("optimistic_");
  const [lotsInput, setLotsInput] = useState("");

  function trade(action: "BUY" | "SELL") {
    onClose();
    ticket.open({ token: tokenOf(row), symbol: row.symbol, side: action });
  }

  return (
    <Sheet open onClose={onClose}>
      <div className="pb-4">
        <div className="mb-1 flex items-center gap-2 py-2">
          <span
            className={cn(
              "rounded px-[7px] py-[3px] text-[10px] font-extrabold tracking-[0.5px]",
              side === "BUY" ? "bg-apk-buy-dim text-apk-buy" : "bg-apk-sell-dim text-apk-sell",
            )}
          >
            {side}
          </span>
          <span className="min-w-0 flex-1 truncate text-[16px] font-bold text-apk-text">{row.symbol}</span>
          <span className="rounded bg-apk-surface px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-apk-muted">
            {sizeLabel(row.lots, qty)}
          </span>
          <span
            className={cn(
              "text-[14px] font-extrabold tabular-nums",
              pnl > 0 ? "text-apk-buy" : pnl < 0 ? "text-apk-sell" : "text-apk-text",
            )}
          >
            {pnl > 0 ? "+" : ""}
            {fmt(pnl)}
          </span>
        </div>

        <div className="mt-1.5 flex flex-col gap-2.5 rounded-lg bg-apk-surface p-2">
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-1.5">
              <span className="text-[16px] font-extrabold tabular-nums text-apk-sell">{px(bid)}</span>
              <IoSwapHorizontal size={12} className="text-apk-dim" />
              <span className="text-[16px] font-extrabold tabular-nums text-apk-buy">{px(ask)}</span>
            </div>
            <button
              type="button"
              onClick={onExit}
              className="flex items-center gap-1 rounded-md bg-apk-sell-dim px-2.5 py-1.5 text-[11px] font-extrabold text-apk-sell"
            >
              <IoExitOutline size={13} />
              EXIT {fmtQty(qty)} QTY
            </button>
          </div>

          <div className="flex gap-3">
            <Stat label="HIGH" value={px(Number(q?.high ?? 0))} cls="text-apk-buy" />
            <Stat label="LOW" value={px(Number(q?.low ?? 0))} cls="text-apk-sell" />
            <Stat label="OPEN" value={px(Number(q?.open ?? 0))} />
            <Stat label="LAST" value={fmtTickTime(q?.ts)} />
          </div>

          {canPartial ? (
            <div>
              <div className="mb-1 text-[11px] font-bold text-apk-dim">PARTIAL CLOSE · {+openLots.toFixed(3)} LOTS OPEN</div>
              <div className="flex gap-1.5">
                {[25, 50, 75].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setLotsInput(String(+((openLots * p) / 100).toFixed(3)))}
                    className="rounded-md border border-apk-border bg-apk-elevated px-2.5 py-2 text-[11px] font-bold text-apk-muted"
                  >
                    {p}%
                  </button>
                ))}
                <input
                  aria-label="Lots to close"
                  inputMode="decimal"
                  value={lotsInput}
                  onChange={(e) => setLotsInput(e.target.value.replace(/[^\d.]/g, ""))}
                  placeholder="Lots"
                  className="min-w-0 flex-1 rounded-lg border border-apk-border bg-apk-elevated px-2.5 text-center text-[14px] font-bold tabular-nums text-apk-text outline-none placeholder:text-apk-dim focus:border-apk-primary"
                />
                <button
                  type="button"
                  disabled={!lotsInput}
                  onClick={() => {
                    const target = {
                      id: row.id,
                      symbol: row.symbol,
                      side,
                      lots: openLots,
                      segment_type: row.segment_type,
                      exchange: row.exchange,
                    };
                    if (closeLots(target, Number(lotsInput))) onClose();
                  }}
                  className="rounded-md bg-apk-sell-dim px-3 text-[11px] font-extrabold text-apk-sell disabled:opacity-50"
                >
                  CLOSE
                </button>
              </div>
            </div>
          ) : null}

          <div className="flex gap-2">
            <button type="button" onClick={() => trade("SELL")} className="flex-1 rounded-lg bg-apk-sell py-3 text-white">
              <div className="text-[12px] font-extrabold tracking-[0.6px]">SELL</div>
              <div className="mt-0.5 text-[14px] font-bold tabular-nums">{px(bid)}</div>
            </button>
            <button type="button" onClick={() => trade("BUY")} className="flex-1 rounded-lg bg-apk-buy py-3 text-white">
              <div className="text-[12px] font-extrabold tracking-[0.6px]">BUY</div>
              <div className="mt-0.5 text-[14px] font-bold tabular-nums">{px(ask)}</div>
            </button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}

function Stat({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="flex-1">
      <div className="text-[9px] font-bold tracking-[0.6px] text-apk-dim">{label}</div>
      <div className={cn("mt-0.5 text-[12px] font-bold tabular-nums text-apk-text", cls)}>{value}</div>
    </div>
  );
}
