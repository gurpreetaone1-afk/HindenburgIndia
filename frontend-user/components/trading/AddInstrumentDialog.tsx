"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X, LayoutGrid } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { InstrumentAPI } from "@/lib/api";
import { cn } from "@/lib/utils";
import { OptionChainPicker } from "./OptionChainPicker";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the picked instrument's token + symbol. Parent inserts
   *  it into its chart-tabs list. */
  onPick: (token: string, symbol: string) => void;
}

/**
 * General-purpose instrument picker for the chart-tabs "+" button.
 *
 * Search lets the user add ANY instrument (equity / future / option /
 * forex / crypto). The "Browse option chain" entry hands off to the
 * dedicated `OptionChainPicker` for users who specifically want to
 * pull an option leg in by strike + expiry rather than type the full
 * symbol.
 *
 * Previously the "+" button opened `OptionChainPicker` directly,
 * which made it impossible to add a non-option instrument without
 * going through the watchlist sidebar — the user-reported "+ sing me
 * option chain open hota hai" symptom.
 */
export function AddInstrumentDialog({ open, onOpenChange, onPick }: Props) {
  const [query, setQuery] = useState("");
  const [chainOpen, setChainOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Autofocus the search field whenever the dialog opens, and reset
  // the query when it closes so the next open starts clean.
  useEffect(() => {
    if (open) {
      setQuery("");
      // Defer focus one tick so the dialog has actually mounted.
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  const trimmed = query.trim();
  const { data: results, isFetching } = useQuery({
    queryKey: ["instrument-search", "chart-tab-add", trimmed],
    queryFn: () => InstrumentAPI.search(trimmed, undefined, undefined, 20),
    enabled: open && trimmed.length >= 2,
    staleTime: 30_000,
  });

  function pick(token: string, symbol: string) {
    onPick(token, symbol);
    onOpenChange(false);
  }

  return (
    <>
      <Dialog open={open && !chainOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg p-0">
          <DialogHeader className="border-b border-border px-4 pb-2 pt-3">
            <DialogTitle className="text-sm">Add instrument</DialogTitle>
          </DialogHeader>
          <div className="px-4 py-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="RELIANCE, NIFTY, GOLD26JUNFUT, BTCUSD…"
                className="pl-9"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Clear"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            {/* Quick option-chain link — keeps the previous + behaviour
                one click away for users who specifically want to pick
                an option leg by strike / expiry. */}
            <button
              type="button"
              onClick={() => setChainOpen(true)}
              className="mt-2 flex w-full items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
            >
              <span className="inline-flex items-center gap-2">
                <LayoutGrid className="size-3.5 text-primary" />
                Browse option chain
              </span>
              <span className="text-[10px] uppercase tracking-wider">
                Strikes · expiries
              </span>
            </button>

            {/* Results — only shown once the query has at least 2 chars,
                same threshold the watchlist sidebar uses. */}
            <div className="mt-3 max-h-[55vh] overflow-y-auto scrollbar-thin">
              {trimmed.length < 2 ? (
                <div className="px-1 py-6 text-center text-[11px] text-muted-foreground">
                  Type at least 2 characters to search.
                </div>
              ) : isFetching && !results ? (
                <div className="px-1 py-6 text-center text-[11px] text-muted-foreground">
                  Searching…
                </div>
              ) : (results?.length ?? 0) === 0 ? (
                <div className="px-1 py-6 text-center text-[11px] text-muted-foreground">
                  No instruments matched "{trimmed}".
                </div>
              ) : (
                <ul className="divide-y divide-border/60 rounded-md border border-border">
                  {results?.map((it: any) => (
                    <li key={it.token}>
                      <button
                        type="button"
                        onClick={() => pick(String(it.token), String(it.symbol ?? it.tradingsymbol ?? "—"))}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/30",
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-foreground">
                            {it.symbol ?? it.tradingsymbol ?? "—"}
                          </div>
                          {it.name && it.name !== it.symbol && (
                            <div className="truncate text-[10px] text-muted-foreground">
                              {it.name}
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5 text-[10px] text-muted-foreground">
                          {it.exchange && (
                            <span className="rounded bg-muted/40 px-1.5 py-0.5 uppercase">
                              {it.exchange}
                            </span>
                          )}
                          {it.segment && it.segment !== it.exchange && (
                            <span className="rounded bg-muted/30 px-1.5 py-0.5">
                              {String(it.segment).split("_").pop()}
                            </span>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Option-chain handoff. When the user closes it without
          picking, we re-open the search dialog so they don't lose
          their way back. */}
      <OptionChainPicker
        open={chainOpen}
        onOpenChange={(o) => {
          setChainOpen(o);
        }}
        onPick={(token, symbol) => {
          pick(token, symbol);
          setChainOpen(false);
        }}
      />
    </>
  );
}
