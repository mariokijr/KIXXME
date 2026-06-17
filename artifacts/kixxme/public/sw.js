/* KixxMe service worker — installable PWA shell + safe runtime caching.
 * Never intercepts /api (network-only) or cross-origin requests (e.g. Supabase).
 */
const VERSION = "kixxme-v1";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const SHELL_URLS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/favicon.svg",
  "/icons/icon-192.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = {};
  try { payload = event.data.json(); } catch { return; }
  const { title = "KixxMe", body = "", url = "/", tag = "default", icon } = payload;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: icon ?? "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url },
      tag,
      renotify: true,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            return client.focus().then(() => client.navigate(url));
          }
        }
        return clients.openWindow(url);
      })
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Supabase & other origins
  if (url.pathname.startsWith("/api")) return; // never cache the API
  if (url.pathname.startsWith("/.well-known")) return; // digital asset links etc.

  // Navigations: network-first, fall back to the cached shell when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches
            .open(SHELL_CACHE)
            .then((cache) => cache.put("/index.html", copy))
            .catch(() => {});
          return res;
        })
        .catch(() =>
          caches
            .match(request)
            .then((r) => r || caches.match("/index.html") || caches.match("/")),
        ),
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  const dest = request.destination;
  if (["script", "style", "font", "image", "worker"].includes(dest)) {
    event.respondWith(
      caches.open(ASSET_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          const network = fetch(request)
            .then((res) => {
              if (res && res.status === 200 && res.type === "basic") {
                cache.put(request, res.clone());
              }
              return res;
            })
            .catch(() => cached);
          return cached || network;
        }),
      ),
    );
  }
});
