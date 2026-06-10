import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import type { Logger } from "pino";
import { and, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import {
  db,
  accountStatusTable,
  accountActionCodesTable,
  blocksTable,
  liveQueueTable,
  videoCallsTable,
  billingCustomersTable,
  supportReportsTable,
  likeActionsTable,
  accountModerationTable,
  accountFlagsTable,
  moderationActionsTable,
  type AccountStatus,
  type AccountActionPayload,
} from "@workspace/db";
import { supabase } from "./supabase.js";
import { cancelAllSubscriptionsForUser } from "./billing.js";
import { purgeUserVerification } from "./verification.js";

/**
 * Account self-service: temporary deactivation, permanent deletion, and the
 * email-verification codes that gate both. See `routes/account.ts` for the HTTP
 * surface and `lib/email.ts` for the Spanish templates.
 *
 * Deactivation state lives in the repo-owned Replit Postgres (`account_status`).
 * Because there are no cross-DB foreign keys, "hide a deactivated user" is
 * enforced in application code at every exposure surface by unioning
 * `getDeactivatedIds()` into the existing block filter.
 */

export type DeactivationType = "1m" | "3m" | "6m" | "indefinite";
export type AccountAction = "deactivate" | "delete";

const MONTHS: Record<Exclude<DeactivationType, "indefinite">, number> = {
  "1m": 1,
  "3m": 3,
  "6m": 6,
};

const CODE_TTL_MS = 15 * 60 * 1000; // codes are valid for 15 minutes
const MAX_ATTEMPTS = 5; // confirmation attempts before a code is locked
const REQUEST_COOLDOWN_MS = 60 * 1000; // min gap between code requests

// --- Deactivation state ----------------------------------------------------

function computeReactivateAt(
  type: DeactivationType,
  from = new Date(),
): Date | null {
  if (type === "indefinite") return null;
  const d = new Date(from);
  d.setMonth(d.getMonth() + MONTHS[type]);
  return d;
}

export async function getAccountStatus(
  userId: string,
): Promise<AccountStatus | null> {
  const [row] = await db
    .select()
    .from(accountStatusTable)
    .where(eq(accountStatusTable.userId, userId))
    .limit(1);
  return row ?? null;
}

/** A timed deactivation whose `reactivateAt` has passed is effectively active. */
export function isEffectivelyDeactivated(
  row: AccountStatus | null,
  now = new Date(),
): boolean {
  if (!row || row.status !== "deactivated") return false;
  if (row.reactivateAt && row.reactivateAt.getTime() <= now.getTime()) {
    return false;
  }
  return true;
}

export async function isDeactivated(userId: string): Promise<boolean> {
  return isEffectivelyDeactivated(await getAccountStatus(userId));
}

/**
 * Set of users currently hidden because they are deactivated. Excludes timed
 * deactivations whose `reactivateAt` has elapsed (lazy auto-reactivation).
 * Unioned into the block set at every surface that exposes another user.
 */
export async function getDeactivatedIds(): Promise<Set<string>> {
  const rows = await db
    .select({ userId: accountStatusTable.userId })
    .from(accountStatusTable)
    .where(
      and(
        eq(accountStatusTable.status, "deactivated"),
        or(
          isNull(accountStatusTable.reactivateAt),
          gt(accountStatusTable.reactivateAt, new Date()),
        ),
      ),
    );
  return new Set(rows.map((r) => r.userId));
}

export async function deactivate(
  userId: string,
  type: DeactivationType,
): Promise<void> {
  const now = new Date();
  const reactivateAt = computeReactivateAt(type, now);
  const cols = {
    status: "deactivated",
    deactivationType: type,
    deactivatedAt: now,
    reactivateAt,
    updatedAt: now,
  };
  await db
    .insert(accountStatusTable)
    .values({ userId, ...cols })
    .onConflictDoUpdate({ target: accountStatusTable.userId, set: cols });
}

export async function reactivate(userId: string): Promise<void> {
  const cols = {
    status: "active",
    deactivationType: null,
    deactivatedAt: null,
    reactivateAt: null,
    updatedAt: new Date(),
  };
  await db
    .insert(accountStatusTable)
    .values({ userId, ...cols })
    .onConflictDoUpdate({ target: accountStatusTable.userId, set: cols });
}

/**
 * Logging back in is the user's "I'm back" signal, so any deactivation (timed
 * or indefinite) is cleared on a successful login. Only touches the row when one
 * exists and is deactivated, to avoid creating noise rows for normal users.
 */
export async function reactivateOnLogin(userId: string): Promise<void> {
  const row = await getAccountStatus(userId);
  if (row && row.status === "deactivated") {
    await reactivate(userId);
  }
}

// --- Verification codes ----------------------------------------------------

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** Remaining cooldown in ms before a new code may be requested (0 = ready). */
export async function requestCooldownRemaining(
  userId: string,
  action: AccountAction,
): Promise<number> {
  const [recent] = await db
    .select({ createdAt: accountActionCodesTable.createdAt })
    .from(accountActionCodesTable)
    .where(
      and(
        eq(accountActionCodesTable.userId, userId),
        eq(accountActionCodesTable.action, action),
      ),
    )
    .orderBy(desc(accountActionCodesTable.createdAt))
    .limit(1);
  if (!recent) return 0;
  const elapsed = Date.now() - recent.createdAt.getTime();
  return elapsed >= REQUEST_COOLDOWN_MS ? 0 : REQUEST_COOLDOWN_MS - elapsed;
}

/**
 * Generate a fresh 6-digit code, invalidating any prior unconsumed codes for
 * the same (user, action). Returns the plaintext code (to email) and expiry.
 */
export async function createActionCode(
  userId: string,
  action: AccountAction,
  payload?: AccountActionPayload,
): Promise<{ code: string; expiresAt: Date }> {
  await db
    .delete(accountActionCodesTable)
    .where(
      and(
        eq(accountActionCodesTable.userId, userId),
        eq(accountActionCodesTable.action, action),
        isNull(accountActionCodesTable.consumedAt),
      ),
    );
  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  await db.insert(accountActionCodesTable).values({
    userId,
    action,
    codeHash: hashCode(code),
    payload: payload ?? null,
    expiresAt,
  });
  return { code, expiresAt };
}

export type ConsumeResult =
  | { ok: true; payload: AccountActionPayload | null }
  | { ok: false; reason: "notfound" | "expired" | "toomany" | "mismatch" };

/**
 * Validate and consume a confirmation code. Increments `attempts` atomically
 * BEFORE comparing (closes a concurrent-guess race), caps attempts, uses a
 * constant-time hash compare, and marks the row consumed on success so it can
 * never be replayed.
 */
export async function consumeActionCode(
  userId: string,
  action: AccountAction,
  code: string,
): Promise<ConsumeResult> {
  const [row] = await db
    .select()
    .from(accountActionCodesTable)
    .where(
      and(
        eq(accountActionCodesTable.userId, userId),
        eq(accountActionCodesTable.action, action),
        isNull(accountActionCodesTable.consumedAt),
      ),
    )
    .orderBy(desc(accountActionCodesTable.createdAt))
    .limit(1);

  if (!row) return { ok: false, reason: "notfound" };
  if (row.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: "expired" };
  }

  const [updated] = await db
    .update(accountActionCodesTable)
    .set({ attempts: sql`${accountActionCodesTable.attempts} + 1` })
    .where(eq(accountActionCodesTable.id, row.id))
    .returning({ attempts: accountActionCodesTable.attempts });
  const attempts = updated?.attempts ?? row.attempts + 1;
  if (attempts > MAX_ATTEMPTS) return { ok: false, reason: "toomany" };

  const expected = Buffer.from(row.codeHash, "hex");
  const actual = Buffer.from(hashCode(code), "hex");
  const match =
    expected.length === actual.length && timingSafeEqual(expected, actual);
  if (!match) return { ok: false, reason: "mismatch" };

  await db
    .update(accountActionCodesTable)
    .set({ consumedAt: new Date() })
    .where(eq(accountActionCodesTable.id, row.id));
  return { ok: true, payload: row.payload ?? null };
}

// --- Permanent deletion ----------------------------------------------------

/** Best-effort recursive removal of a user's objects in the avatars bucket. */
async function removeUserStorage(userId: string, log: Logger): Promise<void> {
  try {
    const toRemove: string[] = [];
    // Avatar lives at `${userId}/<file>`, gallery photos at `${userId}/photos/<file>`.
    for (const prefix of [userId, `${userId}/photos`]) {
      const { data } = await supabase.storage
        .from("avatars")
        .list(prefix, { limit: 1000 });
      for (const f of data ?? []) {
        // Folder placeholders have a null id; skip them.
        if (f.id === null) continue;
        toRemove.push(`${prefix}/${f.name}`);
      }
    }
    if (toRemove.length > 0) {
      await supabase.storage.from("avatars").remove(toRemove);
    }
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : String(err), userId },
      "account deletion: storage cleanup failed (best-effort)",
    );
  }
}

function throwOnError(
  error: { message: string } | null,
  step: string,
): void {
  if (error) throw new Error(`account deletion failed at ${step}: ${error.message}`);
}

/**
 * Permanently delete an account across BOTH databases. There are no PostgREST
 * transactions, so every step is delete-if-exists (idempotent) and the
 * irreversible Supabase auth deletion runs LAST — if any data step fails we
 * throw before it, and a retry with a fresh code re-runs cleanly.
 */
export async function deleteAccount(userId: string, log: Logger): Promise<void> {
  // 1. Stop billing first. Best-effort: a Stripe hiccup must not trap the user
  //    in an account they asked to delete. The billing_customers mapping is
  //    purged below (step 3) once cancellation has had its chance to run.
  try {
    await cancelAllSubscriptionsForUser(userId, log);
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : String(err), userId },
      "account deletion: subscription cancellation failed (continuing)",
    );
  }

  // 2. Supabase core data. Delete rows that may reference the profile BEFORE the
  //    profile row itself so any FK to profiles cannot block the delete.
  const reportsBy = await supabase
    .from("reports")
    .delete()
    .eq("reporter_id", userId);
  throwOnError(reportsBy.error, "reports(reporter)");
  const reportsAbout = await supabase
    .from("reports")
    .delete()
    .eq("reported_user_id", userId);
  throwOnError(reportsAbout.error, "reports(reported)");

  const { data: convs, error: convErr } = await supabase
    .from("conversations")
    .select("id")
    .or(`user1_id.eq.${userId},user2_id.eq.${userId}`);
  throwOnError(convErr, "conversations(list)");
  const convIds = (convs ?? []).map((c) => c.id as string);
  if (convIds.length > 0) {
    const msgDel = await supabase
      .from("messages")
      .delete()
      .in("conversation_id", convIds);
    throwOnError(msgDel.error, "messages");
    const convDel = await supabase
      .from("conversations")
      .delete()
      .in("id", convIds);
    throwOnError(convDel.error, "conversations");
  }

  const likesBy = await supabase.from("likes").delete().eq("liker_id", userId);
  throwOnError(likesBy.error, "likes(liker)");
  const likesFor = await supabase.from("likes").delete().eq("liked_id", userId);
  throwOnError(likesFor.error, "likes(liked)");

  const photosDel = await supabase
    .from("profile_photos")
    .delete()
    .eq("user_id", userId);
  throwOnError(photosDel.error, "profile_photos");
  await removeUserStorage(userId, log);

  const profileDel = await supabase.from("profiles").delete().eq("id", userId);
  throwOnError(profileDel.error, "profiles");

  // 3. Repo-owned Replit Postgres tables (no cross-DB FKs).
  await db
    .delete(blocksTable)
    .where(
      or(eq(blocksTable.blockerId, userId), eq(blocksTable.blockedId, userId)),
    );
  await db.delete(liveQueueTable).where(eq(liveQueueTable.userId, userId));
  await db
    .delete(videoCallsTable)
    .where(
      or(
        eq(videoCallsTable.callerId, userId),
        eq(videoCallsTable.calleeId, userId),
      ),
    );
  await db
    .delete(billingCustomersTable)
    .where(eq(billingCustomersTable.userId, userId));
  await db
    .delete(supportReportsTable)
    .where(
      or(
        eq(supportReportsTable.reporterId, userId),
        eq(supportReportsTable.targetUserId, userId),
      ),
    );
  await db
    .delete(likeActionsTable)
    .where(
      or(
        eq(likeActionsTable.likerId, userId),
        eq(likeActionsTable.likedId, userId),
      ),
    );
  await db
    .delete(accountActionCodesTable)
    .where(eq(accountActionCodesTable.userId, userId));
  await db
    .delete(accountStatusTable)
    .where(eq(accountStatusTable.userId, userId));
  await db
    .delete(accountModerationTable)
    .where(eq(accountModerationTable.userId, userId));
  await db
    .delete(accountFlagsTable)
    .where(eq(accountFlagsTable.userId, userId));
  await db
    .delete(moderationActionsTable)
    .where(eq(moderationActionsTable.userId, userId));
  // Verification: remove private selfies from storage + the request rows.
  await purgeUserVerification(userId, log);

  // 4. Irreversible: remove the Supabase auth user LAST.
  const { error: authErr } = await supabase.auth.admin.deleteUser(userId);
  if (authErr) {
    throw new Error(`account deletion failed at auth.deleteUser: ${authErr.message}`);
  }

  log.info({ userId }, "account permanently deleted");
}
