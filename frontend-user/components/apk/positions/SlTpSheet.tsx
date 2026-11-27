"use client";

// Port of apk portfolio/components/SlTpEditor (one sheet for both legs).
// Save logic is the web EditSlTpDialog's: Active rows → per-trade endpoint,
// Position rows → per-position endpoint; "" clears a leg; only the legs the
// user changed are sent; invalidate ["positions"].

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { IoClose } from "react-icons/io5";
import { PositionAPI } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useMarketStream } from "@/lib/useMarketStream";
import { usePriceFlash } from "@/lib/usePriceFlash";
import { GradientButton, Sheet, fmt } from "@/components/apk/ui";
import { resolveSide, tokenOf } from "./logic";

const initialOf = (v: unknown) => (v != null ? String(Number(v)) : "");
const NO_TOKENS: string[] = [];

export function SlTpSheet({
  target,
  onClose,
}: {
  target: { row: any; kind: "position" | "active" } | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const row = target?.row;
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSl(initialOf(row?.stop_loss));
    setTp(initialOf(row?.target));
    // Re-seed only when a different row opens the sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row?.id]);

  const token = row ? tokenOf(row) : "";
  const tick = useMarketStream(token ? [token] : NO_TOKENS).get(token);
  const liveLtp = Number(tick?.ltp ?? row?.ltp ?? 0);
  const flash = usePriceFlash(liveLtp, 350);

  if (!target || !row) return null;

  const side = resolveSide(row);
  const isBuy = side === "BUY";
  const entry = Number(row.avg_price ?? row.price ?? 0);
  const slNum = Number(sl) > 0 ? Number(sl) : null;
  const tpNum = Number(tp) > 0 ? Number(tp) : null;
  // Light client-side hints only — the server is the source of truth.
  const slError =
    slNum != null && isBuy && slNum >= liveLtp
      ? "Stop-loss should be below current price"
      : slNum != null && !isBuy && slNum <= liveLtp
        ? "Stop-loss should be above current price"
        : null;
  const tpError =
    tpNum != null && isBuy && tpNum <= liveLtp
      ? "Target should be above current price"
      : tpNum != null && !isBuy && tpNum >= liveLtp
        ? "Target should be below current price"
        : null;
  const pctFromEntry = entry > 0 ? ((liveLtp - entry) / entry) * 100 * (isBuy ? 1 : -1) : 0;

  async function save() {
    const body: { stop_loss?: number | null; target?: number | null } = {};
    for (const [key, value, initial] of [
      ["stop_loss", sl, initialOf(row.stop_loss)],
      ["target", tp, initialOf(row.target)],
    ] as const) {
      if (value === initial) continue;
      const n = value === "" ? null : Number(value);
      if (n !== null && !Number.isFinite(n)) {
        toast.error("Enter a valid number");
        return;
      }
      body[key] = n;
    }
    if (Object.keys(body).length === 0) return onClose();
    setSaving(true);
    try {
      if (target!.kind === "active") await PositionAPI.updateActiveTradeSlTp(row.id, body);
      else await PositionAPI.updateSlTp(row.id, body);
      toast.success(
        "stop_loss" in body && "target" in body
          ? "Stop loss & target updated"
          : `${"target" in body ? "Target" : "Stop loss"} updated`,
      );
      qc.invalidateQueries({ queryKey: ["positions"] });
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Update failed");
    } finally {
      setSaving(false);
    }
  }

  const leg = (
    label: string,
    value: string,
    set: (v: string) => void,
    error: string | null,
    hint: string,
  ) => (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[12px] font-bold text-apk-text">{label}</label>
        {value ? (
          <button type="button" onClick={() => set("")} className="text-[11px] font-bold text-apk-primary">
            Clear
          </button>
        ) : null}
      </div>
      <input
        aria-label={label}
        inputMode="decimal"
        value={value}
        onChange={(e) => set(e.target.value.replace(/[^\d.]/g, ""))}
        placeholder="0"
        className={cn(
          "rounded-lg border bg-apk-bg px-3.5 py-3 text-[18px] font-bold tabular-nums text-apk-text outline-none placeholder:text-apk-dim focus:border-apk-primary",
          error ? "border-apk-sell" : "border-apk-border",
        )}
      />
      <div className={cn("text-[11px]", error ? "text-apk-sell" : "text-apk-dim")}>{error ?? hint}</div>
    </div>
  );

  return (
    <Sheet open onClose={onClose}>
      <div className="flex flex-col gap-3.5 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[18px] font-extrabold text-apk-text">SL / TP</div>
            <div className="text-[11px] text-apk-muted">
              {side} · {row.symbol}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-apk-muted">
            <IoClose size={22} />
          </button>
        </div>

        <div className="flex rounded-xl border border-apk-border bg-apk-bg p-3.5">
          <div className="flex-1">
            <div className="text-[10px] font-bold tracking-[0.6px] text-apk-dim">ENTRY</div>
            <div className="mt-1 text-[17px] font-bold tabular-nums text-apk-text">{fmt(entry)}</div>
          </div>
          <div className="mx-3 w-px self-stretch bg-apk-border" />
          <div className="flex flex-[1.2] flex-col items-end">
            <div className="flex items-center gap-1.5">
              <span className={cn("size-1.5 rounded-full", flash === "down" ? "bg-apk-sell" : "bg-apk-buy")} />
              <span className="text-[10px] font-bold tracking-[0.6px] text-apk-dim">LIVE PRICE</span>
            </div>
            <div
              className={cn(
                "mt-0.5 text-[22px] font-extrabold tabular-nums",
                flash === "up" ? "text-apk-buy" : flash === "down" ? "text-apk-sell" : "text-apk-text",
              )}
            >
              {liveLtp > 0 ? fmt(liveLtp) : "—"}
            </div>
            {entry > 0 ? (
              <div
                className={cn(
                  "mt-0.5 text-[11px] font-bold tabular-nums",
                  pctFromEntry > 0 ? "text-apk-buy" : pctFromEntry < 0 ? "text-apk-sell" : "text-apk-text",
                )}
              >
                {pctFromEntry >= 0 ? "+" : ""}
                {fmt(pctFromEntry)}% from entry
              </div>
            ) : null}
          </div>
        </div>

        {leg(
          "Stop Loss",
          sl,
          setSl,
          slError,
          isBuy ? "Triggers a SELL when price falls to this level" : "Triggers a BUY when price rises to this level",
        )}
        {leg(
          "Take Profit",
          tp,
          setTp,
          tpError,
          isBuy ? "Closes when price rises to this level" : "Closes when price falls to this level",
        )}

        <div className="mt-1 flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-apk-border py-3.5 text-[14px] font-bold text-apk-text"
          >
            Cancel
          </button>
          <div className="flex-1">
            <GradientButton label={saving ? "Saving…" : "Save"} loading={saving} onClick={save} />
          </div>
        </div>
      </div>
    </Sheet>
  );
}
