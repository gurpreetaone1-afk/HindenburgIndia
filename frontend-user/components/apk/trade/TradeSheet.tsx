"use client";

// Port of apk src/features/trade/components/TradeSheet.tsx — the phone order
// ticket: header (symbol · bid/ask · change), Charts / Option Chain pills,
// SL·TP switch, LTP stats, lot limits + LOT⇄QTY, price box + lot stepper,
// Market | Limit, SL/TP fields, margin KPI grid, BUY / SELL. Orders go out
// through useOrderTicket.submit (the web OrderPanel path).

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  IoAdd,
  IoArrowDownOutline,
  IoArrowUpOutline,
  IoCart,
  IoClose,
  IoFlash,
  IoLayersOutline,
  IoLocateOutline,
  IoRemove,
  IoStatsChartOutline,
  IoSwapHorizontal,
  IoTimeOutline,
} from "react-icons/io5";
import { PositionAPI } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Sheet } from "@/components/apk/ui";
import type { TradeSheetArgs } from "./TradeSheetProvider";
import { chainUnderlying, isOptionable, useOrderTicket, type OrderKind } from "./useOrderTicket";
import { setLastInstrument } from "./lastInstrument";

const BUY_GREEN = "#22C55E";
const SELL_RED = "#EF4444";
const ACCENT = "#5E35F2";

const inrFull = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fullINR = (v: number) => (Number.isFinite(v) ? inrFull.format(v) : "—");
const fmt2 = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : "—");
const num = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const clean = (v: string) => v.replace(/[^\d.]/g, "");

function fmtLot(v: unknown): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return String(+n.toFixed(n < 1 ? 3 : 0));
}

export function TradeSheet({ args, onClose }: { args: TradeSheetArgs; onClose: () => void }) {
  // Fresh state per instrument (the provider keeps one instance mounted).
  return <TradeSheetInner key={`${args.token}|${args.side ?? ""}`} args={args} onClose={onClose} />;
}

function TradeSheetInner({ args, onClose }: { args: TradeSheetArgs; onClose: () => void }) {
  const router = useRouter();
  const token = args.token;
  const t = useOrderTicket(token, args.side ?? "BUY");

  const [mode, setMode] = useState<OrderKind>("MARKET");
  const [lots, setLots] = useState(args.lots && args.lots > 0 ? String(args.lots) : "");
  const [inputMode, setInputMode] = useState<"LOT" | "QTY">("LOT");
  const [slTpEnabled, setSlTpEnabled] = useState(false);
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [limitPrice, setLimitPrice] = useState("");

  useEffect(() => setLastInstrument(token), [token]);

  // Seed the admin default lot once settings resolve; never clobber an edit.
  useEffect(() => {
    if (t.settingsReady && lots === "") setLots(String(t.defaultLot));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.settingsReady]);

  // Open-position count on this instrument (cart pill).
  const { data: openPositions } = useQuery<any[]>({
    queryKey: ["positions", "open"],
    queryFn: () => PositionAPI.open(),
    staleTime: 3_000,
  });
  const posCount = useMemo(
    () => (openPositions ?? []).filter((p) => String(p?.instrument_token ?? p?.token ?? "") === token).length,
    [openPositions, token],
  );

  // Time of the last price change we saw (APK "Last Trade" = last tick time).
  const lastTrade = useMemo(
    () =>
      t.ltp > 0
        ? new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })
        : "—",
    [t.ltp],
  );

  const symbol = args.symbol ?? t.instrument?.symbol ?? token;
  const lotsNum = num(lots);
  const bid = t.sellPrice;
  const ask = t.buyPrice;
  const previewPrice = mode === "LIMIT" ? num(limitPrice) || t.ltp : t.ltp;
  const m = t.margin(lotsNum, previewPrice);
  const usedMargin = Number(t.wallet?.margin ?? t.wallet?.used_margin ?? 0);
  const bal = Number(t.wallet?.bal ?? t.wallet?.available_balance ?? 0);
  const free = Number(t.wallet?.free ?? bal - usedMargin);

  function bumpLots(dir: 1 | -1) {
    const step = t.lotStep;
    const cur = num(lots) || t.minLot;
    let next = Math.max(t.minLot, +(cur + dir * step).toFixed(3));
    if (dir > 0 && t.maxLotPerOrder > 0) next = Math.min(t.maxLotPerOrder, next);
    setLots(String(next));
  }

  const stepperValue =
    inputMode === "QTY"
      ? lotsNum
        ? String(+(lotsNum * t.lotSize).toFixed(3))
        : ""
      : lots;

  function onStepperChange(raw: string) {
    const v = clean(raw);
    if (inputMode === "LOT") return setLots(v);
    if (v === "" || v === ".") return setLots("");
    const qty = Number(v);
    if (Number.isFinite(qty)) setLots(String(+(qty / t.lotSize).toFixed(3)));
  }

  function fire(action: "BUY" | "SELL") {
    const fired = t.submit(action, {
      orderType: mode,
      lots: lotsNum,
      price: mode === "LIMIT" ? limitPrice : "",
      stopLoss: slTpEnabled ? stopLoss : "",
      target: slTpEnabled ? takeProfit : "",
    });
    if (fired) onClose();
  }

  const optionable = isOptionable(t.instrument);

  return (
    <Sheet open onClose={onClose} className="bg-apk-bg [&>div:first-child]:bg-apk-bg">
      <div className="pb-1 pt-1">
        {/* Header: symbol + cart | bid / ask + change | close */}
        <div className="flex items-center">
          <div className="mr-2 flex min-w-0 flex-1 items-center">
            <span className="mr-1.5 truncate text-[18px] font-extrabold text-apk-text">{symbol}</span>
            <span className="flex shrink-0 items-center rounded-md bg-apk-elevated px-1.5 py-0.5 text-apk-muted">
              <IoCart size={11} />
              <span className="ml-[3px] text-[11px] font-bold tabular-nums">{posCount}</span>
            </span>
          </div>
          <div className="flex shrink-0 flex-col items-end">
            <div className="flex text-[14px] font-extrabold tabular-nums">
              <span className="mr-2" style={{ color: SELL_RED }}>{t.fmtPrice(bid)}</span>
              <span style={{ color: BUY_GREEN }}>{t.fmtPrice(ask)}</span>
            </div>
            <span
              className="mt-0.5 text-[11px] font-bold tabular-nums"
              style={{ color: t.change >= 0 ? BUY_GREEN : SELL_RED }}
            >
              {t.change >= 0 ? "+" : ""}
              {fmt2(t.change)} ({t.changePct >= 0 ? "+" : ""}
              {fmt2(t.changePct)}%)
            </span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="ml-2 shrink-0 p-0.5 text-apk-muted">
            <IoClose size={22} />
          </button>
        </div>

        <div className="mt-1 text-[11px] text-apk-muted">
          LTP <span className="tabular-nums">{t.fmtPrice(t.ltp)}</span>
        </div>

        {/* Pills: Charts | Option Chain  ·  SL·TP switch */}
        <div className="mt-3.5 flex items-center">
          <OutlinePill
            label="Charts"
            icon={<IoStatsChartOutline size={13} />}
            onClick={() => {
              router.push(`/terminal?token=${encodeURIComponent(token)}`);
              onClose();
            }}
          />
          {optionable ? (
            <OutlinePill
              label="Option Chain"
              icon={<IoLayersOutline size={13} />}
              onClick={() => {
                router.push(`/option-chain?underlying=${encodeURIComponent(chainUnderlying(t.instrument))}`);
                onClose();
              }}
            />
          ) : null}
          <div className="flex-1" />
          <button
            type="button"
            role="switch"
            aria-checked={slTpEnabled}
            onClick={() => setSlTpEnabled((v) => !v)}
            className="flex items-center rounded-full border border-apk-border px-2.5 py-1.5 text-apk-text"
          >
            <IoLocateOutline size={13} />
            <span className="mx-1.5 text-[11px] font-bold">SL · TP</span>
            <span
              className="h-4 w-[26px] rounded-full p-0.5"
              style={{ backgroundColor: slTpEnabled ? BUY_GREEN : "rgb(var(--apk-surface))" }}
            >
              <span className={cn("block size-3 rounded-full bg-white transition-transform", slTpEnabled && "translate-x-[10px]")} />
            </span>
          </button>
        </div>

        {/* LTP High / Low / Open / Last Trade */}
        <div className="mt-2.5 flex">
          <KV label="LTP High" value={t.fmtPrice(t.high)} />
          <KV label="LTP Low" value={t.fmtPrice(t.low)} />
          <KV label="Open" value={t.fmtPrice(t.open)} />
          <KV label="Last Trade" value={lastTrade} />
        </div>

        {/* Lot limits + LOT ⇄ QTY */}
        <div className="mt-2.5 flex items-center border-t border-apk-border pt-2.5">
          <KV label="Min Lot" value={fmtLot(t.eff?.min_lot)} />
          <KV label="Order Lot" value={fmtLot(t.eff?.order_lot)} />
          <KV label="Max Lots" value={fmtLot(t.eff?.max_each_lot)} />
          <KV label="Lot Size" value={fmtLot(t.eff?.lot_size ?? t.lotSize)} />
          <div className="flex flex-1 justify-end">
            <button
              type="button"
              onClick={() => setInputMode((v) => (v === "LOT" ? "QTY" : "LOT"))}
              className={cn(
                "flex items-center rounded-full border px-2.5 py-1.5",
                inputMode === "QTY" ? "bg-apk-elevated" : "border-apk-border bg-transparent text-apk-text",
              )}
              style={inputMode === "QTY" ? { borderColor: ACCENT, color: ACCENT } : undefined}
            >
              <IoSwapHorizontal size={14} className={inputMode === "QTY" ? "" : "text-apk-muted"} />
              <span className="ml-1.5 text-[11px] font-bold">{inputMode === "LOT" ? "Qty" : "Lot"}</span>
            </button>
          </div>
        </div>

        {/* Price box + lot stepper */}
        <div className="mt-2.5 flex">
          <div
            className={cn(
              "mr-2 flex flex-1 flex-col items-center justify-center rounded-[10px] border bg-apk-elevated",
              mode === "LIMIT" ? "py-2.5" : "border-apk-border py-3.5",
            )}
            style={mode === "LIMIT" ? { borderColor: ACCENT } : undefined}
          >
            {mode === "LIMIT" ? (
              <input
                value={limitPrice}
                onChange={(e) => setLimitPrice(clean(e.target.value))}
                onFocus={(e) => e.target.select()}
                inputMode="decimal"
                aria-label="Limit price"
                placeholder={t.ltp > 0 ? fmt2(t.ltp) : "Price"}
                className="w-full min-w-[90px] bg-transparent text-center text-[18px] font-extrabold tabular-nums text-apk-text outline-none placeholder:text-apk-dim"
              />
            ) : (
              <span className="text-[17px] font-bold text-apk-text">Market</span>
            )}
            <span className="mt-0.5 text-[11px] tracking-[0.6px] text-apk-muted">PRICE</span>
          </div>
          <div className="ml-2 flex flex-1 items-center rounded-[10px] border border-apk-border bg-apk-elevated px-1.5">
            <StepCircle label="Decrease lots" onClick={() => bumpLots(-1)}>
              <IoRemove size={18} />
            </StepCircle>
            <div className="flex min-w-0 flex-1 flex-col items-center">
              <input
                value={stepperValue}
                onChange={(e) => onStepperChange(e.target.value)}
                onFocus={(e) => e.target.select()}
                inputMode="decimal"
                aria-label={inputMode === "LOT" ? "Lots" : "Quantity"}
                className="w-full min-w-[40px] bg-transparent text-center text-[20px] font-extrabold tabular-nums text-apk-text outline-none"
              />
              <span className="-mt-0.5 text-[11px] tracking-[0.6px] text-apk-muted">{inputMode}</span>
            </div>
            <StepCircle label="Increase lots" onClick={() => bumpLots(1)}>
              <IoAdd size={18} />
            </StepCircle>
          </div>
        </div>

        {/* Market | Limit */}
        <div className="mt-2 flex rounded-[10px] border border-apk-border bg-apk-elevated p-1">
          <SegBtn label="Market" icon={<IoFlash size={14} />} active={mode === "MARKET"} onClick={() => setMode("MARKET")} />
          <SegBtn
            label="Limit"
            icon={<IoTimeOutline size={14} />}
            active={mode === "LIMIT"}
            onClick={() => {
              setMode("LIMIT");
              if (!limitPrice) {
                const seed = (args.side ?? "BUY") === "BUY" ? ask || t.ltp : bid || t.ltp;
                if (seed > 0) setLimitPrice(seed.toFixed(2));
              }
            }}
          />
        </div>

        {slTpEnabled ? (
          <div className="mt-2.5 flex gap-2">
            <BracketField
              label="STOP LOSS"
              tone={SELL_RED}
              value={stopLoss}
              onChange={setStopLoss}
              placeholder={bid > 0 ? `< ${fmt2(bid)}` : "Optional"}
            />
            <BracketField
              label="TARGET"
              tone={BUY_GREEN}
              value={takeProfit}
              onChange={setTakeProfit}
              placeholder={ask > 0 ? `> ${fmt2(ask)}` : "Optional"}
            />
          </div>
        ) : null}

        {/* Margin KPI grid */}
        <div className="mt-2 flex flex-col gap-1.5">
          <div className="flex gap-1.5">
            <KpiCell label="INTRADAY MARGIN" value={fullINR(m.intraday)} hint={t.marginHint("intraday")} />
            <KpiCell label="CARRY FORWARD" value={fullINR(m.carry)} hint={t.marginHint("overnight")} />
          </div>
          <div className="flex gap-1.5">
            <KpiCell label="USED MARGIN" value={fullINR(usedMargin)} />
            <KpiCell label="AVAILABLE" value={fullINR(free)} color={free < 0 ? SELL_RED : BUY_GREEN} />
          </div>
        </div>

        {/* BUY / SELL */}
        <div className="mt-2.5 flex gap-3">
          <ActionButton kind="BUY" price={t.fmtPrice(ask)} onClick={() => fire("BUY")} />
          <ActionButton kind="SELL" price={t.fmtPrice(bid)} onClick={() => fire("SELL")} />
        </div>
      </div>
    </Sheet>
  );
}

function OutlinePill({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mr-1.5 flex items-center rounded-lg border border-apk-border bg-apk-elevated px-3 py-2 text-apk-text"
    >
      {icon}
      <span className="ml-1.5 text-[11px] font-bold">{label}</span>
    </button>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="text-[11px] text-apk-muted">{label}</div>
      <div className="mt-0.5 truncate text-[13px] font-bold tabular-nums text-apk-text">{value}</div>
    </div>
  );
}

function KpiCell({ label, value, hint, color }: { label: string; value: string; hint?: string; color?: string }) {
  return (
    <div className="min-w-0 flex-1 rounded-lg border border-apk-border bg-apk-elevated px-2 py-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-bold tracking-[0.4px] text-apk-dim">{label}</span>
        {hint ? (
          <span className="text-[9px] font-extrabold tabular-nums" style={{ color: ACCENT }}>
            {hint}
          </span>
        ) : null}
      </div>
      <div className="mt-0.5 truncate text-[12px] font-extrabold tabular-nums text-apk-text" style={color ? { color } : undefined}>
        {value}
      </div>
    </div>
  );
}

function SegBtn({ label, icon, active, onClick }: { label: string; icon: ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn("flex flex-1 items-center justify-center rounded-lg py-2.5", active ? "text-white" : "text-apk-muted")}
      style={active ? { backgroundColor: ACCENT } : undefined}
    >
      {icon}
      <span className="ml-1.5 text-[14px] font-bold">{label}</span>
    </button>
  );
}

function StepCircle({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid size-[30px] shrink-0 place-items-center rounded-full bg-apk-surface text-apk-text"
    >
      {children}
    </button>
  );
}

function BracketField({
  label,
  tone,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  tone: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="flex-1 rounded-[10px] border border-apk-border bg-apk-elevated px-2.5 py-2">
      <span className="flex items-center gap-1">
        <span className="size-1.5 rounded-full" style={{ backgroundColor: tone }} />
        <span className="text-[10px] font-bold tracking-[0.5px] text-apk-dim">{label}</span>
      </span>
      <input
        value={value}
        onChange={(e) => onChange(clean(e.target.value))}
        inputMode="decimal"
        placeholder={placeholder}
        className="mt-1 w-full bg-transparent text-[16px] font-bold tabular-nums text-apk-text outline-none placeholder:text-apk-dim"
      />
    </label>
  );
}

function ActionButton({ kind, price, onClick }: { kind: "BUY" | "SELL"; price: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-1 flex-col items-center rounded-[10px] py-[11px] text-white active:opacity-80"
      style={{ backgroundColor: kind === "BUY" ? BUY_GREEN : SELL_RED }}
    >
      <span className="flex items-center">
        {kind === "BUY" ? <IoArrowUpOutline size={16} /> : <IoArrowDownOutline size={16} />}
        <span className="ml-1.5 text-[16px] font-extrabold">{kind}</span>
      </span>
      <span className="mt-0.5 text-[12px] font-bold tabular-nums opacity-95">{price}</span>
    </button>
  );
}
