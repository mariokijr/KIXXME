---
name: KixxMe client-side Gold/entitlement gates
description: Why frontend must not pre-block Gold features on the raw plan from /profiles/me, and how the Descubrir interaction model is wired.
---

# Client-side Gold gates must round-trip the server

`GET /profiles/me` returns the **raw** Supabase `profiles.plan` column, NOT the
`getPlan()`-resolved entitlement. So the client plan does **not** reflect the
`GOLD_TEST_EMAILS` override (a read-only promotion applied only at the server
`getPlan` layer).

**Rule:** Do NOT pre-gate a *functional* Gold action on `myProfile.plan === "gold"`
and short-circuit before the request. That wrongly blocks `GOLD_TEST_EMAILS`
testers (and any future server-side override) because the request never reaches
the server that would have allowed it. Instead **attempt the action and branch on
the server response** — show the premium upsell modal on `402`/`403` (e.g. video
call → live route 402; conversation create → `403 {code:"premium_required_no_match"}`),
otherwise a generic error toast.

**Why:** raw `profiles.plan` is intentionally display-only (badges, premium page
show the *real* tier per the billing design); functional gates are enforced
server-side via `getPlan`. A client pre-gate silently diverges from the server
truth. Cost us a code-review cycle on the chat video button.

**The "round-trip the server" rule covers BOTH parties for video calls.** You
may use the **other** party's DTO `plan` (raw display plan from `getOtherProfile`)
as a **display-only** hint — e.g. the chat video button shows a lock badge when
`other_user.plan !== "gold"`. But that lock must **NOT** short-circuit the
request: clicking still calls `createLiveCall` and branches on the server's 402,
because `/live/calls` verifies BOTH caller and recipient via `getPlan` (honors
`GOLD_TEST_EMAILS`). The server returns two distinct 402s — caller-not-Gold
("KixxMe Live es exclusivo para miembros Gold") vs recipient-not-Gold ("El otro
usuario no tiene KixxMe Gold"); surface `err.data.error` in the upsell.
**Why:** `GOLD_TEST_EMAILS` is SET in this dev environment (the owner tests Gold
on real phones), and the override never writes the display plan — so a hard
client block on the recipient's raw plan makes a test-Gold recipient
*uncallable* even though the server would allow the call. A display-only lock
that still attempts is accurate in prod (when the allowlist is empty) AND keeps
test-Gold↔test-Gold video calls working.

**Plan tiers for the two chat gates (product rule, the owner's decision):**
- **Cold-start chat (no mutual match):** allowed for **Plus AND Gold**; FREE
  still needs a match. Backend gate in `conversations.ts` reads `getPlan` and
  blocks only `plan === "free"` → `403 {code:"premium_required_no_match"}`. The
  premium page already advertises "Chats ilimitados" for Plus, so this aligns
  backend with marketing.
- **Video calls (KixxMe Live):** Gold **to** Gold only — server 402s if either
  caller or recipient isn't Gold; Plus can never call.

**How to apply:** when adding any premium-only action, let the server decide.
Reuse the shared `useStartConversation` (conversation create → upsell on the
coded 403) and the `GoldUpsellProvider`/`useGoldUpsell().showGold()` modal rather
than inventing a new toast/pre-check.

# Descubrir / likes interaction model (intent, not code)

- Three Discover pills: **Tarjetas** (swipe deck), **Cuadrícula** (= MY
  likes/superlikes), **En línea** (= online users). **Empareja** (mutual matches)
  is a *standalone* page at `/matches`, reached via the heart icon — not a pill.
- Dislike ("pass") persists in `profile_passes`; the swipe deck candidate query
  uses `staleTime: Infinity`, so after each decision invalidate
  `getListProfilesQueryKey({sort:"recent"})` with `refetchType:"none"` — keeps the
  in-session deck order stable but forces the next mount to refetch (excluding the
  now liked/superliked/passed profile). Without this, navigating away and back
  resurfaces already-decided profiles from cache.
- `recordLike` is idempotent: a repeat of the same edge returns
  `already_processed` (no charge); the client must early-return in `onSuccess`
  before celebrating/toasting. A like→superlike upgrade is still a real change.
- A mutual like auto-creates the conversation server-side; conversation CREATE is
  the only gated step (existing thread always opens for both participants).
