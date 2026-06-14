import { db, userInterestsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

/**
 * Pre-defined interest tags grouped by category. Only slugs from this list
 * are accepted by the PUT /profiles/me/interests endpoint.
 */
export const INTEREST_CATEGORIES: { label: string; tags: string[] }[] = [
  {
    label: "💪 Fitness",
    tags: ["gimnasio", "running", "yoga", "natacion", "ciclismo", "senderismo", "deporte"],
  },
  {
    label: "✈️ Viajes",
    tags: ["viajes", "playa", "montana", "mochilero", "road_trip", "campamento"],
  },
  {
    label: "🎵 Música",
    tags: ["musica", "conciertos", "dj", "karaoke", "festivales", "guitarra"],
  },
  {
    label: "🎬 Entretenimiento",
    tags: ["cine", "series", "teatro", "videojuegos", "podcasts", "lectura"],
  },
  {
    label: "🍽️ Gastronomía",
    tags: ["gastronomia", "cocina", "cafes", "bares", "vinos", "sushi"],
  },
  {
    label: "🌿 Estilo de vida",
    tags: ["meditacion", "vegano", "voluntariado", "fotografia", "moda", "arte", "naturaleza", "clubbing", "pride", "tecnologia"],
  },
];

export const ALLOWED_TAGS = new Set(
  INTEREST_CATEGORIES.flatMap((c) => c.tags),
);

export const MAX_INTERESTS = 20;

/** Get the interests for a single user. Returns [] when there's no row yet. */
export async function getUserInterests(userId: string): Promise<string[]> {
  const rows = await db
    .select({ tag: userInterestsTable.tag })
    .from(userInterestsTable)
    .where(eq(userInterestsTable.userId, userId));
  return rows.map((r) => r.tag).sort();
}

/**
 * Batch-load interests for many users at once. Returns a Map keyed by userId;
 * absent users map to an empty array (caller can .get(id) ?? []).
 */
export async function getUserInterestsForUsers(
  userIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (userIds.length === 0) return map;
  const rows = await db
    .select({ userId: userInterestsTable.userId, tag: userInterestsTable.tag })
    .from(userInterestsTable)
    .where(inArray(userInterestsTable.userId, userIds));
  for (const row of rows) {
    const list = map.get(row.userId) ?? [];
    list.push(row.tag);
    map.set(row.userId, list);
  }
  return map;
}

/**
 * Full replace: delete all existing tags for this user then insert the new set
 * atomically inside a transaction. Validates against ALLOWED_TAGS and MAX_INTERESTS.
 * Throws with a user-facing message on invalid input.
 */
export async function setUserInterests(
  userId: string,
  tags: unknown[],
): Promise<string[]> {
  if (!Array.isArray(tags)) throw new Error("interests debe ser un array.");
  if (tags.length > MAX_INTERESTS)
    throw new Error(`Puedes seleccionar un máximo de ${MAX_INTERESTS} intereses.`);
  const deduped = [...new Set(tags.map((t) => String(t).toLowerCase().trim()))].filter(Boolean);
  const invalid = deduped.filter((t) => !ALLOWED_TAGS.has(t));
  if (invalid.length > 0)
    throw new Error(`Intereses no válidos: ${invalid.join(", ")}`);

  await db.transaction(async (tx) => {
    await tx
      .delete(userInterestsTable)
      .where(eq(userInterestsTable.userId, userId));
    if (deduped.length > 0) {
      await tx
        .insert(userInterestsTable)
        .values(deduped.map((tag) => ({ userId, tag })));
    }
  });
  return deduped.sort();
}
