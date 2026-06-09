import type { Request, Response } from "express";
import { supabase, supabaseAuth } from "./supabase.js";

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
 */
export async function requireAuth(
  req: Request,
  res: Response,
): Promise<{ userId: string; token: string } | null> {
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
  touchLastActive(data.user.id);
  return { userId: data.user.id, token };
}

/**
 * Optional auth: returns the user when a valid token is present, otherwise null.
 * Never writes a response, so handlers can serve public and authenticated
 * variants from the same endpoint.
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
