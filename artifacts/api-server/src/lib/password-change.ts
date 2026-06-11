import { supabase, supabaseUserAuth } from "./supabase.js";

/**
 * Secure password-change flow (Perfil/Ajustes). Email/password accounts only.
 *
 * The flow is gated by the shared 6-digit emailed code (see `lib/account.ts`),
 * with a dedicated action "change_password" and a 10-minute TTL. The new
 * password is NEVER persisted server-side: it is re-sent by the client at the
 * confirm step (held only in memory between the two screens) and validated +
 * applied then. Passwords are never logged and never emailed.
 */

export const PASSWORD_CHANGE_ACTION = "change_password" as const;

/** A password code is valid for 10 minutes (per the security-alert email). */
export const PASSWORD_CODE_TTL_MS = 10 * 60 * 1000;

/** Minimum length for a new password. */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Enforce "seguridad mínima": at least 8 characters with both letters and
 * numbers. Returns a Spanish error message, or null when the password is valid.
 * Never logs or echoes the password.
 */
export function validateNewPassword(password: unknown): string | null {
  if (typeof password !== "string" || password.length === 0) {
    return "Introduce una contraseña nueva.";
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `La nueva contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  if (!hasLetter || !hasNumber) {
    return "La nueva contraseña debe incluir letras y números.";
  }
  return null;
}

/**
 * Verify the account's CURRENT password by attempting a sign-in on the dedicated
 * session client (never the data/service clients — that would poison their RLS
 * context). Returns true only on a successful sign-in. The password is never
 * logged.
 */
export async function verifyCurrentPassword(
  email: string,
  currentPassword: string,
): Promise<boolean> {
  if (!email || !currentPassword) return false;
  const { data, error } = await supabaseUserAuth.auth.signInWithPassword({
    email,
    password: currentPassword,
  });
  return !error && !!data.session;
}

export type ApplyPasswordResult =
  | { ok: true }
  | { ok: false; error: string; providerMessage: string };

/**
 * Apply the new password via the admin API. Maps the provider's English error
 * to Spanish copy; the raw provider message is the only thing logged by the
 * caller (never the password itself).
 */
export async function applyNewPassword(
  userId: string,
  newPassword: string,
): Promise<ApplyPasswordResult> {
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    password: newPassword,
  });
  if (!error) return { ok: true };

  const raw = error.message.toLowerCase();
  const spanish = raw.includes("different")
    ? "La nueva contraseña no puede ser igual a la actual."
    : raw.includes("should be at least") || raw.includes("at least 6")
      ? `La nueva contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`
      : "No se pudo actualizar la contraseña. Inténtalo de nuevo.";
  return { ok: false, error: spanish, providerMessage: error.message };
}
