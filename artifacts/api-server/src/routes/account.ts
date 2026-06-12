import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { supabase } from "../lib/supabase.js";
import {
  getAccountStatus,
  isEffectivelyDeactivated,
  requestCooldownRemaining,
  createActionCode,
  consumeActionCode,
  deactivate,
  deleteAccount,
  type AccountAction,
  type DeactivationType,
} from "../lib/account.js";
import {
  PASSWORD_CHANGE_ACTION,
  PASSWORD_CODE_TTL_MS,
  validateNewPassword,
  verifyCurrentPassword,
  applyNewPassword,
} from "../lib/password-change.js";
import {
  RequestAccountActionCodeBody,
  ConfirmAccountActionBody,
  RequestPasswordChangeCodeBody,
  ConfirmPasswordChangeBody,
} from "@workspace/api-zod";
import {
  sendEmail,
  appBaseUrl,
  accountActionCodeEmail,
  accountDeactivatedEmail,
  accountDeletedEmail,
  passwordChangeCodeEmail,
  passwordChangedEmail,
} from "../lib/email.js";

const router = Router();

/**
 * Account self-service: email-verified temporary DEACTIVATION (1m/3m/6m or
 * indefinite) and permanent DELETION. Both sensitive actions are gated by a
 * 6-digit code emailed to the account's address (see `lib/account.ts` for code
 * lifecycle and `lib/email.ts` for the Spanish templates).
 */

/** Resolve the account's email from the Supabase auth record. */
async function getUserEmail(userId: string): Promise<string | null> {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error) return null;
  return data.user?.email ?? null;
}

/** Current account status (active or deactivated). */
router.get("/account/status", async (req, res) => {
  // Reachable while email is unverified so the client can resolve session state.
  const auth = await requireAuth(req, res, { allowUnverified: true });
  if (!auth) return;

  const row = await getAccountStatus(auth.userId);
  if (!row || !isEffectivelyDeactivated(row)) {
    res.json({ status: "active" });
    return;
  }
  res.json({
    status: "deactivated",
    deactivationType: (row.deactivationType as DeactivationType | null) ?? null,
    deactivatedAt: row.deactivatedAt ? row.deactivatedAt.toISOString() : null,
    reactivateAt: row.reactivateAt ? row.reactivateAt.toISOString() : null,
  });
});

/** Email a verification code to confirm a deactivation or deletion. */
router.post("/account/verification/request", async (req, res) => {
  // Self-service exit (deactivate / permanent delete) must stay reachable for
  // suspended/banned users AND users who never verified their email — everyone
  // keeps the right to leave / erase their data.
  const auth = await requireAuth(req, res, {
    allowModerated: true,
    allowUnverified: true,
  });
  if (!auth) return;

  const parsed = RequestAccountActionCodeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Solicitud no válida" });
    return;
  }
  const action = parsed.data.action as AccountAction;

  let deactivationType: DeactivationType | undefined;
  if (action === "deactivate") {
    if (!parsed.data.deactivationType) {
      res.status(400).json({ error: "Debes elegir una duración" });
      return;
    }
    deactivationType = parsed.data.deactivationType;
  }

  // Rate limit: at most one code request per action per 60s.
  const remaining = await requestCooldownRemaining(auth.userId, action);
  if (remaining > 0) {
    res.status(429).json({
      error: `Espera ${Math.ceil(
        remaining / 1000,
      )} segundos antes de pedir otro código`,
    });
    return;
  }

  const email = await getUserEmail(auth.userId);
  if (!email) {
    res
      .status(400)
      .json({ error: "No se pudo encontrar tu correo electrónico" });
    return;
  }

  const { code, expiresAt } = await createActionCode(
    auth.userId,
    action,
    deactivationType ? { deactivationType } : undefined,
  );

  const { subject, html } = accountActionCodeEmail(action, code);
  const sent = await sendEmail({ to: email, subject, html });
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

/** Confirm a deactivation or deletion with the emailed code. */
router.post("/account/verification/confirm", async (req, res) => {
  // Self-service exit (deactivate / permanent delete) must stay reachable for
  // suspended/banned users AND users who never verified their email — everyone
  // keeps the right to leave / erase their data.
  const auth = await requireAuth(req, res, {
    allowModerated: true,
    allowUnverified: true,
  });
  if (!auth) return;

  const parsed = ConfirmAccountActionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Solicitud no válida" });
    return;
  }
  const action = parsed.data.action as AccountAction;
  const code = parsed.data.code.trim();
  if (!/^\d{6}$/.test(code)) {
    res.status(400).json({ error: "Código no válido" });
    return;
  }

  const result = await consumeActionCode(auth.userId, action, code);
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

  // Read the email BEFORE any irreversible step (deleteAccount removes the auth
  // user, after which the address can no longer be resolved).
  const email = await getUserEmail(auth.userId);

  if (action === "deactivate") {
    const dt = result.payload?.deactivationType ?? "indefinite";
    await deactivate(auth.userId, dt);

    // Invalidate every session: logging back in is what reactivates the account.
    try {
      await supabase.auth.admin.signOut(auth.token, "global");
    } catch (err) {
      req.log.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "deactivate: global sign-out failed (continuing)",
      );
    }

    if (email) {
      const row = await getAccountStatus(auth.userId);
      const base = appBaseUrl();
      const { subject, html } = accountDeactivatedEmail(
        row?.reactivateAt ?? null,
        base ? `${base}/` : undefined,
      );
      void sendEmail({ to: email, subject, html });
    }

    res.json({ success: true, action: "deactivate" });
    return;
  }

  // action === "delete" — irreversible, cross-database.
  try {
    await deleteAccount(auth.userId, req.log);
  } catch (err) {
    req.log.error(
      {
        err: err instanceof Error ? err.message : String(err),
        userId: auth.userId,
      },
      "account deletion failed",
    );
    res
      .status(500)
      .json({ error: "No se pudo eliminar la cuenta. Inténtalo de nuevo." });
    return;
  }

  if (email) {
    const { subject, html } = accountDeletedEmail();
    void sendEmail({ to: email, subject, html });
  }

  res.json({ success: true, action: "delete" });
});

// --- Password change -------------------------------------------------------
//
// Two-step, email-verified password change for email/password accounts:
//   1) /account/password/request — verify the CURRENT password, then email a
//      one-time 6-digit code (10-min TTL). The new password is NOT stored.
//   2) /account/password/confirm — consume the code and apply the new password
//      (re-sent by the client), then send a security notice.
//
// requireAuth already proves session ownership, so the current-password check
// is an identity re-confirmation. It still runs a Supabase sign-in per attempt,
// so we bound attempts per user (in-memory) to stop a hijacked session from
// brute-forcing the current password through this endpoint. Confirm is already
// protected by the code's own attempts cap + single-use + expiry.
const PW_REQUEST_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const PW_REQUEST_MAX = 10; // attempts per user per window
const pwRequestHits = new Map<string, number[]>();

function pwRequestRateLimited(userId: string): boolean {
  const now = Date.now();
  const hits = (pwRequestHits.get(userId) ?? []).filter(
    (t) => now - t < PW_REQUEST_WINDOW_MS,
  );
  if (hits.length >= PW_REQUEST_MAX) {
    pwRequestHits.set(userId, hits);
    return true;
  }
  hits.push(now);
  pwRequestHits.set(userId, hits);
  return false;
}

/** Verify the current password and email a one-time code to confirm a change. */
router.post("/account/password/request", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const parsed = RequestPasswordChangeCodeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Solicitud no válida" });
    return;
  }
  const { currentPassword, newPassword } = parsed.data;

  // Validate the new password BEFORE any network calls (cheap rejections first).
  const formatError = validateNewPassword(newPassword);
  if (formatError) {
    res.status(400).json({ error: formatError });
    return;
  }
  if (newPassword === currentPassword) {
    res.status(400).json({
      error: "La nueva contraseña no puede ser igual a la actual.",
    });
    return;
  }

  // Bound attempts per user (covers wrong-current-password retries that never
  // reach the code-cooldown below).
  if (pwRequestRateLimited(auth.userId)) {
    res.status(429).json({
      error: "Demasiados intentos. Inténtalo de nuevo en unos minutos.",
    });
    return;
  }

  const email = auth.email ?? (await getUserEmail(auth.userId));
  if (!email) {
    res
      .status(400)
      .json({ error: "No se pudo encontrar tu correo electrónico" });
    return;
  }

  // Re-confirm identity: the current password must be correct.
  const correct = await verifyCurrentPassword(email, currentPassword);
  if (!correct) {
    res.status(400).json({ error: "La contraseña actual no es correcta." });
    return;
  }

  // At most one code per 60s (separate from the per-user attempt cap above).
  const remaining = await requestCooldownRemaining(
    auth.userId,
    PASSWORD_CHANGE_ACTION,
  );
  if (remaining > 0) {
    res.status(429).json({
      error: `Espera ${Math.ceil(
        remaining / 1000,
      )} segundos antes de pedir otro código`,
    });
    return;
  }

  const { code, expiresAt } = await createActionCode(
    auth.userId,
    PASSWORD_CHANGE_ACTION,
    undefined,
    PASSWORD_CODE_TTL_MS,
  );

  const { subject, html } = passwordChangeCodeEmail(code);
  const sent = await sendEmail({ to: email, subject, html });
  if (!sent) {
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

/** Confirm and apply a password change with the emailed code. */
router.post("/account/password/confirm", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const parsed = ConfirmPasswordChangeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Solicitud no válida" });
    return;
  }
  const code = parsed.data.code.trim();
  const { newPassword } = parsed.data;
  if (!/^\d{6}$/.test(code)) {
    res.status(400).json({ error: "Código no válido" });
    return;
  }

  // Re-validate the new password (defense in depth — a client could bypass the
  // form UI). The current password is intentionally NOT required here: a valid
  // session plus the single-use, expiring code emailed to the account is the
  // proof of intent.
  const formatError = validateNewPassword(newPassword);
  if (formatError) {
    res.status(400).json({ error: formatError });
    return;
  }

  // Consume the code FIRST (single-use guarantee) before applying the change.
  const result = await consumeActionCode(
    auth.userId,
    PASSWORD_CHANGE_ACTION,
    code,
  );
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

  const applied = await applyNewPassword(auth.userId, newPassword);
  if (!applied.ok) {
    // Log the provider message only — never the password.
    req.log.warn(
      { err: applied.providerMessage },
      "password-change: updateUserById failed",
    );
    res.status(400).json({ error: applied.error });
    return;
  }

  // Evict every OTHER device's session so a password change locks out a possible
  // hijacker, while keeping the current session alive. Best-effort — never blocks
  // the success response. (`updateUserById` alone does not revoke refresh tokens.)
  try {
    await supabase.auth.admin.signOut(auth.token, "others");
  } catch (err) {
    req.log.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "password-change: sign-out of other sessions failed (continuing)",
    );
  }

  // Security notice (fire-and-forget): alert the owner that the password changed.
  const email = auth.email ?? (await getUserEmail(auth.userId));
  if (email) {
    const base = appBaseUrl();
    const { subject, html } = passwordChangedEmail(base ? `${base}/` : undefined);
    void sendEmail({ to: email, subject, html });
  }

  res.json({ success: true });
});

export default router;
