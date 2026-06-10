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
  RequestAccountActionCodeBody,
  ConfirmAccountActionBody,
} from "@workspace/api-zod";
import {
  sendEmail,
  appBaseUrl,
  accountActionCodeEmail,
  accountDeactivatedEmail,
  accountDeletedEmail,
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
  const auth = await requireAuth(req, res);
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
  // suspended or banned users — they have a right to leave / erase their data.
  const auth = await requireAuth(req, res, { allowModerated: true });
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
  // suspended or banned users — they have a right to leave / erase their data.
  const auth = await requireAuth(req, res, { allowModerated: true });
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

export default router;
