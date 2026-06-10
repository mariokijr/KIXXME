---
name: PWA & mobile packaging
description: How KixxMe is made an installable PWA and wrapped for Google Play / App Store; the non-obvious service-worker, deploy-rewrite, and store-signing constraints.
---

# PWA & mobile packaging (KixxMe web at base "/")

The web app ships an installable PWA; native store apps wrap that same PWA (TWA for Play, PWABuilder/Capacitor for App Store). Assets live in `artifacts/kixxme/public/` (`manifest.json`, `sw.js`, `icons/`, `.well-known/assetlinks.json`); packaging configs in `mobile/`.

## Service worker — hard constraints
**Rule:** the SW must NEVER intercept `/api/*` (same-origin Express API), cross-origin requests (Supabase REST/realtime/storage, Stripe), or `/.well-known/*`. The fetch handler bails (returns without `respondWith`) on: non-GET, cross-origin, `/api`, `/.well-known`. Navigations are network-first (so deploys propagate immediately) with offline fallback to the precached shell; other static assets are stale-while-revalidate limited to status-200 `type:"basic"`.
**Why:** caching authenticated API or cross-origin responses would serve stale auth/data and could break realtime. Network-first navigation + content-hashed Vite assets make `skipWaiting()`+`clients.claim()` safe (no realistic staleness window).
**How to apply:** registration is PROD-only (`import.meta.env.PROD` in `src/pwa.ts`); in dev it unregisters stale workers so Vite HMR is unaffected. Bump the `VERSION` constant in `sw.js` whenever `sw.js` itself changes, or the activate-time old-cache cleanup never runs.

## Deploy rewrite vs static files
**Rule:** `.well-known/assetlinks.json` (and `manifest.json`, `sw.js`, `icons/`) are served as real files even though the web artifact has a SPA rewrite `/* -> /index.html`.
**Why:** Replit static deployments serve existing files in preference to rewrite rules (file-first), so the catch-all only handles non-existent SPA routes. Vite 7 copies dotfile dirs (`.well-known`) from `public/` into `dist/public/` — confirmed in the build output.
**How to apply:** after publishing, smoke-test on the live domain: `curl https://<domain>/.well-known/assetlinks.json` must return JSON, not index.html.

## Store signing
**Rule:** the SHA-256 in `assetlinks.json` must be the **Play App Signing** key fingerprint (from Play Console), NOT the local keystore — whenever Play App Signing is enabled (the default). It ships as a placeholder; replace + republish before the Play submission or the TWA opens with Chrome's URL bar visible.
**Why:** Play re-signs the upload with its own managed key; the device verifies against that key's fingerprint.
