/**
 * Gmail transport via the Replit Gmail connector (@replit/connectors-sdk).
 *
 * Sends mail through the connector proxy, which injects the OAuth token and
 * refreshes it automatically. `email.ts#sendEmail` catches any throw here, so
 * signup, subscriptions, and support reports never break if the connector is
 * unavailable or not connected.
 *
 * Integration: Replit "Gmail" connector (google-mail), scope gmail.send.
 */
import { ReplitConnectors } from "@replit/connectors-sdk";

export interface GmailMessage {
  to: string;
  from: string;
  replyTo?: string;
  subject: string;
  html: string;
}

/** True when every char is in the 7-bit ASCII range. */
function isAscii(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) > 0x7f) return false;
  }
  return true;
}

/**
 * Strip CR/LF from a header value so user-influenced fields (subject, reply-to)
 * can never inject additional email headers (header-injection guard).
 */
function headerValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/** RFC 2047-encode a header value when it contains non-ASCII (emoji, accents). */
function encodeHeaderWord(value: string): string {
  const clean = headerValue(value);
  if (isAscii(clean)) return clean;
  return `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

function buildRawMessage(message: GmailMessage): string {
  // base64-encode the (UTF-8) HTML body and wrap at 76 chars per RFC 2045.
  const bodyBase64 = Buffer.from(message.html, "utf8")
    .toString("base64")
    .replace(/(.{76})/g, "$1\r\n");

  const headers = [
    `From: ${headerValue(message.from)}`,
    `To: ${headerValue(message.to)}`,
    ...(message.replyTo ? [`Reply-To: ${headerValue(message.replyTo)}`] : []),
    `Subject: ${encodeHeaderWord(message.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ];

  return `${headers.join("\r\n")}\r\n\r\n${bodyBase64}`;
}

export async function sendGmailMessage(message: GmailMessage): Promise<void> {
  const raw = Buffer.from(buildRawMessage(message), "utf8").toString(
    "base64url",
  );

  // Do not cache the client — the SDK manages token refresh per request.
  const connectors = new ReplitConnectors();
  const response = await connectors.proxy(
    "google-mail",
    "/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Gmail send failed: ${response.status} ${response.statusText} ${detail}`.trim(),
    );
  }
}
