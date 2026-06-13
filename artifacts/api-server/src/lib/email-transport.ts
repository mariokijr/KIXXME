import { logger } from "./logger.js";
import { sendGmailMessage } from "./gmail.js";

/**
 * Transport layer for outbound email. Resend-first for custom-domain
 * deliverability (SPF/DKIM/DMARC aligned to kixxme.com), with the existing
 * Gmail connector as an automatic fallback.
 *
 * Selection is purely env-driven and additive — nothing changes until the
 * secrets are set, so this is safe to ship before the domain is verified:
 *   - `RESEND_API_KEY`  — when present, Resend is used as the primary provider.
 *   - `EMAIL_FROM`      — verified custom-domain sender, e.g.
 *                         "KixxMe <no-reply@kixxme.com>". Resend is SKIPPED
 *                         when unset (sending from gmail.com always 403s on
 *                         Resend) and the Gmail connector is used directly.
 *
 * Fail-soft contract: if Resend errors at runtime we fall back to Gmail so a
 * provider hiccup never drops mail. Gmail sends are retried once on 429
 * (rate-limit) with a short backoff. This throws only when both paths are
 * exhausted; `sendEmail()` in email.ts wraps it so callers never see an
 * exception.
 */
export interface OutboundEmail {
  to: string;
  from: string;
  replyTo: string;
  subject: string;
  html: string;
}

function resendApiKey(): string | undefined {
  const key = (process.env.RESEND_API_KEY ?? "").trim();
  return key || undefined;
}

function resendFrom(): string | undefined {
  return (process.env.EMAIL_FROM ?? "").trim() || undefined;
}

async function sendViaResend(key: string, from: string, email: OutboundEmail): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email.to],
      reply_to: email.replyTo,
      subject: email.subject,
      html: email.html,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend API ${res.status}: ${detail.slice(0, 300)}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Deliver via Gmail with one retry on 429 (rate-limit burst). The Gmail API
 * has a per-user quota; a short backoff resolves momentary spikes.
 */
async function sendViaGmail(email: OutboundEmail, retriesLeft = 1): Promise<void> {
  try {
    await sendGmailMessage({
      to: email.to,
      from: email.from,
      replyTo: email.replyTo,
      subject: email.subject,
      html: email.html,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (retriesLeft > 0 && msg.includes("429")) {
      logger.warn(
        { to: email.to },
        "Gmail 429 rate-limit hit; waiting 3 s before retry",
      );
      await sleep(3000);
      return sendViaGmail(email, retriesLeft - 1);
    }
    throw err;
  }
}

let warnedMissingEmailFrom = false;

/**
 * Deliver one email through the active provider.
 *
 * Priority:
 *   1. Resend — only when BOTH RESEND_API_KEY and EMAIL_FROM are set.
 *      Without EMAIL_FROM, Resend would use the Gmail From address which
 *      is always rejected (403) because gmail.com is not a Resend-verified
 *      domain. Skipping Resend in that case avoids a guaranteed failure
 *      before falling through to Gmail.
 *   2. Gmail (with one 429-retry) — used when Resend is unconfigured, EMAIL_FROM
 *      is missing, or Resend returns a transient error.
 */
export async function deliverEmail(email: OutboundEmail): Promise<void> {
  const key = resendApiKey();
  const from = resendFrom();

  if (key && from) {
    try {
      await sendViaResend(key, from, email);
      return;
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), to: email.to },
        "Resend send failed; falling back to Gmail",
      );
    }
  } else if (key && !from && !warnedMissingEmailFrom) {
    warnedMissingEmailFrom = true;
    logger.warn(
      "RESEND_API_KEY is set but EMAIL_FROM is not — skipping Resend to avoid " +
        "the guaranteed gmail.com 403. Set EMAIL_FROM to a verified kixxme.com " +
        'sender (e.g. "KixxMe <no-reply@kixxme.com>") once the domain is ' +
        "verified at https://resend.com/domains.",
    );
  }

  await sendViaGmail(email);
}
