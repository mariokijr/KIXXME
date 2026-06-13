---
name: Email transport — Gmail rate-limit & Resend setup
description: Gmail API 429 causes, the serial queue fix, and Resend activation conditions.
---

## Rule

All email goes through `artifacts/api-server/src/lib/email-transport.ts`. Resend is used ONLY when both `RESEND_API_KEY` **and** `EMAIL_FROM` env vars are set. Without `EMAIL_FROM`, Resend is skipped entirely — sending from a `gmail.com` From address always 403s on Resend.

## Gmail API rate limit (429) — root cause & fix

Gmail API has a per-user quota (~250 units/second; `messages.send` = 100 units → 2.5 sends/sec cap). Under concurrent registrations (multiple users requesting verification codes at once), sends collide and all 429.

**Fix in place:** `deliverEmail()` routes Gmail sends through an in-process serial queue (`drainGmailQueue`):
- One send processed at a time; 600 ms gap between completions ≈ 1.67 sends/sec
- Each failed send retried up to 2× using Google's embedded `"Retry after <ISO timestamp>"` parsed from the 429 body (fallback: exponential 2s/4s), capped at 30 s

**Why:** Concurrent sends overwhelmed the Gmail API quota. The queue eliminates contention without needing a database or external queue.

**How to apply:** Any time Gmail 429 errors appear in logs, check whether the queue is in place. Never attempt concurrent `sendGmailMessage()` calls from route handlers directly.

## Resend activation

Resend turns on automatically when `EMAIL_FROM=KixxMe <no-reply@kixxme.com>` is set in shared env AND `RESEND_API_KEY` exists. The kixxme.com domain was added to Resend (id: `9b11e94b-d205-44e8-8ef4-2bc280083687`, region: eu-west-1) but DNS records have NOT been verified as of this session. Until verified, Resend 403s with "domain not verified" and the queue handles Gmail fallback.

DNS records needed to verify kixxme.com in Resend:
- TXT `resend._domainkey` → long DKIM `p=MIGfMA0GCS…IDAQAB`
- MX `send` → `feedback-smtp.eu-west-1.amazonses.com` priority 10
- TXT `send` → `v=spf1 include:amazonses.com ~all`

## Current production configuration (as of this session)

- `EMAIL_FROM`: **not set** → Resend bypassed, Gmail-only
- `RESEND_API_KEY`: set (but inactive without EMAIL_FROM)
- All emails send from `supportkixxme@gmail.com` via Gmail connector
- Serial queue + retry-after-aware retries active

## Warning

`fetch_deployment_logs` returns production logs; dev server restarts don't affect production. Env var changes to "shared" propagate to production immediately at runtime (no redeploy needed), but CODE changes require a re-publish.
