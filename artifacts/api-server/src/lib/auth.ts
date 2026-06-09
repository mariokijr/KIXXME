import type { Request, Response } from "express";
  import { supabase, supabaseAuth } from "./supabase.js";

  export function getToken(req: Request): string | null {
    return req.headers.authorization?.replace("Bearer ", "") ?? null;
  }

  export async function requireAuth(
    req: Request,
    res: Response
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
    supabase
      .from("profiles")
      .update({ last_active_at: new Date().toISOString() })
      .eq("id", data.user.id)
      .then(() => {});

    return { userId: data.user.id, token };
  }
  