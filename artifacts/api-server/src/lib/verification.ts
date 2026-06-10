import type { Logger } from "pino";
import { desc, eq, sql } from "drizzle-orm";
import {
  db,
  verificationRequestsTable,
  type VerificationRequest,
} from "@workspace/db";
import { supabase } from "./supabase.js";
import { logger } from "./logger.js";

/**
 * Profile / identity verification workflow.
 *
 * The verified BADGE is the Supabase `profiles.is_verified` boolean (source of
 * truth, rendered everywhere). This module manages the repo-owned
 * `verification_requests` queue that gates an admin flipping that flag. There
 * are no cross-DB foreign keys — `userId` holds a Supabase auth UUID joined in
 * application code. NOT to be confused with the unrelated email
 * account-action-code flow under `/account/verification/*`.
 */

export type VerificationFlowStatus =
  | "none"
  | "pending"
  | "approved"
  | "rejected";

export interface MyVerification {
  status: VerificationFlowStatus;
  is_verified: boolean;
  requested_at: string | null;
  reviewed_at: string | null;
  note: string | null;
}

async function readIsVerified(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("profiles")
    .select("is_verified")
    .eq("id", userId)
    .maybeSingle();
  return Boolean(data?.is_verified);
}

async function latestRequest(
  userId: string,
): Promise<VerificationRequest | undefined> {
  const [row] = await db
    .select()
    .from(verificationRequestsTable)
    .where(eq(verificationRequestsTable.userId, userId))
    .orderBy(desc(verificationRequestsTable.createdAt))
    .limit(1);
  return row;
}

/**
 * Derive the user's verification standing. `is_verified=true` always wins
 * (status "approved"), which self-heals a partial approval where the Supabase
 * write landed but the Drizzle status update did not.
 */
export async function getVerificationStatus(
  userId: string,
): Promise<MyVerification> {
  const [isVerified, latest] = await Promise.all([
    readIsVerified(userId),
    latestRequest(userId),
  ]);
  let status: VerificationFlowStatus;
  if (isVerified) status = "approved";
  else if (latest?.status === "pending") status = "pending";
  else if (latest?.status === "rejected") status = "rejected";
  else status = "none";
  return {
    status,
    is_verified: isVerified,
    requested_at: latest?.createdAt?.toISOString() ?? null,
    reviewed_at: latest?.reviewedAt?.toISOString() ?? null,
    note: latest?.note ?? null,
  };
}

// --- Selfie storage (PRIVATE bucket) ---------------------------------------

/**
 * Identity selfies live in a DEDICATED PRIVATE Supabase storage bucket — never
 * the public `avatars` bucket the profile photos use. Admins view them through
 * short-lived signed URLs; the raw objects are not publicly reachable.
 */
export const VERIFICATION_BUCKET = "verification-selfies";
const SIGNED_URL_TTL_SECONDS = 600; // 10 minutes — long enough for one review pass
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Lazily create the private bucket. Idempotent — ignores "already exists". */
async function ensureVerificationBucket(): Promise<void> {
  const { error } = await supabase.storage.createBucket(VERIFICATION_BUCKET, {
    public: false,
  });
  if (error && !/exist/i.test(error.message)) {
    throw new Error(`Failed to create verification bucket: ${error.message}`);
  }
}

/**
 * Upload a selfie buffer and return its storage path. Creates the private
 * bucket on first use ("Bucket not found" → create → retry once).
 */
async function uploadSelfie(
  userId: string,
  buffer: Buffer,
  mime: string,
): Promise<string> {
  const ext = EXT_BY_MIME[mime] ?? "jpg";
  const path = `${userId}/${Date.now()}.${ext}`;
  const attempt = () =>
    supabase.storage
      .from(VERIFICATION_BUCKET)
      .upload(path, buffer, { contentType: mime, upsert: false });

  let { error } = await attempt();
  if (error && /bucket not found/i.test(error.message)) {
    await ensureVerificationBucket();
    ({ error } = await attempt());
  }
  if (error) {
    throw new Error(`Failed to upload selfie: ${error.message}`);
  }
  return path;
}

/**
 * Mint a short-lived signed URL for an admin to view a selfie. Returns null for
 * a missing path or on error (degrade gracefully — the admin sees "Sin selfie").
 */
export async function signSelfieUrl(
  path: string | null,
): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(VERIFICATION_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error) {
    logger.warn({ error: error.message }, "signSelfieUrl: failed");
    return null;
  }
  return data?.signedUrl ?? null;
}

/**
 * Best-effort removal of all of a user's verification selfies plus their
 * `verification_requests` rows. Used by account deletion. Storage cleanup never
 * throws; the row delete does (so deletion can retry).
 */
export async function purgeUserVerification(
  userId: string,
  log: Logger,
): Promise<void> {
  try {
    const { data } = await supabase.storage
      .from(VERIFICATION_BUCKET)
      .list(userId, { limit: 1000 });
    const toRemove = (data ?? [])
      .filter((f) => f.id !== null)
      .map((f) => `${userId}/${f.name}`);
    if (toRemove.length > 0) {
      await supabase.storage.from(VERIFICATION_BUCKET).remove(toRemove);
    }
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : String(err), userId },
      "verification selfie cleanup failed (best-effort)",
    );
  }
  await db
    .delete(verificationRequestsTable)
    .where(eq(verificationRequestsTable.userId, userId));
}

export type RequestVerificationResult = {
  ok: boolean;
  code?: "already_verified" | "pending_exists";
  status: MyVerification;
};

/**
 * Create a pending request (with a mandatory identity selfie) unless already
 * verified or one is already open. Cheap status checks run BEFORE the upload so
 * we don't store an orphan object for an obvious reject; on the partial-unique
 * race the just-uploaded object is best-effort removed before returning 409.
 */
export async function requestVerification(
  userId: string,
  selfie: { buffer: Buffer; mime: string },
): Promise<RequestVerificationResult> {
  const current = await getVerificationStatus(userId);
  if (current.is_verified) {
    return { ok: false, code: "already_verified", status: current };
  }
  if (current.status === "pending") {
    return { ok: false, code: "pending_exists", status: current };
  }

  const selfiePath = await uploadSelfie(userId, selfie.buffer, selfie.mime);
  try {
    await db
      .insert(verificationRequestsTable)
      .values({ userId, status: "pending", selfiePath });
  } catch (err) {
    // The insert failed, so the just-uploaded object is orphaned — remove it.
    await supabase.storage
      .from(VERIFICATION_BUCKET)
      .remove([selfiePath])
      .catch(() => {});
    // Distinguish the EXPECTED partial-unique race (a pending row already
    // exists) from an UNEXPECTED failure by re-reading status, rather than
    // sniffing the driver error: a now-pending row means the race fired (409);
    // anything else is a real error worth logging and surfacing as 500.
    const status = await getVerificationStatus(userId);
    if (status.status === "pending") {
      return { ok: false, code: "pending_exists", status };
    }
    logger.error(
      { err: err instanceof Error ? err.message : String(err), userId },
      "requestVerification: insert failed unexpectedly",
    );
    throw err;
  }
  return { ok: true, status: await getVerificationStatus(userId) };
}

/** Pending requests (id + requester + selfie + when) for the admin queue. */
export async function listPendingVerificationRows(): Promise<
  { id: string; userId: string; selfiePath: string | null; createdAt: Date }[]
> {
  return db
    .select({
      id: verificationRequestsTable.id,
      userId: verificationRequestsTable.userId,
      selfiePath: verificationRequestsTable.selfiePath,
      createdAt: verificationRequestsTable.createdAt,
    })
    .from(verificationRequestsTable)
    .where(eq(verificationRequestsTable.status, "pending"))
    .orderBy(desc(verificationRequestsTable.createdAt));
}

export async function countPendingVerifications(): Promise<number> {
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(verificationRequestsTable)
    .where(eq(verificationRequestsTable.status, "pending"));
  return row?.c ?? 0;
}

export type ReviewResult = "ok" | "not_found" | "not_pending";

/**
 * Apply an admin decision. Acts only on a still-pending row (idempotent-safe).
 * Approve writes Supabase `is_verified=true` FIRST (badge source of truth), then
 * marks the request approved; a failed Supabase write throws before any local
 * status change.
 */
export async function reviewVerification(
  id: string,
  decision: "approve" | "reject",
  adminId: string,
  note?: string | null,
): Promise<ReviewResult> {
  const [row] = await db
    .select()
    .from(verificationRequestsTable)
    .where(eq(verificationRequestsTable.id, id))
    .limit(1);
  if (!row) return "not_found";
  if (row.status !== "pending") return "not_pending";

  if (decision === "approve") {
    const { error } = await supabase
      .from("profiles")
      .update({ is_verified: true, updated_at: new Date().toISOString() })
      .eq("id", row.userId);
    if (error) {
      throw new Error(`Failed to set is_verified: ${error.message}`);
    }
    await db
      .update(verificationRequestsTable)
      .set({
        status: "approved",
        reviewedBy: adminId,
        reviewedAt: new Date(),
        note: note ?? null,
      })
      .where(eq(verificationRequestsTable.id, id));
  } else {
    await db
      .update(verificationRequestsTable)
      .set({
        status: "rejected",
        reviewedBy: adminId,
        reviewedAt: new Date(),
        note: note ?? null,
      })
      .where(eq(verificationRequestsTable.id, id));
  }
  return "ok";
}
