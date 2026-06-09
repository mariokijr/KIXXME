---
name: KixxMe dual database
description: KixxMe runs two separate Postgres databases — Supabase for app tables, Replit Postgres for repo-owned tables. How to add relational data without breaking either.
---

# KixxMe uses two separate Postgres databases

- **Supabase** (via `SUPABASE_URL` / service-role key, accessed through `supabase-js` / PostgREST): holds the core user-facing tables — `profiles`, `likes`, `conversations`, `messages`, plus auth, storage, and realtime. This schema is **not** DDL-modifiable from this repo. You cannot `CREATE`/`ALTER TABLE` on it from code or psql here; changes must happen out-of-band (Supabase dashboard / Supabase migrations).
- **Replit Postgres** (via `DATABASE_URL`, accessed through `@workspace/db` Drizzle): a separate, writable database owned by this repo. The `blocks` table (user/conversation blocking) lives here.

**Why:** The block feature needed a new table, but the Supabase schema can't be altered from this repo. The writable Replit Postgres + the existing `@workspace/db` Drizzle package (already an api-server dependency; documented stack = "PostgreSQL + Drizzle") was the only place to add DDL-controlled tables.

**How to apply:**
- Adding new relational tables/columns for KixxMe? You cannot extend Supabase tables from here. Either coordinate a Supabase-side migration, or put the new table in the Replit Postgres via a Drizzle schema in `lib/db/src/schema/` + `psql "$DATABASE_URL"`, then run `pnpm run typecheck:libs` to rebuild lib declarations.
- **No cross-DB foreign keys** are possible between Replit-Postgres tables and Supabase tables (e.g. `blocks.blocker_id` cannot FK to Supabase `profiles.id`). Enforce relationships in application code: load the block relation set (`getBlockRelations` in `artifacts/api-server/src/lib/blocks.ts` returns `{iBlocked, blockedMe}`), then filter Supabase result rows in JS rather than via SQL joins.
- Block enforcement is centralized in `artifacts/api-server/src/lib/blocks.ts` and applied at every contact surface (discover/map list, conversation list, create-conversation, send-message, read-messages, image upload, like). Any new surface that exposes another user must call `isBlockedBetween` / filter by the block sets too.
