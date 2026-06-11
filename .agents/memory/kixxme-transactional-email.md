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
