"use client";

// Queries + close/exit actions for the phone Portfolio / position detail.
// Keys, options, endpoints, optimistic updates and toasts are COPIED from
// app/(dashboard)/positions/page.tsx (squareoff / squareoffAll /
// exitActive) and components/common/ClosePositionDialog.tsx (partial close).
// The desktop page is not refactored — keep these in sync if it changes.

import { useMemo } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PositionAPI, WalletAPI } from "@/lib/api";
import { isInstrumentMarketOpen, marketLabel } from "@/lib/marketHours";
import { isBenignCloseError } from "./logic";

export function useOpenPositions() {
  return useQuery<any[]>({
    queryKey: ["positions", "open"],
    queryFn: () => PositionAPI.open(),
    refetchInterval: 2000,
    staleTime: 1500,
  });
}

export function useActiveTrades() {
  return useQuery<any[]>({
    queryKey: ["positions", "active-trades"],
    queryFn: () => PositionAPI.activeTrades(),
    refetchInterval: 2000,
    staleTime: 1500,
  });
}

export function useClosedPositions(enabled = true) {
  return useInfiniteQuery<{ items: any[]; total: number }>({
    queryKey: ["positions", "closed"],
    queryFn: ({ pageParam }) => PositionAPI.closed(pageParam as number, 25),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => (lastPage.items.length === 25 ? allPages.length + 1 : undefined),
    staleTime: 0,
    enabled,
  });
}

export function useWalletSummary() {
  return useQuery<any>({
    queryKey: ["wallet", "summary"],
    queryFn: () => WalletAPI.summary(),
    refetchInterval: 10000,
    staleTime: 5000,
  });
}

export interface PartialCloseTarget {
  id: string;
  symbol: string;
  side: string;
  /** Open lots (canonical lot count, not qty). */
  lots: number;
  segment_type?: string;
  exchange?: string;
}

export function usePositionActions() {
  const qc = useQueryClient();

  // Optimistic row with no token → poll the open list for its real id (8 × 400 ms).
  async function resolveRealPositionId(optimisticId: string): Promise<string | null> {
    const cur = qc.getQueryData<any[]>(["positions", "open"]) ?? [];
    const opt = cur.find((p) => p.id === optimisticId);
    const tok =
      String(opt?.instrument_token ?? opt?.token ?? "") ||
      (cur.length === 1 ? String(cur[0]?.instrument_token ?? cur[0]?.token ?? "") : "");
    if (!tok) return null;
    const ATTEMPTS = 8;
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      try {
        await qc.refetchQueries({ queryKey: ["positions", "open"] });
      } catch {
        /* ignore — try the cache anyway */
      }
      const fresh = qc.getQueryData<any[]>(["positions", "open"]) ?? [];
      const real = fresh.find(
        (p) =>
          !String(p.id).startsWith("optimistic_") &&
          String(p.instrument_token ?? p.token ?? "") === tok &&
          (p.status ?? "OPEN") === "OPEN",
      );
      if (real?.id) return String(real.id);
      if (attempt < ATTEMPTS - 1) await new Promise((r) => setTimeout(r, 400));
    }
    return null;
  }

  /** Full close of a position (phone path of the web `squareoff`: no confirm, "Closed" toast). */
  async function squareoff(id: string) {
    let targetId = id;
    if (id.startsWith("optimistic_")) {
      // Just-bought row whose real id hasn't landed — close BY TOKEN.
      const cur = qc.getQueryData<any[]>(["positions", "open"]) ?? [];
      const optRow = cur.find((p) => p.id === id);
      const tok = String(optRow?.instrument_token ?? optRow?.token ?? "");
      if (tok) {
        targetId = `token:${tok}`;
      } else {
        const resolved = await resolveRealPositionId(id);
        if (!resolved) {
          toast.error("Order still settling — try Exit again in a moment");
          return;
        }
        targetId = resolved;
      }
    }

    qc.cancelQueries({ queryKey: ["positions", "open"] });
    qc.cancelQueries({ queryKey: ["positions", "summary"] });
    qc.cancelQueries({ queryKey: ["positions", "active-trades"] });
    const posSnapshot = qc.getQueryData<any[]>(["positions", "open"]);
    const tradesSnapshot = qc.getQueryData<any[]>(["positions", "active-trades"]);
    qc.setQueryData<any[]>(["positions", "open"], (old) =>
      Array.isArray(old) ? old.filter((p) => p.id !== id && p.id !== targetId) : [],
    );
    // Also drop optimistic (not-yet-confirmed) rows on this instrument: they
    // carry no position_id, so the id filter alone left them on Active after
    // the close until the next poll.
    const closedRow = (posSnapshot ?? []).find((p) => p.id === id || p.id === targetId);
    const closedTok = String(closedRow?.instrument_token ?? closedRow?.token ?? (targetId.startsWith("token:") ? targetId.slice(6) : ""));
    qc.setQueryData<any[]>(["positions", "active-trades"], (old) =>
      Array.isArray(old)
        ? old.filter(
            (t) =>
              t.position_id !== id &&
              t.position_id !== targetId &&
              !(t._optimistic && closedTok && String(t.instrument_token ?? t.token ?? "") === closedTok),
          )
        : [],
    );

    const pendingToastId = toast.success("Closed", { duration: 1500 });
    try {
      await PositionAPI.squareoff(targetId);
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["positions", "open"] });
        qc.invalidateQueries({ queryKey: ["positions", "active-trades"] });
      }, 400);
      qc.invalidateQueries({ queryKey: ["positions", "closed"] });
      setTimeout(() => qc.invalidateQueries({ queryKey: ["positions", "closed"] }), 1500);
    } catch (e: any) {
      if (isBenignCloseError(e)) {
        qc.invalidateQueries({ queryKey: ["positions", "closed"] });
        qc.invalidateQueries({ queryKey: ["wallet"] });
        return;
      }
      if (posSnapshot) qc.setQueryData(["positions", "open"], posSnapshot);
      if (tradesSnapshot) qc.setQueryData(["positions", "active-trades"], tradesSnapshot);
      toast.dismiss(pendingToastId);
      toast.error(e?.message || "Failed");
    }
  }

  async function squareoffAll() {
    const open = qc.getQueryData<any[]>(["positions", "open"]);
    if (!open?.length) return;
    qc.cancelQueries({ queryKey: ["positions", "open"] });
    qc.cancelQueries({ queryKey: ["positions", "summary"] });
    qc.cancelQueries({ queryKey: ["positions", "active-trades"] });
    const posSnapshot = open;
    const tradesSnapshot = qc.getQueryData<any[]>(["positions", "active-trades"]);
    qc.setQueryData<any[]>(["positions", "open"], () => []);
    qc.setQueryData<any[]>(["positions", "active-trades"], () => []);

    const pendingToastId = toast.success(`Squaring off ${open.length}…`, { duration: 1500 });
    try {
      const r = await PositionAPI.squareoffAll();
      toast.dismiss(pendingToastId);
      const squared = r?.squared_off ?? 0;
      const total = r?.total ?? 0;
      const marketClosed = r?.blocked_by_market_closed ?? 0;
      const holdBlocked = r?.blocked_by_hold_time ?? 0;
      if (squared === 0 && marketClosed > 0) {
        toast.error(
          `Market is closed — ${marketClosed} position${marketClosed > 1 ? "s" : ""} can only be closed once the market reopens.`,
        );
      } else if (marketClosed > 0) {
        toast.success(`Squared off ${squared}/${total}. ${marketClosed} skipped — market closed.`);
      } else if (holdBlocked > 0) {
        toast.success(`Squared off ${squared}/${total}. ${holdBlocked} skipped — hold-time not met.`);
      } else {
        toast.success(`Squared off ${squared}/${total}`);
      }
      if ((marketClosed > 0 || holdBlocked > 0) && posSnapshot) {
        qc.setQueryData(["positions", "open"], posSnapshot);
        if (tradesSnapshot) qc.setQueryData(["positions", "active-trades"], tradesSnapshot);
      }
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
      qc.invalidateQueries({ queryKey: ["positions", "closed"] });
      setTimeout(() => qc.invalidateQueries({ queryKey: ["positions", "closed"] }), 1500);
    } catch (e: any) {
      if (posSnapshot) qc.setQueryData(["positions", "open"], posSnapshot);
      if (tradesSnapshot) qc.setQueryData(["positions", "active-trades"], tradesSnapshot);
      toast.dismiss(pendingToastId);
      toast.error(e?.message || "Failed");
    }
  }

  /** Exit one active trade (per-fill), optimistically shrinking its parent position. */
  async function exitActive(id: string) {
    const trades = qc.getQueryData<any[]>(["positions", "active-trades"]) ?? [];
    const row = trades.find((t) => t.id === id);
    const positionId = row?.position_id;
    const tradeQty = Math.abs(Number(row?.quantity ?? 0)) || 0;

    qc.cancelQueries({ queryKey: ["positions", "active-trades"] });
    qc.cancelQueries({ queryKey: ["positions", "open"] });
    const tradesSnapshot = qc.getQueryData<any[]>(["positions", "active-trades"]);
    const posSnapshot = qc.getQueryData<any[]>(["positions", "open"]);

    qc.setQueryData<any[]>(["positions", "active-trades"], (old) =>
      Array.isArray(old) ? old.filter((t) => t.id !== id) : [],
    );
    if (positionId && tradeQty > 0) {
      qc.setQueryData<any[]>(["positions", "open"], (old) => {
        if (!Array.isArray(old)) return [];
        return old
          .map((p) => {
            if (p.id !== positionId) return p;
            const curQty = Number(p.quantity) || 0;
            const sign = curQty >= 0 ? 1 : -1;
            const nextAbs = Math.max(0, Math.abs(curQty) - tradeQty);
            return nextAbs < 1e-9 ? null : { ...p, quantity: nextAbs * sign };
          })
          .filter(Boolean) as any[];
      });
    }

    const pendingToastId = toast.success("Exit placed", { duration: 1500 });
    try {
      await PositionAPI.closeActiveTrade(id);
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["positions", "active-trades"] });
        qc.invalidateQueries({ queryKey: ["positions", "open"] });
      }, 400);
      qc.invalidateQueries({ queryKey: ["positions", "closed"] });
      setTimeout(() => qc.invalidateQueries({ queryKey: ["positions", "closed"] }), 1500);
    } catch (e: any) {
      if (isBenignCloseError(e)) {
        qc.invalidateQueries({ queryKey: ["positions", "closed"] });
        qc.invalidateQueries({ queryKey: ["wallet"] });
        return;
      }
      if (tradesSnapshot) qc.setQueryData(["positions", "active-trades"], tradesSnapshot);
      if (posSnapshot) qc.setQueryData(["positions", "open"], posSnapshot);
      toast.dismiss(pendingToastId);
      toast.error(e?.message || "Failed");
    }
  }

  /**
   * Close `lots` of a position — ClosePositionDialog.submit (validation,
   * market guard, toasts). Returns false when rejected client-side; on true
   * the request is already in flight (caller closes its sheet at once).
   */
  function closeLots(target: PartialCloseTarget, lots: number): boolean {
    const openLots = target.lots;
    if (!Number.isFinite(lots) || lots <= 0) {
      toast.error("Enter a valid lot count");
      return false;
    }
    if (lots > openLots + 1e-9) {
      toast.error(`Cannot close more than open ${openLots} lots`);
      return false;
    }
    if (!isInstrumentMarketOpen(target.segment_type, target.exchange)) {
      toast.error(
        `${marketLabel(target.segment_type, target.exchange)} market is closed — try closing ${target.symbol} during trading hours`,
        { duration: 4000 },
      );
      return false;
    }
    const isFull = lots >= openLots - 1e-9;

    let snapshot: any[] | undefined;
    if (isFull) {
      snapshot = qc.getQueryData<any[]>(["positions", "open"]);
      qc.setQueryData<any[]>(["positions", "open"], (old) =>
        Array.isArray(old) ? old.filter((p) => p.id !== target.id) : old,
      );
    }
    const pendingToastId = toast.success(isFull ? `${target.symbol} closed` : `${target.symbol} ${lots} lot(s) closed`);
    PositionAPI.squareoff(target.id, isFull ? undefined : lots)
      .then(() => {
        qc.invalidateQueries({ queryKey: ["wallet"] });
        qc.invalidateQueries({ queryKey: ["orders"] });
        qc.invalidateQueries({ queryKey: ["positions", "closed"] });
        setTimeout(() => qc.invalidateQueries({ queryKey: ["positions", "closed"] }), 1500);
      })
      .catch((e: any) => {
        if (isFull && snapshot) qc.setQueryData(["positions", "open"], snapshot);
        toast.dismiss(pendingToastId);
        toast.error(e?.message || "Close failed");
      });
    return true;
  }

  // Every action only closes over `qc` (stable) — one object for the
  // lifetime of the client, so memo'd rows get stable callbacks.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => ({ squareoff, squareoffAll, exitActive, closeLots }), [qc]);
}
