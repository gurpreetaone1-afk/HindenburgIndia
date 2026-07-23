"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownToLine,
  ArrowUpRight,
  CandlestickChart,
  ChevronRight,
  Eye,
  EyeOff,
  Repeat,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/authStore";
import { BinaryAPI, DashboardAPI, OrderAPI, PositionAPI } from "@/lib/api";
import { cn, formatINR, formatPrice, pnlColor } from "@/lib/utils";
import { useMarketStream } from "@/lib/useMarketStream";
import { isInstrumentMarketOpen } from "@/lib/marketHours";

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { data: summary } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => DashboardAPI.summary(),
    refetchInterval: 5000,
  });
  const { data: positions } = useQuery({
    queryKey: ["positions", "open"],
    queryFn: () => PositionAPI.open(),
    refetchInterval: 5000,
  });
  // Live quotes for the open-positions widget so its P&L matches the
  // Positions page EXACTLY — both recompute (close-side price − entry) × qty
  // off the same WebSocket bid/ask feed. Previously this widget showed the
  // backend `unrealized_pnl` at the stale LTP, which diverged from the
  // Positions page (live BID for a long exit) by the spread + charges.
  const streamTokens = useMemo(() => {
    const set = new Set<string>();
    for (const p of positions ?? []) {
      const tok = String(p?.instrument_token ?? p?.token ?? "");
      if (tok) set.add(tok);
    }
    return Array.from(set);
  }, [positions]);
  const liveQuotes = useMarketStream(streamTokens);
  // Side-aware close-side price (BID for BUY exit, ASK for SELL exit) →
  // live ltp → stored row.ltp. Frozen to row.ltp when the market is closed.
  // Mirrors liveLtpFor() in the Positions page so the numbers stay in lockstep.
  function liveLtpFor(row: any, side?: "BUY" | "SELL"): number {
    if (!isInstrumentMarketOpen(row?.segment_type ?? row?.segment, row?.exchange)) {
      return Number(row?.ltp ?? 0);
    }
    const tok = String(row?.instrument_token ?? row?.token ?? "");
    if (tok) {
      const tick = liveQuotes.get(tok);
      if (side === "BUY") {
        const liveBid = Number(tick?.bid ?? 0);
        if (liveBid > 0) return liveBid;
      } else if (side === "SELL") {
        const liveAsk = Number(tick?.ask ?? 0);
        if (liveAsk > 0) return liveAsk;
      }
      const liveLtp = Number(tick?.ltp ?? 0);
      if (liveLtp > 0) return liveLtp;
    }
    return Number(row?.ltp ?? 0);
  }
  const { data: orders } = useQuery({
    queryKey: ["orders", "recent-dashboard"],
    queryFn: () => OrderAPI.list(),
  });
  // Surface the Binary quick-action only when admin has enabled it
  // platform-wide. The settings call is cheap (singleton lookup +
  // Redis cache) and runs once on dashboard mount; users on a tenant
  // where binary is off don't see a dead tile.
  const { data: binaryCfg } = useQuery({
    queryKey: ["binary", "settings", ""],
    queryFn: () => BinaryAPI.settings(),
    // Short cache + refetch on focus so an admin toggling the pool reflects
    // on the dashboard quick-action without a hard reload.
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
  // Per-user availability (global × per-user × admin/broker pool chain) —
  // hide the Binary quick-action entirely when binary isn't available to
  // this user, not just when the global flag is off.
  const binaryEnabled = Boolean(binaryCfg?.available);
  // Today's P&L comes from the dedicated `/positions/pnl-summary` endpoint —
  // /dashboard/summary used to recompute it inline, but that path:
  //   1. only iterated currently-open positions, so trades CLOSED today were
  //      excluded from "Today's P&L";
  //   2. added each position's LIFETIME `realized_pnl` (not just today's),
  //      inflating the number with old realised slices; and
  //   3. didn't convert USD-quoted (crypto / forex / MCX) P&L to INR,
  //      reading ~83× too small for those users.
  // The pnl-summary endpoint already covers all three correctly and is the
  // same source the terminal's positions strip + PnlSummaryCards use, so the
  // dashboard, terminal and reports views now agree on a single number.
  const { data: pnlSummary } = useQuery({
    queryKey: ["positions", "pnl-summary"],
    queryFn: () => PositionAPI.pnlSummary(),
    refetchInterval: 5000,
  });

  const wallet = summary?.wallet ?? {};
  const portfolio =
    Number(wallet.available_balance ?? 0) + Number(wallet.used_margin ?? 0);
  // Prefer the canonical pnl-summary value; fall back to the dashboard
  // payload only while the dedicated query is still loading so we don't
  // flash ₹0 on first paint.
  const todayPnl = Number(pnlSummary?.today_pnl ?? summary?.today_pnl ?? 0);
  const todayPct = portfolio ? (todayPnl / portfolio) * 100 : 0;

  const [hideBalance, setHideBalance] = useState(false);

  return (
    <div className="space-y-5">
      {/* ── Greeting ─────────────────────────────────────────────── */}
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Welcome back</p>
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
            {user?.full_name?.split(" ")[0] ?? "Trader"} 👋
          </h1>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {user?.is_demo && <span className="mr-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-400">DEMO</span>}
            {user?.user_code}
          </p>
        </div>
      </header>

      {/* ── Hero portfolio card (Upstox-style) ───────────────────── */}
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary to-primary/80 p-5 text-primary-foreground shadow-lg shadow-primary/20">
        <div className="flex items-start justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider opacity-90">
              <Wallet className="size-3.5" /> Portfolio value
            </div>
            <div className="flex items-baseline gap-3">
              <h2 className="font-tabular text-3xl font-bold md:text-4xl">
                {hideBalance ? "₹ ••••••" : formatINR(portfolio)}
              </h2>
              <button
                type="button"
                onClick={() => setHideBalance((v) => !v)}
                aria-label="Toggle balance visibility"
                className="rounded-full p-1 opacity-80 transition hover:bg-white/15 hover:opacity-100"
              >
                {hideBalance ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <div
              className={cn(
                "mt-1 inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-xs font-semibold",
                todayPnl >= 0 ? "text-buy" : "text-sell"
              )}
              style={{ color: todayPnl >= 0 ? "#7df0a4" : "#ffadb5" }}
            >
              <TrendingUp className={cn("size-3", todayPnl < 0 && "rotate-180")} />
              {hideBalance ? "•••" : `${todayPnl >= 0 ? "+" : ""}${formatINR(todayPnl)}`}
              {!hideBalance && (
                <span className="opacity-80">
                  ({todayPct >= 0 ? "+" : ""}
                  {todayPct.toFixed(2)}%)
                </span>
              )}
              <span className="opacity-70">today</span>
            </div>
          </div>
          <Link
            href="/wallet"
            className="hidden shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold backdrop-blur transition hover:bg-white/25 sm:inline-flex"
          >
            <ArrowDownToLine className="size-3.5" /> Add funds
          </Link>
        </div>

        {/* Inline mini-stats — 2 columns (Available + Used margin).
            Holdings P/L tile removed — every trade on this platform is
            intraday / carry-forward, there's no separate delivery book. */}
        <div className="mt-5 grid grid-cols-2 divide-x divide-white/15 text-center text-xs">
          <MiniStat
            label="Available"
            value={hideBalance ? "•••" : formatINR(wallet.available_balance ?? 0)}
          />
          <MiniStat
            label="Used margin"
            value={hideBalance ? "•••" : formatINR(wallet.used_margin ?? 0)}
          />
        </div>
      </section>

      {/* ── Quick actions ─────────────────────────────────────── */}
      <section
        className={cn(
          "grid gap-2 sm:gap-3",
          binaryEnabled ? "grid-cols-4" : "grid-cols-3"
        )}
      >
        <QuickAction href="/terminal" icon={CandlestickChart} label="Trade" tone="primary" />
        {binaryEnabled && (
          <QuickAction href="/binary" icon={Repeat} label="Binary" />
        )}
        <QuickAction href="/wallet" icon={ArrowDownToLine} label="Deposit" />
        <QuickAction href="/reports/pnl" icon={TrendingUp} label="Reports" />
      </section>

      {/* ── Stat tiles row — 3 tiles (Holdings value removed) ────── */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="Open positions" value={String(summary?.open_positions ?? 0)} hint="live MTM" />
        <StatTile label="Pending orders" value={String(summary?.pending_orders ?? 0)} hint="awaiting fill" />
        <StatTile
          label="Today's P&L"
          value={hideBalance ? "•••" : formatINR(todayPnl)}
          tone={pnlColor(todayPnl)}
        />
      </section>

      {/* ── Open positions + Recent orders ──────────────────────── */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <PanelCard
          className="lg:col-span-2"
          title="Open positions"
          subtitle="Live mark-to-market"
          action={{ label: "View all", href: "/positions" }}
        >
          {positions?.length ? (
            <ul className="divide-y divide-border">
              {positions.slice(0, 6).map((p: any) => {
                // Recompute P&L exactly like the Positions page: side-aware
                // close price (live BID/ASK) − entry, FX disabled, gross.
                const rawSide = (p.action ?? p.side ?? p.opened_side ?? "").toString().toUpperCase();
                const signedQty = Number(p.quantity ?? 0);
                const side: "BUY" | "SELL" =
                  rawSide === "BUY" || rawSide === "SELL"
                    ? (rawSide as "BUY" | "SELL")
                    : signedQty >= 0
                      ? "BUY"
                      : "SELL";
                const qty = Math.abs(signedQty);
                const entry = Number(p.avg_price ?? 0);
                const ltp = liveLtpFor(p, side) || Number(p.ltp ?? 0);
                const dir = side === "SELL" ? -1 : 1;
                const pnl =
                  ltp > 0 && entry > 0 && qty !== 0 ? dir * (ltp - entry) * qty : 0;
                const isUp = pnl >= 0;
                return (
                  <li key={p.id}>
                    <Link
                      href="/positions"
                      className="flex items-center justify-between gap-3 py-2.5 transition-colors hover:bg-muted/30"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "grid size-9 place-items-center rounded-full text-xs font-bold uppercase",
                            isUp ? "bg-buy/15 text-buy" : "bg-sell/15 text-sell"
                          )}
                        >
                          {p.symbol?.slice(0, 2)}
                        </div>
                        <div>
                          <div className="text-sm font-medium">{p.symbol}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {p.product_type} · {p.quantity} @ {formatPrice(p.avg_price, p.segment_type, p.exchange)}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={cn("font-tabular text-sm font-semibold", pnlColor(pnl))}>
                          {formatINR(pnl)}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          LTP {formatPrice(ltp, p.segment_type, p.exchange)}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState message="No open positions" cta={{ label: "Open a trade", href: "/terminal" }} />
          )}
        </PanelCard>

        <PanelCard
          title="Recent orders"
          subtitle="Last 6 placed"
          action={{ label: "All", href: "/positions" }}
        >
          {orders?.length ? (
            <ul className="divide-y divide-border">
              {orders.slice(0, 6).map((o: any) => {
                const isBuy = String(o.action).toUpperCase() === "BUY";
                return (
                  <li key={o.id}>
                    <Link
                      href="/positions"
                      className="flex items-center justify-between py-2 text-xs transition-colors hover:bg-muted/30"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex w-12 justify-center rounded px-1.5 py-0.5 text-[10px] font-semibold",
                            isBuy ? "bg-buy/15 text-buy" : "bg-sell/15 text-sell"
                          )}
                        >
                          {isBuy ? "BUY" : "SELL"}
                        </span>
                        <span className="font-medium">{o.symbol}</span>
                        <span className="text-muted-foreground">×{o.quantity}</span>
                      </div>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          o.status === "EXECUTED"
                            ? "bg-buy/15 text-buy"
                            : o.status === "REJECTED" || o.status === "CANCELLED"
                              ? "bg-muted text-muted-foreground"
                              : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        )}
                      >
                        {o.status}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState message="No orders yet" cta={{ label: "Place an order", href: "/terminal" }} />
          )}
        </PanelCard>
      </section>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2">
      <div className="text-[10px] uppercase tracking-wider opacity-75">{label}</div>
      <div className="mt-0.5 font-tabular text-sm font-semibold">{value}</div>
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  label,
  tone,
}: {
  href: string;
  icon: any;
  label: string;
  tone?: "primary";
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-xs font-medium transition-all",
        tone === "primary"
          ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
          : "border-border bg-card hover:border-primary/30 hover:bg-primary/5"
      )}
    >
      <div
        className={cn(
          "grid size-9 place-items-center rounded-full",
          tone === "primary" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
        )}
      >
        <Icon className="size-4" />
      </div>
      {label}
    </Link>
  );
}

function StatTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-1 font-tabular text-lg font-semibold", tone)}>{value}</div>
      {hint && <div className="mt-0.5 text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function PanelCard({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: { label: string; href: string };
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-4", className)}>
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
        {action && (
          <Link
            href={action.href}
            className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
          >
            {action.label} <ChevronRight className="size-3" />
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ message, cta }: { message: string; cta?: { label: string; href: string } }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <div className="text-sm text-muted-foreground">{message}</div>
      {cta && (
        <Button asChild variant="outline" size="sm">
          <Link href={cta.href}>
            <ArrowUpRight className="size-3.5" /> {cta.label}
          </Link>
        </Button>
      )}
    </div>
  );
}
