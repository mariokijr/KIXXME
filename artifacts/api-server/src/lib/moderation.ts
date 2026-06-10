import { and, desc, eq, gt, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import {
  db,
  accountModerationTable,
  accountFlagsTable,
  moderationActionsTable,
  supportReportsTable,
  type AccountModeration,
  type ModerationAction,
} from "@workspace/db";
import { supabase } from "./supabase.js";
import { logger } from "./logger.js";
import { getDeactivatedIds, isDeactivated } from "./account.js";

/**
 * Admin moderation: suspensions/bans plus the auto-flagging that surfaces
 * suspicious accounts for review. State lives in the repo-owned Replit Postgres
 * (`account_moderation`, `account_flags`); there are no cross-DB foreign keys,
 * so "hide a moderated user" is enforced in application code by unioning
 * `getModeratedIds()` into the visibility set, exactly like deactivation.
 *
 * Moderation is ORTHOGONAL to self-service deactivation (`lib/account.ts`):
 * `isUnavailable` / `getUnavailableIds` here are the canonical "hide this user
 * everywhere" helpers (deactivated ∪ moderated) that every exposure surface
 * should use.
 */

export type ModerationState = "active" | "suspended" | "banned" | "removed";

export interface ModerationStatus {
  state: ModerationState;
  suspendedUntil: Date | null;
  reason: string | null;
}

const ACTIVE: ModerationStatus = {
  state: "active",
  suspendedUntil: null,
  reason: null,
};

// Distinct open moderation reports against a user that auto-raise a flag.
const REPORT_FLAG_THRESHOLD = 3;
// Copy-paste / spam detector window + thresholds (message send).
const SPAM_WINDOW_MS = 10 * 60 * 1000;
const SPAM_MIN_CONVERSATIONS = 3;
const SPAM_MIN_LENGTH = 10;

/**
 * A timed suspension whose `suspendedUntil` has passed is effectively active.
 * Expiry is applied lazily on read — we never write a row back on expiry.
 */
function applyExpiry(
  row: AccountModeration | undefined,
  now = new Date(),
): ModerationStatus {
  if (!row) return ACTIVE;
  if (row.state === "banned") {
    return { state: "banned", suspendedUntil: null, reason: row.reason ?? null };
  }
  if (row.state === "removed") {
    return { state: "removed", suspendedUntil: null, reason: row.reason ?? null };
  }
  if (row.state === "suspended") {
    if (row.suspendedUntil && row.suspendedUntil.getTime() <= now.getTime()) {
      return ACTIVE;
    }
    return {
      state: "suspended",
      suspendedUntil: row.suspendedUntil ?? null,
      reason: row.reason ?? null,
    };
  }
  return ACTIVE;
}

export async function getModerationState(
  userId: string,
): Promise<ModerationStatus> {
  const [row] = await db
    .select()
    .from(accountModerationTable)
    .where(eq(accountModerationTable.userId, userId))
    .limit(1);
  return applyExpiry(row);
}

export async function isSuspendedOrBanned(userId: string): Promise<boolean> {
  return (await getModerationState(userId)).state !== "active";
}

/** Set of users currently suspended or banned (timed suspensions auto-expire). */
export async function getModeratedIds(): Promise<Set<string>> {
  const now = new Date();
  const rows = await db
    .select({ userId: accountModerationTable.userId })
    .from(accountModerationTable)
    .where(
      or(
        eq(accountModerationTable.state, "banned"),
        eq(accountModerationTable.state, "removed"),
        and(
          eq(accountModerationTable.state, "suspended"),
          or(
            isNull(accountModerationTable.suspendedUntil),
            gt(accountModerationTable.suspendedUntil, now),
          ),
        ),
      ),
    );
  return new Set(rows.map((r) => r.userId));
}

/**
 * User ids whose EFFECTIVE state matches one specific non-active state (timed
 * suspensions auto-expire). Used by the admin directory's status filter so the
 * filtered list + total stay correct across pagination (the set is small).
 */
export async function getUserIdsInState(
  state: "suspended" | "banned" | "removed",
): Promise<string[]> {
  const now = new Date();
  const cond =
    state === "suspended"
      ? and(
          eq(accountModerationTable.state, "suspended"),
          or(
            isNull(accountModerationTable.suspendedUntil),
            gt(accountModerationTable.suspendedUntil, now),
          ),
        )
      : eq(accountModerationTable.state, state);
  const rows = await db
    .select({ userId: accountModerationTable.userId })
    .from(accountModerationTable)
    .where(cond);
  return rows.map((r) => r.userId);
}

/**
 * Canonical "this user must be hidden from others" check: deactivated OR
 * suspended/banned. Replaces direct `isDeactivated` calls at exposure surfaces.
 */
export async function isUnavailable(userId: string): Promise<boolean> {
  const [deactivated, moderated] = await Promise.all([
    isDeactivated(userId),
    isSuspendedOrBanned(userId),
  ]);
  return deactivated || moderated;
}

/** Union of deactivated and moderated ids — hide all of these everywhere. */
export async function getUnavailableIds(): Promise<Set<string>> {
  const [deactivated, moderated] = await Promise.all([
    getDeactivatedIds(),
    getModeratedIds(),
  ]);
  const all = new Set<string>(deactivated);
  for (const id of moderated) all.add(id);
  return all;
}

// --- Sanction history (append-only audit log) ------------------------------

export type ModerationActionKind =
  | "warn"
  | "suspend"
  | "ban"
  | "remove"
  | "restore"
  | "lift"
  | "remove_photo";

/**
 * Append one row to the immutable sanction history. Best-effort: a history
 * hiccup must never abort the moderation action itself (`account_moderation`
 * is the current-state source of truth). Never throws.
 */
export async function recordModerationAction(
  userId: string,
  action: ModerationActionKind,
  opts: {
    actedBy: string;
    reason?: string | null;
    detail?: string | null;
    durationDays?: number | null;
  },
): Promise<void> {
  try {
    await db.insert(moderationActionsTable).values({
      userId,
      action,
      reason: opts.reason ?? null,
      detail: opts.detail ?? null,
      durationDays: opts.durationDays ?? null,
      actedBy: opts.actedBy,
    });
  } catch (err) {
    logger.warn(
      {
        err: err instanceof Error ? err.message : String(err),
        userId,
        action,
      },
      "recordModerationAction failed (non-fatal)",
    );
  }
}

/** Full sanction history for a user, newest first. */
export async function listModerationHistory(
  userId: string,
): Promise<ModerationAction[]> {
  return db
    .select()
    .from(moderationActionsTable)
    .where(eq(moderationActionsTable.userId, userId))
    .orderBy(desc(moderationActionsTable.createdAt));
}

/** Batch current moderation status (with lazy expiry) for many users. */
export async function getModerationStatesForUsers(
  userIds: string[],
): Promise<Map<string, ModerationStatus>> {
  const out = new Map<string, ModerationStatus>();
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return out;
  const rows = await db
    .select()
    .from(accountModerationTable)
    .where(inArray(accountModerationTable.userId, unique));
  const now = new Date();
  for (const row of rows) out.set(row.userId, applyExpiry(row, now));
  return out;
}

// --- Admin actions ---------------------------------------------------------

async function upsertModeration(
  userId: string,
  cols: {
    state: ModerationState;
    suspendedUntil: Date | null;
    reason: string | null;
    actedBy: string;
    updatedAt: Date;
  },
): Promise<void> {
  await db
    .insert(accountModerationTable)
    .values({ userId, ...cols })
    .onConflictDoUpdate({ target: accountModerationTable.userId, set: cols });
}

export async function suspendUser(
  userId: string,
  opts: { durationDays?: number | null; reason?: string | null; actedBy: string },
): Promise<void> {
  const now = new Date();
  const suspendedUntil =
    opts.durationDays && opts.durationDays > 0
      ? new Date(now.getTime() + opts.durationDays * 24 * 60 * 60 * 1000)
      : null;
  await upsertModeration(userId, {
    state: "suspended",
    suspendedUntil,
    reason: opts.reason ?? null,
    actedBy: opts.actedBy,
    updatedAt: now,
  });
  await recordModerationAction(userId, "suspend", {
    actedBy: opts.actedBy,
    reason: opts.reason ?? null,
    durationDays: opts.durationDays ?? null,
  });
}

export async function banUser(
  userId: string,
  opts: { reason?: string | null; actedBy: string },
): Promise<void> {
  await upsertModeration(userId, {
    state: "banned",
    suspendedUntil: null,
    reason: opts.reason ?? null,
    actedBy: opts.actedBy,
    updatedAt: new Date(),
  });
  await recordModerationAction(userId, "ban", {
    actedBy: opts.actedBy,
    reason: opts.reason ?? null,
  });
}

/**
 * Admin-initiated REVERSIBLE soft-delete. Sets the account to `removed` (hidden
 * everywhere + blocked from the API like a ban) without touching any data, so
 * `restoreUser` can bring it back. NOT a hard delete — GDPR erasure stays in
 * `lib/account.ts deleteAccount` (self-service).
 */
export async function removeUser(
  userId: string,
  opts: { reason?: string | null; actedBy: string },
): Promise<void> {
  await upsertModeration(userId, {
    state: "removed",
    suspendedUntil: null,
    reason: opts.reason ?? null,
    actedBy: opts.actedBy,
    updatedAt: new Date(),
  });
  await recordModerationAction(userId, "remove", {
    actedBy: opts.actedBy,
    reason: opts.reason ?? null,
  });
}

/** Clear any suspension/ban (keeps the row for an audit of who lifted it). */
export async function liftModeration(
  userId: string,
  actedBy: string,
): Promise<void> {
  await upsertModeration(userId, {
    state: "active",
    suspendedUntil: null,
    reason: null,
    actedBy,
    updatedAt: new Date(),
  });
  await recordModerationAction(userId, "lift", { actedBy });
}

/**
 * Bring a `removed` (or suspended/banned) account back to active. Same effect
 * as `liftModeration` but recorded as `restore` so the history distinguishes a
 * reinstated deletion from a lifted suspension.
 */
export async function restoreUser(
  userId: string,
  actedBy: string,
): Promise<void> {
  await upsertModeration(userId, {
    state: "active",
    suspendedUntil: null,
    reason: null,
    actedBy,
    updatedAt: new Date(),
  });
  await recordModerationAction(userId, "restore", { actedBy });
}

/**
 * Issue a formal warning. Warnings are recorded in the history and emailed to
 * the user, but DO NOT change account state (no access restriction) — the email
 * is the user-facing notification.
 */
export async function warnUser(
  userId: string,
  opts: { reason: string; actedBy: string },
): Promise<void> {
  await recordModerationAction(userId, "warn", {
    actedBy: opts.actedBy,
    reason: opts.reason,
  });
}

// --- Auto-flagging ---------------------------------------------------------

/**
 * Maintain a single OPEN flag per (user, reason): bump count + refresh detail
 * on repeat triggers instead of inserting duplicates. Never throws.
 */
export async function flagAccount(
  userId: string,
  reason: "report_threshold" | "spam_pattern",
  detail: string,
): Promise<void> {
  try {
    const [existing] = await db
      .select({ id: accountFlagsTable.id })
      .from(accountFlagsTable)
      .where(
        and(
          eq(accountFlagsTable.userId, userId),
          eq(accountFlagsTable.reason, reason),
          eq(accountFlagsTable.status, "open"),
        ),
      )
      .limit(1);
    if (existing) {
      await db
        .update(accountFlagsTable)
        .set({
          count: sql`${accountFlagsTable.count} + 1`,
          detail,
          updatedAt: new Date(),
        })
        .where(eq(accountFlagsTable.id, existing.id));
    } else {
      await db
        .insert(accountFlagsTable)
        .values({ userId, reason, detail, count: 1, status: "open" });
    }
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), userId, reason },
      "flagAccount failed (non-fatal)",
    );
  }
}

/**
 * Raise a `report_threshold` flag once a user has been reported by enough
 * distinct people (open moderation reports). Fire-and-forget; never throws.
 */
export async function maybeAutoFlagOnReport(targetUserId: string): Promise<void> {
  try {
    const reporters = await db
      .selectDistinct({ reporterId: supportReportsTable.reporterId })
      .from(supportReportsTable)
      .where(
        and(
          eq(supportReportsTable.targetUserId, targetUserId),
          isNotNull(supportReportsTable.reportType),
          eq(supportReportsTable.status, "open"),
        ),
      );
    if (reporters.length >= REPORT_FLAG_THRESHOLD) {
      await flagAccount(
        targetUserId,
        "report_threshold",
        `${reporters.length} usuarios distintos han reportado este perfil.`,
      );
    }
  } catch (err) {
    logger.warn(
      {
        err: err instanceof Error ? err.message : String(err),
        targetUserId,
      },
      "maybeAutoFlagOnReport failed (non-fatal)",
    );
  }
}

/**
 * Simple copy-paste / spam detector: if a user sent the SAME message body to
 * several distinct conversations within a short window, raise a `spam_pattern`
 * flag. Runs fire-and-forget after a message is sent; never throws.
 */
export async function detectSpamFromMessage(
  senderId: string,
  content: string | null | undefined,
): Promise<void> {
  try {
    if (!content) return;
    const trimmed = content.trim();
    if (trimmed.length < SPAM_MIN_LENGTH) return;

    const since = new Date(Date.now() - SPAM_WINDOW_MS).toISOString();
    const { data, error } = await supabase
      .from("messages")
      .select("conversation_id, content")
      .eq("sender_id", senderId)
      .gte("created_at", since)
      .limit(200);
    if (error || !data) return;

    const conversations = new Set<string>();
    for (const m of data) {
      if (typeof m.content === "string" && m.content.trim() === trimmed) {
        conversations.add(m.conversation_id as string);
      }
    }
    if (conversations.size >= SPAM_MIN_CONVERSATIONS) {
      await flagAccount(
        senderId,
        "spam_pattern",
        `Mismo mensaje enviado a ${conversations.size} conversaciones distintas en pocos minutos.`,
      );
    }
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), senderId },
      "detectSpamFromMessage failed (non-fatal)",
    );
  }
}
