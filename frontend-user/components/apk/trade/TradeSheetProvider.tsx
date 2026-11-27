"use client";

// Port of apk src/features/trade/components/TradeSheetProvider.tsx — one
// order ticket for the whole phone UI. Any screen calls
//   useApkTradeSheet().open({ token, symbol, name, side })
// and the sheet (./TradeSheet) mounts lazily on first open.

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { TradeSheet } from "./TradeSheet";

export interface TradeSheetArgs {
  token: string;
  symbol?: string;
  name?: string;
  side?: "BUY" | "SELL";
  /** Pre-filled lots (the chart BuySellBar passes its stepper value). */
  lots?: number;
}

interface Ctx {
  open: (args: TradeSheetArgs) => void;
  close: () => void;
}

const TradeSheetCtx = createContext<Ctx | null>(null);

export function ApkTradeSheetProvider({ children }: { children: ReactNode }) {
  const [args, setArgs] = useState<TradeSheetArgs | null>(null);
  const close = useCallback(() => setArgs(null), []);
  const value = useMemo<Ctx>(() => ({ open: (a) => setArgs(a), close }), [close]);
  return (
    <TradeSheetCtx.Provider value={value}>
      {children}
      {args ? <TradeSheet args={args} onClose={close} /> : null}
    </TradeSheetCtx.Provider>
  );
}

export function useApkTradeSheet(): Ctx {
  const ctx = useContext(TradeSheetCtx);
  if (!ctx) throw new Error("useApkTradeSheet must be used inside ApkTradeSheetProvider (ApkShell)");
  return ctx;
}
