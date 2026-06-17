import { pgTable, uuid, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";

/**
 * Extra profile attributes that don't exist on the Supabase `profiles` table
 * and can't be added there (Supabase schema is NOT DDL-modifiable from this
 * repo). Lives in the repo-owned Replit Postgres (DATABASE_URL).
 *
 * Same dual-DB pattern as verification/visits/blocks: `userId` holds the
 * Supabase auth user UUID, there are no cross-DB foreign keys, and the API
 * merges these fields into the profile read responses in application code.
 */
export const profileDetailsTable = pgTable("profile_details", {
  userId: uuid("user_id").primaryKey(),

  // --- Core discovery fields (required for calidad mínima) ---
  // Rol/Preferencia: activo | pasivo | versatil | versatil_activo | versatil_pasivo | sin_preferencias | no_decir
  role: text("role"),
  // Qué buscas: amistad | chat | citas | relacion | encuentros | lo_que_surja
  lookingFor: text("looking_for"),

  // --- Enrichment fields (optional, displayed on profile & swipe card) ---

  // Orientación sexual: gay | bisexual | curioso | heteroflexible | pansexual |
  //   demisexual | asexual | en_exploracion | no_decir
  orientation: text("orientation"),

  // Altura en centímetros (e.g. 175). Nullable = not set.
  heightCm: integer("height_cm"),

  // Signo zodiacal: aries | tauro | geminis | cancer | leo | virgo |
  //   libra | escorpio | sagitario | capricornio | acuario | piscis
  zodiacSign: text("zodiac_sign"),

  // Hábitos: alcohol
  // no_bebo | ocasionalmente | fines_semana | frecuentemente
  alcohol: text("alcohol"),

  // Hábitos: tabaco
  // no_fumo | fumo_ocasionalmente | fumo | intentando_dejarlo
  tobacco: text("tobacco"),

  // Hábitos: ejercicio
  // todos_dias | frecuentemente | a_veces | nunca
  exercise: text("exercise"),

  // Mascotas: tengo_perro | tengo_gato | tengo_mascotas | no_mascotas | me_encantan
  pets: text("pets"),

  // --- Private / system fields ---

  tutorialCompletedAt: timestamp("tutorial_completed_at", { withTimezone: true }),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  showOnMap: boolean("show_on_map").notNull().default(true),

  // One-time privacy notice acknowledgements (set on first visit to each section).
  mapPrivacyAcknowledgedAt: timestamp("map_privacy_acknowledged_at", { withTimezone: true }),
  livePrivacyAcknowledgedAt: timestamp("live_privacy_acknowledged_at", { withTimezone: true }),

  // Boost: when set (and in the future), this user appears first in Descubrir.
  // Expires automatically — no cleanup needed, the sort just checks > now().
  boostExpiresAt: timestamp("boost_expires_at", { withTimezone: true }),

  // Modo invisible (Gold only): when true, viewing another profile does NOT
  // record a visitor footprint on the target user's visitor list.
  invisibleMode: boolean("invisible_mode").notNull().default(false),

  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type ProfileDetails = typeof profileDetailsTable.$inferSelect;
export type InsertProfileDetails = typeof profileDetailsTable.$inferInsert;
