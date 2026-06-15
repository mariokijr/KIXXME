---
name: KixxMe OAuth social login (Google/Apple)
description: How Google/Apple sign-in is wired with zero backend changes, and why "OAuth not working" is almost always Supabase dashboard config rather than code.
---

# OAuth social login (Google / Apple)

Social login was added with **minimal backend changes**. `SOCIAL_AUTH_ENABLED` (in `artifacts/kixxme/src/lib/auth.tsx`) is the master feature flag — set to `true` to show buttons. The server-side change: `isEmailVerified()` in `email-verification.ts` must skip the OTP gate for OAuth users (`app_metadata.provider !== "email"`). Before adding new auth surfaces, preserve these invariants.

## Why no backend changes were needed
- `requireAuth` trusts `supabase.auth.getUser(token)` — any valid Supabase session (password OR OAuth) authenticates the same way.
- `GET /profiles/me` JIT-upserts a missing profile row (id only, `username` stays null).
- Onboarding keys off a **missing `username`** (`profile.tsx` `!profile.username`), and discover/stats filter `username IS NOT NULL`, so a half-onboarded OAuth account never leaks into Descubrir.

**How to apply:** an OAuth user just needs the client to obtain a Supabase session and persist it like a normal login, then route to `/profile` (no username → forced onboarding). Do not add server endpoints or DB triggers for social login.

## Client flow (the safe shape)
- Supabase client uses `flowType:"implicit"` with `detectSessionInUrl:false` — `/auth/callback` parses the URL **hash** manually.
- `loginWithProvider` → `signInWithOAuth({ redirectTo: origin + BASE + "/auth/callback" })` (BASE = `import.meta.env.BASE_URL`, trailing slash stripped).
- `/auth/callback` strips the hash via `history.replaceState` **before** any async (no token left in history), then `adoptOAuthSession` validates the token with `supabase.auth.getUser(access_token)` and persists.
- `getUser(token)` with an explicit token is **read-only** — it does NOT attach a session to the shared anon/data client (same safe pattern as the session-pollution note; only signUp/signInWithPassword/setSession/refreshSession pollute).

## The operational gotcha (record this)
OAuth **silently fails until the Supabase dashboard is configured**: the provider must be enabled AND the exact `origin + BASE + /auth/callback` URL added under Auth → URL Configuration → Redirect URLs.
**Why:** a non-allowlisted `redirectTo` is silently ignored and tokens land on the Site URL (a page with no hash parser) → login appears to hang. Allowlist **both** the dev origin and the production domain. Apple additionally requires an Apple Developer account ($99/yr). So "social login is broken" is almost always dashboard config, not code.

## Display vs gating
The Apple button is gated behind `isIOS()` (Apple sign-in is only offered on iOS). A disabled/unconfigured provider surfaces the error **on `/auth/callback`** (GoTrue redirects back with an `error` param), not via the pre-redirect toast — keep the callback error panel copy generic ("proveedor no disponible").
