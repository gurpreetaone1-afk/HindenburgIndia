"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Save,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ZerodhaAPI } from "@/lib/api";
import { isSuperAdmin } from "@/lib/permissions";
import { useAdminAuthStore } from "@/stores/authStore";
import { cn } from "@/lib/utils";

// Exchanges the operator assigns. Labels explain what each carries so the
// A/B choice is obvious. Order groups NSE/BSE-side first, MCX last.
const EXCHANGES: { code: string; label: string; hint: string }[] = [
  { code: "NSE", label: "NSE", hint: "Equity (cash)" },
  { code: "NFO", label: "NSE F&O", hint: "NIFTY / BANKNIFTY / stock options" },
  { code: "BSE", label: "BSE", hint: "Equity (cash)" },
  { code: "BFO", label: "BSE F&O", hint: "SENSEX / BANKEX" },
  { code: "CDS", label: "Currency", hint: "NSE currency derivatives" },
  { code: "MCX", label: "MCX", hint: "Commodities — CRUDE / GOLD / NG" },
];

const ACCOUNT_LABEL: Record<number, string> = { 0: "Account A", 1: "Account B" };

type LiveAccount = {
  configured?: boolean;
  connected?: boolean;
  effective_up?: boolean | null;
};

/**
 * Dual-account routing + HA failover control. Assign each exchange to Kite
 * Account A or B; if either account's socket drops, its exchanges auto-fail
 * over to the surviving account so the feed never stops. Super-admin only.
 * Fully responsive — the exchange grid stacks to one column on mobile.
 */
export function RoutingFailoverCard() {
  const admin = useAdminAuthStore((s) => s.admin);
  const qc = useQueryClient();
  const isSuper = isSuperAdmin(admin);

  const QUERY_KEY = ["zerodha", "routing"] as const;
  const routingQuery = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => ZerodhaAPI.routing(),
    refetchInterval: 4000, // live health pills
    enabled: isSuper,
  });

  const serverConfig = routingQuery.data?.config;
  const live = routingQuery.data?.live;

  // Local editable copy of the exchange→account map + knobs.
  const [map, setMap] = useState<Record<string, number>>({});
  const [failoverEnabled, setFailoverEnabled] = useState(true);
  const [downSec, setDownSec] = useState(5);
  const [upSec, setUpSec] = useState(25);
  const [dirty, setDirty] = useState(false);

  // Hydrate the editor from the server whenever a fresh config lands and the
  // user hasn't started editing (so live refetches don't stomp edits).
  useEffect(() => {
    if (!serverConfig || dirty) return;
    const m: Record<string, number> = {};
    for (const ex of EXCHANGES) {
      m[ex.code] = Number(serverConfig.exchange_account_map?.[ex.code] ?? 0) === 1 ? 1 : 0;
    }
    setMap(m);
    setFailoverEnabled(Boolean(serverConfig.failover_enabled));
    setDownSec(Number(serverConfig.failover_confirm_down_sec ?? 5));
    setUpSec(Number(serverConfig.failback_confirm_up_sec ?? 25));
  }, [serverConfig, dirty]);

  const saveMut = useMutation({
    mutationFn: () =>
      ZerodhaAPI.updateRouting({
        exchange_account_map: map,
        failover_enabled: failoverEnabled,
        failover_confirm_down_sec: downSec,
        failback_confirm_up_sec: upSec,
      }),
    onSuccess: () => {
      toast.success("Feed routing saved");
      setDirty(false);
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.detail || "Failed to save routing"),
  });

  const disconnectMut = useMutation({
    mutationFn: (account: number) => ZerodhaAPI.disconnectAccount(account),
    onSuccess: (_d, account) => {
      toast.success(
        `${ACCOUNT_LABEL[account]} disconnected — watch the feed fail over to the other account`,
      );
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.detail || "Disconnect failed"),
  });

  // Is a failover currently ACTIVE? (an exchange effectively routed to a
  // different account than its configured one.)
  const activeFailovers = useMemo(() => {
    const eff = live?.effective_routing || {};
    const cfg = live?.routing_map || {};
    const out: { ex: string; from: number; to: number }[] = [];
    for (const ex of Object.keys(eff)) {
      const desired = Number(cfg[ex] ?? 0);
      const actual = Number(eff[ex]);
      if (actual !== desired) out.push({ ex, from: desired, to: actual });
    }
    return out;
  }, [live]);

  if (!isSuper) return null;

  const accA: LiveAccount = live?.accounts?.["0"] || {};
  const accB: LiveAccount = live?.accounts?.["1"] || {};

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-primary" />
          Feed Routing &amp; Failover
        </CardTitle>
        <CardDescription>
          Assign each exchange to a Kite account. If either account&apos;s socket
          drops, its exchanges auto-fail over to the other so the feed never
          stops.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Live account health pills */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AccountHealth label="Account A" sub="NSE / BSE" acc={accA} />
          <AccountHealth label="Account B" sub="MCX" acc={accB} />
        </div>

        {/* Active-failover banner */}
        {activeFailovers.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
            <div>
              <div className="font-semibold text-amber-600 dark:text-amber-400">
                Failover active
              </div>
              <div className="text-xs text-muted-foreground">
                {activeFailovers
                  .map(
                    (f) =>
                      `${f.ex}: ${ACCOUNT_LABEL[f.from]} → ${ACCOUNT_LABEL[f.to]}`,
                  )
                  .join(" · ")}{" "}
                — running on the surviving account until recovery.
              </div>
            </div>
          </div>
        )}

        {/* Exchange assignment grid */}
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Exchange assignment
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {EXCHANGES.map((ex) => {
              const val = map[ex.code] ?? 0;
              const effAcct = live?.effective_routing?.[ex.code];
              const failedOver =
                effAcct !== undefined && Number(effAcct) !== Number(val);
              return (
                <div
                  key={ex.code}
                  className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {ex.label}
                      {failedOver && (
                        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                          on {ACCOUNT_LABEL[Number(effAcct)]}
                        </span>
                      )}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {ex.hint}
                    </div>
                  </div>
                  <select
                    value={val}
                    onChange={(e) => {
                      setMap((m) => ({ ...m, [ex.code]: Number(e.target.value) }));
                      setDirty(true);
                    }}
                    className="shrink-0 rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value={0}>Account A</option>
                    <option value={1}>Account B</option>
                  </select>
                </div>
              );
            })}
          </div>
        </div>

        {/* Failover knobs */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={failoverEnabled}
              onChange={(e) => {
                setFailoverEnabled(e.target.checked);
                setDirty(true);
              }}
              className="size-4 accent-primary"
            />
            <span>Auto-failover</span>
          </label>
          <NumberField
            label="Fail-over after (s)"
            value={downSec}
            min={1}
            max={120}
            onChange={(v) => {
              setDownSec(v);
              setDirty(true);
            }}
          />
          <NumberField
            label="Fail-back after (s)"
            value={upSec}
            min={1}
            max={600}
            onChange={(v) => {
              setUpSec(v);
              setDirty(true);
            }}
          />
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button
            onClick={() => saveMut.mutate()}
            disabled={!dirty || saveMut.isPending}
            className="w-full sm:w-auto"
          >
            {saveMut.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Save className="mr-2 size-4" />
            )}
            Save routing
          </Button>

          {/* Failover test — off-market only. Disconnects one account so you
              can watch its exchanges move to the survivor, then it self-heals. */}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              size="sm"
              disabled={disconnectMut.isPending || !accA.connected}
              onClick={() => disconnectMut.mutate(0)}
              className="w-full sm:w-auto"
            >
              <Activity className="mr-2 size-4" /> Test: drop A
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={disconnectMut.isPending || !accB.connected}
              onClick={() => disconnectMut.mutate(1)}
              className="w-full sm:w-auto"
            >
              <Activity className="mr-2 size-4" /> Test: drop B
            </Button>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Tip: use “Test: drop A/B” only off-market to verify failover — the
          dropped account self-heals within ~30 s and its exchanges route back.
        </p>
      </CardContent>
    </Card>
  );
}

function AccountHealth({
  label,
  sub,
  acc,
}: {
  label: string;
  sub: string;
  acc: LiveAccount;
}) {
  const configured = Boolean(acc?.configured);
  const connected = Boolean(acc?.connected);
  const state = !configured ? "unset" : connected ? "up" : "down";
  const styles = {
    up: "border-emerald-500/40 bg-emerald-500/10",
    down: "border-destructive/40 bg-destructive/10",
    unset: "border-border bg-muted/30",
  }[state];
  return (
    <div className={cn("flex items-center gap-3 rounded-md border px-3 py-2.5", styles)}>
      {state === "up" ? (
        <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />
      ) : state === "down" ? (
        <XCircle className="size-5 shrink-0 text-destructive" />
      ) : (
        <AlertTriangle className="size-5 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0">
        <div className="text-sm font-semibold">
          {label}{" "}
          <span className="font-normal text-muted-foreground">· {sub}</span>
        </div>
        <div
          className={cn(
            "text-xs font-medium",
            state === "up"
              ? "text-emerald-600 dark:text-emerald-400"
              : state === "down"
                ? "text-destructive"
                : "text-muted-foreground",
          )}
        >
          {state === "up"
            ? "Connected · streaming"
            : state === "down"
              ? "Disconnected"
              : "Not configured"}
        </div>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-16 rounded border border-border bg-background px-2 py-1 text-right text-sm outline-none focus:ring-1 focus:ring-primary"
      />
    </label>
  );
}
