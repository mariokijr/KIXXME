import { Router } from "express";
import { requireAuth, isAdminEmail } from "../lib/auth.js";
import { db, supportReportsTable } from "@workspace/db";
import {
  sendEmail,
  SUPPORT_EMAIL,
  supportReportEmailHtml,
} from "../lib/email.js";
import { hasGold } from "../lib/entitlement.js";
import {
  listMine,
  createTicket,
  getTicketDetail,
  postMessage,
} from "../lib/support-tickets.js";
import { notifySupportReplyByEmail } from "../lib/support-notifications.js";

const router = Router();

const MAX_SUBJECT = 200;
const MAX_BODY = 5000;

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

// ---------------------------------------------------------------------------
// Priority support chat ("Soporte Premium Gold"). Threaded admin↔user tickets.
// OPENING from the user side is Gold-only; replying needs only ownership (so an
// admin-initiated ticket to a free user can still be answered). Admins act on
// any ticket. All status transitions live in lib/support-tickets.ts; routes
// never set status. GET detail + POST messages are SHARED by users and admins.
// ---------------------------------------------------------------------------

router.get("/support/tickets", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const list = await listMine(auth.userId);
  res.json(list);
});

router.post("/support/tickets", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { subject, message } = (req.body ?? {}) as {
    subject?: unknown;
    message?: unknown;
  };
  if (typeof subject !== "string" || singleLine(subject).length === 0) {
    res.status(400).json({ error: "El asunto es obligatorio" });
    return;
  }
  if (typeof message !== "string" || message.trim().length === 0) {
    res.status(400).json({ error: "El mensaje es obligatorio" });
    return;
  }
  if (message.length > MAX_BODY) {
    res.status(400).json({ error: "El mensaje es demasiado largo" });
    return;
  }

  // Gold-only to OPEN a ticket from the user side. Replying to an existing
  // ticket (including admin-initiated ones) only requires ownership.
  if (!(await hasGold(auth.userId))) {
    res.status(402).json({
      error: "El chat de soporte prioritario es exclusivo de KixxMe Gold",
      code: "gold_required",
    });
    return;
  }

  try {
    const detail = await createTicket(
      auth.userId,
      singleLine(subject).slice(0, MAX_SUBJECT),
      message.trim(),
    );
    res.status(201).json(detail);
  } catch (error) {
    req.log.error(
      { error: error instanceof Error ? error.message : String(error) },
      "support ticket: failed to open",
    );
    res.status(500).json({ error: "No se pudo abrir el ticket" });
  }
});

router.get("/support/tickets/:id", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const id = req.params.id;
  if (!UUID_RE.test(id)) {
    res.status(404).json({ error: "Ticket no encontrado" });
    return;
  }
  const detail = await getTicketDetail(
    id,
    auth.userId,
    isAdminEmail(auth.email),
  );
  if (!detail) {
    res.status(404).json({ error: "Ticket no encontrado" });
    return;
  }
  res.json(detail);
});

router.post("/support/tickets/:id/messages", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const id = req.params.id;
  if (!UUID_RE.test(id)) {
    res.status(404).json({ error: "Ticket no encontrado" });
    return;
  }
  const { body } = (req.body ?? {}) as { body?: unknown };
  if (typeof body !== "string" || body.trim().length === 0) {
    res.status(400).json({ error: "El mensaje es obligatorio" });
    return;
  }
  if (body.length > MAX_BODY) {
    res.status(400).json({ error: "El mensaje es demasiado largo" });
    return;
  }

  const isAdmin = isAdminEmail(auth.email);
  try {
    const detail = await postMessage(id, auth.userId, isAdmin, body.trim());
    if (!detail) {
      res.status(404).json({ error: "Ticket no encontrado" });
      return;
    }
    // An admin reply (the sender is not the ticket owner) nudges the owner by
    // email — fire-and-forget; never fails the request.
    if (detail.ticket.userId !== auth.userId) {
      void notifySupportReplyByEmail(
        detail.ticket.userId,
        detail.ticket.subject,
      );
    }
    res.status(201).json(detail);
  } catch (error) {
    req.log.error(
      { error: error instanceof Error ? error.message : String(error) },
      "support ticket: failed to post message",
    );
    res.status(500).json({ error: "No se pudo enviar el mensaje" });
  }
});

export default router;
