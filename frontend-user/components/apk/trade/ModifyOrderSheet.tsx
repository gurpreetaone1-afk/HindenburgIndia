"use client";

// Phone "Edit order" modal — looks like the apk OrdersScreen EditOrderModal;
// logic is the web PositionsTabs EditPendingOrderDialog: same validation
// (marketable-LIMIT guard, partial-fill floor), PUT /user/orders/{id} with
// { price?, trigger_price?, lots? }, then invalidate ["orders"].
//
//   <ModifyOrderSheet order={editing} onClose={() => setEditing(null)} />
//
// `order` is a row from OrderAPI.list(); null renders nothing.

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { IoClose } from "react-icons/io5";
import { InstrumentAPI, OrderAPI } from "@/lib/api";

export interface ModifyOrderSheetProps {
  order: any | null;
  onClose: () => void;
}

export function ModifyOrderSheet({ order, onClose }: ModifyOrderSheetProps) {
  if (!order) return null;
  return <ModifyOrderDialog key={order.id} order={order} onClose={onClose} />;
}

const clean = (v: string) => v.replace(/[^\d.]/g, "");

function ModifyOrderDialog({ order, onClose }: { order: any; onClose: () => void }) {
  const qc = useQueryClient();
  const ref = useRef<HTMLDialogElement>(null);
  const [price, setPrice] = useState(order.price != null && Number(order.price) > 0 ? String(Number(order.price)) : "");
  const [trigger, setTrigger] = useState(
    order.trigger_price != null && Number(order.trigger_price) > 0 ? String(Number(order.trigger_price)) : "",
  );
  const [lots, setLots] = useState(order.lots != null ? String(Number(order.lots)) : "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);

  const token = order.instrument_token ?? order.token;
  const { data: quote } = useQuery<any>({
    queryKey: ["quote", token],
    queryFn: () => InstrumentAPI.quote(token),
    enabled: !!token,
    refetchInterval: 1500,
    staleTime: 1000,
  });

  const orderType = String(order.order_type ?? "LIMIT").toUpperCase();
  const isLimit = orderType === "LIMIT";
  const isSlm = orderType === "SL_M" || orderType === "SL-M" || orderType === "SLM";
  const isSl = orderType === "SL";

  async function save() {
    const priceNum = price ? Number(price) : NaN;
    const triggerNum = trigger ? Number(trigger) : NaN;
    const lotsNum = lots ? Number(lots) : NaN;

    if (isLimit && (!Number.isFinite(priceNum) || priceNum <= 0)) {
      toast.error("Enter a valid limit price");
      return;
    }
    if (isSlm || isSl) {
      if (!Number.isFinite(triggerNum) || triggerNum <= 0) {
        toast.error("Enter a valid trigger price");
        return;
      }
      if (isSl && (!Number.isFinite(priceNum) || priceNum <= 0)) {
        toast.error("Enter a valid limit price");
        return;
      }
    }
    if (Number.isFinite(lotsNum) && lotsNum <= 0) {
      toast.error("Lots must be greater than 0");
      return;
    }
    if (isLimit && Number.isFinite(priceNum)) {
      const side = String(order.action ?? "").toUpperCase();
      const ask = Number(quote?.ask ?? quote?.ltp ?? 0);
      const bid = Number(quote?.bid ?? quote?.ltp ?? 0);
      if (side === "BUY" && ask > 0 && priceNum >= ask) {
        toast.error(
          `BUY LIMIT ${priceNum} is at or above the current ask ${ask} — this would fill immediately. To wait for a lower price, lower the limit; to wait for a higher price, switch to an SL-M order.`,
          { duration: 6000 },
        );
        return;
      }
      if (side === "SELL" && bid > 0 && priceNum <= bid) {
        toast.error(
          `SELL LIMIT ${priceNum} is at or below the current bid ${bid} — this would fill immediately. To wait for a higher price, raise the limit; to wait for a lower price, switch to an SL-M order.`,
          { duration: 6000 },
        );
        return;
      }
    }
    if (Number.isFinite(lotsNum) && lotsNum > 0) {
      const filled = Number(order.filled_quantity ?? 0);
      if (filled > 0) {
        const lotSize = Number(order.instrument?.lot_size ?? order.lot_size ?? 1) || 1;
        const minLots = filled / lotSize;
        if (lotsNum < minLots) {
          toast.error(`Already filled ${filled} qty (${minLots.toFixed(2)} lots) — new lots must be ≥ that.`);
          return;
        }
      }
    }

    const body: Record<string, number> = {};
    if (isLimit && Number.isFinite(priceNum)) body.price = priceNum;
    if ((isSlm || isSl) && Number.isFinite(triggerNum)) body.trigger_price = triggerNum;
    if (isSl && Number.isFinite(priceNum)) body.price = priceNum;
    if (Number.isFinite(lotsNum) && lotsNum > 0) body.lots = lotsNum;
    if (Object.keys(body).length === 0) {
      toast.error("Nothing to update");
      return;
    }

    setSaving(true);
    try {
      await OrderAPI.modify(order.id, body);
      toast.success("Order updated");
      qc.invalidateQueries({ queryKey: ["orders"] });
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      aria-labelledby="apk-edit-order-title"
      className="m-auto w-[calc(100%-32px)] max-w-md rounded-[14px] border border-apk-border bg-apk-elevated p-0 text-apk-text backdrop:bg-black/55"
    >
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <div id="apk-edit-order-title" className="text-[16px] font-extrabold">
              Edit order
            </div>
            <div className="mt-0.5 truncate text-[11px] text-apk-muted">
              {order.action} · {order.symbol} · {orderType}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="-m-1 p-1 text-apk-muted">
            <IoClose size={22} />
          </button>
        </div>

        <EditField label="Lots" value={lots} onChange={setLots} placeholder={String(order.lots ?? "1")} />
        {isLimit || isSl ? (
          <EditField
            label="Limit price"
            value={price}
            onChange={setPrice}
            placeholder={Number(order.price) > 0 ? Number(order.price).toFixed(2) : "0.00"}
          />
        ) : null}
        {isSlm || isSl ? (
          <EditField
            label="Trigger price"
            value={trigger}
            onChange={setTrigger}
            placeholder={Number(order.trigger_price) > 0 ? Number(order.trigger_price).toFixed(2) : "0.00"}
          />
        ) : null}

        <div className="mt-1.5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-[10px] border border-apk-border py-3 text-[14px] font-bold"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="flex-1 rounded-[10px] bg-apk-primary py-3 text-[14px] font-extrabold text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </dialog>
  );
}

function EditField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col">
      <span className="mb-1 text-[11px] font-bold tracking-[0.4px] text-apk-muted">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(clean(e.target.value))}
        inputMode="decimal"
        placeholder={placeholder}
        className="rounded-[10px] border border-apk-border bg-apk-surface px-3 py-2.5 text-[16px] font-bold tabular-nums text-apk-text outline-none placeholder:text-apk-dim focus:border-apk-primary"
      />
    </label>
  );
}
