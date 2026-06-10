import { desc, eq, sql } from "drizzle-orm";
import {
  db,
  verificationRequestsTable,
  type VerificationRequest,
} from "@workspace/db";
import { supabase } from "./supabase.js";

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

export type RequestVerificationResult = {
  ok: boolean;
  code?: "already_verified" | "pending_exists";
  status: MyVerification;
};

/** Create a pending request unless already verified or one is already open. */
export async function requestVerification(
  userId: string,
): Promise<RequestVerificationResult> {
  const current = await getVerificationStatus(userId);
  if (current.is_verified) {
    return { ok: false, code: "already_verified", status: current };
  }
  if (current.status === "pending") {
    return { ok: false, code: "pending_exists", status: current };
  }
  try {
    await db
      .insert(verificationRequestsTable)
      .values({ userId, status: "pending" });
  } catch {
    // Partial-unique race: a pending row already exists.
    return {
      ok: false,
      code: "pending_exists",
      status: await getVerificationStatus(userId),
    };
  }
  return { ok: true, status: await getVerificationStatus(userId) };
}

/** Pending requests (id + requester + when) for the admin queue. */
export async function listPendingVerificationRows(): Promise<
  { id: string; userId: string; createdAt: Date }[]
> {
  return db
    .select({
      id: verificationRequestsTable.id,
      userId: verificationRequestsTable.userId,
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
