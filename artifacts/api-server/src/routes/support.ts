import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { db, supportReportsTable } from "@workspace/db";
import {
  sendEmail,
  SUPPORT_EMAIL,
  supportReportEmailHtml,
} from "../lib/email.js";

const router = Router();

const CATEGORIES = new Set([
  "contact",
  "chat",
  "profile",
  "settings",
  "general",
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A valid address can't contain whitespace (incl. CR/LF), so this also rejects
// header-injection payloads aimed at the outbound Reply-To header.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Strip CR/LF (and other control chars) so a user-supplied subject can never
// inject extra headers when it is later placed in the outbound Subject line.
function singleLine(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F]+/g, " ").trim();
}

router.post("/support/reports", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { category, targetUserId, subject, message, contactEmail } = (req.body ??
    {}) as {
    category?: unknown;
    targetUserId?: unknown;
    subject?: unknown;
    message?: unknown;
    contactEmail?: unknown;
  };

  if (typeof category !== "string" || !CATEGORIES.has(category)) {
    res.status(400).json({ error: "Categoría no válida" });
    return;
  }
  if (typeof message !== "string" || message.trim().length === 0) {
    res.status(400).json({ error: "El mensaje es obligatorio" });
    return;
  }
  if (message.length > 5000) {
    res.status(400).json({ error: "El mensaje es demasiado largo" });
    return;
  }
  if (subject !== undefined && subject !== null && typeof subject !== "string") {
    res.status(400).json({ error: "Asunto no válido" });
    return;
  }
  if (
    targetUserId !== undefined &&
    targetUserId !== null &&
    targetUserId !== "" &&
    (typeof targetUserId !== "string" || !UUID_RE.test(targetUserId))
  ) {
    res.status(400).json({ error: "Usuario no válido" });
    return;
  }
  if (contactEmail !== undefined && contactEmail !== null && contactEmail !== "") {
    const trimmedEmail =
      typeof contactEmail === "string" ? contactEmail.trim() : "";
    if (
      typeof contactEmail !== "string" ||
      trimmedEmail.length > 320 ||
      !EMAIL_RE.test(trimmedEmail)
    ) {
      res.status(400).json({ error: "Email no válido" });
      return;
    }
  }

  try {
    const [row] = await db
      .insert(supportReportsTable)
      .values({
        reporterId: auth.userId,
        category,
        targetUserId:
          typeof targetUserId === "string" && targetUserId.length > 0
            ? targetUserId
            : null,
        subject:
          typeof subject === "string" && singleLine(subject).length > 0
            ? singleLine(subject).slice(0, 200)
            : null,
        message: message.trim(),
        contactEmail:
          typeof contactEmail === "string" && contactEmail.trim().length > 0
            ? contactEmail.trim()
            : null,
      })
      .returning();

    if (!row) {
      res.status(500).json({ error: "No se pudo guardar el reporte" });
      return;
    }

    // Notify the support inbox. Fire-and-forget: the report is already saved,
    // so an email problem must never fail the request. sendEmail never throws.
    void sendEmail({
      to: SUPPORT_EMAIL,
      subject: `[KixxMe] ${row.category}${row.subject ? `: ${row.subject}` : ""}`,
      html: supportReportEmailHtml({
        id: row.id,
        category: row.category,
        reporterId: row.reporterId,
        targetUserId: row.targetUserId,
        subject: row.subject,
        message: row.message,
        contactEmail: row.contactEmail,
        createdAt: row.createdAt,
      }),
      replyTo: row.contactEmail ?? undefined,
    });

    res.status(201).json({
      id: row.id,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    });
  } catch (error) {
    req.log.error(
      { error: error instanceof Error ? error.message : String(error) },
      "support report: failed to save",
    );
    res.status(500).json({ error: "No se pudo guardar el reporte" });
  }
});

export default router;
