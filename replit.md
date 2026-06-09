# KixxMe

A Spanish-language gay social/dating app: users build a profile, discover nearby people on a list and map, like and chat in real time, and block users they don't want to interact with.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- Web app (React + Vite): `artifacts/kixxme/` — pages in `src/pages/` (discover, map, chat, public-profile, profile, auth).
- API server (Express): `artifacts/api-server/` — routes in `src/routes/` (`profiles.ts`, `conversations.ts`), helpers in `src/lib/` (`supabase.ts`, `auth.ts`, `blocks.ts`, `geo.ts`).
- API contract (source of truth): `lib/api-spec/openapi.yaml` → Orval-generated hooks + Zod via `pnpm --filter @workspace/api-spec run codegen`.
- Repo-owned DB schema (Drizzle): `lib/db/src/schema/` (e.g. `blocks.ts`), exported from `lib/db/src/index.ts`.

## Architecture decisions

- **Two databases.** Core app tables (`profiles`, `likes`, `conversations`, `messages`), auth, storage, and realtime live in **Supabase** (PostgREST via `supabase-js`); this schema is NOT DDL-modifiable from this repo. Repo-owned tables (e.g. `blocks`) live in the separate **Replit Postgres** (`DATABASE_URL`) via `@workspace/db` Drizzle. See `.agents/memory/kixxme-dual-database.md`.
- **No cross-DB foreign keys.** Relationships between Replit-Postgres tables and Supabase tables are enforced in application code, not SQL joins (e.g. block filtering loads block sets, then filters Supabase rows in JS).
- **Block enforcement is centralized** in `artifacts/api-server/src/lib/blocks.ts` and applied at every surface that exposes another user (discover/map, favorites, conversation list/create, send/read messages, image upload, like).
- **Contract-first.** Endpoints are defined in OpenAPI, then server validates with generated Zod and the client uses generated React Query hooks.

## Product

- Email/password auth (Supabase) with profile creation (bio, photos, location).
- Discover nearby users as a list and on a map, sorted/filtered by distance and online status.
- Like profiles and view a favorites list.
- One-to-one realtime chat with text and image messages, read receipts, and unread counts.
- Block / unblock users: blocking hides each user from the other across discovery, favorites, likes, and chat, and prevents new contact in either direction.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- The API server has **no hot reload** — restart the `artifacts/api-server: API Server` workflow after backend edits. The web app uses Vite HMR.
- Two separate databases (see Architecture decisions). You cannot `CREATE`/`ALTER TABLE` on Supabase from this repo; new repo-owned tables go in the Replit Postgres (`DATABASE_URL`) via Drizzle.
- After editing `lib/api-spec/openapi.yaml`, run `pnpm --filter @workspace/api-spec run codegen`. After editing a `lib/*` package, run `pnpm run typecheck:libs` before leaf typechecks.
- Chat image uploads are base64 in the request body; very large images can hit the Express body size limit (`PayloadTooLargeError`).

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
