// Shared profile-form vocabulary and the single "calidad mínima" gate used by
// both the editable "Mi perfil" page and the mandatory onboarding profile step.
// Keeping the options + the completeness check in one place guarantees the two
// surfaces agree on what a complete profile is.

export type RoleValue =
  | "activo"
  | "pasivo"
  | "versatil"
  | "heterocurioso"
  | "flexible"
  | "no_decir";

export type LookingForValue =
  | "amistad"
  | "chat"
  | "citas"
  | "relacion"
  | "encuentros"
  | "lo_que_surja";

export const ROLE_OPTIONS: { value: RoleValue; label: string }[] = [
  { value: "activo", label: "Activo" },
  { value: "pasivo", label: "Pasivo" },
  { value: "versatil", label: "Versátil" },
  { value: "heterocurioso", label: "Heterocurioso" },
  { value: "flexible", label: "Flexible" },
  { value: "no_decir", label: "Prefiero no decirlo" },
];

export const LOOKING_FOR_OPTIONS: { value: LookingForValue; label: string }[] = [
  { value: "amistad", label: "Amistad" },
  { value: "chat", label: "Chat" },
  { value: "citas", label: "Citas" },
  { value: "relacion", label: "Relación seria" },
  { value: "encuentros", label: "Encuentros" },
  { value: "lo_que_surja", label: "Lo que surja" },
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
