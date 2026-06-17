import { Router } from "express";
import { supabase, supabaseUserAuth } from "../lib/supabase.js";
import {
  markEmailVerified,
  markTutorialCompleted,
  upsertProfileDetails,
} from "../lib/profile-details.js";
import { db } from "@workspace/db";
import { likeActionsTable } from "@workspace/db";

/**
 * Development-only routes for testing and seeding.
 * All handlers 404 immediately in production.
 */
const router = Router();

const isDev = process.env.NODE_ENV !== "production";

/**
 * POST /dev/test-user
 * Creates a fully set-up test user (email verified, tutorial done, profile
 * complete, plan='gold') and returns credentials + session tokens so tests
 * can log in without going through the email-OTP flow.
 *
 * NEVER exposed in production.
 */
router.post("/dev/test-user", async (req, res) => {
  if (!isDev) {
    res.status(404).end();
    return;
  }

  const suffix = Math.random().toString(36).slice(2, 8);
  const email = `testuser+${suffix}@kixxme-test.invalid`;
  const password = `TestPass${suffix}123!`;
  const username = `tester_${suffix}`;

  // 1. Create Supabase auth user with email already confirmed.
  const { data: authData, error: authError } =
    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username },
    });

  if (authError || !authData.user) {
    res.status(500).json({ error: authError?.message ?? "createUser failed" });
    return;
  }

  const userId = authData.user.id;

  // 2. Wait briefly for the Supabase DB trigger to create the profiles row.
  await new Promise((r) => setTimeout(r, 800));

  // 3. Populate the Supabase profiles row with calidad mínima + Gold plan.
  await supabase.from("profiles").update({
    username,
    age: 25,
    city: "Madrid",
    bio: "Perfil de prueba para testing automatizado.",
    avatar_url:
      "https://ui-avatars.com/api/?name=Test+User&background=8b5cf6&color=fff&size=256",
    plan: "gold",
  }).eq("id", userId);

  // 4. Set mandatory profile_details (role + looking_for) — creates the row first.
  await upsertProfileDetails(userId, {
    role: "activo",
    lookingFor: "amistad",
  });

  // 5. Mark email verified + complete tutorial AFTER the row exists, so the
  //    onConflictDoUpdate only touches the columns it owns (no NULL overwrite).
  await markEmailVerified(userId);
  await markTutorialCompleted(userId);

  // 6. Sign in via the user-facing auth client to obtain a session.
  const { data: signIn, error: signInError } =
    await supabaseUserAuth.auth.signInWithPassword({ email, password });

  if (signInError || !signIn.session) {
    res
      .status(500)
      .json({ error: signInError?.message ?? "signIn failed" });
    return;
  }

  res.json({
    email,
    password,
    userId,
    access_token: signIn.session.access_token,
    refresh_token: signIn.session.refresh_token,
  });
});

/**
 * POST /dev/match-users
 * Creates a mutual like (match) between two test users so they can chat.
 * Body: { user_a_id, user_b_id }
 *
 * NEVER exposed in production.
 */
router.post("/dev/match-users", async (req, res) => {
  if (!isDev) {
    res.status(404).end();
    return;
  }

  const { user_a_id, user_b_id } = req.body as { user_a_id: string; user_b_id: string };
  if (!user_a_id || !user_b_id) {
    res.status(400).json({ error: "user_a_id and user_b_id required" });
    return;
  }

  try {
    await db.insert(likeActionsTable).values([
      { likerId: user_a_id, likedId: user_b_id, kind: "like", source: "quota" },
      { likerId: user_b_id, likedId: user_a_id, kind: "like", source: "quota" },
    ]).onConflictDoNothing();

    res.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
