"use client";

// Phone port of apk src/features/trade/screens/OrdersScreen.tsx.
// Data + cancel logic are the web orders page's (app/(dashboard)/orders/
// page.tsx): same ["orders","book"] query, same OrderAPI.cancel + toasts.

import { memo, useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { IoCartOutline, IoClose, IoCreateOutline, IoTimeOutline } from "react-icons/io5";
import { OrderAPI } from "@/lib/api";
import { cn, formatPrice, parseBackendDate } from "@/lib/utils";
import { Button, Screen, Sheet } from "@/components/apk/ui";
import { ModifyOrderSheet } from "@/components/apk/trade/ModifyOrderSheet";
import { fmtQty } from "@/components/apk/positions/logic";
import { IllustrationEmpty, LabeledLoader, SideFilterChips, ist, type SideFilter } from "./shared";

type TabKey = "open" | "executed" | "rejected";

// Backend OrderStatus values (models/order.py). Open = the web book's
// working statuses; Rejected also carries cancelled/expired, as the app does.
const OPEN_STATUSES = ["PENDING", "OPEN", "TRIGGERED", "PARTIAL"];
const REJECTED_STATUSES = ["REJECTED", "CANCELLED", "EXPIRED"];

const EMPTY_COPY: Record<TabKey, string> = {
  open: "Pending and partially filled orders will appear here.",
  executed: "Filled orders will appear here once you trade.",
  rejected: "Rejected and cancelled orders will show up here.",
};

function statusOf(o: any): string {
  return String(o?.status ?? "").toUpperCase();
}

function hasBracket(o: any): boolean {
  return Number(o?.bracket_stop_loss) > 0 || Number(o?.bracket_target) > 0;
}

function matchesFilter(o: any, f: SideFilter): boolean {
  const action = String(o?.action ?? "").toUpperCase();
  if (f === "all") return true;
  if (f === "buy") return action === "BUY";
  if (f === "sell") return action === "SELL";
  return hasBracket(o);
}

function fmtSegmentLabel(segment?: string, exchange?: string): string {
  const s = (segment ?? "").toUpperCase();
  if (!s && !exchange) return "";
  if (s.includes("CRYPTO")) return "Crypto";
  if (s.includes("CDS") || s.includes("FOREX")) return "Forex";
  if (s.includes("MCX") || s.includes("COMEX")) return "Comex";
  if (s.includes("NFO") || s.includes("BFO")) return "F&O";
  if (s.includes("BSE")) return "BSE";
  if (s.includes("NSE")) return "NSE";
  return exchange ?? "";
}

export function ApkOrdersScreen() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>("open");
  const [sideFilter, setSideFilter] = useState<SideFilter>("all");
  const [confirming, setConfirming] = useState<any | null>(null);
  const [editing, setEditing] = useState<any | null>(null);

  // Same query (key + options) as the desktop orders book.
  const { data: orders = [], isLoading, isError, error } = useQuery<any[]>({
    queryKey: ["orders", "book"],
    queryFn: () => OrderAPI.list() as Promise<any[]>,
    refetchInterval: 4000,
    staleTime: 2000,
    placeholderData: (prev) => prev,
  });

  const buckets = useMemo(() => {
    const out: Record<TabKey, any[]> = { open: [], executed: [], rejected: [] };
    for (const o of orders) {
      const s = statusOf(o);
      if (s === "EXECUTED") out.executed.push(o);
      else if (REJECTED_STATUSES.includes(s)) out.rejected.push(o);
      else if (OPEN_STATUSES.includes(s)) out.open.push(o);
    }
    return out;
  }, [orders]);

  const rows = useMemo(
    () => (sideFilter === "all" ? buckets[tab] : buckets[tab].filter((o) => matchesFilter(o, sideFilter))),
    [buckets, tab, sideFilter],
  );

  // Web orders page cancelOrder — same call, toasts and invalidation.
  async function cancelOrder(id: string) {
    try {
      await OrderAPI.cancel(id);
      toast.success("Order cancelled");
      qc.invalidateQueries({ queryKey: ["orders"] });
    } catch (e: any) {
      toast.error(e?.message || "Failed to cancel order");
    }
  }

  const onCancel = useCallback((o: any) => setConfirming(o), []);
  const onEdit = useCallback((o: any) => setEditing(o), []);

  const tabs: { key: TabKey; label: string }[] = [
    { key: "open", label: "Open" },
    { key: "executed", label: "Executed" },
    { key: "rejected", label: "Rejected" },
  ];

  return (
    <Screen padded={false}>
      <div className="sticky top-0 z-10 bg-apk-bg">
        <div className="px-4 pb-2 pt-3">
          <h1 className="text-[26px] font-extrabold text-apk-text">Orders</h1>
        </div>
        <div className="apk-no-scrollbar flex overflow-x-auto border-b border-apk-border px-4">
          {tabs.map((t) => {
            const active = tab === t.key;
            return (
              <button key={t.key} type="button" onClick={() => setTab(t.key)} className="mr-6 shrink-0 whitespace-nowrap text-left">
                <span className="flex items-center py-3">
                  <span className={cn("text-[15px]", active ? "font-bold text-apk-text" : "font-semibold text-apk-muted")}>
                    {t.label}
                  </span>
                  <span className="ml-2 grid h-[18px] min-w-[22px] place-items-center rounded-full bg-apk-surface px-1.5 text-[11px] font-bold tabular-nums text-apk-muted">
                    {buckets[t.key].length}
                  </span>
                </span>
                {active ? <span className="-mt-0.5 block h-0.5 rounded-[1px] bg-apk-primary" /> : null}
              </button>
            );
          })}
        </div>
        <SideFilterChips active={sideFilter} onChange={setSideFilter} className="pb-1 pt-2" />
      </div>

      {isLoading && orders.length === 0 ? (
        <LabeledLoader label="Loading orders…" />
      ) : isError && orders.length === 0 ? (
        <IllustrationEmpty
          kind="clipboard"
          title="Couldn't load orders"
          description={(error as Error | null)?.message ?? "Please try again."}
        />
      ) : rows.length === 0 ? (
        <IllustrationEmpty kind="clipboard" title={`No ${tab} orders`} description={EMPTY_COPY[tab]} />
      ) : (
        <div className="pb-5 pt-2">
          {rows.map((o, i) => (
            <div key={o.id}>
              {i > 0 ? <div className="mx-4 h-px bg-apk-border" /> : null}
              <OrderRow
                order={o}
                onCancel={tab === "open" ? onCancel : undefined}
                onEdit={tab === "open" ? onEdit : undefined}
              />
            </div>
          ))}
        </div>
      )}

      <Sheet open={!!confirming} onClose={() => setConfirming(null)} title="Cancel order?">
        {confirming ? (
          <div className="pb-2">
            <p className="text-[14px] text-apk-muted">
              {String(confirming.action ?? "").toUpperCase()} {confirming.lots} {confirming.symbol} will be cancelled.
            </p>
            <div className="mt-4 flex gap-2">
              <Button label="Keep" variant="ghost" fullWidth onClick={() => setConfirming(null)} />
              <Button
                label="Cancel order"
                variant="danger"
                fullWidth
                onClick={() => {
                  const id = confirming.id;
                  setConfirming(null);
                  void cancelOrder(id);
                }}
              />
            </div>
          </div>
        ) : null}
      </Sheet>

      {/* MODIFY HOOK-UP — the only place an order edit is wired. */}
      <ModifyOrderSheet order={editing} onClose={() => setEditing(null)} />
    </Screen>
  );
}

const STATUS_STYLE: Record<string, { cls: string; label: string }> = {
  EXECUTED: { cls: "bg-apk-primary/[0.18] text-apk-primary", label: "EXECUTED" },
  OPEN: { cls: "bg-apk-warn/[0.16] text-apk-warn", label: "OPEN" },
  PENDING: { cls: "bg-apk-warn/[0.16] text-apk-warn", label: "PENDING" },
  TRIGGERED: { cls: "bg-apk-warn/[0.16] text-apk-warn", label: "TRIGGERED" },
  PARTIAL: { cls: "bg-apk-warn/[0.16] text-apk-warn", label: "PARTIAL" },
  CANCELLED: { cls: "bg-apk-dim/[0.18] text-apk-muted", label: "CANCELLED" },
  EXPIRED: { cls: "bg-apk-dim/[0.18] text-apk-muted", label: "EXPIRED" },
  REJECTED: { cls: "bg-apk-sell/[0.14] text-apk-sell", label: "REJECTED" },
};

const OrderRow = memo(function OrderRow({
  order,
  onCancel,
  onEdit,
}: {
  order: any;
  onCancel?: (o: any) => void;
  onEdit?: (o: any) => void;
}) {
  const status = statusOf(order);
  const isBuy = String(order.action ?? "").toUpperCase() === "BUY";
  const st = STATUS_STYLE[status] ?? { cls: "bg-apk-surface text-apk-muted", label: status || "—" };
  const segmentLabel = fmtSegmentLabel(order.segment, order.exchange);

  const eventTs = order.executed_at || order.cancelled_at || order.created_at;
  const time = ist(eventTs, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) || "—";
  const d = parseBackendDate(eventTs);
  const sameYear = !d || d.getFullYear() === new Date().getFullYear();
  const date = ist(eventTs, { day: "2-digit", month: "short", ...(sameYear ? {} : { year: "numeric" }) });

  // Avg for filled, limit for LIMIT, trigger for SL / SL-M, MARKET otherwise.
  const avg = Number(order.average_price ?? 0);
  const limit = Number(order.price ?? 0);
  const trigger = Number(order.trigger_price ?? 0);
  const type = String(order.order_type ?? "").toUpperCase();
  const priceValue =
    avg > 0
      ? formatPrice(avg, order.segment, order.exchange)
      : type === "MARKET"
        ? "MARKET"
        : limit > 0
          ? formatPrice(limit, order.segment, order.exchange)
          : trigger > 0
            ? formatPrice(trigger, order.segment, order.exchange)
            : "—";
  const cartQty = status === "EXECUTED" && Number(order.filled_quantity) > 0 ? order.filled_quantity : order.quantity;

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <span
            className={cn(
              "rounded px-2 py-[3px] text-[11px] font-extrabold tracking-[0.6px]",
              isBuy ? "bg-apk-primary/[0.18] text-apk-primary" : "bg-apk-sell/[0.16] text-apk-sell",
            )}
          >
            {isBuy ? "BUY" : "SELL"}
          </span>
          <span className="ml-2.5 flex items-center text-apk-text">
            <IoCartOutline size={14} />
            <span className="ml-1 text-[13px] font-bold tabular-nums">{fmtQty(cartQty)}</span>
          </span>
        </div>
        <div className="flex items-center">
          <IoTimeOutline size={12} className="text-apk-muted" />
          <span className="ml-1 mr-2.5 flex flex-col items-end">
            <span className="text-[11px] font-semibold tabular-nums text-apk-muted">{time}</span>
            {date ? <span className="mt-px text-[10px] text-apk-dim">{date}</span> : null}
          </span>
          <span className={cn("rounded px-2 py-[3px] text-[11px] font-extrabold tracking-[0.5px]", st.cls)}>
            {st.label}
          </span>
        </div>
      </div>

      <div className="mt-2 flex items-end justify-between">
        <div className="mr-3 min-w-0 flex-1">
          <div className="truncate text-[16px] font-extrabold text-apk-text">{order.symbol}</div>
          {segmentLabel ? <div className="mt-0.5 text-[11px] text-apk-dim">{segmentLabel}</div> : null}
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[16px] font-extrabold tabular-nums text-apk-text">{priceValue}</span>
          <span className="mt-0.5 text-[11px] text-apk-dim">{order.product_type}</span>
        </div>
      </div>

      {status === "REJECTED" && order.rejection_reason ? (
        <div className="mt-1.5 line-clamp-2 text-[11px] text-apk-sell">{order.rejection_reason}</div>
      ) : null}

      {onEdit || onCancel ? (
        <div className="mt-2.5 flex justify-end gap-2">
          {onEdit ? (
            <button
              type="button"
              onClick={() => onEdit(order)}
              className="flex items-center rounded-md bg-apk-primary/15 px-2.5 py-1.5 text-apk-primary"
            >
              <IoCreateOutline size={13} />
              <span className="ml-[5px] text-[11px] font-extrabold tracking-[0.4px]">EDIT</span>
            </button>
          ) : null}
          {onCancel ? (
            <button
              type="button"
              onClick={() => onCancel(order)}
              className="flex items-center rounded-md bg-apk-sell/15 px-2.5 py-1.5 text-apk-sell"
            >
              <IoClose size={13} />
              <span className="ml-[5px] text-[11px] font-extrabold tracking-[0.4px]">CANCEL</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});
