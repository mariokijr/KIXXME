import { Router } from "express";
import { and, desc, eq, ilike, isNotNull, isNull, gt, or, sql } from "drizzle-orm";
import {
  db,
  supportReportsTable,
  accountFlagsTable,
  accountModerationTable,
  videoCallsTable,
  type SupportReport,
} from "@workspace/db";
import { requireAdmin } from "../lib/auth.js";
import { supabase } from "../lib/supabase.js";
import { isOnline } from "../lib/geo.js";
import { removePhotoRow } from "../lib/photos.js";
import {
  getModerationState,
  suspendUser,
  banUser,
  liftModeration,
} from "../lib/moderation.js";
import {
  ResolveAdminReportBody,
  ReviewAdminFlagBody,
  SuspendUserBody,
  BanUserBody,
  ReviewAdminVerificationBody,
} from "@workspace/api-zod";
import {
  countPendingVerifications,
  listPendingVerificationRows,
  reviewVerification,
} from "../lib/verification.js";

const router = Router();

/**
 * Admin moderation dashboard API. Every endpoint is gated by `requireAdmin`
 * (email on the ADMIN_EMAILS allowlist). Reports + flags live in the repo-owned
 * Replit Postgres; reporter/target profile data, messages and photos live in
 * Supabase and are joined in application code (no cross-DB foreign keys).
 */

const PUBLIC_COLUMNS =
  "id, username, bio, avatar_url, age, city, gender, location, created_at, last_active_at, is_verified, plan";

function normalizePlan(plan: unknown): "free" | "plus" | "gold" {
  return plan === "plus" || plan === "gold" ? plan : "free";
}

interface ProfileRow {
  id: string;
  username: string;
  bio: string | null;
  avatar_url: string | null;
  age: number | null;
  city: string | null;
  gender: string | null;
  location: string | null;
  created_at?: string;
  last_active_at: string | null;
  is_verified: boolean | null;
  plan: string | null;
}

function buildPublicProfile(row: ProfileRow) {
  return {
    id: row.id,
    username: row.username,
    bio: row.bio,
    age: row.age,
    city: row.city,
    gender: row.gender,
    location: row.location,
    avatar_url: row.avatar_url,
    distance_km: null,
    is_online: isOnline(row.last_active_at),
    is_verified: Boolean(row.is_verified),
    plan: normalizePlan(row.plan),
    created_at: row.created_at,
  };
}

/** Map a set of Supabase user ids → username (one round-trip). */
async function usernameMap(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;
  const { data } = await supabase
    .from("profiles")
    .select("id, username")
    .in("id", unique);
  for (const r of data ?? []) {
    map.set(r.id as string, r.username as string);
  }
  return map;
}

function mapReportRow(row: SupportReport, names: Map<string, string>) {
  return {
    id: row.id,
    reporterId: row.reporterId,
    reporterUsername: names.get(row.reporterId) ?? null,
    targetUserId: row.targetUserId,
    targetUsername: row.targetUserId
      ? names.get(row.targetUserId) ?? null
      : null,
    category: row.category,
    reportType: row.reportType,
    targetType: row.targetType,
    subject: row.subject,
    message: row.message,
    status: row.status,
    actionTaken: row.actionTaken,
    createdAt: row.createdAt.toISOString(),
  };
}

// --- Summary ---------------------------------------------------------------

router.get("/admin/summary", async (req, res) => {
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const now = new Date();
  const [openReports, openFlags, suspended, banned, pendingVerifications] =
    await Promise.all([
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(supportReportsTable)
        .where(
          and(
            isNotNull(supportReportsTable.reportType),
            eq(supportReportsTable.status, "open"),
          ),
        ),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(accountFlagsTable)
        .where(eq(accountFlagsTable.status, "open")),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(accountModerationTable)
        .where(
          and(
            eq(accountModerationTable.state, "suspended"),
            or(
              isNull(accountModerationTable.suspendedUntil),
              gt(accountModerationTable.suspendedUntil, now),
            ),
          ),
        ),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(accountModerationTable)
        .where(eq(accountModerationTable.state, "banned")),
      countPendingVerifications(),
    ]);

  res.json({
    openReports: openReports[0]?.c ?? 0,
    openFlags: openFlags[0]?.c ?? 0,
    suspended: suspended[0]?.c ?? 0,
    banned: banned[0]?.c ?? 0,
    pendingVerifications,
  });
});

// --- Verification queue ----------------------------------------------------

const PLAN_RANK: Record<"free" | "plus" | "gold", number> = {
  gold: 2,
  plus: 1,
  free: 0,
};

interface VerificationProfileRow {
  id: string;
  username: string | null;
  avatar_url: string | null;
  age: number | null;
  city: string | null;
  bio: string | null;
  is_verified: boolean | null;
  plan: string | null;
}

router.get("/admin/verifications", async (req, res) => {
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const rows = await listPendingVerificationRows();
  const ids = rows.map((r) => r.userId);

  const profileMap = new Map<string, VerificationProfileRow>();
  const photosMap = new Map<string, unknown[]>();
  if (ids.length > 0) {
    const [{ data: profiles }, { data: photos }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, username, avatar_url, age, city, bio, is_verified, plan")
        .in("id", ids),
      supabase
        .from("profile_photos")
        .select("*")
        .in("user_id", ids)
        .order("position", { ascending: true }),
    ]);
    for (const p of (profiles ?? []) as VerificationProfileRow[]) {
      profileMap.set(p.id, p);
    }
    for (const ph of photos ?? []) {
      const userId = (ph as { user_id: string }).user_id;
      const list = photosMap.get(userId) ?? [];
      list.push(ph);
      photosMap.set(userId, list);
    }
  }

  const verifications = rows.map((r) => {
    const p = profileMap.get(r.userId);
    return {
      id: r.id,
      userId: r.userId,
      username: p?.username ?? null,
      avatar_url: p?.avatar_url ?? null,
      age: p?.age ?? null,
      city: p?.city ?? null,
      bio: p?.bio ?? null,
      plan: normalizePlan(p?.plan ?? null),
      is_verified: Boolean(p?.is_verified),
      photos: photosMap.get(r.userId) ?? [],
      createdAt: r.createdAt.toISOString(),
    };
  });

  // Paid tiers first, then oldest pending requests first (longest waiting).
  verifications.sort((a, b) => {
    const rank = PLAN_RANK[b.plan] - PLAN_RANK[a.plan];
    if (rank !== 0) return rank;
    return (
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  });

  res.json({ verifications, total: verifications.length });
});

router.post("/admin/verifications/:id/review", async (req, res) => {
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const parsed = ReviewAdminVerificationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos no válidos" });
    return;
  }
  const { decision, note } = parsed.data;

  const result = await reviewVerification(
    req.params.id,
    decision,
    auth.userId,
    note ?? null,
  );
  if (result === "not_found") {
    res.status(404).json({ error: "Solicitud no encontrada" });
    return;
  }
  if (result === "not_pending") {
    res.status(409).json({ error: "La solicitud ya fue revisada" });
    return;
  }
  res.json({ success: true });
});

// --- Reports list ----------------------------------------------------------

router.get("/admin/reports", async (req, res) => {
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const reportType =
    typeof req.query.reportType === "string" ? req.query.reportType : undefined;
  const targetType =
    typeof req.query.targetType === "string" ? req.query.targetType : undefined;
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const limit = Math.min(
    Math.max(Number(req.query.limit) || 50, 1),
    100,
  );
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const conditions = [isNotNull(supportReportsTable.reportType)];
  if (status) conditions.push(eq(supportReportsTable.status, status));
  if (reportType) conditions.push(eq(supportReportsTable.reportType, reportType));
  if (targetType) conditions.push(eq(supportReportsTable.targetType, targetType));
  if (q) conditions.push(ilike(supportReportsTable.message, `%${q}%`));
  const where = and(...conditions);

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(supportReportsTable)
      .where(where)
      .orderBy(desc(supportReportsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(supportReportsTable)
      .where(where),
  ]);

  const names = await usernameMap(
    rows.flatMap((r) => [r.reporterId, r.targetUserId ?? ""]),
  );

  res.json({
    reports: rows.map((r) => mapReportRow(r, names)),
    total: totalRows[0]?.c ?? 0,
  });
});

// --- Report detail ---------------------------------------------------------

router.get("/admin/reports/:id", async (req, res) => {
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const [report] = await db
    .select()
    .from(supportReportsTable)
    .where(eq(supportReportsTable.id, req.params.id))
    .limit(1);

  if (!report || !report.reportType) {
    res.status(404).json({ error: "Reporte no encontrado" });
    return;
  }

  const ids = [report.reporterId, report.targetUserId ?? ""].filter(Boolean);
  const { data: profiles } = await supabase
    .from("profiles")
    .select(PUBLIC_COLUMNS)
    .in("id", ids);

  const byId = new Map<string, ProfileRow>();
  for (const p of (profiles ?? []) as ProfileRow[]) byId.set(p.id, p);
  const names = await usernameMap(ids);

  const reporterRow = byId.get(report.reporterId);
  const targetRow = report.targetUserId ? byId.get(report.targetUserId) : null;

  // Target moderation state + how many open reports target has.
  const [targetMod, targetReportRows] = await Promise.all([
    report.targetUserId
      ? getModerationState(report.targetUserId)
      : Promise.resolve({ state: "active" as const, suspendedUntil: null, reason: null }),
    report.targetUserId
      ? db
          .select({ c: sql<number>`count(*)::int` })
          .from(supportReportsTable)
          .where(
            and(
              eq(supportReportsTable.targetUserId, report.targetUserId),
              isNotNull(supportReportsTable.reportType),
              eq(supportReportsTable.status, "open"),
            ),
          )
      : Promise.resolve([{ c: 0 }]),
  ]);

  // Reported message + a little surrounding conversation context.
  let reportedMessage = null;
  let messageContext: unknown[] = [];
  if (report.targetMessageId) {
    const { data: msg } = await supabase
      .from("messages")
      .select(
        "id, conversation_id, sender_id, content, image_url, created_at, read_at, deleted_at",
      )
      .eq("id", report.targetMessageId)
      .maybeSingle();
    reportedMessage = msg ?? null;
  }
  if (report.targetConversationId) {
    const { data: ctx } = await supabase
      .from("messages")
      .select(
        "id, conversation_id, sender_id, content, image_url, created_at, read_at, deleted_at",
      )
      .eq("conversation_id", report.targetConversationId)
      .order("created_at", { ascending: false })
      .limit(20);
    messageContext = (ctx ?? []).slice().reverse();
  }

  // Reported video call.
  let call = null;
  if (report.targetCallId) {
    const [c] = await db
      .select()
      .from(videoCallsTable)
      .where(eq(videoCallsTable.id, report.targetCallId))
      .limit(1);
    if (c) {
      call = {
        id: c.id,
        callerId: c.callerId,
        calleeId: c.calleeId,
        status: c.status,
        createdAt: c.createdAt.toISOString(),
        endedAt: c.endedAt ? c.endedAt.toISOString() : null,
      };
    }
  }

  // Target's photos (so an admin can see what was reported / remove a photo).
  let targetPhotos: unknown[] = [];
  if (report.targetUserId) {
    const { data: photos } = await supabase
      .from("profile_photos")
      .select("id, user_id, url, storage_path, is_avatar, position, created_at")
      .eq("user_id", report.targetUserId)
      .order("position", { ascending: true });
    targetPhotos = photos ?? [];
  }

  res.json({
    report: mapReportRow(report, names),
    reporter: reporterRow ? buildPublicProfile(reporterRow) : null,
    target: targetRow ? buildPublicProfile(targetRow) : null,
    targetState: targetMod.state,
    targetSuspendedUntil: targetMod.suspendedUntil
      ? targetMod.suspendedUntil.toISOString()
      : null,
    targetReportCount: targetReportRows[0]?.c ?? 0,
    reportedMessage,
    messageContext,
    call,
    targetPhotos,
  });
});

// --- Resolve / triage ------------------------------------------------------

router.post("/admin/reports/:id/resolve", async (req, res) => {
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const parsed = ResolveAdminReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos no válidos" });
    return;
  }
  const { status, note, action } = parsed.data;

  const [report] = await db
    .select()
    .from(supportReportsTable)
    .where(eq(supportReportsTable.id, req.params.id))
    .limit(1);
  if (!report || !report.reportType) {
    res.status(404).json({ error: "Reporte no encontrado" });
    return;
  }

  // Apply the optional moderation side-effect first so the recorded actionTaken
  // reflects something that actually happened.
  if (action && action !== "none" && action !== "dismiss") {
    if (action === "remove_photo") {
      if (report.targetPhotoId) {
        const { data: photo } = await supabase
          .from("profile_photos")
          .select("id, user_id, storage_path, is_avatar")
          .eq("id", report.targetPhotoId)
          .maybeSingle();
        if (photo) await removePhotoRow(photo);
      }
    } else if (report.targetUserId) {
      if (action === "suspend") {
        await suspendUser(report.targetUserId, {
          reason: note ?? null,
          actedBy: auth.userId,
        });
      } else if (action === "ban") {
        await banUser(report.targetUserId, {
          reason: note ?? null,
          actedBy: auth.userId,
        });
      }
    }
  }

  await db
    .update(supportReportsTable)
    .set({
      status,
      resolutionNote: note ?? null,
      actionTaken: action ?? null,
      resolvedBy: auth.userId,
      resolvedAt: new Date(),
    })
    .where(eq(supportReportsTable.id, report.id));

  res.json({ success: true });
});

// --- Flags -----------------------------------------------------------------

router.get("/admin/flags", async (req, res) => {
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const status =
    typeof req.query.status === "string" ? req.query.status : "open";
  const where = eq(accountFlagsTable.status, status);

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(accountFlagsTable)
      .where(where)
      .orderBy(desc(accountFlagsTable.updatedAt))
      .limit(100),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(accountFlagsTable)
      .where(where),
  ]);

  const names = await usernameMap(rows.map((r) => r.userId));

  res.json({
    flags: rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      username: names.get(r.userId) ?? null,
      reason: r.reason,
      detail: r.detail,
      count: r.count,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })),
    total: totalRows[0]?.c ?? 0,
  });
});

router.post("/admin/flags/:id/review", async (req, res) => {
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const parsed = ReviewAdminFlagBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos no válidos" });
    return;
  }

  await db
    .update(accountFlagsTable)
    .set({ status: parsed.data.status, updatedAt: new Date() })
    .where(eq(accountFlagsTable.id, req.params.id));

  res.json({ success: true });
});

// --- User moderation actions ----------------------------------------------

router.post("/admin/users/:userId/suspend", async (req, res) => {
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const parsed = SuspendUserBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Datos no válidos" });
    return;
  }
  if (req.params.userId === auth.userId) {
    res.status(400).json({ error: "No puedes moderar tu propia cuenta" });
    return;
  }

  await suspendUser(req.params.userId, {
    durationDays: parsed.data.durationDays ?? null,
    reason: parsed.data.reason ?? null,
    actedBy: auth.userId,
  });
  res.json({ success: true });
});

router.post("/admin/users/:userId/ban", async (req, res) => {
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const parsed = BanUserBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Datos no válidos" });
    return;
  }
  if (req.params.userId === auth.userId) {
    res.status(400).json({ error: "No puedes moderar tu propia cuenta" });
    return;
  }

  await banUser(req.params.userId, {
    reason: parsed.data.reason ?? null,
    actedBy: auth.userId,
  });
  res.json({ success: true });
});

router.post("/admin/users/:userId/lift", async (req, res) => {
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  await liftModeration(req.params.userId, auth.userId);
  res.json({ success: true });
});

// --- Remove a reported photo ----------------------------------------------

router.delete("/admin/photos/:photoId", async (req, res) => {
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const { data: photo } = await supabase
    .from("profile_photos")
    .select("id, user_id, storage_path, is_avatar")
    .eq("id", req.params.photoId)
    .maybeSingle();

  if (!photo) {
    res.status(404).json({ error: "Foto no encontrada" });
    return;
  }

  await removePhotoRow(photo);
  res.json({ success: true });
});

export default router;
