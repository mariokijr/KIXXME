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
 *                         "KixxMe <no-reply@kixxme.com>". Falls back to the
 *                         caller's From (the Gmail support identity) when unset.
 *
 * Fail-soft contract: if Resend errors at runtime we fall back to Gmail so a
 * provider hiccup never drops mail. This throws only when BOTH paths fail;
 * `sendEmail()` in email.ts wraps it so callers never see an exception.
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

/**
 * Preferred From for Resend. Set `EMAIL_FROM` to a sender on the verified
 * custom domain for best deliverability; otherwise reuse the caller's From.
 */
function resendFrom(fallback: string): string {
  return (process.env.EMAIL_FROM ?? "").trim() || fallback;
}

async function sendViaResend(key: string, email: OutboundEmail): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: resendFrom(email.from),
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
 * Deliver one email through the active provider. Resend when configured (with a
 * Gmail fallback on failure), otherwise Gmail directly.
 */
export async function deliverEmail(email: OutboundEmail): Promise<void> {
  const key = resendApiKey();
  if (key) {
    try {
      await sendViaResend(key, email);
      return;
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), to: email.to },
        "Resend send failed; falling back to Gmail",
      );
    }
  }
  await sendGmailMessage({
    to: email.to,
    from: email.from,
    replyTo: email.replyTo,
    subject: email.subject,
    html: email.html,
  });
}
