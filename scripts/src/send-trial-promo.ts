/**
 * Trial promo email campaign script.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run send-trial-promo -- --test
 *     → sends only to Mariokimbm2003@gmail.com (dry run against dedup)
 *
 *   pnpm --filter @workspace/scripts run send-trial-promo
 *     → sends to all free-plan users in Supabase (with dedup)
 *
 * Requires env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL, APP_BASE_URL
 */
import { createClient } from "@supabase/supabase-js";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { db, emailSendsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const TEST_EMAIL = "Mariokimbm2003@gmail.com";
const FROM = "KixxMe <supportkixxme@gmail.com>";
const CATEGORY = "trial_promo";
const DEDUP_KEY_PREFIX = "gold-trial-promo-20260613";
const RATE_LIMIT_MS = 600;
const NULL_UUID = "00000000-0000-0000-0000-000000000000";

function isAscii(s: string) {
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) > 0x7f) return false;
  return true;
}
function encodeHeader(s: string): string {
  const clean = s.replace(/[\r\n]+/g, " ").trim();
  if (isAscii(clean)) return clean;
  return `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}
function base64Body(s: string): string {
  return Buffer.from(s, "utf8")
    .toString("base64")
    .replace(/(.{76})/g, "$1\r\n");
}
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h1|h2|h3|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}
function buildRaw(to: string, subject: string, html: string): string {
  const boundary = "kixxme_promo_" + Date.now().toString(36);
  const text = htmlToText(html) || "Abre este correo en un cliente compatible con HTML.";
  const headers = [
    `From: ${FROM}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].join("\r\n");
  const body = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64Body(text),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64Body(html),
    `--${boundary}--`,
    "",
  ].join("\r\n");
  return `${headers}\r\n\r\n${body}`;
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const raw = Buffer.from(buildRaw(to, subject, html), "utf8").toString("base64url");
  const connectors = new ReplitConnectors();
  const res = await connectors.proxy(
    "google-mail",
    "/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gmail error ${res.status}: ${detail}`.trim());
  }
}

function buildPromoHtml(appUrl: string): string {
  const trialUrl = `${appUrl.replace(/\/$/, "")}/trial`;
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>5 días de Gold gratis en KixxMe</title>
</head>
<body style="margin:0;padding:0;background:#0d0b1a;font-family:sans-serif;color:#e2e8f0;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0b1a;">
<tr><td align="center" style="padding:32px 16px;">
<table width="100%" style="max-width:480px;background:#0d0b1a;border-radius:20px;border:1px solid rgba(234,179,8,0.25);overflow:hidden;">

  <!-- Header -->
  <tr>
    <td style="padding:32px 28px 20px;text-align:center;background:linear-gradient(135deg,rgba(234,179,8,0.12),rgba(249,115,22,0.06));">
      <div style="font-size:32px;margin-bottom:8px;">👑</div>
      <h1 style="margin:0 0 6px;font-size:26px;font-weight:700;letter-spacing:2px;color:#facc15;">5 DÍAS DE GOLD GRATIS</h1>
      <p style="margin:0;font-size:14px;color:#94a3b8;">Solo para usuarios registrados de KixxMe</p>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="padding:24px 28px;">
      <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#cbd5e1;">
        Queremos que descubras todo lo que KixxMe puede ofrecerte, completamente gratis durante <strong style="color:#facc15;">5 días</strong>.
      </p>

      <p style="margin:0 0 18px;font-size:14px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Incluye todo Gold:</p>
      <table width="100%" cellpadding="0" cellspacing="0">
        ${[
          ["👑", "Likes y SuperLikes ilimitados"],
          ["👁️", "Ve quién visita tu perfil"],
          ["⭐", "Descubre quién te da SuperLike"],
          ["🕵️", "Modo incógnito"],
          ["⚡", "Boost diario prioritario"],
          ["🛡️", "Soporte VIP 24/7"],
          ["💬", "Chat directo con KixxMe Soporte"],
        ]
          .map(
            ([icon, text]) => `<tr><td style="padding:6px 0;font-size:14px;color:#cbd5e1;">${icon} ${text}</td></tr>`,
          )
          .join("")}
      </table>

      <div style="margin:28px 0;text-align:center;">
        <a href="${trialUrl}"
          style="display:inline-block;padding:14px 36px;border-radius:14px;font-size:17px;font-weight:700;letter-spacing:2px;color:#fff;text-decoration:none;background:linear-gradient(135deg,#d97706,#ea580c);">
          ACTIVAR 5 DÍAS GRATIS
        </a>
      </div>

      <p style="margin:0 0 8px;font-size:12px;color:#64748b;text-align:center;">
        Sin compromiso · Cancela antes del día 5 y no pagas nada.<br/>
        Después, 9,99 €/mes. Solo una prueba por cuenta.
      </p>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="padding:16px 28px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
      <p style="margin:0;font-size:11px;color:#475569;">
        KixxMe · La app gay española<br/>
        <a href="${appUrl}" style="color:#6366f1;text-decoration:none;">Abrir KixxMe</a>
      </p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

async function main() {
  const isTest = process.argv.includes("--test");

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const appUrl =
    process.env.APP_BASE_URL ??
    (process.env.REPLIT_DOMAINS?.split(",")[0]
      ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
      : "https://kixxme.replit.app");

  const subject = "👑 5 días de Gold gratis — solo por ser parte de KixxMe";
  const html = buildPromoHtml(appUrl);

  type Recipient = { id: string; email: string };
  let recipients: Recipient[] = [];

  if (isTest) {
    console.log(`[test] Sending to ${TEST_EMAIL} only.`);
    recipients = [{ id: NULL_UUID, email: TEST_EMAIL }];
  } else {
    console.log("Fetching free-plan users from Supabase…");
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Page through all free-plan profiles to get their Supabase user emails.
    let page = 0;
    const PAGE = 1000;
    const ids: string[] = [];

    while (true) {
      const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("plan", "free")
        .range(page * PAGE, page * PAGE + PAGE - 1);

      if (error) {
        console.error("Supabase fetch error:", error.message);
        process.exit(1);
      }
      if (!data || data.length === 0) break;
      ids.push(...data.map((r: { id: string }) => r.id));
      if (data.length < PAGE) break;
      page++;
    }

    console.log(`Found ${ids.length} free-plan users. Fetching emails…`);

    // Fetch emails in batches from Supabase Auth admin API.
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100);
      for (const id of batch) {
        const { data: user, error } = await supabase.auth.admin.getUserById(id);
        if (error || !user?.user?.email) continue;
        recipients.push({ id, email: user.user.email });
      }
    }
    console.log(`Retrieved ${recipients.length} emails.`);
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const { id, email } of recipients) {
    const dedupKey = `${DEDUP_KEY_PREFIX}:${id}`;

    const inserted = await db
      .insert(emailSendsTable)
      .values({ userId: id, category: CATEGORY, dedupKey })
      .onConflictDoNothing()
      .returning();

    if (inserted.length === 0) {
      console.log(`  skip  ${email} (already sent)`);
      skipped++;
      continue;
    }

    try {
      await sendEmail(email, subject, html);
      console.log(`  sent  ${email}`);
      sent++;
    } catch (err: any) {
      console.error(`  FAIL  ${email}: ${err?.message}`);
      // Remove dedup row so this recipient can be retried.
      await db
        .delete(emailSendsTable)
        .where(
          and(
            eq(emailSendsTable.category, CATEGORY),
            eq(emailSendsTable.dedupKey, dedupKey),
          ),
        );
      failed++;
    }

    if (!isTest) {
      await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
    }
  }

  console.log(
    `\nDone. Sent: ${sent} · Skipped: ${skipped} · Failed: ${failed}`,
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
