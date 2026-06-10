/**
 * Pure, client-side profile-completion score. There is no backend endpoint —
 * the score is derived from the already-fetched profile + photo list so the
 * UI can nudge users toward a fuller profile (and reuse the same checklist as
 * a "missing items" list). Keep this dependency-free and side-effect-free.
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
  /** Number of gallery photos (excludes nothing — just the photo list length). */
  photoCount: number;
}

export interface ProfileCompletion {
  /** 0–100 completion percentage (rounded). */
  percent: number;
  /** How many checklist items are done. */
  completed: number;
  /** Total checklist items. */
  total: number;
  /** Spanish labels for the items still missing, in display order. */
  missing: string[];
  /** True when every checklist item is complete. */
  complete: boolean;
}

interface CompletionCheck {
  /** Spanish call-to-action shown when the item is missing. */
  label: string;
  done: (i: ProfileCompletionInput) => boolean;
}

const CHECKS: CompletionCheck[] = [
  { label: "Añade un nombre de usuario", done: (i) => !!i.username?.trim() },
  { label: "Sube una foto de perfil", done: (i) => !!i.avatar_url?.trim() },
  { label: "Añade al menos una foto a tu galería", done: (i) => i.photoCount >= 1 },
  { label: "Escribe tu bio", done: (i) => !!i.bio?.trim() },
  { label: "Indica tu edad", done: (i) => i.age != null && i.age > 0 },
  { label: "Añade tu género", done: (i) => !!i.gender?.trim() },
  { label: "Añade tu ciudad", done: (i) => !!i.city?.trim() },
  { label: "Añade tu país", done: (i) => !!i.location?.trim() },
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
