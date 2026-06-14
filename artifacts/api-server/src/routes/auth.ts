import { Router } from "express";
import { supabase, supabaseUserAuth } from "../lib/supabase.js";
import { reactivateOnLogin } from "../lib/account.js";
import { sendEmail, appBaseUrl, passwordResetEmail } from "../lib/email.js";
import {
  isValidEmail,
  sendVerificationEmail,
} from "../lib/email-verification.js";

const router = Router();

// --- Simple in-memory rate limiter for the password-reset request endpoint --
// Guards against abuse of the unauthenticated forgot-password endpoint (admin
// generateLink bypasses Supabase's own email rate limits, and the Gmail
// connector quota is finite). In-memory is acceptable here: a single process
// with no hot reload; counters resetting on restart is harmless.
const RESET_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RESET_MAX = 5; // attempts per key per window
const resetHits = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const hits = (resetHits.get(key) ?? []).filter(
    (t) => now - t < RESET_WINDOW_MS,
  );
  if (hits.length >= RESET_MAX) {
    resetHits.set(key, hits);
    return true;
  }
  hits.push(now);
  resetHits.set(key, hits);
  return false;
}

function clientIp(headers: Record<string, unknown>, fallback?: string): string {
  // Use the LAST x-forwarded-for entry (appended by our trusted proxy), not the
  // first. The leftmost entry is the raw client-supplied value and is trivially
  // spoofable, so keying the rate limiter on it would let an attacker rotate
  // fake IPs to bypass the per-IP bucket.
  const fwd = headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) {
    const parts = fwd.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1]!;
  }
  return fallback ?? "unknown";
}

router.post("/auth/signup", async (req, res) => {
  const { email, password, username } = req.body as {
    email?: string;
    password?: string;
    username?: string;
  };

  if (!email || !password) {
    res.status(400).json({ error: "email and password are required" });
    return;
  }
  if (!isValidEmail(email)) {
    res
      .status(400)
      .json({ error: "Introduce un correo electrónico válido." });
    return;
  }

  const { data, error } = await supabaseUserAuth.auth.signUp({
    email,
    password,
    options: {
      data: { username: username ?? "" },
    },
  });

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  // Send the 6-digit verification code. The account is created but gated
  // (requireAuth → EmailVerificationGate) until the user confirms the code.
  // The welcome email is deferred to the moment verification first succeeds
  // (see routes/email-verification.ts confirm handler) so it only lands for
  // a genuinely usable account. Emails are delivered via Resend using the
  // verified custom domain (support@kixxme.com).
  if (data.user?.id) {
    void sendVerificationEmail(data.user.id, email).catch((err) => {
      req.log.error(
        { err: err instanceof Error ? err.message : String(err) },
        "signup: failed to send verification email",
      );
    });
  }

  // The in-app verify screen needs the session that Supabase returns from
  // signUp — which only happens while the project's "Confirm email" setting is
  // OFF. A null session means it has been turned ON; log loudly so it's caught.
  if (!data.session) {
    req.log.warn(
      "signup: no session returned — Supabase 'Confirm email' is likely ON; the in-app email-verification flow requires it OFF",
    );
  }

  res.status(201).json({
    user: {
      id: data.user?.id ?? "",
      email: data.user?.email ?? "",
      username: (data.user?.user_metadata?.username as string) ?? "",
    },
    session: data.session
      ? {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: data.session.expires_at ?? 0,
        }
      : null,
  });
});

router.post("/auth/login", async (req, res) => {
  const { email, password } = req.body as {
    email?: string;
    password?: string;
  };

  if (!email || !password) {
    res.status(400).json({ error: "email and password are required" });
    return;
  }

  const { data, error } = await supabaseUserAuth.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    res.status(401).json({ error: error.message });
    return;
  }

  // Logging in is the user's "I'm back" signal: clear any temporary
  // deactivation (timed or indefinite) before returning the session.
  try {
    await reactivateOnLogin(data.user.id);
  } catch (err) {
    req.log.error(
      { err: err instanceof Error ? err.message : String(err) },
      "login: reactivation failed",
    );
  }

  res.json({
    user: {
      id: data.user.id,
      email: data.user.email ?? "",
      username: (data.user.user_metadata?.username as string) ?? "",
    },
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at ?? 0,
    },
  });
});

router.post("/auth/logout", async (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    res.status(401).json({ error: "No token provided" });
    return;
  }

  const { error } = await supabase.auth.admin.signOut(token);
  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.json({ message: "Logged out successfully" });
});

router.post("/auth/refresh", async (req, res) => {
  const { refresh_token } = req.body as { refresh_token?: string };

  if (!refresh_token) {
    res.status(400).json({ error: "refresh_token is required" });
    return;
  }

  const { data, error } = await supabaseUserAuth.auth.refreshSession({
    refresh_token,
  });
  if (error) {
    res.status(401).json({ error: error.message });
    return;
  }

  res.json({
    session: {
      access_token: data.session?.access_token ?? "",
      refresh_token: data.session?.refresh_token ?? "",
      expires_at: data.session?.expires_at ?? 0,
    },
  });
});

router.post("/auth/forgot-password", async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "email is required" });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const ip = clientIp(req.headers, req.ip);
  if (rateLimited(`ip:${ip}`) || rateLimited(`email:${normalizedEmail}`)) {
    res.status(429).json({
      error: "Demasiadas solicitudes. Inténtalo de nuevo en unos minutos.",
    });
    return;
  }

  // Respond 200 immediately and identically whether or not the account exists,
  // so the endpoint can't be used to enumerate users (no existence signal, no
  // timing side-channel). Link generation + email send run in the background.
  res.json({ ok: true });

  const base = appBaseUrl();
  if (!base) {
    req.log.warn(
      "forgot-password: appBaseUrl unavailable (neither APP_BASE_URL nor REPLIT_DOMAINS set); cannot build reset link",
    );
    return;
  }

  // The reset redirect is derived server-side and never taken from the client,
  // so this unauthenticated endpoint can't be coerced into emailing
  // attacker-controlled links from the official KixxMe address.
  const redirectTo = `${base}/reset-password`;

  try {
    const { data, error } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email: normalizedEmail,
      options: { redirectTo },
    });
    const link = data?.properties?.action_link;
    if (error || !link) {
      // Most commonly "user not found" — stay silent to the caller.
      req.log.info(
        { err: error?.message },
        "forgot-password: no reset link generated",
      );
      return;
    }
    const { subject, html } = passwordResetEmail(link);
    const sent = await sendEmail({ to: normalizedEmail, subject, html });
    if (!sent) {
      req.log.warn(
        "forgot-password: reset email not sent (email provider not configured?)",
      );
    }
  } catch (err) {
    req.log.error(
      { err: err instanceof Error ? err.message : String(err) },
      "forgot-password: failed to generate/send reset link",
    );
  }
});

router.post("/auth/reset-password", async (req, res) => {
  const { accessToken, password } = req.body as {
    accessToken?: string;
    password?: string;
  };

  if (!accessToken || typeof accessToken !== "string") {
    res
      .status(400)
      .json({ error: "El enlace no es válido o ha caducado. Solicita uno nuevo." });
    return;
  }
  if (!password || typeof password !== "string" || password.length < 6) {
    res
      .status(400)
      .json({ error: "La contraseña debe tener al menos 6 caracteres." });
    return;
  }

  // The recovery access token in the reset link is a short-lived session token.
  // Validate it and resolve the user it belongs to (failure => expired/tampered).
  const { data: userData, error: userErr } =
    await supabase.auth.getUser(accessToken);
  if (userErr || !userData?.user) {
    res.status(400).json({
      error: "El enlace no es válido o ha caducado. Solicita uno nuevo.",
    });
    return;
  }
  const user = userData.user;

  const { error: updErr } = await supabase.auth.admin.updateUserById(user.id, {
    password,
  });
  if (updErr) {
    // Keep all user-facing copy in Spanish; log the raw provider message.
    req.log.warn(
      { err: updErr.message },
      "reset-password: updateUserById failed",
    );
    const raw = updErr.message.toLowerCase();
    const spanish = raw.includes("different")
      ? "La nueva contraseña debe ser diferente a la anterior."
      : raw.includes("should be at least") || raw.includes("at least 6")
        ? "La contraseña debe tener al menos 6 caracteres."
        : "No se pudo actualizar la contraseña. Inténtalo de nuevo.";
    res.status(400).json({ error: spanish });
    return;
  }

  // Invalidate every existing session now that the password changed. A recovery
  // reset must log out anyone holding an old token (including a potential
  // attacker), mirroring the OTP-gated change-password flow's session sweep.
  // Best-effort — the password is already updated, so never fail the reset on a
  // revocation hiccup. Runs BEFORE the fresh sign-in below so the new session
  // isn't swept away by this global sign-out.
  try {
    await supabase.auth.admin.signOut(accessToken, "global");
  } catch (err) {
    req.log.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "reset-password: session revocation failed",
    );
  }

  // Resetting the password is also an "I'm back" signal: clear any temporary
  // deactivation, mirroring login.
  try {
    await reactivateOnLogin(user.id);
  } catch (err) {
    req.log.error(
      { err: err instanceof Error ? err.message : String(err) },
      "reset-password: reactivation failed",
    );
  }

  // Mint a fresh, full session so the client lands logged in immediately. If
  // auto sign-in fails for any reason the password change still succeeded, so
  // return the user with a null session and let the client route to login.
  const email = user.email;
  if (email) {
    const { data: signInData, error: signInErr } =
      await supabaseUserAuth.auth.signInWithPassword({ email, password });
    if (!signInErr && signInData.session) {
      res.json({
        user: {
          id: user.id,
          email,
          username: (user.user_metadata?.username as string) ?? "",
        },
        session: {
          access_token: signInData.session.access_token,
          refresh_token: signInData.session.refresh_token,
          expires_at: signInData.session.expires_at ?? 0,
        },
      });
      return;
    }
    req.log.warn(
      { err: signInErr?.message },
      "reset-password: auto sign-in failed after password update",
    );
  }

  res.json({
    user: {
      id: user.id,
      email: email ?? "",
      username: (user.user_metadata?.username as string) ?? "",
    },
    session: null,
  });
});

export default router;
