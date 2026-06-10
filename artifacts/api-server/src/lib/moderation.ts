import { and, eq, gt, isNotNull, isNull, or, sql } from "drizzle-orm";
import {
  db,
  accountModerationTable,
  accountFlagsTable,
  supportReportsTable,
  type AccountModeration,
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

export type ModerationState = "active" | "suspended" | "banned";

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
