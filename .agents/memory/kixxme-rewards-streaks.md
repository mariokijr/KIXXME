---
name: KixxMe daily rewards, streaks & credit ledger
description: How daily-reward credits plug into the DERIVED like/SuperLike quota engine without breaking its append-only invariants; streak day math; unlimited-tier credit policy.
---

# Daily rewards, streaks & the credit ledger

KixxMe like/SuperLike quotas are **derived** (rolling-window COUNT over append-only
`like_actions`), not a stored counter. Daily rewards grant **bonus credits** that the
like engine spends only after the base allowance is exhausted. The hard part is making
credits coexist with a derived quota without corrupting the base lockout.

## The `source` discriminator is load-bearing
`like_actions.source` is `'quota' | 'credit'` (default `'quota'`, which grandfathers all
pre-existing rows). **Every place that counts the BASE allowance must filter
`source='quota'`:**
- `windowUsage` (the rolling-window count returned in QuotaState)
- the in-transaction gate count (the authoritative check before inserting)
- `rechargeAt` = `min(createdAt)` of the same quota-filtered set

**Why:** a credit-funded like is a real `like_actions` row. If it counted toward the base
window it would (a) inflate usage and (b) push out `rechargeAt`, so spending a bonus credit
would paradoxically *delay* your next free like. Forgetting the filter at any one of those
three sites silently reintroduces that bug.

## Credit spend is inside the per-user advisory-locked tx
Balance = `SUM(delta)` per `(userId, kind)` over append-only `reward_credits`. The balance
read AND the `-1` spend row insert happen inside the same `pg_advisory_xact_lock(hashtext(userId))`
transaction that gates the like; `claimDailyReward` takes the **same** lock, so grant / spend /
claim are fully serialized per user — no double-spend, no negative balance.
On a downstream Supabase failure, a **dual compensating refund** deletes BOTH the
`like_actions` row and the `reward_credits` spend row, wrapped in one `db.transaction` so a
partial failure can't leave the credit spent but the like un-recorded.

## Streak math (claim-driven, UTC calendar day)
Streak advances on **claim**, not arbitrary activity. Day key = `toISOString().slice(0,10)`
(pure UTC). `lastClaimDate === today` → already-claimed → **409** (idempotent under the lock);
`=== yesterday` (epoch +86,400,000ms) → `current+1`; otherwise reset to 1. Grant rule:
like credits ramp on a **7-day cycle `[1,1,2,1,2,2,3]`** (`(current-1)%7`), **+1 SuperLike
every 10th day** (`current % 10 === 0`), and a **30-day special** (`current % 30 === 0`) of
+1 SuperLike +3 like credits. The 30-day special **supersedes** the 10-day SuperLike on the
shared day (every 30th is also a 10th) → exactly one SuperLike, never two. Amounts deliberately
modest so daily rewards don't undercut Plus/Gold.

## Unlimited tiers accrue but cannot spend — hide, don't special-case
Gold (both unlimited) and Plus (likes unlimited) accrue credits they can't spend; the
unlimited branch of the quota builder never consumes them. We deliberately **keep granting**
(credits become spendable on downgrade) but the rewards card **hides the credit chip for any
kind whose quota is `unlimited`** (it reads `useGetLikeQuota` to decide). Showing "N extra"
for an unspendable kind is the misleading part, not the accrual.

## Profile completion is purely client-side
`artifacts/kixxme/src/lib/profile-completion.ts` is a dependency-free pure helper (9 checks →
percent + Spanish `missing[]`). **No endpoint** — it derives from the already-cached profile +
photo list. All field checks are null-safe; the card returns null when no profile is loaded.
