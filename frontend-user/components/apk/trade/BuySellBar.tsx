"use client";

// Port of apk src/features/trade/components/BuySellBar.tsx — SELL (bid) ·
// − lots + · BUY (ask). Unlike the app, a tap opens the order ticket on that
// side instead of firing a MARKET order: the web removed one-tap ordering on
// phones (MobileQuickTradeBar opens the order card), and that rule stays.

import { IoAdd, IoRemove } from "react-icons/io5";
import { AnimatedPrice } from "@/components/ui/AnimatedPrice";
import type { OrderTicket } from "./useOrderTicket";
import { useApkTradeSheet } from "./TradeSheetProvider";

const STEP_BLUE = "#2962FF";
const SELL_RED = "#EF4444";
const BUY_GREEN = "#22C55E";

function SideBox({
  kind,
  price,
  format,
  onClick,
}: {
  kind: "BUY" | "SELL";
  price: number;
  format: (n: number) => string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={kind === "BUY" ? "Buy" : "Sell"}
      className="flex flex-1 flex-col rounded-md px-2.5 py-1.5 text-white active:opacity-80"
      style={{ backgroundColor: kind === "BUY" ? BUY_GREEN : SELL_RED }}
    >
      <span className="self-end text-[9px] font-semibold opacity-90">{kind === "BUY" ? "buy" : "sell"}</span>
      <span className="-mt-px text-[14px] font-bold tabular-nums">
        {price > 0 ? <AnimatedPrice value={price} format={format} glide flash={false} /> : "—"}
      </span>
    </button>
  );
}

function StepButton({ dir, onClick }: { dir: "minus" | "plus"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir === "plus" ? "Increase lots" : "Decrease lots"}
      className="grid h-[34px] w-[30px] shrink-0 place-items-center rounded-md text-white"
      style={{ backgroundColor: STEP_BLUE }}
    >
      {dir === "plus" ? <IoAdd size={18} /> : <IoRemove size={18} />}
    </button>
  );
}

export function BuySellBar({
  t,
  lots,
  onLotsChange,
}: {
  t: OrderTicket;
  lots: string;
  onLotsChange: (v: string) => void;
}) {
  const fmt = (n: number) => t.fmtPrice(n);

  function bump(dir: 1 | -1) {
    const cur = Number(lots) || 0;
    let next = Math.max(t.minLot, +(cur + dir * t.lotStep).toFixed(4));
    if (dir > 0 && t.maxLotPerOrder > 0) next = Math.min(t.maxLotPerOrder, next);
    onLotsChange(String(next));
  }

  const sheet = useApkTradeSheet();
  const fire = (action: "BUY" | "SELL") => {
    const inst = t.instrument;
    if (!inst?.token) return;
    sheet.open({ token: String(inst.token), symbol: inst.symbol, name: inst.name, side: action, lots: Number(lots) || undefined });
  };

  return (
    <div className="flex items-center gap-1 bg-apk-bg px-2 py-1.5">
      <SideBox kind="SELL" price={t.sellPrice || t.ltp} format={fmt} onClick={() => fire("SELL")} />
      <StepButton dir="minus" onClick={() => bump(-1)} />
      <input
        value={lots}
        onChange={(e) => onLotsChange(e.target.value.replace(/[^\d.]/g, ""))}
        onFocus={(e) => e.target.select()}
        inputMode="decimal"
        aria-label={`${t.instrument?.symbol ?? ""} lots`}
        className="w-11 min-w-[44px] bg-transparent px-0.5 text-center text-[14px] font-bold tabular-nums text-apk-text outline-none"
      />
      <StepButton dir="plus" onClick={() => bump(1)} />
      <SideBox kind="BUY" price={t.buyPrice || t.ltp} format={fmt} onClick={() => fire("BUY")} />
    </div>
  );
}

