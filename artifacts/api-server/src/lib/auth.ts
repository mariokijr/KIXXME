import type { Request, Response } from "express";
import { supabase, supabaseAuth } from "./supabase.js";
import { getModerationState } from "./moderation.js";
import { recordIfSystem, isSystemEmail } from "./system-accounts.js";
import { isEmailVerified } from "./email-verification.js";

export interface AuthContext {
  userId: string;
  token: string;
  email: string | null;
}

export function getToken(req: Request): string | null {
  return req.headers.authorization?.replace("Bearer ", "") ?? null;
}

function touchLastActive(userId: string): void {
  supabase
    .from("profiles")
    .update({ last_active_at: new Date().toISOString() })
    .eq("id", userId)
    .then(() => {});
}

/**
 * Require a valid Supabase JWT. Writes a 401 response and returns null when the
 * token is missing or invalid. Also refreshes the user's last_active_at.
 *
 * Suspended/banned users are blocked here with a 403 carrying a machine-readable
 * `code` ('suspended' | 'banned') and `until` so the client can show the right
 * Spanish screen. Pass `{ allowModerated: true }` for the few endpoints a
 * moderated user must still reach (their own moderation status, logout, and
 * permanent account deletion).
 *
 * New accounts that haven't completed the mandatory email check are blocked with
 * a 403 `{ code: "email_unverified" }`. Pass `{ allowUnverified: true }` for the
 * endpoints the verification flow itself needs (send/confirm the code, read
 * own status) plus the self-service account-exit routes.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  opts?: { allowModerated?: boolean; allowUnverified?: boolean },
): Promise<AuthContext | null> {
  const token = getToken(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: "Invalid or expired token" });
    return null;
  }
  const userId = data.user.id;

  if (!opts?.allowModerated) {
    const mod = await getModerationState(userId);
    if (mod.state !== "active") {
      const error =
        mod.state === "banned"
          ? "Tu cuenta ha sido suspendida de forma permanente por incumplir las normas de la comunidad."
          : mod.state === "removed"
            ? "Tu cuenta ha sido eliminada por un administrador."
            : "Tu cuenta está temporalmente suspendida.";
      res.status(403).json({
        error,
        code: mod.state,
        until: mod.suspendedUntil ? mod.suspendedUntil.toISOString() : null,
      });
      return null;
    }
  }

  if (!opts?.allowUnverified) {
    const verified = await isEmailVerified(data.user, req.log);
    if (!verified) {
      res.status(403).json({
        error: "Confirma tu correo electrónico para continuar usando KixxMe.",
        code: "email_unverified",
      });
      return null;
    }
  }

  touchLastActive(userId);
  const email = data.user.email ?? null;
  recordIfSystem(userId, email);
  return { userId, token, email };
}

/**
 * Optional auth: returns the user when a valid token is present, otherwise null.
 * Never writes a response, so handlers can serve public and authenticated
 * variants from the same endpoint. Read-only, so moderation is not gated here.
 */
export async function optionalAuth(
  req: Request,
): Promise<{ userId: string; token: string } | null> {
  const token = getToken(req);
  if (!token) return null;
  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error || !data.user) return null;
  touchLastActive(data.user.id);
  return { userId: data.user.id, token };
}

/** Case-insensitive allowlist of admin emails from the ADMIN_EMAILS env var. */
function adminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().has(email.toLowerCase());
}

/**
 * Require an authenticated admin (email on the ADMIN_EMAILS allowlist). Writes
 * the appropriate 401/403 and returns null when not authorized.
 */
export async function requireAdmin(
  req: Request,
  res: Response,
): Promise<AuthContext | null> {
  const auth = await requireAuth(req, res);
  if (!auth) return null;
  if (!isAdminEmail(auth.email)) {
    res.status(403).json({ error: "No autorizado" });
    return null;
  }
  return auth;
}

/**
 * An "operator" is anyone who runs the support console: a real admin
 * (ADMIN_EMAILS) OR a system support account (SYSTEM_ACCOUNT_EMAILS, e.g.
 * supportkixxme@gmail.com). This is DELIBERATELY narrower than admin: it grants
 * only the support-ticket / support-inbox surfaces, NEVER the moderation,
 * verification or report-triage routes (those stay `requireAdmin`). The system
 * account is default-on with no env opt-in, so it must not silently inherit
 * ban/remove powers or access to private verification selfies.
 */
export function isOperatorEmail(email: string | null | undefined): boolean {
  return isAdminEmail(email) || isSystemEmail(email);
}

/**
 * Require an authenticated operator (admin OR system support account). Used by
 * the support-ticket queue and the support-inbox endpoints only.
 */
export async function requireOperator(
  req: Request,
  res: Response,
): Promise<AuthContext | null> {
  const auth = await requireAuth(req, res);
  if (!auth) return null;
  if (!isOperatorEmail(auth.email)) {
    res.status(403).json({ error: "No autorizado" });
    return null;
  }
  return auth;
}
