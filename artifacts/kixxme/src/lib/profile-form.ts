// Shared profile-form vocabulary and the single "calidad mínima" gate used by
// both the editable "Mi perfil" page and the mandatory onboarding profile step.
// Keeping the options + the completeness check in one place guarantees the two
// surfaces agree on what a complete profile is.

export type RoleValue =
  | "activo"
  | "pasivo"
  | "versatil"
  | "versatil_activo"
  | "versatil_pasivo"
  | "sin_preferencias"
  | "no_decir";

export type LookingForValue =
  | "amistad"
  | "chat"
  | "citas"
  | "relacion"
  | "encuentros"
  | "lo_que_surja";

export type OrientationValue =
  | "gay"
  | "bisexual"
  | "curioso"
  | "heteroflexible"
  | "pansexual"
  | "demisexual"
  | "asexual"
  | "en_exploracion"
  | "no_decir";

export type ZodiacSignValue =
  | "aries" | "tauro" | "geminis" | "cancer" | "leo" | "virgo"
  | "libra" | "escorpio" | "sagitario" | "capricornio" | "acuario" | "piscis";

export type AlcoholValue = "no_bebo" | "ocasionalmente" | "fines_semana" | "frecuentemente";
export type TobaccoValue = "no_fumo" | "fumo_ocasionalmente" | "fumo" | "intentando_dejarlo";
export type ExerciseValue = "todos_dias" | "frecuentemente" | "a_veces" | "nunca";
export type PetsValue = "tengo_perro" | "tengo_gato" | "tengo_mascotas" | "no_mascotas" | "me_encantan";

export const ROLE_OPTIONS: { value: RoleValue; label: string }[] = [
  { value: "activo", label: "Activo" },
  { value: "pasivo", label: "Pasivo" },
  { value: "versatil", label: "Versátil" },
  { value: "versatil_activo", label: "Versátil activo" },
  { value: "versatil_pasivo", label: "Versátil pasivo" },
  { value: "sin_preferencias", label: "Sin preferencias" },
  { value: "no_decir", label: "Prefiero no decirlo" },
];

export const LOOKING_FOR_OPTIONS: { value: LookingForValue; label: string }[] = [
  { value: "relacion", label: "Relación seria" },
  { value: "citas", label: "Citas" },
  { value: "amistad", label: "Amistad" },
  { value: "encuentros", label: "Algo casual" },
  { value: "chat", label: "Conocer gente" },
  { value: "lo_que_surja", label: "Ya veremos" },
];

export const ORIENTATION_OPTIONS: { value: OrientationValue; label: string }[] = [
  { value: "gay", label: "Gay" },
  { value: "bisexual", label: "Bisexual" },
  { value: "curioso", label: "Curioso" },
  { value: "heteroflexible", label: "Heteroflexible" },
  { value: "pansexual", label: "Pansexual" },
  { value: "demisexual", label: "Demisexual" },
  { value: "asexual", label: "Asexual" },
  { value: "en_exploracion", label: "En exploración" },
  { value: "no_decir", label: "Prefiero no decirlo" },
];

export const ZODIAC_OPTIONS: { value: ZodiacSignValue; label: string; emoji: string }[] = [
  { value: "aries", label: "Aries", emoji: "♈" },
  { value: "tauro", label: "Tauro", emoji: "♉" },
  { value: "geminis", label: "Géminis", emoji: "♊" },
  { value: "cancer", label: "Cáncer", emoji: "♋" },
  { value: "leo", label: "Leo", emoji: "♌" },
  { value: "virgo", label: "Virgo", emoji: "♍" },
  { value: "libra", label: "Libra", emoji: "♎" },
  { value: "escorpio", label: "Escorpio", emoji: "♏" },
  { value: "sagitario", label: "Sagitario", emoji: "♐" },
  { value: "capricornio", label: "Capricornio", emoji: "♑" },
  { value: "acuario", label: "Acuario", emoji: "♒" },
  { value: "piscis", label: "Piscis", emoji: "♓" },
];

export const ALCOHOL_OPTIONS: { value: AlcoholValue; label: string; emoji: string }[] = [
  { value: "no_bebo", label: "No bebo", emoji: "🚫" },
  { value: "ocasionalmente", label: "Ocasionalmente", emoji: "🥂" },
  { value: "fines_semana", label: "Fines de semana", emoji: "🍻" },
  { value: "frecuentemente", label: "Frecuentemente", emoji: "🍷" },
];

export const TOBACCO_OPTIONS: { value: TobaccoValue; label: string; emoji: string }[] = [
  { value: "no_fumo", label: "No fumo", emoji: "🚭" },
  { value: "fumo_ocasionalmente", label: "Ocasionalmente", emoji: "🌬️" },
  { value: "fumo", label: "Fumo", emoji: "🚬" },
  { value: "intentando_dejarlo", label: "Intentando dejarlo", emoji: "💪" },
];

export const EXERCISE_OPTIONS: { value: ExerciseValue; label: string; emoji: string }[] = [
  { value: "todos_dias", label: "Todos los días", emoji: "🏋️" },
  { value: "frecuentemente", label: "Frecuentemente", emoji: "🏃" },
  { value: "a_veces", label: "A veces", emoji: "🚶" },
  { value: "nunca", label: "Nunca", emoji: "😅" },
];

export const PETS_OPTIONS: { value: PetsValue; label: string; emoji: string }[] = [
  { value: "tengo_perro", label: "Tengo perro", emoji: "🐕" },
  { value: "tengo_gato", label: "Tengo gato", emoji: "🐈" },
  { value: "tengo_mascotas", label: "Tengo mascotas", emoji: "🐾" },
  { value: "no_mascotas", label: "No tengo mascotas", emoji: "🏠" },
  { value: "me_encantan", label: "Me encantan los animales", emoji: "❤️" },
];

export const MIN_BIO_LENGTH = 10;
export const MIN_AGE = 18;

export interface MandatoryProfileInput {
  username?: string | null;
  bio?: string | null;
  age?: number | null;
  city?: string | null;
  role?: string | null;
  looking_for?: string | null;
  avatar_url?: string | null;
  photoCount: number;
}

export interface MandatoryProfileStatus {
  complete: boolean;
  /** Human-readable Spanish labels for the missing pieces, in display order. */
  missing: string[];
}

/**
 * The "calidad mínima" required for a profile to be usable: a main photo plus the
 * fields needed to appear in Descubrir. Returns the Spanish labels of whatever is
 * still missing so callers can build a single clear message.
 */
export function computeMandatoryProfile(
  input: MandatoryProfileInput,
): MandatoryProfileStatus {
  const missing: string[] = [];

  const hasMainPhoto = !!input.avatar_url?.trim() || input.photoCount > 0;
  if (!hasMainPhoto) missing.push("una foto principal");
  if (!input.username?.trim()) missing.push("nombre de usuario");
  if ((input.bio?.trim().length ?? 0) < MIN_BIO_LENGTH)
    missing.push(`una biografía (mín. ${MIN_BIO_LENGTH} caracteres)`);
  if (input.age == null) missing.push("tu edad");
  else if (input.age < MIN_AGE) missing.push(`tu edad (mínimo ${MIN_AGE} años)`);
  if (!input.city?.trim()) missing.push("tu ciudad");
  if (!input.role) missing.push("rol/preferencia");
  if (!input.looking_for) missing.push("qué buscas");

  return { complete: missing.length === 0, missing };
}
