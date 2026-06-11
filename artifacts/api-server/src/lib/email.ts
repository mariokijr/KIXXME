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

/**
 * Public https base URL of the app, used to build user-facing links (password
 * reset, email CTAs, Stripe return URLs).
 *
 * Resolution order:
 *   1. `APP_BASE_URL` — explicit override; set this to the custom domain in
 *      production (e.g. `https://kixxme.com`) so links are deterministic and
 *      don't depend on `REPLIT_DOMAINS` ordering.
 *   2. First entry of `REPLIT_DOMAINS` (the generated `*.replit.app` / dev
 *      `*.replit.dev` domain) as a fallback.
 */
export function appBaseUrl(): string | undefined {
  const override = (process.env.APP_BASE_URL ?? "").trim();
  if (override) {
    try {
      const parsed = new URL(override);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") {
        // Normalize: strip trailing slashes so callers can append "/path".
        return override.replace(/\/+$/, "");
      }
      logger.warn(
        { appBaseUrl: override },
        "APP_BASE_URL has a non-http(s) protocol; ignoring it and falling back to REPLIT_DOMAINS",
      );
    } catch {
      logger.warn(
        { appBaseUrl: override },
        "APP_BASE_URL is not a valid URL; ignoring it and falling back to REPLIT_DOMAINS",
      );
    }
  }
  const domain = (process.env.REPLIT_DOMAINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)[0];
  return domain ? `https://${domain}` : undefined;
}

/**
 * Hostnames the app treats as its own — the custom domain (`APP_BASE_URL`) plus
 * every `REPLIT_DOMAINS` entry. Used to validate client-supplied return URLs so
 * checkout can be launched from the custom domain without opening a redirect
 * hole.
 */
export function allowedHosts(): string[] {
  const hosts = new Set<string>();
  const override = (process.env.APP_BASE_URL ?? "").trim();
  if (override) {
    try {
      hosts.add(new URL(override).hostname);
    } catch {
      // Ignore a malformed override; the REPLIT_DOMAINS entries still apply.
    }
  }
  for (const d of (process.env.REPLIT_DOMAINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)) {
    hosts.add(d);
  }
  return [...hosts];
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

// --- Password reset ---------------------------------------------------------

export const PASSWORD_RESET_SUBJECT = "Restablece tu contraseña de KixxMe";

export function passwordResetEmailHtml(resetUrl: string): string {
  const body = paragraphs([
    "Hemos recibido una solicitud para restablecer la contraseña de tu cuenta de KixxMe.",
    "Pulsa el botón para crear una nueva contraseña. Por seguridad, este enlace caduca en 1 hora.",
    "Si no has solicitado este cambio, ignora este correo: tu contraseña seguirá intacta y nadie podrá acceder a tu cuenta.",
    "Equipo KixxMe",
  ]);
  return renderEmail({
    preheader: "Restablece tu contraseña de KixxMe.",
    heading: "Restablece tu contraseña 🔑",
    bodyHtml: body,
    cta: { label: "Crear nueva contraseña", url: resetUrl },
  });
}

export function passwordResetEmail(resetUrl: string): {
  subject: string;
  html: string;
} {
  return { subject: PASSWORD_RESET_SUBJECT, html: passwordResetEmailHtml(resetUrl) };
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

// --- Match + SuperLike notifications (engagement) ---------------------------
// Sent when a like becomes a mutual Match (both parties) or when a user
// receives a SuperLike. The SuperLike sender's identity follows the same
// redaction rule as in-app notifications: only Plus/Gold recipients learn who
// sent it (free recipients get "alguien" + an upsell).

export const MATCH_SUBJECT = "\u{1F389} \u00A1Es un Match en KixxMe!";

export function matchEmailHtml(otherName: string, appUrl?: string): string {
  const name = otherName.trim() || "alguien";
  const body = paragraphs([
    `<strong style="color:#f4f1fb;">\u00A1Enhorabuena! T\u00FA y ${escapeHtml(
      name,
    )} os hab\u00E9is gustado.</strong>`,
    "\u{1F389} Es un Match. Ahora pod\u00E9is hablar y conoceros mejor.",
    "\u{1F525} No dejes que se enfr\u00EDe: rompe el hielo con un buen mensaje.",
    "Equipo KixxMe",
  ]);
  return renderEmail({
    preheader: `T\u00FA y ${name} hab\u00E9is hecho Match en KixxMe`,
    heading: "\u{1F389} \u00A1Es un Match!",
    bodyHtml: body,
    cta: appUrl ? { label: "Abrir chat", url: appUrl } : undefined,
  });
}

export function matchEmail(
  otherName: string,
  appUrl?: string,
): { subject: string; html: string } {
  return { subject: MATCH_SUBJECT, html: matchEmailHtml(otherName, appUrl) };
}

export const SUPERLIKE_SUBJECT =
  "\u{1F49C} Has recibido un SuperLike en KixxMe";

export function superLikeReceivedEmailHtml(
  senderName: string | null,
  appUrl?: string,
): string {
  const lead = senderName
    ? `<strong style="color:#f4f1fb;">${escapeHtml(
        senderName,
      )} te ha enviado un SuperLike.</strong>`
    : `<strong style="color:#f4f1fb;">Alguien te ha enviado un SuperLike.</strong>`;
  const lines = [
    lead,
    "\u{1F49C} Un SuperLike significa que le has gustado de verdad.",
  ];
  if (!senderName) {
    lines.push(
      "\u{1F440} Hazte KixxMe Plus o Gold para ver qui\u00E9n te env\u00EDa SuperLikes.",
    );
  }
  lines.push(
    "Entra y desc\u00FAbrelo. Tu pr\u00F3xima conexi\u00F3n te espera \u{1F525}",
  );
  lines.push("Equipo KixxMe");
  return renderEmail({
    preheader: senderName
      ? `${senderName} te ha enviado un SuperLike`
      : "Has recibido un SuperLike en KixxMe",
    heading: "\u{1F49C} \u00A1Has recibido un SuperLike!",
    bodyHtml: paragraphs(lines),
    cta: appUrl ? { label: "Ver en KixxMe", url: appUrl } : undefined,
  });
}

export function superLikeReceivedEmail(
  senderName: string | null,
  appUrl?: string,
): { subject: string; html: string } {
  return {
    subject: SUPERLIKE_SUBJECT,
    html: superLikeReceivedEmailHtml(senderName, appUrl),
  };
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

// --- Account actions: verification codes + confirmations --------------------
// Email-verified, sensitive account changes. Code emails confirm intent before
// the action runs; the post-action emails confirm it happened.

function formatDateEs(d: Date): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

function codeBlock(code: string): string {
  return `<div style="margin:18px 0;padding:18px;border:1px solid ${BORDER};border-radius:14px;background:#0d0a1c;text-align:center;">
              <span style="font-size:34px;font-weight:800;letter-spacing:10px;color:${TEXT};font-family:'Courier New',monospace;">${escapeHtml(code)}</span>
            </div>`;
}

export const DELETE_CODE_SUBJECT = "Confirmación de eliminación de cuenta";
export const DEACTIVATE_CODE_SUBJECT = "Confirmación de desactivación de cuenta";

/** Verification-code email gating a deactivation or deletion. */
export function accountActionCodeEmail(
  action: "deactivate" | "delete",
  code: string,
): { subject: string; html: string } {
  const isDelete = action === "delete";
  const subject = isDelete ? DELETE_CODE_SUBJECT : DEACTIVATE_CODE_SUBJECT;
  const intro = isDelete
    ? 'Has solicitado <strong style="color:#f4f1fb;">eliminar permanentemente</strong> tu cuenta de KixxMe. Introduce este código en la app para confirmar:'
    : 'Has solicitado <strong style="color:#f4f1fb;">desactivar temporalmente</strong> tu cuenta de KixxMe. Introduce este código en la app para confirmar:';
  const warn = isDelete
    ? "\u26A0\uFE0F Esta acci\u00F3n es permanente: se borrar\u00E1n tu perfil, tus fotos, tus mensajes y tus me gusta. No se puede deshacer."
    : "Mientras est\u00E9 desactivada no aparecer\u00E1s para otras personas. Podr\u00E1s reactivarla cuando quieras volviendo a iniciar sesi\u00F3n.";
  const body = [
    `<p style="margin:0 0 14px 0;">${intro}</p>`,
    codeBlock(code),
    `<p style="margin:14px 0 0 0;">Este c\u00F3digo caduca en 15 minutos. Si no has sido t\u00FA, ignora este correo y tu cuenta seguir\u00E1 intacta.</p>`,
    `<p style="margin:14px 0 0 0;color:#f3b14b;">${warn}</p>`,
  ].join("\n            ");
  return {
    subject,
    html: renderEmail({
      preheader: isDelete
        ? "Tu c\u00F3digo para eliminar la cuenta"
        : "Tu c\u00F3digo para desactivar la cuenta",
      heading: subject,
      bodyHtml: body,
    }),
  };
}

export const DEACTIVATED_SUBJECT = "Tu cuenta de KixxMe est\u00E1 desactivada";

/** Confirmation sent after a successful deactivation. */
export function accountDeactivatedEmail(
  reactivateAt: Date | null,
  appUrl?: string,
): { subject: string; html: string } {
  const when = reactivateAt
    ? `Tu cuenta se reactivar\u00E1 autom\u00E1ticamente el <strong style="color:#f4f1fb;">${escapeHtml(
        formatDateEs(reactivateAt),
      )}</strong>. Tambi\u00E9n puedes volver antes: solo inicia sesi\u00F3n.`
    : "Tu cuenta seguir\u00E1 desactivada hasta que vuelvas a iniciar sesi\u00F3n. Cuando quieras volver, solo inicia sesi\u00F3n.";
  const body = paragraphs([
    "<strong style=\"color:#f4f1fb;\">Tu cuenta se ha desactivado correctamente.</strong>",
    "Ya no apareces en la b\u00FAsqueda, el mapa ni para el resto de personas.",
    when,
    "Te esperamos de vuelta \u{1F49C}",
    "Equipo KixxMe",
  ]);
  return {
    subject: DEACTIVATED_SUBJECT,
    html: renderEmail({
      preheader: "Tu cuenta de KixxMe est\u00E1 desactivada.",
      heading: "Cuenta desactivada",
      bodyHtml: body,
      cta: appUrl ? { label: "Volver a KixxMe", url: appUrl } : undefined,
    }),
  };
}

export const DELETED_SUBJECT = "Tu cuenta de KixxMe ha sido eliminada";

/** Confirmation sent after a successful permanent deletion. */
export function accountDeletedEmail(): { subject: string; html: string } {
  const body = paragraphs([
    "<strong style=\"color:#f4f1fb;\">Tu cuenta de KixxMe se ha eliminado de forma permanente.</strong>",
    "Hemos borrado tu perfil, tus fotos, tus mensajes y tus me gusta. Esta acci\u00F3n no se puede deshacer.",
    "Si en el futuro quieres volver, ser\u00E1s siempre bienvenido: solo tendr\u00E1s que crear una cuenta nueva.",
    "Gracias por haber formado parte de KixxMe \u{1F525}",
    "Equipo KixxMe",
  ]);
  return {
    subject: DELETED_SUBJECT,
    html: renderEmail({
      preheader: "Tu cuenta de KixxMe ha sido eliminada.",
      heading: "Cuenta eliminada",
      bodyHtml: body,
    }),
  };
}

// --- Moderation actions (admin-initiated) ----------------------------------
// Sent by the moderation panel when an admin warns, suspends, bans, removes,
// or restores an account. The optional `reason` is the admin's note; it is the
// only user-facing surface for a warning (warnings change no account state).

/** A highlighted "motivo" block, shown only when the admin gave a reason. */
function reasonBlock(reason: string | null | undefined): string {
  if (!reason || !reason.trim()) return "";
  return `<div style="margin:4px 0 14px 0;padding:14px 16px;border:1px solid ${BORDER};border-left:3px solid #f3b14b;border-radius:12px;background:#0d0a1c;color:#d9d3ee;white-space:pre-wrap;"><span style="color:#6f6790;">Motivo:</span> ${escapeHtml(
    reason.trim(),
  )}</div>`;
}

export const MODERATION_WARNING_SUBJECT = "\u26A0\uFE0F Aviso de KixxMe";

export function moderationWarningEmailHtml(
  reason: string | null,
  appUrl?: string,
): string {
  const body = [
    paragraphs([
      "<strong style=\"color:#f4f1fb;\">Has recibido un aviso del equipo de moderaci\u00F3n de KixxMe.</strong>",
      "Hemos detectado actividad que puede incumplir nuestras normas de la comunidad.",
    ]),
    reasonBlock(reason),
    paragraphs([
      "Tu cuenta sigue activa. Te pedimos que revises las normas para evitar futuras sanciones, que pueden incluir la suspensi\u00F3n o el cierre de tu cuenta.",
      "Equipo KixxMe",
    ]),
  ].join("\n            ");
  return renderEmail({
    preheader: "Has recibido un aviso del equipo de moderaci\u00F3n de KixxMe.",
    heading: "\u26A0\uFE0F Aviso de moderaci\u00F3n",
    bodyHtml: body,
    cta: appUrl ? { label: "Revisar las normas", url: appUrl } : undefined,
  });
}

export const MODERATION_SUSPENDED_SUBJECT =
  "Tu cuenta de KixxMe ha sido suspendida";

export function moderationSuspendedEmailHtml(
  reason: string | null,
  until: Date | null,
): string {
  const when = until
    ? `Tu cuenta estar\u00E1 suspendida hasta el <strong style="color:#f4f1fb;">${escapeHtml(
        formatDateEs(until),
      )}</strong>. Despu\u00E9s podr\u00E1s volver a iniciar sesi\u00F3n con normalidad.`
    : "Tu cuenta queda suspendida hasta nuevo aviso del equipo de moderaci\u00F3n.";
  const body = [
    paragraphs([
      "<strong style=\"color:#f4f1fb;\">Tu cuenta de KixxMe ha sido suspendida temporalmente.</strong>",
      "Mientras dure la suspensi\u00F3n no podr\u00E1s acceder a la app ni aparecer para otras personas.",
    ]),
    reasonBlock(reason),
    paragraphs([
      when,
      "Si crees que se trata de un error, responde a este correo.",
      "Equipo KixxMe",
    ]),
  ].join("\n            ");
  return renderEmail({
    preheader: "Tu cuenta de KixxMe ha sido suspendida temporalmente.",
    heading: "Cuenta suspendida",
    bodyHtml: body,
  });
}

export const MODERATION_BANNED_SUBJECT =
  "Tu cuenta de KixxMe ha sido suspendida permanentemente";

export function moderationBannedEmailHtml(reason: string | null): string {
  const body = [
    paragraphs([
      "<strong style=\"color:#f4f1fb;\">Tu cuenta de KixxMe ha sido suspendida de forma permanente.</strong>",
      "Tras revisar tu actividad, hemos cerrado el acceso a tu cuenta por incumplir nuestras normas de la comunidad.",
    ]),
    reasonBlock(reason),
    paragraphs([
      "Si crees que se trata de un error, puedes responder a este correo para solicitar una revisi\u00F3n.",
      "Equipo KixxMe",
    ]),
  ].join("\n            ");
  return renderEmail({
    preheader: "Tu cuenta de KixxMe ha sido suspendida permanentemente.",
    heading: "Cuenta suspendida permanentemente",
    bodyHtml: body,
  });
}

export const MODERATION_REMOVED_SUBJECT =
  "Tu cuenta de KixxMe ha sido eliminada";

export function moderationRemovedEmailHtml(reason: string | null): string {
  const body = [
    paragraphs([
      "<strong style=\"color:#f4f1fb;\">Un administrador ha eliminado tu cuenta de KixxMe.</strong>",
      "Ya no puedes acceder a la app ni aparecer para otras personas.",
    ]),
    reasonBlock(reason),
    paragraphs([
      "Si crees que se trata de un error, responde a este correo para solicitar una revisi\u00F3n.",
      "Equipo KixxMe",
    ]),
  ].join("\n            ");
  return renderEmail({
    preheader: "Un administrador ha eliminado tu cuenta de KixxMe.",
    heading: "Cuenta eliminada",
    bodyHtml: body,
  });
}

export const MODERATION_RESTORED_SUBJECT =
  "Tu cuenta de KixxMe ha sido restaurada";

export function moderationRestoredEmailHtml(appUrl?: string): string {
  const body = paragraphs([
    "<strong style=\"color:#f4f1fb;\">\u00A1Buenas noticias! Tu cuenta de KixxMe vuelve a estar activa.</strong>",
    "Ya puedes iniciar sesi\u00F3n y volver a conectar con gente cerca de ti.",
    "Te esperamos de vuelta \u{1F525}",
    "Equipo KixxMe",
  ]);
  return renderEmail({
    preheader: "Tu cuenta de KixxMe vuelve a estar activa.",
    heading: "Cuenta restaurada \u{1F389}",
    bodyHtml: body,
    cta: appUrl ? { label: "Volver a KixxMe", url: appUrl } : undefined,
  });
}

// --- Support ticket reply (priority "Soporte Premium" chat) -----------------
// Sent fire-and-forget to the ticket owner when support replies, so the user
// knows there's an answer waiting even if the app is closed. It deliberately
// carries NO sensitive context (no subject, no reply body) — only a neutral
// nudge back into the app, where the actual conversation lives.

export const SUPPORT_REPLY_SUBJECT = "Soporte KixxMe te ha respondido";

export function supportReplyEmailHtml(appUrl?: string): string {
  const body = paragraphs([
    "<strong style=\"color:#f4f1fb;\">Hola, tienes una nueva respuesta de Soporte KixxMe.</strong>",
    "Entra en la aplicaci\u00F3n para leer el mensaje y continuar la conversaci\u00F3n.",
  ]);
  return renderEmail({
    preheader: "Tienes una nueva respuesta de Soporte KixxMe.",
    heading: "\u{1F4AC} Soporte KixxMe te ha respondido",
    bodyHtml: body,
    cta: appUrl ? { label: "Ver respuesta en KixxMe", url: appUrl } : undefined,
  });
}

export function supportReplyEmail(appUrl?: string): {
  subject: string;
  html: string;
} {
  return {
    subject: SUPPORT_REPLY_SUBJECT,
    html: supportReplyEmailHtml(appUrl),
  };
}

// --- Support inbox notification (a user wrote into priority support) ---------
// Sent to SUPPORT_EMAIL whenever a user opens a priority ticket or replies in
// one, so the operator (supportkixxme@gmail.com) is nudged even when not in the
// app. Unlike the user-facing email, this is the operator's OWN inbox, so a
// username + short preview is fine (same trust level as supportReportEmailHtml).

export function supportNewMessageEmailHtml(opts: {
  username: string;
  ticketSubject: string;
  preview: string;
  isNew: boolean;
  appUrl?: string;
}): string {
  const { username, ticketSubject, preview, isNew, appUrl } = opts;
  const body = paragraphs([
    `<strong style="color:#f4f1fb;">${escapeHtml(username)}</strong> ${
      isNew
        ? "ha abierto un nuevo ticket de soporte prioritario."
        : "ha respondido en su ticket de soporte prioritario."
    }`,
    `Asunto: <span style="color:#f4f1fb;">${escapeHtml(ticketSubject)}</span>`,
    `Mensaje: <span style="color:#f4f1fb;">${escapeHtml(preview)}</span>`,
    "Responde desde el panel de moderaci\u00F3n de KixxMe.",
  ]);
  return renderEmail({
    preheader: `${username}: ${preview}`,
    heading: isNew
      ? "\u{1F4E9} Nuevo ticket de soporte"
      : "\u{1F4E9} Nueva respuesta de soporte",
    bodyHtml: body,
    cta: appUrl ? { label: "Abrir en KixxMe", url: appUrl } : undefined,
  });
}

export function supportNewMessageEmail(opts: {
  username: string;
  ticketSubject: string;
  preview: string;
  isNew: boolean;
  appUrl?: string;
}): { subject: string; html: string } {
  const tag = opts.isNew ? "Nuevo ticket" : "Respuesta";
  return {
    subject: `[KixxMe Soporte] ${tag}: ${opts.ticketSubject}`,
    html: supportNewMessageEmailHtml(opts),
  };
}
