/* Hindenburg India PWA service worker — minimal-but-installable.
 *
 * The browser only fires `beforeinstallprompt` (and exposes the "Install
 * app" affordance) when a manifest + a service worker that handles
 * `fetch` are both registered for the page. We don't need offline-first
 * for a live-trading app — stale prices are worse than no prices — so
 * this SW does network-first, falls back to nothing if offline.
 *
 * Skipping cache for /api/* and the /ws/* websocket upgrade requests
 * keeps every order placement, quote and tick going straight to the
 * backend without intermediate staleness.
 */
const VERSION = "stock4x-pwa-v3";
const NOTIF_ICON = "/icons/icon-192.png";

self.addEventListener("install", (event) => {
  // Take over immediately on first install so the install prompt becomes
  // available without a reload.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Clean up any older caches if we ever start using them. Currently a
  // no-op, but keeping the boilerplate so adding a precache later is one
  // line away.
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Only handle GET — leave POST/PUT/DELETE strictly to the network.
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Skip API + WS — trading data must never come from a cache.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/ws/") ||
    url.protocol === "ws:" ||
    url.protocol === "wss:"
  ) {
    return;
  }
  // Plain network — no caching for now. The presence of this handler
  // alone is what unlocks the install prompt; we'll add a runtime
  // cache for static chunks in a follow-up if first-paint feels slow.
  event.respondWith(fetch(req).catch(() => Response.error()));
});

/* ── Notifications ─────────────────────────────────────────────────
 * Two ingress paths, both end at registration.showNotification:
 *   1. `message` — the page posts {type:"notify"} when the PWA is in
 *      foreground / minimised (Android only accepts SW-fired notifs).
 *   2. `push`    — a Web Push (VAPID) wakes the SW even when the PWA is
 *      force-stopped / the screen is locked.
 * Both carry a `tag` so the same event arriving on both surfaces (WS +
 * Web Push) collapses into a single tray row instead of double-pinging.
 */
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "notify") return;
  const title = String(data.title || "Hindenburg India");
  const body = String(data.body || "");
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: NOTIF_ICON,
      badge: NOTIF_ICON,
      tag: data.tag || undefined,
      renotify: true,
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("push", (event) => {
  let payload = { title: "Hindenburg India", body: "", url: "/", tag: undefined };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    try {
      const text = event.data && event.data.text();
      if (text) payload.body = String(text);
    } catch {}
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: NOTIF_ICON,
      badge: NOTIF_ICON,
      tag: payload.tag,
      renotify: true,
      data: { url: payload.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((wins) => {
        for (const w of wins) {
          if (w.url.includes(url) && "focus" in w) return w.focus();
        }
        if (wins.length > 0 && "focus" in wins[0]) {
          const w = wins[0];
          if ("navigate" in w) w.navigate(url);
          return w.focus();
        }
        if (self.clients.openWindow) return self.clients.openWindow(url);
      }),
  );
});
