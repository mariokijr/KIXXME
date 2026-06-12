---
name: KixxMe transactional email
description: All transactional email goes through the Gmail connector from supportkixxme@gmail.com; sending degrades gracefully until connected; sanitize user input before building raw RFC2822.
---

KixxMe sends all transactional email (welcome on signup, premium welcome on Stripe `checkout.session.completed`, support-report notifications) via the **Gmail connector**, From/Reply-To `supportkixxme@gmail.com`. The user explicitly chose Gmail over Resend.

- `artifacts/api-server/src/lib/email.ts` holds the neon/fire HTML templates plus a provider-agnostic `sendEmail` that **never throws** — it catches transport errors, logs via `logger`, and returns false. Callers fire-and-forget (`void sendEmail(...)`) so email problems never fail signup / checkout / support requests.
- `gmail.ts` is a stub that throws "not connected" until the Gmail connector is connected. After connection: `addIntegration` the new `connection:...`, copy the `getUncachableGmailClient()` snippet verbatim (do NOT cache the client — tokens expire), then implement raw `messages.send`.

**Security — header injection:** the Gmail API needs a hand-built raw RFC 2822 message, so user-supplied `subject` and `contactEmail` (Reply-To) MUST be CRLF/control-char stripped and format-validated before going into headers, or you get email header injection. The support route already strips control chars from `subject` and regex-validates `contactEmail`; preserve that when encoding headers, and RFC 2047-encode non-ASCII subjects.

**Why:** password-reset emails are handled by Supabase Auth (out of repo, not ours to template). The premium email fires only on `checkout.session.completed` to avoid duplicate sends.

**How to apply:** when wiring `gmail.ts` after the connector is connected, or adding any new transactional email.

**Deliverability — never send HTML-only.** `buildRawMessage` sends `multipart/alternative` (a stripped plain-text part + the HTML). HTML-only mail is markedly more likely to be classified as spam by Gmail and others.
**Why:** a user repeatedly reported moderation emails "don't arrive"; they were sent fine (provider 200) but landing in the recipient's Spam/Promociones. Adding the text part is the single most effective code-side deliverability fix.
**How to apply:** keep both parts whenever touching the transport; the boundary token contains `_` (not a base64 char) so it can never collide with the encoded bodies.

**Proving real delivery without the recipient's mailbox.** "Provider returned 200 / it's in Sent" only proves *accepted for delivery*, not *landed in inbox*. To get true end-to-end evidence, send to a **`+alias` of the connected (readable) account** (e.g. `supportkixxme+modtest_<ts>@gmail.com` → delivered to `supportkixxme@gmail.com`) then read it back via the Gmail API (`messages?includeSpamTrash=true&q=to:<alias>` → check `labelIds` for `INBOX` vs `SPAM`).
**Why:** the connector only grants access to the *sender* mailbox, never an arbitrary recipient; the alias trick routes a real send into a mailbox you can actually inspect. Caveat: Gmail favors self-sends, so this proves generation+transport+acceptance+inbox-placement+not-rejected, not external-domain reputation.
**How to apply:** to run the *real* server code (templates + transport) one-off, esbuild-bundle a temp entry that imports `./lib/email.js` to a temp dir (NOT `dist/`, which the running server uses) — the connector works from plain bash (`REPLIT_CONNECTORS_HOSTNAME`+`REPL_IDENTITY` are present); delete the temp files after.

**Brand layout depends on a public base URL.** The shared `renderEmail` header logo is an `<img>` pointing at `${appBaseUrl()}/icons/icon-192.png` (the web app's public badge), and the footer legal/help links (`/legal/privacidad`, `/legal/terminos`, `/support`) also resolve against `appBaseUrl()`. When no public base is resolvable the layout **silently** drops the logo image (wordmark-only) and omits the legal nav — by design, never a broken link/image. The CTA uses `background:${BRAND_SOLID};background:${GRADIENT}` so Outlook (which drops gradient backgrounds) still shows a solid brand-pink button instead of invisible white-on-nothing text.
**Why:** in prod the logo/links only work once the app is **published** AND `APP_BASE_URL` is set (deploy secret); in dev they resolve to the `.replit.dev` preview domain (publicly reachable, so images load in test sends).
**How to apply:** if a user reports "no logo / broken links in the email", check `APP_BASE_URL` + that the app is published — it's config, not the template.

## Anti-spam layer + notification preferences + Resend-readiness

The send path now goes through a policy gate, NOT raw `sendEmail`, for every non-onboarding email. Two Replit-Postgres tables back it: `notification_preferences` (per-user bool toggles for the *engagement* categories) and `email_sends` (idempotency/throttle ledger with **UNIQUE(category, dedupKey)**).

**Categories split into ALWAYS-ON vs PREFERENCE-GATED.** Transactional/direct-response mail (billing lifecycle, support ticket acks, report acks, password) is always-on and bypasses preferences. Engagement mail (new-message nudge, match, superlike) is preference-gated. `claimEmailSend({userId,category,dedupKey,cooldownMs?})` does: pref check (engagement only) → atomic claim → returns whether the caller should send. `clearEmailClaim` re-arms a key (used so a *new* offline message can email again once the prior one is read).

**Fail directions are deliberate and asymmetric — get them right:**
- `claimEmailSend` insert/claim fails **CLOSED** (error → don't send) so a DB hiccup can never flood.
- preference lookup fails **OPEN** (error → treat as enabled) so a DB hiccup never silently drops mail the user wants.
- `wasEmailedRecently` (cross-category suppression) fails **OPEN** (error → "not recently") so it never over-suppresses.
**Why:** the worst outcomes differ per check — flooding vs dropping — so each defaults to the less-bad failure.

**Claim shapes (once-ever vs cooldown):** once-ever = insert + `onConflictDoNothing` on the UNIQUE; cooldown = `onConflictDoUpdate` with `setWhere sentAt < cutoff` so `.returning()` yields a row exactly when it's time to re-send. New-message nudge = ~6h cooldown per conversation, only when the recipient is **offline** (last_active_at), and **suppressed for 30min after a match email for that pair** (avoids double-pinging a fresh match). Billing/support/report acks are once-ever per stripe-object / ticket / report id. The two admin acks (ticket-closed, report-resolved) are also once-ever so re-closing/re-resolving never re-emails.

**Privacy in acks:** report-received and report-resolved emails NEVER name the reported user or the action taken — only that the report was received/reviewed.

**Transport is Resend-first with Gmail fallback** (`lib/email-transport.ts`): if `RESEND_API_KEY` + `EMAIL_FROM` are set it sends via Resend, else (or on Resend failure) falls back to the Gmail connector; still fail-soft. The user's earlier Gmail-only choice is now the *fallback*. Resend is the recommended prod path for custom-domain deliverability (SPF/DKIM/DMARC on kixxme.com); `APP_BASE_URL=https://kixxme.com` must be set (deploy secret) for logo+CTA links.
**How to apply:** to add a new email, pick a category (always-on vs engagement), claim before sending, choose a stable dedupKey, and decide the fail direction by asking "is flooding or dropping worse here?".
