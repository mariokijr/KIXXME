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
the server response** — show the Gold upsell modal on `402`/`403` (e.g. video call
→ live route 402; conversation create → `403 {code:"gold_required_no_match"}`),
otherwise a generic error toast.

**Why:** raw `profiles.plan` is intentionally display-only (badges, premium page
show the *real* tier per the billing design); functional gates are enforced
server-side via `getPlan`. A client pre-gate silently diverges from the server
truth. Cost us a code-review cycle on the chat video button.

**How to apply:** when adding any Gold-only action, let the server decide. Reuse
the shared `useStartConversation` (conversation create → Gold modal on the coded
403) and the `GoldUpsellProvider`/`useGoldUpsell().showGold()` modal rather than
inventing a new toast/pre-check.

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
