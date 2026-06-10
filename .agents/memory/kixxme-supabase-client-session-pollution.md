---
name: Supabase shared-client session pollution → phantom RLS errors
description: Why calling session-establishing auth methods on a shared service-role/data Supabase client silently breaks RLS process-wide, and the rule that prevents it.
---

# Shared Supabase client session pollution

**Rule:** never call a session-establishing auth method — `signUp`, `signInWithPassword`, `refreshSession`, or `setSession` — on a Supabase client that is also used for data (`.from(...)`) access. Those calls attach the returned user session to the client *instance*; from then on supabase-js sends that user's JWT as the `Authorization` header on every subsequent request, so a **service-role client is silently demoted to that user's RLS context**. Route user auth that returns a session through a **dedicated anon client** that is never used for `.from()` data. Admin auth ops (`auth.admin.*`) and `auth.getUser(token)` do NOT set a session and are safe on the data client.

**Why:** the server's `supabase` (service-role) and `supabaseAuth` clients are module-level singletons shared across all requests. A single login/signup poisons the whole process until restart. Symptoms it produced in KixxMe (all from ONE root cause):
- `GET /profiles/me` auto-create upsert threw `new row violates row-level security policy for table "profiles"` (500) at the "Preparando tu perfil" screen.
- Profile SELECTs returned 0 rows under the polluted user's RLS, so users with a real profile looked profile-less → stuck in the onboarding loop.
- The world-map "registered" counter read 0 (same RLS-filtered reads).

**Why it's a nightmare to diagnose:** it is **stateful and intermittent** — it only manifests *after* a real login/signup runs on that process. Direct minted-token API probes (that skip the server's `/auth/login` route) hit a still-clean client and pass, falsely "proving" the code is fine. Proof method that actually reproduces it: on a service-role client, `setSession(userToken)` then `.from('profiles')` — reads collapse to 0 and an upsert throws the exact RLS error.

**How to apply:** keep three clients in `lib/supabase.ts` — `supabase` (service role, data + admin), `supabaseAuth` (anon, `getUser` token verify only), and `supabaseUserAuth` (anon, the ONLY client for signUp/signInWithPassword/refreshSession). Construct all of them with `auth: { persistSession:false, autoRefreshToken:false, detectSessionInUrl:false }` as defense-in-depth. If a "service-role" query ever hits RLS, suspect session pollution before suspecting the RLS policy itself.
