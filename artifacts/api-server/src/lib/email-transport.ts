import { logger } from "./logger.js";
import { sendGmailMessage } from "./gmail.js";

/**
 * Transport layer for outbound email. Resend-first for custom-domain
 * deliverability (SPF/DKIM/DMARC aligned to kixxme.com), with the existing
 * Gmail connector as an automatic fallback.
 *
 * Selection is purely env-driven:
 *   - `RESEND_API_KEY` + `EMAIL_FROM` → Resend (primary, recommended for prod).
 *     EMAIL_FROM must be a verified custom-domain sender, e.g.
 *     "KixxMe <no-reply@kixxme.com>". Without EMAIL_FROM, Resend is skipped
 *     entirely — using a gmail.com From always 403s on Resend.
 *   - Gmail connector → fallback (or primary when Resend is unconfigured).
 *     Gmail sends are serialised through an in-process queue (one at a time,
 *     600 ms inter-send gap) so concurrent registrations never saturate the
 *     Gmail API user quota. Each failed send is retried up to 2 times, waiting
 *     the exact "Retry after" timestamp that Gmail embeds in 429 responses.
 *
 * Fail-soft contract: throws only when every path is exhausted; `sendEmail()`
 * in email.ts wraps it so callers never see an exception.
 */

export interface OutboundEmail {
  to: string;
  from: string;
  replyTo: string;
  subject: string;
  html: string;
}

function resendApiKey(): string | undefined {
  return (process.env.RESEND_API_KEY ?? "").trim() || undefined;
}

function resendFrom(): string | undefined {
  return (process.env.EMAIL_FROM ?? "").trim() || undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

/**
 * Parse the "Retry after <ISO timestamp>" that Gmail embeds in 429 bodies and
 * return how many ms to wait (capped at 30 s to avoid blocking the queue
 * indefinitely). Returns null when no parseable timestamp is found.
 */
function parseGmailRetryAfterMs(errorMessage: string): number | null {
  const match = /Retry after (\d{4}-\d{2}-\d{2}T[\d:.]+Z)/i.exec(errorMessage);
  if (!match) return null;
  const retryAt = Date.parse(match[1]);
  if (isNaN(retryAt)) return null;
  const waitMs = retryAt - Date.now();
  // Add 500 ms buffer; cap at 30 s so a misbehaving response never hangs forever.
  return Math.min(Math.max(waitMs + 500, 500), 30_000);
}

/**
 * Attempt a single Gmail send, retrying up to `retriesLeft` times on 429.
 * Each retry waits exactly as long as Gmail asks (parsed from the error body),
 * falling back to an exponential guess when no timestamp is present.
 */
async function gmailSendWithRetry(
  email: OutboundEmail,
  retriesLeft = 2,
  attempt = 1,
): Promise<void> {
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
      const waitMs = parseGmailRetryAfterMs(msg) ?? Math.min(2000 * 2 ** (attempt - 1), 30_000);
      logger.warn(
        { to: email.to, waitMs, attempt },
        "Gmail 429; waiting before retry",
      );
      await sleep(waitMs);
      return gmailSendWithRetry(email, retriesLeft - 1, attempt + 1);
    }
    throw err;
  }
}

/**
 * Serial Gmail queue — prevents concurrent Gmail API calls from colliding on
 * the per-user rate limit. Sends are processed one at a time with a 600 ms
 * gap between completions (≈ 1.5 sends/sec, well within the API quota).
 *
 * The queue is module-level (process-global), so all concurrent route handlers
 * share the same serialisation.
 */
interface QueuedSend {
  email: OutboundEmail;
  resolve: () => void;
  reject: (err: unknown) => void;
}
const gmailQueue: QueuedSend[] = [];
let gmailProcessing = false;

async function drainGmailQueue(): Promise<void> {
  if (gmailProcessing) return;
  gmailProcessing = true;
  while (gmailQueue.length > 0) {
    const item = gmailQueue.shift()!;
    try {
      await gmailSendWithRetry(item.email);
      item.resolve();
    } catch (err) {
      item.reject(err);
    }
    if (gmailQueue.length > 0) {
      await sleep(600); // rate-limit gap between sends
    }
  }
  gmailProcessing = false;
}

function queuedGmailSend(email: OutboundEmail): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    gmailQueue.push({ email, resolve, reject });
    void drainGmailQueue();
  });
}

let warnedMissingEmailFrom = false;

/**
 * When Resend returns `daily_quota_exceeded`, we cache the exhaustion for
 * RESEND_QUOTA_RETRY_MS (default 10 min) so subsequent calls skip the HTTP
 * round-trip without flooding logs. After the TTL expires the next send
 * retries Resend automatically — useful after upgrading the Resend plan.
 * On paid plans Resend never returns daily_quota_exceeded, so this cache
 * stays at 0 and every email goes through Resend.
 */
const RESEND_QUOTA_RETRY_MS = 10 * 60 * 1000; // 10 minutes
let resendQuotaExhaustedUntil = 0; // Unix ms; 0 = not exhausted

function isResendQuotaExhausted(): boolean {
  return Date.now() < resendQuotaExhaustedUntil;
}

/**
 * Deliver one email through the active provider.
 *
 * Priority:
 *   1. Resend — only when both RESEND_API_KEY and EMAIL_FROM are set AND the
 *      daily quota is not exhausted. When Resend returns `daily_quota_exceeded`
 *      the exhaustion is cached until midnight UTC so subsequent sends skip
 *      Resend without retrying and go straight to Gmail.
 *   2. Gmail (serialised queue + retry-after-aware retries) — used when
 *      Resend is unconfigured, EMAIL_FROM is missing, quota is exhausted,
 *      or any other Resend error occurs.
 */
export async function deliverEmail(email: OutboundEmail): Promise<void> {
  const key = resendApiKey();
  const from = resendFrom();

  if (key && from && !isResendQuotaExhausted()) {
    try {
      await sendViaResend(key, from, email);
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("daily_quota_exceeded")) {
        resendQuotaExhaustedUntil = Date.now() + RESEND_QUOTA_RETRY_MS;
        logger.error(
          { to: email.to, retryAfter: new Date(resendQuotaExhaustedUntil).toISOString() },
          "🚨 RESEND DAILY QUOTA EXCEEDED — falling back to Gmail for 10 min, then retrying Resend. " +
            "Upgrade your Resend plan at https://resend.com/settings/billing to restore full deliverability.",
        );
      } else {
        logger.warn(
          { err: msg, to: email.to },
          "Resend send failed; falling back to Gmail queue",
        );
      }
    }
  } else if (key && !from && !warnedMissingEmailFrom) {
    warnedMissingEmailFrom = true;
    logger.warn(
      "RESEND_API_KEY is set but EMAIL_FROM is not — skipping Resend (gmail.com From " +
        'always 403s). Set EMAIL_FROM to "KixxMe <no-reply@kixxme.com>" once ' +
        "kixxme.com is verified at https://resend.com/domains.",
    );
  } else if (isResendQuotaExhausted()) {
    logger.warn(
      { to: email.to, resetsAt: new Date(resendQuotaExhaustedUntil).toISOString() },
      "Resend quota exhausted (cached); routing via Gmail",
    );
  }

  await queuedGmailSend(email);
}
