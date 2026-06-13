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
import { requireAdmin, requireOperator } from "../lib/auth.js";
import { supabase } from "../lib/supabase.js";
import { getSystemAccountIds } from "../lib/system-accounts.js";
import { isOnline } from "../lib/geo.js";
import { removePhotoRow } from "../lib/photos.js";
import {
  getModerationState,
  getModerationStatesForUsers,
  getModeratedIds,
  getUserIdsInState,
  listModerationHistory,
  recordModerationAction,
  suspendUser,
  banUser,
  liftModeration,
  removeUser,
  restoreUser,
  warnUser,
} from "../lib/moderation.js";
import {
  notifyWarningByEmail,
  notifySuspensionByEmail,
  notifyBanByEmail,
  notifyRemovalByEmail,
  notifyRestoreByEmail,
} from "../lib/moderation-notifications.js";
import {
  getProfileDetailsForUsers,
  markEmailVerified,
  getEmailVerifiedAt,
} from "../lib/profile-details.js";
import {
  ResolveAdminReportBody,
  ReviewAdminFlagBody,
  SuspendUserBody,
  BanUserBody,
  WarnUserBody,
  RemoveUserBody,
  ReviewAdminVerificationBody,
  AdminCreateTicketBody,
  SetAdminTicketStatusBody,
} from "@workspace/api-zod";
import {
  countPendingVerifications,
  listPendingVerificationRows,
  reviewVerification,
  signSelfieUrl,
} from "../lib/verification.js";
import {
  listAdmin as listAdminTickets,
  adminCreateTicket,
  setTicketStatus,
  adminTicketStats,
  profileExists,
  getCanonicalThreadForUser,
  startThreadForUser,
} from "../lib/support-tickets.js";
import {
  notifySupportReplyByEmail,
  notifySupportTicketClosedByEmail,
  notifyReportResolvedByEmail,
} from "../lib/support-notifications.js";
import type { SupportTicketStatus } from "@workspace/db";

const router = Router();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  const [
    openReports,
    openFlags,
    suspended,
    banned,
    removed,
    pendingVerifications,
    ticketStats,
  ] = await Promise.all([
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
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(accountModerationTable)
      .where(eq(accountModerationTable.state, "removed")),
    countPendingVerifications(),
    adminTicketStats(),
  ]);

  res.json({
    openReports: openReports[0]?.c ?? 0,
    openFlags: openFlags[0]?.c ?? 0,
    suspended: suspended[0]?.c ?? 0,
    banned: banned[0]?.c ?? 0,
    removed: removed[0]?.c ?? 0,
    pendingVerifications,
    openTickets: ticketStats.openTickets,
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

  const verifications = await Promise.all(
    rows.map(async (r) => {
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
        // Short-lived signed URL to the private selfie (null for legacy rows).
        selfie_url: await signSelfieUrl(r.selfiePath),
        createdAt: r.createdAt.toISOString(),
      };
    }),
  );

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
        if (photo) {
          await removePhotoRow(photo);
          await recordModerationAction(photo.user_id as string, "remove_photo", {
            actedBy: auth.userId,
            reason: note ?? null,
          });
        }
      }
    } else if (report.targetUserId && report.targetUserId !== auth.userId) {
      if (action === "suspend") {
        await suspendUser(report.targetUserId, {
          reason: note ?? null,
          actedBy: auth.userId,
        });
        void notifySuspensionByEmail(report.targetUserId, note ?? null, null);
      } else if (action === "ban") {
        await banUser(report.targetUserId, {
          reason: note ?? null,
          actedBy: auth.userId,
        });
        void notifyBanByEmail(report.targetUserId, note ?? null);
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

  // Ack the reporter that their report was reviewed (privacy-safe; always-on).
  void notifyReportResolvedByEmail(report.reporterId, report.id);

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

// --- User directory (list + detail) ---------------------------------------

interface AdminUserProfileRow {
  id: string;
  username: string | null;
  avatar_url: string | null;
  age: number | null;
  city: string | null;
  bio: string | null;
  is_verified: boolean | null;
  plan: string | null;
  last_active_at: string | null;
  created_at: string | null;
}

router.get("/admin/users", async (req, res) => {
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  // PostgREST .or() uses ',' '(' ')' as its grammar; strip them from the search
  // term so it can never break or inject into the filter expression.
  const safeQ = q.replace(/[,()]/g, " ").trim();
  const plan = typeof req.query.plan === "string" ? req.query.plan : undefined;
  const status =
    typeof req.query.status === "string" ? req.query.status : undefined;
  const statusFilter =
    status === "active" ||
    status === "suspended" ||
    status === "banned" ||
    status === "removed"
      ? status
      : undefined;
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  // Moderation state lives in Replit Postgres, not a Supabase column. Resolve
  // the relevant id set up front and constrain the Supabase query with it, so
  // both pagination and `total` stay correct (the moderated set is small).
  let restrictIds: string[] | null = null; // only these ids
  let excludeIds: string[] | null = null; // all but these ids
  if (statusFilter && statusFilter !== "active") {
    restrictIds = await getUserIdsInState(statusFilter);
    if (restrictIds.length === 0) {
      res.json({ users: [], total: 0 });
      return;
    }
  } else if (statusFilter === "active") {
    excludeIds = [...(await getModeratedIds())];
  }

  let query = supabase
    .from("profiles")
    .select(
      "id, username, avatar_url, age, city, bio, is_verified, plan, last_active_at, created_at",
      { count: "exact" },
    );
  if (safeQ) {
    query = query.or(`username.ilike.%${safeQ}%,city.ilike.%${safeQ}%`);
  }
  if (plan === "free" || plan === "plus" || plan === "gold") {
    query = query.eq("plan", plan);
  }
  if (restrictIds) query = query.in("id", restrictIds);
  if (excludeIds && excludeIds.length > 0) {
    query = query.not("id", "in", `(${excludeIds.join(",")})`);
  }
  query = query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  if (error) {
    req.log.error({ err: error.message }, "admin user list failed");
    res.status(500).json({ error: "No se pudieron cargar los usuarios" });
    return;
  }

  const rows = (data ?? []) as AdminUserProfileRow[];
  const states = await getModerationStatesForUsers(rows.map((r) => r.id));

  const users = rows.map((r) => {
    const mod = states.get(r.id);
    return {
      id: r.id,
      username: r.username,
      avatarUrl: r.avatar_url,
      age: r.age,
      city: r.city,
      plan: normalizePlan(r.plan),
      isVerified: Boolean(r.is_verified),
      lastActiveAt: r.last_active_at,
      createdAt: r.created_at ?? null,
      state: mod?.state ?? "active",
      suspendedUntil: mod?.suspendedUntil
        ? mod.suspendedUntil.toISOString()
        : null,
    };
  });

  res.json({ users, total: count ?? users.length });
});

router.get("/admin/users/:userId", async (req, res) => {
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const userId = req.params.userId;
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, username, avatar_url, age, city, bio, is_verified, plan, last_active_at, created_at",
    )
    .eq("id", userId)
    .maybeSingle();

  if (!profile) {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }
  const p = profile as AdminUserProfileRow;

  const [mod, history, details, photosRes, reportRows, userRes, emailVerifiedAt] =
    await Promise.all([
      getModerationState(userId),
      listModerationHistory(userId),
      getProfileDetailsForUsers([userId]),
      supabase
        .from("profile_photos")
        .select("id, user_id, url, storage_path, is_avatar, position, created_at")
        .eq("user_id", userId)
        .order("position", { ascending: true }),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(supportReportsTable)
        .where(
          and(
            eq(supportReportsTable.targetUserId, userId),
            isNotNull(supportReportsTable.reportType),
          ),
        ),
      supabase.auth.admin.getUserById(userId),
      getEmailVerifiedAt(userId).catch(() => null),
    ]);

  const detail = details.get(userId);
  const authUser = userRes.data?.user ?? null;

  // Determine whether this account requires email verification (post-cutoff,
  // non-system) and whether it has passed it. null = not subject to the gate.
  const EMAIL_VERIFICATION_ENFORCED_FROM = Date.UTC(2026, 5, 12);
  const createdMs = authUser?.created_at
    ? new Date(authUser.created_at).getTime()
    : NaN;
  const requiresVerification =
    !isNaN(createdMs) && createdMs >= EMAIL_VERIFICATION_ENFORCED_FROM;
  const emailVerified: boolean | null = requiresVerification
    ? emailVerifiedAt !== null
    : null;

  res.json({
    user: {
      id: p.id,
      username: p.username,
      avatarUrl: p.avatar_url,
      age: p.age,
      city: p.city,
      plan: normalizePlan(p.plan),
      isVerified: Boolean(p.is_verified),
      lastActiveAt: p.last_active_at,
      createdAt: p.created_at ?? null,
      state: mod.state,
      suspendedUntil: mod.suspendedUntil
        ? mod.suspendedUntil.toISOString()
        : null,
    },
    email: authUser?.email ?? null,
    emailVerified,
    bio: p.bio,
    role: detail?.role ?? null,
    lookingFor: detail?.looking_for ?? null,
    reportCount: reportRows[0]?.c ?? 0,
    photos: photosRes.data ?? [],
    history: history.map((h) => ({
      id: h.id,
      action: h.action,
      reason: h.reason,
      detail: h.detail,
      durationDays: h.durationDays,
      actedBy: h.actedBy,
      createdAt: h.createdAt.toISOString(),
    })),
  });
});

// --- Admin manual email verification (support bypass) ---------------------

router.post("/admin/users/:userId/verify-email", async (req, res) => {
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const userId = req.params.userId;
  if (!UUID_RE.test(userId)) {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }

  // Confirm the Supabase profile exists before touching Replit Postgres.
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }

  try {
    await markEmailVerified(userId);
    req.log.info({ userId, actedBy: auth.userId }, "admin: manual email verification");
    res.json({ ok: true });
  } catch (err) {
    req.log.error(
      { err: err instanceof Error ? err.message : String(err), userId },
      "admin: manual verify-email failed",
    );
    res.status(500).json({ error: "No se pudo verificar el correo" });
  }
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

  const durationDays = parsed.data.durationDays ?? null;
  const reason = parsed.data.reason ?? null;
  await suspendUser(req.params.userId, {
    durationDays,
    reason,
    actedBy: auth.userId,
  });
  const until =
    durationDays && durationDays > 0
      ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000)
      : null;
  void notifySuspensionByEmail(req.params.userId, reason, until);
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

  const reason = parsed.data.reason ?? null;
  await banUser(req.params.userId, { reason, actedBy: auth.userId });
  void notifyBanByEmail(req.params.userId, reason);
  res.json({ success: true });
});

router.post("/admin/users/:userId/warn", async (req, res) => {
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const parsed = WarnUserBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Datos no válidos" });
    return;
  }
  if (req.params.userId === auth.userId) {
    res.status(400).json({ error: "No puedes moderar tu propia cuenta" });
    return;
  }

  await warnUser(req.params.userId, {
    reason: parsed.data.reason,
    actedBy: auth.userId,
  });
  void notifyWarningByEmail(req.params.userId, parsed.data.reason);
  res.json({ success: true });
});

router.post("/admin/users/:userId/remove", async (req, res) => {
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const parsed = RemoveUserBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Datos no válidos" });
    return;
  }
  if (req.params.userId === auth.userId) {
    res.status(400).json({ error: "No puedes moderar tu propia cuenta" });
    return;
  }

  const reason = parsed.data.reason ?? null;
  await removeUser(req.params.userId, { reason, actedBy: auth.userId });
  void notifyRemovalByEmail(req.params.userId, reason);
  res.json({ success: true });
});

router.post("/admin/users/:userId/restore", async (req, res) => {
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  await restoreUser(req.params.userId, auth.userId);
  void notifyRestoreByEmail(req.params.userId);
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
  await recordModerationAction(photo.user_id as string, "remove_photo", {
    actedBy: auth.userId,
  });
  res.json({ success: true });
});

// --- Priority support chat (admin side) ------------------------------------
// The admin queue across ALL users. Reading a single ticket and replying reuse
// the SHARED user endpoints (GET /support/tickets/:id, POST
// /support/tickets/:id/messages) — an admin's session is detected there — so
// there are no admin-only detail/message endpoints. Here we add the queue list,
// admin-initiated tickets, and the status override.

const TICKET_STATUSES: SupportTicketStatus[] = [
  "pending",
  "answered",
  "closed",
  "urgent",
];

router.get("/admin/tickets", async (req, res) => {
  const auth = await requireOperator(req, res);
  if (!auth) return;

  const statusParam =
    typeof req.query.status === "string" ? req.query.status : undefined;
  const status = TICKET_STATUSES.includes(statusParam as SupportTicketStatus)
    ? (statusParam as SupportTicketStatus)
    : undefined;
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const list = await listAdminTickets({ status, limit, offset });
  res.json(list);
});

router.post("/admin/tickets", async (req, res) => {
  const auth = await requireOperator(req, res);
  if (!auth) return;

  const parsed = AdminCreateTicketBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos no válidos" });
    return;
  }
  const { userId, subject, message } = parsed.data;
  if (!UUID_RE.test(userId)) {
    res.status(400).json({ error: "Usuario no válido" });
    return;
  }
  // The target must be a real account (cross-DB: Supabase profile).
  if (!(await profileExists(userId))) {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }

  try {
    const detail = await adminCreateTicket(
      auth.userId,
      userId,
      subject.replace(/[\u0000-\u001F\u007F]+/g, " ").trim().slice(0, 200),
      message.trim(),
    );
    // Admin-initiated outreach nudges the user by email (fire-and-forget).
    void notifySupportReplyByEmail(userId);
    res.status(201).json(detail);
  } catch (error) {
    req.log.error(
      { error: error instanceof Error ? error.message : String(error) },
      "admin support ticket: failed to create",
    );
    res.status(500).json({ error: "No se pudo crear el ticket" });
  }
});

router.post("/admin/tickets/:id/status", async (req, res) => {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  if (!UUID_RE.test(req.params.id)) {
    res.status(404).json({ error: "Ticket no encontrado" });
    return;
  }
  const parsed = SetAdminTicketStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Estado no válido" });
    return;
  }
  const detail = await setTicketStatus(
    req.params.id,
    auth.userId,
    parsed.data.status as SupportTicketStatus,
  );
  if (!detail) {
    res.status(404).json({ error: "Ticket no encontrado" });
    return;
  }
  res.json(detail);

  // Notify the owner when their ticket is closed (always-on, privacy-safe).
  if (parsed.data.status === "closed") {
    void notifySupportTicketClosedByEmail(detail.ticket.userId, detail.ticket.id);
  }
});

// ---------------------------------------------------------------------------
// Support inbox (operator console). Gated by `requireOperator` (admin OR the
// system support account) — deliberately NARROWER than requireAdmin, so the
// default-on support account never inherits moderation/verification powers.
// Backs the Mensajes tab of the support account: a directory of ALL users
// (Gold → Plus → free) plus resolve/start of the canonical support thread.
// ---------------------------------------------------------------------------

const SUPPORT_INBOX_COLS =
  "id, username, avatar_url, is_verified, plan, last_active_at";
// Paid tiers are a small minority; bound the priority prefetch (PostgREST caps
// rows anyway). The free bucket is paged normally underneath the paid prefix.
const PAID_PREFETCH_CAP = 1000;

interface SupportInboxRow {
  id: string;
  username: string;
  avatar_url: string | null;
  is_verified: boolean | null;
  plan: string | null;
  last_active_at: string | null;
}

router.get("/admin/support-users", async (req, res) => {
  const auth = await requireOperator(req, res);
  if (!auth) return;

  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  // PostgREST .or() uses ',' '(' ')' as grammar — strip them so the search term
  // can never break out of or inject into the filter expression.
  const safeQ = q.replace(/[,()]/g, " ").trim();
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  // System accounts (incl. the calling support account) must never surface in
  // the directory or the totals.
  const systemIds = [...new Set([...getSystemAccountIds(), auth.userId])];

  const fetchPaid = async (
    plan: "gold" | "plus",
  ): Promise<SupportInboxRow[]> => {
    let query = supabase
      .from("profiles")
      .select(SUPPORT_INBOX_COLS)
      .eq("plan", plan);
    if (safeQ) {
      query = query.or(`username.ilike.%${safeQ}%,city.ilike.%${safeQ}%`);
    }
    if (systemIds.length > 0) {
      query = query.not("id", "in", `(${systemIds.join(",")})`);
    }
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(PAID_PREFETCH_CAP);
    if (error) throw new Error(error.message);
    return (data ?? []) as SupportInboxRow[];
  };

  try {
    // Paid users come first (Gold, then Plus), fully prefetched so the priority
    // prefix is stable across pages; free users page underneath.
    const [goldRows, plusRows] = await Promise.all([
      fetchPaid("gold"),
      fetchPaid("plus"),
    ]);
    const priorityRows = [...goldRows, ...plusRows];
    const paidIds = priorityRows.map((r) => r.id);

    const prioritySlice = priorityRows.slice(offset, offset + limit);
    let pageRows: SupportInboxRow[] = prioritySlice;
    const remaining = limit - prioritySlice.length;
    if (remaining > 0) {
      // The free window starts where the priority list ran out.
      const freeOffset = Math.max(0, offset - priorityRows.length);
      const notIn = [...new Set([...paidIds, ...systemIds])];
      let freeQuery = supabase.from("profiles").select(SUPPORT_INBOX_COLS);
      if (safeQ) {
        freeQuery = freeQuery.or(
          `username.ilike.%${safeQ}%,city.ilike.%${safeQ}%`,
        );
      }
      if (notIn.length > 0) {
        freeQuery = freeQuery.not("id", "in", `(${notIn.join(",")})`);
      }
      const { data: freeData, error: freeErr } = await freeQuery
        .order("created_at", { ascending: false })
        .range(freeOffset, freeOffset + remaining - 1);
      if (freeErr) throw new Error(freeErr.message);
      pageRows = [
        ...prioritySlice,
        ...((freeData ?? []) as SupportInboxRow[]),
      ];
    }

    // total = every non-system profile matching the search (one count query),
    // which equals |gold| + |plus| + |free| under the same filter.
    let countQuery = supabase
      .from("profiles")
      .select("id", { count: "exact", head: true });
    if (safeQ) {
      countQuery = countQuery.or(
        `username.ilike.%${safeQ}%,city.ilike.%${safeQ}%`,
      );
    }
    if (systemIds.length > 0) {
      countQuery = countQuery.not("id", "in", `(${systemIds.join(",")})`);
    }
    const { count } = await countQuery;

    const states = await getModerationStatesForUsers(pageRows.map((r) => r.id));
    const users = pageRows.map((r) => ({
      id: r.id,
      username: r.username,
      avatarUrl: r.avatar_url,
      plan: normalizePlan(r.plan),
      isVerified: Boolean(r.is_verified),
      isOnline: isOnline(r.last_active_at),
      lastActiveAt: r.last_active_at,
      state: states.get(r.id)?.state ?? "active",
    }));
    res.json({ users, total: count ?? users.length });
  } catch (error) {
    req.log.error(
      { error: error instanceof Error ? error.message : String(error) },
      "support inbox: user directory failed",
    );
    res.status(500).json({ error: "No se pudieron cargar los usuarios" });
  }
});

router.get("/admin/support-users/:userId/thread", async (req, res) => {
  const auth = await requireOperator(req, res);
  if (!auth) return;
  if (!UUID_RE.test(req.params.userId)) {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }
  try {
    const detail = await getCanonicalThreadForUser(
      req.params.userId,
      auth.userId,
    );
    res.json({
      ticket: detail?.ticket ?? null,
      messages: detail?.messages ?? [],
    });
  } catch (error) {
    req.log.error(
      { error: error instanceof Error ? error.message : String(error) },
      "support inbox: thread load failed",
    );
    res.status(500).json({ error: "No se pudo cargar la conversación" });
  }
});

router.post("/admin/support-users/:userId/thread", async (req, res) => {
  const auth = await requireOperator(req, res);
  if (!auth) return;
  if (!UUID_RE.test(req.params.userId)) {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }
  const message =
    typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message) {
    res.status(400).json({ error: "El mensaje es obligatorio" });
    return;
  }
  if (message.length > 5000) {
    res.status(400).json({ error: "El mensaje es demasiado largo" });
    return;
  }
  // The target must be a real account (cross-DB: Supabase profile).
  if (!(await profileExists(req.params.userId))) {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }
  try {
    const detail = await startThreadForUser(
      auth.userId,
      req.params.userId,
      message,
    );
    // Nudge the user by email (fire-and-forget).
    void notifySupportReplyByEmail(req.params.userId);
    res.status(201).json({ ticket: detail.ticket, messages: detail.messages });
  } catch (error) {
    req.log.error(
      { error: error instanceof Error ? error.message : String(error) },
      "support inbox: thread start failed",
    );
    res.status(500).json({ error: "No se pudo iniciar la conversación" });
  }
});

export default router;
