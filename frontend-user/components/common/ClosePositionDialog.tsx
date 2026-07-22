"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Repeat2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { OrderAPI, PositionAPI, ProfileAPI } from "@/lib/api";
import { cn } from "@/lib/utils";
import { isInstrumentMarketOpen, marketLabel } from "@/lib/marketHours";

/**
 * Replacement for the browser-native `confirm("Square off this position?")`
 * dialog. The native confirm:
 *   • doesn't theme with the app (jarring system chrome),
 *   • can't show context (symbol, side, current lots),
 *   • is all-or-nothing — no partial-close UX.
 *
 * This modal mirrors the screenshot the user shared: symbol/side/open-lots
 * summary, four quick presets (25 / 50 / 75 / FULL), a numeric override
 * box, and a destructive Close action. Optimistically removes the row from
 * `["positions","open"]` on click so the UI feels instant; the API call
 * runs in the background and rolls back on error.
 */
export interface ClosePositionTarget {
  id: string;
  symbol: string;
  side: "BUY" | "SELL" | string;
  /** Open lots (canonical lot count, NOT raw qty). Can be fractional for
   *  MCX/crypto/forex (0.01, 0.001). */
  lots: number;
  /** Used for the market-hours guard so a click outside trading hours
   *  shows a clear toast instead of firing the API and getting rejected
   *  (which would briefly remove the row before rollback). */
  segment_type?: string;
  exchange?: string;
  /** Product type (MIS / NRML / CNC) — needed when the dialog
   *  orchestrates a rollover (place fresh order on the next-expiry
   *  contract with the same product type). Optional for callers that
   *  don't surface rollover. */
  product_type?: string;
  /** ISO expiry date — used to decide whether to even attempt the
   *  rollover-target lookup (only fires for derivatives with an
   *  expiry). Optional for non-derivative callers. */
  expiry?: string | null;
}

type Preset = 25 | 50 | 75 | 100;

interface Props {
  target: ClosePositionTarget | null;
  onClose: () => void;
  /** Fired the moment the dialog kicks off the squareoff API call —
   *  lets the parent row mark its Close button as loading until the
   *  matching engine actually flattens the position (re-order users
   *  wait ~N seconds; instant-fill users get cleared by the next
   *  positions poll). Cleared by the parent when the position
   *  disappears from the open list. */
  onSubmit?: (positionId: string) => void;
}

export function ClosePositionDialog({ target, onClose, onSubmit }: Props) {
  const qc = useQueryClient();
  const [preset, setPreset] = useState<Preset>(100);
  const [lotsInput, setLotsInput] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Re-order users — the backend parks every MARKET squareoff for N s
  // before flattening. The optimistic-remove below has to be skipped in
  // that case so the row doesn't flash out + back in + out again.
  const { data: me } = useQuery<any>({
    queryKey: ["users", "me"],
    queryFn: () => ProfileAPI.me(),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
  const reorderDelayActive =
    Number(me?.reorder_effective_delay_sec ?? 0) > 0;

  // Reset state whenever a new position opens the dialog. Without this the
  // last user's preset / typed value would carry over to the next click.
  useEffect(() => {
    if (target) {
      setPreset(100);
      setLotsInput(String(target.lots));
      setSubmitting(false);
    }
  }, [target]);

  const open = !!target;
  const openLots = target?.lots ?? 0;

  // Rollover-target lookup — only fires for derivatives with an
  // expiry. 404 (no later expiry / non-derivative) returns null and
  // the Roll button stays hidden. The endpoint is cheap (one indexed
  // Mongo lookup) so we eagerly fire on every dialog open.
  const rolloverEligible = !!target?.id && !!target?.expiry;
  const { data: rolloverDest } = useQuery({
    queryKey: ["position-rollover-target", target?.id],
    queryFn: async () => {
      try {
        return await PositionAPI.rolloverTarget(target!.id);
      } catch {
        // Swallow 404 (no later expiry) — button just won't render.
        return null;
      }
    },
    enabled: rolloverEligible && open,
    staleTime: 60_000,
  });
  const [rolling, setRolling] = useState(false);

  function pickPreset(p: Preset) {
    setPreset(p);
    // Round to the same decimal precision the panel uses for the lot
    // stepper (3 dp covers MCX 0.001 / crypto 0.001). Avoids "0.0033333…"
    // when the user picks 33% on 0.01 lots (we expose 25/50/75 only, so
    // values come out clean, but the rounding stays correct for edge cases).
    const next = +((openLots * p) / 100).toFixed(3);
    setLotsInput(String(next));
  }

  /**
   * One-click rollover: close the current position, then immediately
   * open the same side/lot count on the next-expiry contract. The
   * close goes through the normal squareoff path; the new order
   * uses MARKET on the same product_type so the user lands on the
   * roll target with the same exposure they had on the old contract.
   *
   * Failure modes:
   *   - Close succeeds, open fails (e.g. insufficient margin on the
   *     new strike): user is left FLAT. Same outcome as a regular
   *     close, plus an error toast so they know the open leg didn't
   *     fire. They can manually re-enter.
   *   - Close fails: nothing is rolled, error toast.
   */
  async function rollToNextExpiry() {
    if (!target || rolling) return;
    if (!rolloverDest?.token) {
      toast.error("No next-expiry contract available for this series");
      return;
    }
    if (typeof target.id === "string" && target.id.startsWith("optimistic_")) {
      toast.error("Order still settling — try again in a second");
      return;
    }
    if (!isInstrumentMarketOpen(target.segment_type, target.exchange)) {
      toast.error(
        `${marketLabel(target.segment_type, target.exchange)} market is closed — try during trading hours`,
      );
      return;
    }
    if (!target.product_type) {
      toast.error("Cannot roll — product type missing on this position");
      return;
    }
    if (!confirm(
      `Roll position?\n\nClose ${target.symbol} (${openLots} lot${openLots === 1 ? "" : "s"})\nOpen same on ${rolloverDest.symbol}\n\nA market order will be placed on the new contract — make sure you have margin for the new strike.`,
    )) {
      return;
    }

    setRolling(true);
    // Optimistic remove of the source position so the row disappears
    // instantly — same UX as a regular close.
    const snapshot = qc.getQueryData<any[]>(["positions", "open"]);
    qc.setQueryData<any[]>(["positions", "open"], (old) =>
      Array.isArray(old) ? old.filter((p) => p.id !== target.id) : old,
    );
    onClose();
    const pendingToastId = toast.loading(
      `Rolling ${target.symbol} → ${rolloverDest.symbol}…`,
    );
    try {
      // Step 1: close current position fully.
      await PositionAPI.squareoff(target.id, undefined);
      // Step 2: open same side + lot count on the next-expiry token.
      // The side stays the same: a long carries to a long on the
      // next series; a short carries to a short. Lot count carries
      // 1:1 even if lot_size differs across expiries — the user
      // explicitly opted into the roll, so we keep their stated lot
      // intent rather than silently rescaling.
      await OrderAPI.place({
        token: rolloverDest.token,
        action: String(target.side).toUpperCase(),
        order_type: "MARKET",
        product_type: target.product_type,
        lots: openLots,
      });
      toast.dismiss(pendingToastId);
      toast.success(`Rolled to ${rolloverDest.symbol}`);
      qc.invalidateQueries({ queryKey: ["wallet"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["positions", "open"] });
    } catch (e: any) {
      // Restore the open-positions cache so the user can see whether
      // the close went through (if open failed, the row is already
      // gone server-side and the next 3s poll will keep it gone; if
      // close failed too, the row reappears).
      if (snapshot) qc.setQueryData(["positions", "open"], snapshot);
      qc.invalidateQueries({ queryKey: ["positions", "open"] });
      toast.dismiss(pendingToastId);
      toast.error(
        e?.message
          ? `Rollover failed: ${e.message}`
          : "Rollover failed",
      );
    } finally {
      setRolling(false);
    }
  }

  async function submit() {
    if (!target || submitting) return;
    const lots = Number(lotsInput);
    if (!Number.isFinite(lots) || lots <= 0) {
      toast.error("Enter a valid lot count");
      return;
    }
    if (lots > openLots + 1e-9) {
      toast.error(`Cannot close more than open ${openLots} lots`);
      return;
    }
    // Optimistic-id guard — synthetic `optimistic_<ts>` rows seeded by
    // OrderPanel / TradeDetailSheet can't be closed via the real API
    // (backend rejects with 404 because the id isn't a valid ObjectId).
    // Wait for the backend write to land (~300-800 ms) before closing.
    if (typeof target.id === "string" && target.id.startsWith("optimistic_")) {
      toast.error("Order still settling — try again in a second");
      return;
    }
    // Market-hours guard: avoid the optimistic remove → backend reject →
    // rollback flicker when the exchange is closed. Position stays in
    // place, dialog stays open, single clear toast tells the user why.
    if (!isInstrumentMarketOpen(target.segment_type, target.exchange)) {
      toast.error(`${marketLabel(target.segment_type, target.exchange)} market is closed — try closing ${target.symbol} during trading hours`, {
        duration: 4000,
      });
      return;
    }
    const isFull = lots >= openLots - 1e-9;

    setSubmitting(true);

    // Optimistic: drop the row from the open-positions cache for a FULL
    // close so the dialog → row removal feels instant. Partial closes
    // leave the row in place (the position is still open, just smaller);
    // the next 3 s positions poll picks up the new qty/avg.
    // Skipped for re-order users — the backend parks the close N s
    // before flattening, so the optimistic remove would just flicker.
    let snapshot: any[] | undefined;
    if (isFull && !reorderDelayActive) {
      snapshot = qc.getQueryData<any[]>(["positions", "open"]);
      qc.setQueryData<any[]>(["positions", "open"], (old) =>
        Array.isArray(old) ? old.filter((p) => p.id !== target.id) : old,
      );
    }

    // Close the dialog immediately — the user already committed by clicking
    // Close. Background error path rolls back the optimistic update.
    onClose();

    // Sync success toast — only for instant fills. Re-order users
    // get the deferred "<symbol> closed" toast from the parent
    // table's drain effect once the matching engine actually
    // flattens the row (explicit ask: notification trade close hone
    // ke baad aana chahiye).
    const pendingToastId = reorderDelayActive
      ? null
      : toast.success(
          isFull
            ? `${target.symbol} closed`
            : `${target.symbol} ${lots} lot(s) closed`,
        );

    // Notify the parent table the moment we fire the API call so the
    // row's X Close button can show its loading spinner until the
    // matching engine actually flattens the position. Parent clears
    // the flag when the position vanishes from the open list.
    onSubmit?.(target.id);

    try {
      // `lots` param: omit for full close so the backend takes the position-
      // wide path (releases all margin, sets status=CLOSED). Sending an
      // explicit value here would still work but the path is slightly
      // different and full-close is the common case.
      await PositionAPI.squareoff(target.id, isFull ? undefined : lots);
      // DO NOT invalidate positions — Atlas read replica may briefly
      // return the just-closed row as still OPEN, which would re-add
      // the row after we just optimistically removed it (flicker). The
      // 2 s background poll handles eventual consistency.
      qc.invalidateQueries({ queryKey: ["wallet"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
    } catch (e: any) {
      // Rollback the optimistic removal.
      if (isFull && snapshot) qc.setQueryData(["positions", "open"], snapshot);
      if (pendingToastId !== null) toast.dismiss(pendingToastId);
      toast.error(e?.message || "Close failed");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm gap-3 p-5">
        <DialogTitle className="text-base font-semibold">Close Position</DialogTitle>

        {/* Symbol / side / open-lots summary card */}
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm">
          <Row label="Symbol" value={target?.symbol ?? "—"} />
          <Row
            label="Side"
            value={
              <span className={cn(
                "font-semibold",
                String(target?.side).toUpperCase() === "BUY" ? "text-buy" : "text-sell",
              )}>
                {String(target?.side).toUpperCase()}
              </span>
            }
          />
          <Row label="Open lots" value={String(openLots)} />
        </div>

        <div>
          <p className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            Lots to close
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {([25, 50, 75, 100] as Preset[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => pickPreset(p)}
                className={cn(
                  "rounded-md border px-2 py-1.5 text-xs font-semibold transition-colors",
                  preset === p
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                )}
              >
                {p === 100 ? "FULL" : `${p}%`}
              </button>
            ))}
          </div>
          <input
            type="number"
            step="any"
            min={0}
            max={openLots}
            value={lotsInput}
            onChange={(e) => setLotsInput(e.target.value)}
            className="mt-2 h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
          />
        </div>

        {/* Roll-to-next-expiry — only renders when the backend
            returned a rolloverDest. The lookup is gated on the
            target carrying an `expiry`, so non-derivatives skip the
            query entirely and this button stays hidden. */}
        {rolloverDest?.token && (
          <button
            type="button"
            onClick={rollToNextExpiry}
            disabled={rolling || submitting}
            className="flex items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-left text-xs transition-colors hover:bg-primary/10 disabled:opacity-60"
          >
            <span className="flex items-center gap-2">
              <Repeat2 className="size-3.5 text-primary" />
              <span>
                <span className="block font-semibold text-foreground">
                  {rolling ? "Rolling…" : "Roll to next expiry"}
                </span>
                <span className="block text-[10px] text-muted-foreground">
                  Close + open same on {rolloverDest.symbol}
                </span>
              </span>
            </span>
            <span className="text-[10px] text-primary">→</span>
          </button>
        )}

        <div className="mt-1 grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting || rolling}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={submitting || rolling}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {submitting ? "Closing…" : "Close"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
