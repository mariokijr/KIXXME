---
name: KixxMe support tickets (Gold priority chat)
description: Design rules for the threaded admin↔user support-ticket chat — gate placement, authz, status machine, unread, atomicity.
---

# Support tickets — Chat de Soporte Premium Gold

Threaded admin↔user support chat. TWO repo-owned Drizzle tables in **Replit Postgres** (`support_tickets` + `support_ticket_messages`, real same-DB FK with ON DELETE CASCADE) — NOT Supabase, NOT the flat `support_reports` table (that one stays for the category report flow). Polling only (Replit PG has no realtime): ~5s open thread, 15–30s lists.

## Durable rules

- **Gold gate covers user-side open AND sending into a *premium* ticket; lapsed Gold keeps read-only history.** A ticket is "premium" when `isPremiumTicket = kind==='official' || openedByRole==='user'` (i.e. the user opened it, or it's the official Gold thread). For premium tickets, BOTH `POST /support/tickets` (open) and `POST /support/tickets/:id/messages` (reply) require `hasGold` → **402 `{code:"gold_required"}`** (not 403) for a non-admin owner. `requireAdmin` bypasses the gate entirely; admin-initiated outreach (`kind='support'`, `openedByRole==='admin'`) is NOT premium, so a FREE user can still answer it.
  - **Why:** sending priority support is a paid Gold feature — a lapsed-Gold user must keep reading their thread but cannot send new messages; yet admins must still be able to start a ticket with ANY user (incl. free) and that user must be able to reply.
  - **`canReply` is the single source of truth, computed server-side in `getTicketDetail`** as `isAdmin || !isPremiumTicket || hasGold(viewerId)` and surfaced as an **optional** DTO field (`undefined` = allowed, backward-compatible). Frontend `support.tsx TicketThread` locks the composer into a "Hazte Gold" upsell only on explicit `canReply === false`; the messages route is the backstop (402 from immutable gate fields, no race with postMessage). Frontend onError detects 402/`gold_required` (real `ApiError` shape `.status`/`.data`) → Gold upsell toast + invalidate. `getTicketGate(id)` is the gate read helper. (The old `getExistingOfficialTicket` helper was removed when the official card became active-Gold-only — see "Support console" below.)

- **One shared message endpoint; senderRole is derived server-side, never trusted from the client.** owner→`user` (even if the owner happens to be an admin), admin-and-not-owner→`admin`, else 404. No dedicated admin message endpoint.

- **Every read/write is owner-or-admin or 404.** A single `authorizeTicket` helper guards GET detail, POST messages, and is the model for status. Non-owners get 404 (never reveal ticket existence). UUID format is pre-checked → 404.

- **ALL status transitions are centralized in `lib/support-tickets.ts`; routes NEVER set status.** Message-insert + ticket bookkeeping (status / lastMessageAt / lastSenderRole / sender's lastReadAt / closed-clear) happen in ONE `db.transaction`. State machine: user open→pending; user reply→pending (urgent sticky; closed→pending reopen); admin reply→answered (clears urgent, reopens closed, nulls closedBy/closedAt); admin-opened→answered; admin set-status forces any.

- **No `/read` endpoint — GET detail marks read as a side-effect** (mirrors GET conversations/:id/messages): it UPDATEs the caller-role's `lastReadAt`, then re-reads the row before mapping so the badge clears in the same response. `computeUnread` compares `lastMessageAt > lastReadAt` AND `lastSenderRole != my role`, and `postMessage` sets the sender's own `lastReadAt = now`, so you never see your own message as unread.
  - **Gotcha:** detail issues a write on every poll (harmless write-amplification at current scale; throttle by skipping the UPDATE when lastReadAt ≥ lastMessageAt if it ever matters).

- **`adminLastReadAt` is a single shared admin read-pointer** (fine for a one-admin team; revisit if multiple admins need independent unread).

- **No email leak in `GET /admin/tickets`** — list hydrates only username/avatar (batched Supabase `.in()` + one `selectDistinctOn` for previews, no N+1); the user's email appears only in detail. Reply-nudge email excludes the message body and HTML-escapes the subject; subject control-chars stripped on both create paths (header-injection safe).

- **GDPR:** `deleteAccount` (`lib/account.ts`) calls `purgeUserTickets` before the irreversible Supabase auth delete; messages cascade via the FK.

- **Notifications are derived, not stored** (same pattern as likes/admin-reports): `GET /notifications/summary` returns user `support_unread` + an admin block `open_tickets` (pending+urgent) / `latest_ticket_at`; `GET /admin/summary` returns `openTickets`.

## Official "👑 Soporte KixxMe" auto-conversation (Gold)

A system-owned welcome ticket auto-created for Gold members; pinned atop Messages, repliable from the admin panel like any ticket. Reuses the same two tables via a `kind` discriminator ('support'|'official').

- **Idempotency = `kind` column + partial unique index `(userId) WHERE kind='official'`.** `ensureOfficialTicket(userId)` inserts the ticket row AND the Spanish welcome message in ONE `db.transaction`; the race loser's `onConflictDoNothing` returns no id, so it re-reads the committed row (which already carries the message, since both live in the winner's tx). Never patches lastReadAt — it's side-effect-free so the chats-list poll doesn't self-clear the badge.
  - **Why:** the welcome message must exist exactly once even under concurrent webhook + GET races.

- **Two trigger points, both needed.** (1) Fire-and-forget from the Stripe `checkout.session.completed` webhook on `tier==='gold'` (caught, never turns a webhook into a 500/retry). (2) Lazy ensure inside `GET /support/official`, gated on `hasGold` (entitlement, NOT `profiles.plan`) so it also covers `GOLD_TEST_EMAILS` users (plan stays 'free') and anyone who never hit the webhook. Non-Gold → `{ticket:null}`.

- **Unread folds in separately to avoid double-count.** New official ticket sets `userLastReadAt=null` + `adminLastReadAt=now` → user sees unread, admin doesn't. `countOfficialUnread` (0/1) is surfaced as `official_unread` and folded into the frontend `totalUnread`. The existing `support_unread` (counts ALL tickets, incl. official) is computed but **unused in the kixxme frontend** — do not also sum it or you double-count.

- **Frontend pin + deep-link.** `chats.tsx` renders a gold `OfficialCard` above conversations via `useGetOfficialSupportTicket`; always visible while Gold even with zero conversations (`hasContent = convos>0 || !!official`). Card → `/support?ticket=<id>`; `support.tsx` seeds `activeTicketId` from the `?ticket=` param (wouter `useSearch`), and `TicketThread` mount marks read + invalidates notifications-summary so the badge clears.

- **No admin-side changes needed:** `listAdmin` has no `kind` filter, so official tickets appear in the admin queue and the shared `postMessage`/status machine handle replies unchanged.

## Support console (operator inbox for the system account)

The system support account (`supportkixxme@gmail.com`) turns its **Mensajes** tab into a console over ALL users, reusing the support-ticket transport. Frontend: `chats.tsx` branches on `Profile.is_system` → `components/support-inbox.tsx` (directory) and `pages/support-inbox-thread.tsx` (per-user thread at `/support-inbox/:userId`).

- **Operator ≠ admin — never widen `requireAdmin`.** `isOperatorEmail = isAdminEmail || isSystemEmail`; `requireOperator` guards ONLY GET/POST `/admin/tickets` + the 3 `/admin/support-users*` routes, and `routes/support.ts` ticket detail/messages/attachments use `isOperatorEmail`. Everything else (moderation, verification-selfie, report triage, `/admin/users`) stays `requireAdmin`.
  - **Why:** the support account is **default-on** (hardcoded email allowlist, no per-account opt-in), so granting it ban/remove/identity-selfie powers would be a standing privilege-escalation surface. It only needs to run support, so it only gets ticket scope.
  - The thread-page UX guard is `is_system || moderation.isAdmin` (UX-only; server `requireOperator` is the real boundary). Block only AFTER moderation resolves so a real admin isn't flashed the deny screen.

- **Official "Soporte KixxMe" card is tied to ACTIVE Gold.** `GET /support/official` returns `{ticket:null}` whenever `!hasGold(viewerId)` (lapse hides the pinned card; the thread + history survive and re-appear on re-grant). There is no longer a lapsed-Gold read-only official card.

- **Gold-aware cold start (`startThreadForUser`).** Operator messaging a **Gold** target lands in the official thread (`ensureOfficialTicket` + `postMessage`) so it shows as the user's pinned chat; a **non-Gold** target gets an admin-initiated outreach ticket (`adminCreateTicket`, subject "Soporte KixxMe", `openedByRole='admin'` → NOT premium → free user can answer). `getCanonicalThreadForUser` resolves official-first else most-recent ticket. **Why:** never strand a Gold user's reply in a separate outreach ticket the official thread would later supersede.

- **Paid-first directory pagination (`GET /admin/support-users`).** Gold + Plus are fully prefetched (cap 1000 each) as a stable priority **prefix**; free users page underneath via Supabase `.range`. `freeOffset = max(0, offset − priorityRows.length)`; `systemIds ∪ self` excluded from both buckets AND the count; `total` is ONE `head:true` count under the same search filter. Search `.or(username/city ilike)` strips `,()` (PostgREST grammar). **Scale caveats (fine today, revisit before growth):** (a) a paid tier exceeding the 1000 cap overflows into the free window — no loss/dup, just ordering oddity; (b) the free `not("id","in",(…))` carries up to ~2000 UUIDs in the GET querystring (~74KB) → URL-length ceiling.

## e2e

Real auth e2e requires tokens: create users via service-role `admin.auth.admin.createUser({email_confirm:true})`, set the gold tester's Supabase `profiles.plan='gold'` directly (only Stripe writes plan in prod), temporarily append a synthetic admin email to the `.replit` `ADMIN_EMAILS` env via `setEnvVars` + restart api-server, then revert. Clean up auth users + ticket rows after. See `kixxme-dual-database.md` for the two-DB split.
