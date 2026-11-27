"use client";

// Port of apk src/features/alerts/screens/AlertsScreen.tsx. Data logic is the
// web alerts page's: ["alerts"] key, symbol search instead of a raw token
// box, LTP_ABOVE / LTP_BELOW + target_price + note (the backend has no
// CHANGE_PCT_* alert types, so the app's % chips are not offered).

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { IoAdd, IoAlarmOutline, IoClose, IoTrashOutline } from "react-icons/io5";
import { AlertsAPI, InstrumentAPI } from "@/lib/api";
import { Card, Chip, GradientButton, Header, Loader, Screen, useConfirm } from "@/components/apk/ui";
import { fixed } from "@/components/apk/market/format";
import { fmtTime } from "./time";

const TYPE_LABEL: Record<string, string> = {
  LTP_ABOVE: "Price ≥",
  LTP_BELOW: "Price ≤",
  PERCENT_CHANGE: "% change",
  VOLUME_SPIKE: "Volume spike",
};
const CREATE_TYPES = ["LTP_ABOVE", "LTP_BELOW"] as const;

const fieldCls =
  "w-full rounded-lg border border-apk-border bg-apk-bg p-2.5 text-[14px] text-apk-text outline-none placeholder:text-apk-muted focus:border-apk-primary";

function AlertRow({ alert, onRemove }: { alert: any; onRemove: () => void }) {
  const status = alert.is_triggered ? "TRIGGERED" : alert.is_active === false ? "INACTIVE" : "ACTIVE";
  const target =
    alert.target_price != null
      ? fixed(Number(alert.target_price))
      : alert.target_percent != null
        ? `${Number(alert.target_percent).toFixed(2)}%`
        : "—";
  return (
    <Card>
      <div className="flex items-center gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold text-apk-text">{alert.symbol ?? alert.instrument_token}</div>
          <div className="mt-0.5 text-[12px] tabular-nums text-apk-muted">
            {TYPE_LABEL[alert.alert_type] ?? alert.alert_type} {target}
          </div>
          {alert.note ? <div className="mt-0.5 truncate text-[12px] text-apk-muted">{alert.note}</div> : null}
          <div className="mt-1 text-[11px] text-apk-dim">
            {alert.is_triggered && alert.triggered_at ? `Triggered ${fmtTime(alert.triggered_at)}` : `Set ${fmtTime(alert.created_at)} · ${status}`}
          </div>
        </div>
        <button type="button" aria-label="Remove alert" onClick={onRemove} className="p-1 text-apk-sell">
          <IoTrashOutline size={18} />
        </button>
      </div>
    </Card>
  );
}

function CreateForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [token, setToken] = useState("");
  const [alertType, setAlertType] = useState<string>("LTP_ABOVE");
  const [target, setTarget] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: results } = useQuery({
    queryKey: ["instr-search-alerts", search],
    queryFn: () => InstrumentAPI.search(search, undefined, undefined, 8),
    enabled: search.length > 0,
  });

  async function create() {
    if (!token || !target) {
      toast.error("Instrument + target required");
      return;
    }
    setBusy(true);
    try {
      await AlertsAPI.create({ token, alert_type: alertType, target_price: Number(target), note });
      toast.success("Alert created");
      setToken("");
      setTarget("");
      setNote("");
      qc.invalidateQueries({ queryKey: ["alerts"] });
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="mb-2.5 text-[14px] font-semibold text-apk-text">New alert</div>
      <div className="flex flex-col gap-2.5">
        <div>
          <label htmlFor="alert-instrument" className="mb-1 ml-1 block text-[11px] text-apk-muted">
            Instrument
          </label>
          <input
            id="alert-instrument"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setToken("");
            }}
            placeholder="Search symbol…"
            autoCapitalize="characters"
            autoCorrect="off"
            className={fieldCls}
          />
          {search && !token && results?.length ? (
            <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-apk-border bg-apk-bg">
              {results.map((r: any) => (
                <button
                  key={r.token}
                  type="button"
                  onClick={() => {
                    setToken(r.token);
                    setSearch(r.symbol);
                  }}
                  className="flex w-full items-center justify-between border-b border-apk-border px-2.5 py-2 text-left text-[12px] last:border-b-0"
                >
                  <span className="text-apk-text">{r.symbol}</span>
                  <span className="text-apk-muted">{r.exchange}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CREATE_TYPES.map((t) => (
            <Chip key={t} label={TYPE_LABEL[t]} size="sm" active={t === alertType} onClick={() => setAlertType(t)} />
          ))}
        </div>
        <div>
          <label htmlFor="alert-target" className="mb-1 ml-1 block text-[11px] text-apk-muted">
            Target price
          </label>
          <input
            id="alert-target"
            type="number"
            step="0.05"
            inputMode="decimal"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="23500"
            className={fieldCls}
          />
        </div>
        <div>
          <label htmlFor="alert-note" className="mb-1 ml-1 block text-[11px] text-apk-muted">
            Note (optional)
          </label>
          <input id="alert-note" value={note} onChange={(e) => setNote(e.target.value)} className={fieldCls} />
        </div>
        <GradientButton label="Create alert" loading={busy} onClick={create} />
      </div>
    </Card>
  );
}

export function ApkAlertsScreen() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const { data, isLoading, isError } = useQuery({ queryKey: ["alerts"], queryFn: () => AlertsAPI.list() });
  const rows = data ?? [];
  const [confirm, confirmDialog] = useConfirm();

  async function remove(a: any) {
    const ok = await confirm({
      title: "Remove alert?",
      message: `${a.symbol ?? a.instrument_token} ${TYPE_LABEL[a.alert_type] ?? ""}`.trim(),
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    try {
      await AlertsAPI.delete(a.id);
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["alerts"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <Screen padded={false}>
      {confirmDialog}
      <div className="px-4">
        <Header
          title="Price alerts"
          back
          right={
            <button
              type="button"
              aria-label={showForm ? "Close form" : "New alert"}
              onClick={() => setShowForm((v) => !v)}
              className="-m-2 p-2 text-apk-text"
            >
              {showForm ? <IoClose size={22} /> : <IoAdd size={22} />}
            </button>
          }
        />
      </div>
      <div className="flex flex-col gap-2.5 p-4">
        {showForm ? <CreateForm onClose={() => setShowForm(false)} /> : null}
        {isLoading ? (
          <Loader />
        ) : isError ? (
          <div className="py-12 text-center text-[14px] text-apk-muted">Couldn&apos;t load alerts.</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 py-12">
            <span className="text-apk-dim">
              <IoAlarmOutline size={36} />
            </span>
            <div className="text-[14px] text-apk-muted">No alerts yet</div>
            <div className="text-[11px] text-apk-dim">Tap + to set a price alert</div>
          </div>
        ) : (
          rows.map((a: any) => <AlertRow key={a.id} alert={a} onRemove={() => remove(a)} />)
        )}
      </div>
    </Screen>
  );
}
