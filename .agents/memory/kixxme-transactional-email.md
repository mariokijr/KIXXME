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
