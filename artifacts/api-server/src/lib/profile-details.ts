import { db, profileDetailsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

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
