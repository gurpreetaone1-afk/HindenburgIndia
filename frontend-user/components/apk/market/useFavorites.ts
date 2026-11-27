"use client";

// Favourite-star logic copied from the web's MobileInstrumentsBar (same
// ["watchlists"] / ["watchlist-quotes"] keys UserWsBridge invalidates, same
// optimistic flip + rollback, same item-id based remove).

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MarketwatchAPI } from "@/lib/api";

export function useFavorites() {
  const qc = useQueryClient();
  const { data: watchlists, isLoading, isError } = useQuery({
    queryKey: ["watchlists"],
    queryFn: () => MarketwatchAPI.list(),
    staleTime: 30_000,
  });
  const activeWl = watchlists?.[0];
  const [pendingFav, setPendingFav] = useState<Map<string, boolean>>(new Map());

  const favItemByToken = useMemo(() => {
    const map = new Map<string, string>();
    for (const it of activeWl?.items ?? []) {
      if (it?.instrument_token && it?.id) map.set(String(it.instrument_token), String(it.id));
    }
    return map;
  }, [activeWl]);

  // Drop optimistic entries once the server list agrees.
  useEffect(() => {
    if (pendingFav.size === 0) return;
    setPendingFav((prev) => {
      const next = new Map(prev);
      for (const [tok, want] of prev) if (favItemByToken.has(tok) === want) next.delete(tok);
      return next.size === prev.size ? prev : next;
    });
  }, [favItemByToken, pendingFav]);

  const isFav = useCallback(
    (token: string) => {
      const tok = String(token);
      return pendingFav.has(tok) ? pendingFav.get(tok)! : favItemByToken.has(tok);
    },
    [pendingFav, favItemByToken],
  );

  const toggle = useCallback(
    async (token: string) => {
      const tok = String(token);
      if (!activeWl?.id) {
        toast.error("No watchlist available");
        return;
      }
      const currentlyFav = isFav(tok);
      setPendingFav((prev) => new Map(prev).set(tok, !currentlyFav));
      try {
        if (currentlyFav) {
          const itemId = favItemByToken.get(tok);
          if (!itemId) throw new Error("Item not found in watchlist");
          await MarketwatchAPI.removeItem(activeWl.id, itemId);
        } else {
          await MarketwatchAPI.addItem(activeWl.id, tok);
        }
        qc.invalidateQueries({ queryKey: ["watchlists"] });
        qc.invalidateQueries({ queryKey: ["watchlist-quotes"] });
      } catch (e: any) {
        setPendingFav((prev) => {
          const next = new Map(prev);
          next.delete(tok);
          return next;
        });
        toast.error(e?.message || (currentlyFav ? "Failed to remove" : "Failed to add"));
      }
    },
    [activeWl?.id, isFav, favItemByToken, qc],
  );

  return { activeWl, isLoading, isError, isFav, toggle };
}
