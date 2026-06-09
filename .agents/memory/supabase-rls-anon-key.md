---
name: Supabase RLS + anon key in API server
description: Using the anon Supabase client to query RLS-protected tables returns zero rows; must pass user JWT.
---

## Rule
When the API server queries tables that have Row Level Security enabled (the default for tables created with the `on_auth_user_created` trigger pattern), use `supabaseForUser(token)` — not the bare `supabase` anon client — so the user's JWT is forwarded and RLS policies can resolve `auth.uid()` correctly.

**Why:** The anon key has no user identity, so `auth.uid()` is null inside RLS policies. Any policy like `auth.uid() = id` blocks all rows. The query succeeds (no SQL error) but returns zero results, which looks like a "profile not found" 404 even though the profile exists.

**How to apply:** Every route that reads or writes a user-owned table should use `supabaseForUser(auth.token)` instead of the module-level `supabase`. The only exception is routes that intentionally bypass RLS (e.g. public read of profiles with an explicit `select` policy for `anon`).
