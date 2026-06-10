// Registers the service worker that makes KixxMe an installable PWA.
// Only active in production builds; in dev we proactively unregister any
// stale worker so it can't interfere with Vite HMR.
export function registerServiceWorker(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  const base = import.meta.env.BASE_URL || "/";

  if (import.meta.env.PROD) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register(`${base}sw.js`, { scope: base })
        .catch(() => {
          /* registration is best-effort; app works without it */
        });
    });
    return;
  }

  navigator.serviceWorker
    .getRegistrations?.()
    .then((regs) => regs.forEach((r) => r.unregister()))
    .catch(() => {});
}
