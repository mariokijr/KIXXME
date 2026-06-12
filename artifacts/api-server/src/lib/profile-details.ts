import { db, profileDetailsTable } from "@workspace/db";
import { eq, inArray, sql } from "drizzle-orm";

/**
 * Extra profile attributes that don't exist on the Supabase `profiles` table
 * (and can't be added there). Stored in the repo-owned Replit Postgres and
 * merged into the profile read responses in application code — same dual-DB
 * pattern as verification/visits/blocks.
 */

/** Rol/Preferencia options (single-select). */
export const PROFILE_ROLES = [
  "activo",
  "pasivo",
  "versatil",
  "heterocurioso",
  "flexible",
  "no_decir",
] as const;
export type ProfileRole = (typeof PROFILE_ROLES)[number];

/** "Qué buscas" options (single-select). */
export const LOOKING_FOR = [
  "amistad",
  "chat",
  "citas",
  "relacion",
  "encuentros",
  "lo_que_surja",
] as const;
export type LookingFor = (typeof LOOKING_FOR)[number];

export interface ProfileDetailValues {
  role: string | null;
  looking_for: string | null;
}

const EMPTY: ProfileDetailValues = { role: null, looking_for: null };

export function isValidRole(v: unknown): v is ProfileRole {
  return typeof v === "string" && (PROFILE_ROLES as readonly string[]).includes(v);
}

export function isValidLookingFor(v: unknown): v is LookingFor {
  return typeof v === "string" && (LOOKING_FOR as readonly string[]).includes(v);
}

/** Single-user detail lookup (returns nulls when there's no row yet). */
export async function getProfileDetails(
  userId: string,
): Promise<ProfileDetailValues> {
  const [row] = await db
    .select()
    .from(profileDetailsTable)
    .where(eq(profileDetailsTable.userId, userId))
    .limit(1);
  if (!row) return { ...EMPTY };
  return { role: row.role ?? null, looking_for: row.lookingFor ?? null };
}

/**
 * Batch detail lookup for many users at once (e.g. the Descubrir candidate set).
 * Returns a Map keyed by userId; users with no row are simply absent from it.
 */
export async function getProfileDetailsForUsers(
  userIds: string[],
): Promise<Map<string, ProfileDetailValues>> {
  const map = new Map<string, ProfileDetailValues>();
  if (userIds.length === 0) return map;
  const rows = await db
    .select()
    .from(profileDetailsTable)
    .where(inArray(profileDetailsTable.userId, userIds));
  for (const row of rows) {
    map.set(row.userId, {
      role: row.role ?? null,
      looking_for: row.lookingFor ?? null,
    });
  }
  return map;
}

/**
 * Upsert only the provided fields — an omitted key is left untouched on update,
 * so a partial profile edit never nulls out the other field. No-ops when neither
 * field is provided.
 */
export async function upsertProfileDetails(
  userId: string,
  values: { role?: string | null; lookingFor?: string | null },
): Promise<void> {
  const set: Record<string, unknown> = {};
  if (values.role !== undefined) set.role = values.role;
  if (values.lookingFor !== undefined) set.lookingFor = values.lookingFor;
  if (Object.keys(set).length === 0) return;

  await db
    .insert(profileDetailsTable)
    .values({
      userId,
      role: values.role ?? null,
      lookingFor: values.lookingFor ?? null,
    })
    .onConflictDoUpdate({ target: profileDetailsTable.userId, set });
}

/**
 * Whether the user appears on the Gold map ("Mostrarme en el mapa"). Defaults to
 * true when there's no row yet. Kept as a dedicated accessor (not folded into
 * getProfileDetails) because that helper's shape is spread verbatim into the
 * public profile responses — this is a private setting and must never leak.
 */
export async function getShowOnMap(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ showOnMap: profileDetailsTable.showOnMap })
    .from(profileDetailsTable)
    .where(eq(profileDetailsTable.userId, userId))
    .limit(1);
  return row?.showOnMap ?? true;
}

/**
 * Set the user's map visibility. Uses onConflictDoUpdate touching ONLY
 * show_on_map, so a toggle never clobbers role/looking_for.
 */
export async function setShowOnMap(
  userId: string,
  value: boolean,
): Promise<void> {
  await db
    .insert(profileDetailsTable)
    .values({ userId, showOnMap: value })
    .onConflictDoUpdate({
      target: profileDetailsTable.userId,
      set: { showOnMap: value },
    });
}

/**
 * Among the given users, the set who have opted OUT of the map (show_on_map =
 * false). Users without a row default to visible, so they are simply absent from
 * the returned set. Batched over the candidate set — no N+1.
 */
export async function getMapOptOutIds(
  userIds: string[],
): Promise<Set<string>> {
  const out = new Set<string>();
  if (userIds.length === 0) return out;
  const rows = await db
    .select({
      userId: profileDetailsTable.userId,
      showOnMap: profileDetailsTable.showOnMap,
    })
    .from(profileDetailsTable)
    .where(inArray(profileDetailsTable.userId, userIds));
  for (const row of rows) {
    if (row.showOnMap === false) out.add(row.userId);
  }
  return out;
}

/**
 * Whether the user has finished the mandatory onboarding tutorial. Kept as a
 * dedicated accessor (not folded into getProfileDetails) because that helper's
 * shape is spread verbatim into the public profile responses — the tutorial flag
 * is private and must never leak there.
 */
export async function getTutorialCompletedAt(
  userId: string,
): Promise<Date | null> {
  const [row] = await db
    .select({ tutorialCompletedAt: profileDetailsTable.tutorialCompletedAt })
    .from(profileDetailsTable)
    .where(eq(profileDetailsTable.userId, userId))
    .limit(1);
  return row?.tutorialCompletedAt ?? null;
}

/**
 * Mark the tutorial as completed exactly once. Idempotent: a repeat call keeps
 * the original timestamp (COALESCE), so re-entry never resets it. Returns the
 * effective completion time.
 */
export async function markTutorialCompleted(userId: string): Promise<Date> {
  const [row] = await db
    .insert(profileDetailsTable)
    .values({ userId, tutorialCompletedAt: new Date() })
    .onConflictDoUpdate({
      target: profileDetailsTable.userId,
      set: {
        tutorialCompletedAt: sql`coalesce(${profileDetailsTable.tutorialCompletedAt}, now())`,
      },
    })
    .returning({ tutorialCompletedAt: profileDetailsTable.tutorialCompletedAt });
  return row?.tutorialCompletedAt ?? new Date();
}

/**
 * When the user proved access to their email via the mandatory signup code, or
 * NULL when not yet verified. Kept as a dedicated accessor (not folded into
 * getProfileDetails) because that helper's shape is spread verbatim into the
 * public profile responses — email-verification state is private and must never
 * leak there.
 */
export async function getEmailVerifiedAt(userId: string): Promise<Date | null> {
  const [row] = await db
    .select({ emailVerifiedAt: profileDetailsTable.emailVerifiedAt })
    .from(profileDetailsTable)
    .where(eq(profileDetailsTable.userId, userId))
    .limit(1);
  return row?.emailVerifiedAt ?? null;
}

/**
 * Mark the email as verified exactly once. Uses an EXPLICIT timestamp (not
 * now()) so we can detect a first-set: the COALESCE keeps the original value on
 * a repeat call, so when the row we get back equals the timestamp we passed in,
 * this call is the one that set it (welcome email fires exactly once). Returns
 * `{ verifiedAt, firstSet }`.
 */
export async function markEmailVerified(
  userId: string,
): Promise<{ verifiedAt: Date; firstSet: boolean }> {
  const ts = new Date();
  const [row] = await db
    .insert(profileDetailsTable)
    .values({ userId, emailVerifiedAt: ts })
    .onConflictDoUpdate({
      target: profileDetailsTable.userId,
      set: {
        emailVerifiedAt: sql`coalesce(${profileDetailsTable.emailVerifiedAt}, ${ts})`,
      },
    })
    .returning({ emailVerifiedAt: profileDetailsTable.emailVerifiedAt });
  const verifiedAt = row?.emailVerifiedAt ?? ts;
  return { verifiedAt, firstSet: verifiedAt.getTime() === ts.getTime() };
}
