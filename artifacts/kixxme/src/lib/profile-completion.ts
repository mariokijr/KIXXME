/**
 * Pure, client-side profile-completion score. Derived from the already-fetched
 * profile + photo list so the UI can nudge users toward a fuller profile.
 */

export interface ProfileCompletionInput {
  username?: string | null;
  bio?: string | null;
  age?: number | null;
  city?: string | null;
  gender?: string | null;
  location?: string | null;
  avatar_url?: string | null;
  is_verified?: boolean | null;
  role?: string | null;
  looking_for?: string | null;
  orientation?: string | null;
  height_cm?: number | null;
  zodiac_sign?: string | null;
  alcohol?: string | null;
  tobacco?: string | null;
  exercise?: string | null;
  pets?: string | null;
  photoCount: number;
}

export interface ProfileCompletion {
  percent: number;
  completed: number;
  total: number;
  missing: string[];
  complete: boolean;
}

interface CompletionCheck {
  label: string;
  done: (i: ProfileCompletionInput) => boolean;
}

const CHECKS: CompletionCheck[] = [
  { label: "Añade un nombre de usuario", done: (i) => !!i.username?.trim() },
  { label: "Sube una foto de perfil", done: (i) => !!i.avatar_url?.trim() },
  { label: "Añade al menos 2 fotos a tu galería", done: (i) => i.photoCount >= 2 },
  { label: "Escribe tu bio", done: (i) => !!i.bio?.trim() },
  { label: "Indica tu edad", done: (i) => i.age != null && i.age > 0 },
  { label: "Añade tu ciudad", done: (i) => !!i.city?.trim() },
  { label: "Selecciona tu rol/preferencia", done: (i) => !!i.role },
  { label: "Indica qué buscas", done: (i) => !!i.looking_for },
  { label: "Añade tu orientación", done: (i) => !!i.orientation },
  { label: "Añade tu altura", done: (i) => i.height_cm != null && i.height_cm > 0 },
  { label: "Añade tu signo zodiacal", done: (i) => !!i.zodiac_sign },
  { label: "Indica tus hábitos (alcohol)", done: (i) => !!i.alcohol },
  { label: "Indica tus hábitos (ejercicio)", done: (i) => !!i.exercise },
  { label: "Verifica tu perfil", done: (i) => !!i.is_verified },
];

export function computeProfileCompletion(
  input: ProfileCompletionInput,
): ProfileCompletion {
  const results = CHECKS.map((c) => ({ label: c.label, done: c.done(input) }));
  const completed = results.filter((r) => r.done).length;
  const total = results.length;
  return {
    percent: Math.round((completed / total) * 100),
    completed,
    total,
    missing: results.filter((r) => !r.done).map((r) => r.label),
    complete: completed === total,
  };
}
