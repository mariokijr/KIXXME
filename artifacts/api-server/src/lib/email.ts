import { logger } from "./logger.js";
import { sendGmailMessage } from "./gmail.js";

/**
 * Email module. All mail is sent from (and replies go to) the KixxMe support
 * inbox. Sending is provider-agnostic via `gmail.ts`; if the Gmail integration
 * is not connected yet, `sendEmail` logs and returns false instead of throwing,
 * so signup, subscriptions, and support reports never break.
 */
export const SUPPORT_EMAIL = "supportkixxme@gmail.com";
const FROM = `KixxMe <${SUPPORT_EMAIL}>`;

/** Public https base URL of the app (first allowed Replit domain), if known. */
export function appBaseUrl(): string | undefined {
  const domain = (process.env.REPLIT_DOMAINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)[0];
  return domain ? `https://${domain}` : undefined;
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<boolean> {
  const { to, subject, html, replyTo } = params;
  try {
    await sendGmailMessage({
      to,
      from: FROM,
      replyTo: replyTo ?? SUPPORT_EMAIL,
      subject,
      html,
    });
    logger.info({ to, subject }, "Email sent");
    return true;
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), to, subject },
      "sendEmail skipped/failed (email provider not configured?)",
    );
    return false;
  }
}

// ---------------------------------------------------------------------------
// Branded template — neon/fire KixxMe look (dark base, purple→pink→orange
// gradient, flame accent). Inline styles + table layout for email-client
// compatibility.
// ---------------------------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const BG = "#0a0814";
const CARD = "#120d22";
const BORDER = "#241a3d";
const TEXT = "#f4f1fb";
const MUTED = "#a89fc4";
const GRADIENT = "linear-gradient(135deg,#a855f7 0%,#ec4899 55%,#f97316 100%)";

interface EmailLayoutOptions {
  preheader: string;
  heading: string;
  bodyHtml: string;
  cta?: { label: string; url: string };
}

function renderEmail(opts: EmailLayoutOptions): string {
  const { preheader, heading, bodyHtml, cta } = opts;
  const ctaHtml = cta
    ? `
              <tr>
                <td style="padding:8px 0 4px 0;">
                  <a href="${escapeHtml(cta.url)}" target="_blank"
                     style="display:inline-block;padding:14px 32px;border-radius:999px;
                            background:${GRADIENT};color:#ffffff;font-weight:700;
                            font-size:15px;text-decoration:none;letter-spacing:0.3px;">
                    ${escapeHtml(cta.label)}
                  </a>
                </td>
              </tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1.0" />
<meta name="color-scheme" content="dark" />
<title>KixxMe</title>
</head>
<body style="margin:0;padding:0;background:${BG};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${BG};">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
       style="background:${BG};padding:32px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:520px;background:${CARD};border:1px solid ${BORDER};
                    border-radius:20px;overflow:hidden;
                    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <tr>
          <td style="height:4px;background:${GRADIENT};font-size:0;line-height:0;">&nbsp;</td>
        </tr>
        <tr>
          <td style="padding:36px 36px 8px 36px;" align="center">
            <div style="font-size:30px;font-weight:800;letter-spacing:1px;color:${TEXT};">
              KIXX<span style="background:${GRADIENT};-webkit-background-clip:text;
                              background-clip:text;color:#ec4899;">ME</span>
              <span style="font-size:26px;">&#128293;</span>
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:18px 36px 0 36px;">
            <h1 style="margin:0 0 8px 0;font-size:22px;line-height:1.3;color:${TEXT};font-weight:800;">
              ${escapeHtml(heading)}
            </h1>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 36px 8px 36px;color:${MUTED};font-size:15px;line-height:1.65;">
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:8px 36px 36px 36px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              ${ctaHtml}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 36px;border-top:1px solid ${BORDER};color:#6f6790;font-size:12px;line-height:1.6;">
            ¿Necesitas ayuda? Escríbenos a
            <a href="mailto:${SUPPORT_EMAIL}" style="color:#ec4899;text-decoration:none;">${SUPPORT_EMAIL}</a>.<br />
            KixxMe · Conexiones que encienden.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function paragraphs(lines: string[]): string {
  return lines
    .map(
      (l) =>
        `<p style="margin:0 0 14px 0;">${l}</p>`,
    )
    .join("\n            ");
}

// --- Welcome (signup) -------------------------------------------------------

export const WELCOME_SUBJECT = "\u{1F525} Bienvenido a KixxMe";

export function welcomeEmailHtml(appUrl?: string): string {
  const body = paragraphs([
    "<strong style=\"color:#f4f1fb;\">Bienvenido al mapa m\u00E1s caliente de Espa\u00F1a.</strong> Completa tu perfil, sube tus mejores fotos y empieza a conocer gente cerca de ti.",
    "\u{1F525} Tu pr\u00F3xima conexi\u00F3n podr\u00EDa estar a solo unos metros.",
    "Equipo KixxMe",
  ]);
  return renderEmail({
    preheader: "Bienvenido al mapa m\u00E1s caliente de Espa\u00F1a.",
    heading: "Bienvenido a la comunidad \u{1F525}",
    bodyHtml: body,
    cta: appUrl ? { label: "Explorar ahora", url: appUrl } : undefined,
  });
}

// --- Premium welcome (subscription) ----------------------------------------
// One template per tier. The Stripe webhook picks the right one from the
// purchased tier via `premiumWelcomeEmail`.

export const PLUS_WELCOME_SUBJECT = "⭐ Ya eres KixxMe Plus";
export const GOLD_WELCOME_SUBJECT = "👑 Bienvenido a KixxMe Gold";

export function plusWelcomeEmailHtml(appUrl?: string): string {
  const body = paragraphs([
    "<strong style=\"color:#f4f1fb;\">¡Enhorabuena! Ya eres KixxMe Plus.</strong>",
    "Acabas de subir de nivel. A partir de ahora tienes acceso a:",
    "💬 Chats ilimitados<br />👀 Ve quién visita tu perfil<br />🎚️ Filtros avanzados<br />⚡ 1 boost semanal para destacar<br />✅ Perfil verificado",
    "🔥 Tu perfil va a brillar más que nunca. Es el momento de dejar huella.",
    "Equipo KixxMe",
  ]);
  return renderEmail({
    preheader: "Ya eres KixxMe Plus: chats ilimitados, más visibilidad y mucho más.",
    heading: "⭐ Ya eres KixxMe Plus",
    bodyHtml: body,
    cta: appUrl ? { label: "Empezar ahora", url: appUrl } : undefined,
  });
}

export function goldWelcomeEmailHtml(appUrl?: string): string {
  const body = paragraphs([
    "<strong style=\"color:#f4f1fb;\">Bienvenido a la élite. Ya eres KixxMe Gold.</strong>",
    "Tienes en tus manos la experiencia más exclusiva de KixxMe:",
    "👑 Todo lo de Plus, y mucho más<br />🕶️ Modo incógnito<br />⚡ Boost diario prioritario<br />👀 Visitas en detalle<br />🎚️ Filtros exclusivos<br />💎 Soporte VIP 24/7",
    "🔥 Ahora formas parte de lo mejor de KixxMe. Disfruta de cada conexión.",
    "Equipo KixxMe",
  ]);
  return renderEmail({
    preheader: "Ya eres KixxMe Gold: la experiencia más exclusiva, sin límites.",
    heading: "👑 Bienvenido a KixxMe Gold",
    bodyHtml: body,
    cta: appUrl ? { label: "Descubrir Gold", url: appUrl } : undefined,
  });
}

/** Pick the tier-specific welcome email for a completed subscription. */
export function premiumWelcomeEmail(
  tier: string,
  appUrl?: string,
): { subject: string; html: string } {
  if (tier === "gold") {
    return { subject: GOLD_WELCOME_SUBJECT, html: goldWelcomeEmailHtml(appUrl) };
  }
  return { subject: PLUS_WELCOME_SUBJECT, html: plusWelcomeEmailHtml(appUrl) };
}

// --- Support report notification (to the support inbox) ---------------------

export function supportReportEmailHtml(report: {
  id: string;
  category: string;
  reporterId: string;
  targetUserId?: string | null;
  subject?: string | null;
  message: string;
  contactEmail?: string | null;
  createdAt: Date;
}): string {
  const row = (label: string, value: string) =>
    `<p style="margin:0 0 10px 0;"><span style="color:#6f6790;">${escapeHtml(label)}:</span> <span style="color:#f4f1fb;">${escapeHtml(value)}</span></p>`;

  const body = [
    row("Categor\u00EDa", report.category),
    report.subject ? row("Asunto", report.subject) : "",
    row("Reporter (user id)", report.reporterId),
    report.targetUserId ? row("Usuario reportado", report.targetUserId) : "",
    report.contactEmail ? row("Email de contacto", report.contactEmail) : "",
    row("Fecha", report.createdAt.toISOString()),
    row("Report id", report.id),
    `<div style="margin-top:16px;padding:16px;border:1px solid ${BORDER};border-radius:12px;background:#0d0a1c;color:#d9d3ee;white-space:pre-wrap;">${escapeHtml(report.message)}</div>`,
  ]
    .filter(Boolean)
    .join("\n            ");

  return renderEmail({
    preheader: `Nuevo reporte: ${report.category}`,
    heading: "Nuevo reporte de soporte",
    bodyHtml: body,
  });
}
