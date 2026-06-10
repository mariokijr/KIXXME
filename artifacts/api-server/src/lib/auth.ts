import type { Request, Response } from "express";
import { supabase, supabaseAuth } from "./supabase.js";
import { getModerationState } from "./moderation.js";

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
 */
export async function requireAuth(
  req: Request,
  res: Response,
  opts?: { allowModerated?: boolean },
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

  touchLastActive(userId);
  return { userId, token, email: data.user.email ?? null };
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
