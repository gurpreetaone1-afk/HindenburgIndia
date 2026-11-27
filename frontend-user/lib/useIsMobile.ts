"use client";

import { useSyncExternalStore } from "react";

// Phones (< 768 px, Tailwind `md`) get the APK-style mobile UI; tablets and
// desktop keep the web layout. Only ONE tree mounts, so a phone never runs
// the desktop page's queries too. Server snapshot is `false`; every caller
// renders behind the auth-hydration gate, i.e. client-side only.
const QUERY = "(max-width: 767px)";

function subscribe(cb: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
