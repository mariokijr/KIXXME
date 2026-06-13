import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { supabase } from "../lib/supabase.js";
import { consumeActionCode, requestCooldownRemaining } from "../lib/account.js";
import {
  VERIFY_EMAIL_ACTION,
  isEmailVerified,
  isValidEmail,
  sendVerificationEmail,
} from "../lib/email-verification.js";
import { markEmailVerified } from "../lib/profile-details.js";
import {
  sendEmail,
  appBaseUrl,
  WELCOME_SUBJECT,
  welcomeEmailHtml,
} from "../lib/email.js";
import { ConfirmEmailVerificationBody } from "@workspace/api-zod";

const router = Router();

/**
 * Mandatory email verification at signup. A new account is unusable (gated in
 * `requireAuth`) until the user proves access to their inbox with a 6-digit code
 * (15-min TTL, 5 attempts, 60s resend cooldown — all via the shared hardened
 * code lifecycle in `lib/account.ts`). Every endpoint here is reachable while
 * unverified (`allowUnverified`) because this IS the flow that lifts the gate.
 */

/** Resolve the Supabase auth user (id, email, created_at) for grandfather logic. */
async function getAuthUser(userId: string) {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error) return null;
  return data.user ?? null;
}

/** Whether the caller still needs to verify, plus their email (for masking). */
router.get("/me/email-verification", async (req, res) => {
  const auth = await requireAuth(req, res, { allowUnverified: true });
  if (!auth) return;

  const user = await getAuthUser(auth.userId);
  // Fail open on lookup failure: never trap a user behind the verify screen.
  const verified = user ? await isEmailVerified(user, req.log) : true;
  res.json({ verified, email: user?.email ?? auth.email ?? "" });
});

/** Email a fresh verification code (60s resend cooldown). */
router.post("/auth/email/verify/send", async (req, res) => {
  const auth = await requireAuth(req, res, { allowUnverified: true });
  if (!auth) return;

  const user = await getAuthUser(auth.userId);
  if (!user) {
    res.status(400).json({ error: "No se pudo encontrar tu cuenta." });
    return;
  }

  // Already verified (incl. grandfathered / system accounts): nothing to send.
  if (await isEmailVerified(user, req.log)) {
    res.json({
      sent: false,
      expiresAt: null,
      message: "Tu correo ya está verificado.",
    });
    return;
  }

  const email = user.email;
  if (!email || !isValidEmail(email)) {
    res
      .status(400)
      .json({ error: "No se pudo encontrar tu correo electrónico." });
    return;
  }

  // Allow one resend every 30s (shorter than the default 60s so users blocked
  // by a failed email send can retry quickly without a minute-long wait).
  const VERIFY_COOLDOWN_MS = 30_000;
  const remaining = await requestCooldownRemaining(
    auth.userId,
    VERIFY_EMAIL_ACTION,
    VERIFY_COOLDOWN_MS,
  );
  if (remaining > 0) {
    res.status(429).json({
      error: `Espera ${Math.ceil(remaining / 1000)} segundos antes de pedir otro código`,
    });
    return;
  }

  const { sent, expiresAt } = await sendVerificationEmail(auth.userId, email);
  if (!sent) {
    // Don't make the user wait for a code that will never arrive.
    res.status(200).json({
      sent: false,
      expiresAt: expiresAt.toISOString(),
      message:
        "No pudimos enviar el correo de verificación en este momento. Inténtalo de nuevo más tarde.",
    });
    return;
  }

  res.json({ sent: true, expiresAt: expiresAt.toISOString() });
});

/** Confirm the emailed code; on success the account becomes usable. */
router.post("/auth/email/verify/confirm", async (req, res) => {
  const auth = await requireAuth(req, res, { allowUnverified: true });
  if (!auth) return;

  const parsed = ConfirmEmailVerificationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Solicitud no válida" });
    return;
  }
  const code = parsed.data.code.trim();
  if (!/^\d{6}$/.test(code)) {
    res.status(400).json({ error: "Código no válido" });
    return;
  }

  const result = await consumeActionCode(auth.userId, VERIFY_EMAIL_ACTION, code);
  if (!result.ok) {
    const msg =
      result.reason === "expired"
        ? "El código ha caducado. Solicita uno nuevo."
        : result.reason === "toomany"
          ? "Demasiados intentos. Solicita un código nuevo."
          : result.reason === "notfound"
            ? "No hay ningún código pendiente. Solicita uno nuevo."
            : "Código incorrecto.";
    res.status(400).json({ error: msg });
    return;
  }

  const { firstSet } = await markEmailVerified(auth.userId);

  // Welcome email fires exactly once — the moment verification first succeeds.
  // (Moved here from signup so it lands only for a genuinely usable account.)
  if (firstSet) {
    const email = auth.email ?? (await getAuthUser(auth.userId))?.email ?? null;
    if (email) {
      const base = appBaseUrl();
      void sendEmail({
        to: email,
        subject: WELCOME_SUBJECT,
        html: welcomeEmailHtml(base ? `${base}/` : undefined),
      });
    }
  }

  res.json({ verified: true, email: auth.email ?? "" });
});

export default router;
