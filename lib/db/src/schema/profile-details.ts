import { pgTable, uuid, text, timestamp, boolean } from "drizzle-orm/pg-core";

/**
 * Extra profile attributes that don't exist on the Supabase `profiles` table
 * and can't be added there (Supabase schema is NOT DDL-modifiable from this
 * repo). Lives in the repo-owned Replit Postgres (DATABASE_URL).
 *
 * Same dual-DB pattern as verification/visits/blocks: `userId` holds the
 * Supabase auth user UUID, there are no cross-DB foreign keys, and the API
 * merges these fields into the profile read responses in application code.
 *
 * Both fields are single-select free text (validated to a closed enum at the
 * API boundary): `role` = Rol/Preferencia, `lookingFor` = "Qué buscas".
 */
export const profileDetailsTable = pgTable("profile_details", {
  // Supabase auth user UUID — one row per user.
  userId: uuid("user_id").primaryKey(),
  // Rol/Preferencia: activo | pasivo | versatil | heterocurioso | flexible | no_decir
  role: text("role"),
  // Qué buscas: amistad | chat | citas | relacion | encuentros | lo_que_surja
  lookingFor: text("looking_for"),
  // When the user finished the mandatory animated onboarding tutorial. NULL until
  // completed; set once (never re-shown). Lives here (not Supabase) because the
  // Supabase `profiles` schema is NOT DDL-modifiable from this repo.
  tutorialCompletedAt: timestamp("tutorial_completed_at", { withTimezone: true }),
  // "Mostrarme en el mapa": whether the user appears as a marker on the Gold map.
  // Default true (visible); the user can opt out to be invisible to everyone on
  // the map. Private setting — never exposed on PublicProfile.
  showOnMap: boolean("show_on_map").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type ProfileDetails = typeof profileDetailsTable.$inferSelect;
export type InsertProfileDetails = typeof profileDetailsTable.$inferInsert;
