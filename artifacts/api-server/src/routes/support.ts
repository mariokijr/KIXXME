import { Router } from "express";
import { requireAuth, isOperatorEmail } from "../lib/auth.js";
import { db, supportReportsTable } from "@workspace/db";
import {
  sendEmail,
  appBaseUrl,
  SUPPORT_EMAIL,
  supportReportEmailHtml,
  supportTicketOpenedEmail,
} from "../lib/email.js";
import { hasGold } from "../lib/entitlement.js";
import {
  listMine,
  createTicket,
  getTicketDetail,
  postMessage,
  ensureOfficialTicket,
  getTicketGate,
} from "../lib/support-tickets.js";
import {
  notifySupportReplyByEmail,
  notifySupportNewMessageByEmail,
} from "../lib/support-notifications.js";
import {
  decodeMedia,
  uploadSupportObject,
  supportMediaPath,
} from "../lib/chat-media.js";

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

// The official "👑 Soporte KixxMe" welcome conversation. Gold-only and gated by
// server-side entitlement (hasGold also covers GOLD_TEST_EMAILS, whose
// profiles.plan stays 'free'), so we never trust the client's plan. Lazily
// ensures the thread exists, then returns it WITHOUT marking it read (the chats
// list polls this). The pinned card is tied to ACTIVE Gold: when Gold lapses
// (or was never held) we return { ticket: null } so the card disappears from
// Mensajes. Re-granting Gold re-shows the SAME thread (ensureOfficialTicket is
// idempotent, so the history is intact). Any existing official thread also
// stays readable (read-only) from the Soporte page via GET /support/tickets.
router.get("/support/official", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  // Only ACTIVE Gold sees the pinned official chat. Lapsed/never-Gold users get
  // { ticket: null } → the Mensajes card is hidden (history is preserved and
  // reappears on re-grant; it also remains visible read-only on the Soporte
  // page's ticket list, which is intentional).
  if (!(await hasGold(auth.userId))) {
    res.json({ ticket: null });
    return;
  }
  try {
    const ticket = await ensureOfficialTicket(auth.userId);
    res.json({ ticket });
  } catch (error) {
    req.log.error(
      { error: error instanceof Error ? error.message : String(error) },
      "support official: failed to ensure ticket",
    );
    res.status(500).json({ error: "No se pudo abrir el chat de soporte" });
  }
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
    // Nudge the support inbox (operator's own inbox) — fire-and-forget.
    void notifySupportNewMessageByEmail(
      auth.userId,
      detail.ticket.subject,
      message.trim(),
      true,
    );
    // Ack the user that we received their ticket (always-on; they're Gold here).
    if (auth.email) {
      const base = appBaseUrl();
      const t = supportTicketOpenedEmail({
        isGold: true,
        appUrl: base ? `${base}/support` : undefined,
      });
      void sendEmail({ to: auth.email, subject: t.subject, html: t.html });
    }
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
    isOperatorEmail(auth.email),
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
  const { body, imageUrl, audioUrl, audioDuration } = (req.body ?? {}) as {
    body?: unknown;
    imageUrl?: unknown;
    audioUrl?: unknown;
    audioDuration?: unknown;
  };

  const text = typeof body === "string" ? body.trim() : "";
  const image =
    typeof imageUrl === "string" && imageUrl.length > 0 ? imageUrl : null;
  const audio =
    typeof audioUrl === "string" && audioUrl.length > 0 ? audioUrl : null;

  // At least one of body / image / audio must be present.
  if (!text && !image && !audio) {
    res.status(400).json({ error: "El mensaje es obligatorio" });
    return;
  }
  if (text.length > MAX_BODY) {
    res.status(400).json({ error: "El mensaje es demasiado largo" });
    return;
  }

  const isAdmin = isOperatorEmail(auth.email);

  // Gold gate on SENDING into a premium ticket. The owner of an "official" or
  // self-opened ticket must be Gold to post a new message (lapsed-Gold keeps
  // read-only history); admins always reply, and admin-initiated outreach
  // (kind='support') stays free-answerable. The gate fields are immutable, so
  // this pre-read can't race postMessage's own re-authorization.
  const gate = await getTicketGate(id);
  if (!gate) {
    res.status(404).json({ error: "Ticket no encontrado" });
    return;
  }
  const isOwner = gate.userId === auth.userId;
  if (!isOwner && !isAdmin) {
    res.status(404).json({ error: "Ticket no encontrado" });
    return;
  }
  const isPremiumTicket =
    gate.kind === "official" || gate.openedByRole === "user";
  if (isOwner && !isAdmin && isPremiumTicket && !(await hasGold(auth.userId))) {
    res.status(402).json({
      error: "El chat de soporte prioritario es exclusivo de KixxMe Gold",
      code: "gold_required",
    });
    return;
  }

  try {
    const detail = await postMessage(id, auth.userId, isAdmin, {
      body: text || null,
      imageUrl: image,
      audioUrl: audio,
      audioDuration: typeof audioDuration === "number" ? audioDuration : null,
    });
    if (!detail) {
      res.status(404).json({ error: "Ticket no encontrado" });
      return;
    }
    if (detail.ticket.userId !== auth.userId) {
      // An admin reply (sender is not the owner) nudges the owner by email —
      // fire-and-forget; user-facing copy carries no sensitive info.
      void notifySupportReplyByEmail(detail.ticket.userId);
    } else if (!isAdmin) {
      // The user wrote in their own ticket → nudge the support inbox. For an
      // attachment-only message use an emoji label as the preview line.
      const preview = text || (image ? "📷 Foto" : "🎤 Nota de voz");
      void notifySupportNewMessageByEmail(
        auth.userId,
        detail.ticket.subject,
        preview,
        false,
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

// Upload a photo or voice note for a support-ticket message. Returns a public
// URL the client then attaches to POST /support/tickets/:id/messages. Runs the
// SAME authorization + Gold gate as posting a message, so a non-participant or a
// non-Gold owner of a premium ticket can never dump files into storage.
router.post("/support/tickets/:id/attachments", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const id = req.params.id;
  if (!UUID_RE.test(id)) {
    res.status(404).json({ error: "Ticket no encontrado" });
    return;
  }

  const isAdmin = isOperatorEmail(auth.email);
  const gate = await getTicketGate(id);
  if (!gate) {
    res.status(404).json({ error: "Ticket no encontrado" });
    return;
  }
  const isOwner = gate.userId === auth.userId;
  if (!isOwner && !isAdmin) {
    res.status(404).json({ error: "Ticket no encontrado" });
    return;
  }
  const isPremiumTicket =
    gate.kind === "official" || gate.openedByRole === "user";
  if (isOwner && !isAdmin && isPremiumTicket && !(await hasGold(auth.userId))) {
    res.status(402).json({
      error: "El chat de soporte prioritario es exclusivo de KixxMe Gold",
      code: "gold_required",
    });
    return;
  }

  const { base64, mime_type } = req.body as {
    base64?: string;
    mime_type?: string;
  };
  if (!base64 || !mime_type) {
    res.status(400).json({ error: "base64 and mime_type are required" });
    return;
  }

  const decoded = decodeMedia(base64, mime_type);
  if (!decoded.ok) {
    res.status(400).json({ error: decoded.error });
    return;
  }

  try {
    const url = await uploadSupportObject(
      supportMediaPath(auth.userId, id, decoded.value),
      decoded.value,
    );
    res.status(201).json({ url });
  } catch (error) {
    req.log.error(
      { error: error instanceof Error ? error.message : String(error) },
      "support attachment upload: error",
    );
    res.status(400).json({ error: "No se pudo subir el archivo" });
  }
});

export default router;
