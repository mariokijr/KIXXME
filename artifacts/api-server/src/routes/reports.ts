import { Router } from "express";
import { requireAuth, isAdminEmail } from "../lib/auth.js";
import { db, supportReportsTable } from "@workspace/db";
import {
  sendEmail,
  SUPPORT_EMAIL,
  supportReportEmailHtml,
} from "../lib/email.js";
import { getModerationState, maybeAutoFlagOnReport } from "../lib/moderation.js";
import { CreateReportBody, GetMyModerationResponse } from "@workspace/api-zod";

const router = Router();

/**
 * File a user-to-user moderation report (a profile, photo, message, video call,
 * or Live user). Stored in the shared `support_reports` table with `reportType`
 * set — that is what distinguishes a moderation report from a support request
 * and what the admin dashboard triages. Saving the row is the source of truth;
 * the support-inbox email and the auto-flag check are fire-and-forget so they
 * can never fail the request.
 */
router.post("/reports", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const parsed = CreateReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Reporte no válido" });
    return;
  }
  const body = parsed.data;

  if (body.targetUserId === auth.userId) {
    res.status(400).json({ error: "No puedes reportarte a ti mismo" });
    return;
  }

  try {
    const [row] = await db
      .insert(supportReportsTable)
      .values({
        reporterId: auth.userId,
        category: "report",
        targetUserId: body.targetUserId,
        reportType: body.reportType,
        targetType: body.targetType,
        targetMessageId: body.targetMessageId ?? null,
        targetConversationId: body.targetConversationId ?? null,
        targetCallId: body.targetCallId ?? null,
        targetPhotoId: body.targetPhotoId ?? null,
        message: body.message?.trim() || "(sin detalle)",
      })
      .returning();

    if (!row) {
      res.status(500).json({ error: "No se pudo guardar el reporte" });
      return;
    }

    // Notify the support inbox. Fire-and-forget — the report is already saved.
    void sendEmail({
      to: SUPPORT_EMAIL,
      subject: `[KixxMe] Reporte: ${row.reportType ?? "other"}`,
      html: supportReportEmailHtml({
        id: row.id,
        category: `${row.category} · ${row.reportType ?? "other"} · ${row.targetType ?? ""}`,
        reporterId: row.reporterId,
        targetUserId: row.targetUserId,
        subject: row.subject,
        message: row.message,
        contactEmail: row.contactEmail,
        createdAt: row.createdAt,
      }),
    });

    // Raise a review flag if this user has now crossed the report threshold.
    void maybeAutoFlagOnReport(body.targetUserId);

    res.status(201).json({
      id: row.id,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    });
  } catch (error) {
    req.log.error(
      { error: error instanceof Error ? error.message : String(error) },
      "report: failed to save",
    );
    res.status(500).json({ error: "No se pudo guardar el reporte" });
  }
});

/**
 * The current user's own moderation state plus whether they are an admin. This
 * endpoint is intentionally exempt from the moderation gate (`allowModerated`)
 * so a suspended/banned user can still load the Spanish "your account is
 * suspended/banned" screen instead of being bounced with a bare 403.
 */
router.get("/me/moderation", async (req, res) => {
  const auth = await requireAuth(req, res, { allowModerated: true });
  if (!auth) return;

  const mod = await getModerationState(auth.userId);
  const payload = {
    state: mod.state,
    suspendedUntil: mod.suspendedUntil ? mod.suspendedUntil.toISOString() : null,
    reason: mod.reason,
    isAdmin: isAdminEmail(auth.email),
  };
  res.json(GetMyModerationResponse.parse(payload));
});

export default router;
