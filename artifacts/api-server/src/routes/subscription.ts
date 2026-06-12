import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { supabase } from "../lib/supabase.js";
import { getPlan } from "../lib/entitlement.js";
import {
  getActiveSubscription,
  cancelSubscriptionAtPeriodEnd,
} from "../lib/billing.js";
import {
  requestCooldownRemaining,
  createActionCode,
  consumeActionCode,
} from "../lib/account.js";
import { ConfirmSubscriptionCancelBody } from "@workspace/api-zod";
import {
  sendEmail,
  appBaseUrl,
  subscriptionCancelCodeEmail,
  subscriptionCancelledEmail,
} from "../lib/email.js";

const router = Router();

/**
 * Self-service subscription cancellation. A paid user (Gold/Plus) confirms a
 * 6-digit emailed code, after which the Stripe subscription is set to
 * `cancel_at_period_end`. The plan stays active until Stripe fires
 * `customer.subscription.deleted` at period end (handled by the webhook).
 *
 * GOLD_TEST_EMAILS overrides have NO real Stripe subscription, so
 * `getActiveSubscription` returns null for them — they never see the button.
 */

const CANCEL_ACTION = "cancel_subscription" as const;
const CANCEL_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** Resolve the account's email from the Supabase auth record. */
async function getUserEmail(userId: string): Promise<string | null> {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error) return null;
  return data.user?.email ?? null;
}

/** Current subscription status: plan + whether a real active sub exists. */
router.get("/subscription", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const plan = await getPlan(auth.userId);

  // Fail-safe: a Stripe outage must not break the settings page. Treat a lookup
  // failure as "no active subscription" so we never offer a cancel button we
  // cannot honor.
  let sub = null;
  try {
    sub = await getActiveSubscription(auth.userId);
  } catch (err) {
    req.log.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "GET /subscription: getActiveSubscription failed (treating as none)",
    );
  }

  res.json({
    has_active_subscription: sub !== null,
    plan,
    tier: sub?.tier ?? null,
    current_period_end: sub?.currentPeriodEnd
      ? sub.currentPeriodEnd.toISOString()
      : null,
    cancel_at_period_end: sub?.cancelAtPeriodEnd ?? false,
  });
});

/** Email a one-time code to confirm cancelling the active subscription. */
router.post("/subscription/cancel/request", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const sub = await getActiveSubscription(auth.userId);
  if (!sub) {
    res
      .status(400)
      .json({ error: "No tienes una suscripción activa que cancelar." });
    return;
  }
  if (sub.cancelAtPeriodEnd) {
    res.status(409).json({
      error: "Tu suscripción ya está programada para cancelarse.",
    });
    return;
  }

  // At most one code per 60s.
  const remaining = await requestCooldownRemaining(auth.userId, CANCEL_ACTION);
  if (remaining > 0) {
    res.status(429).json({
      error: `Espera ${Math.ceil(
        remaining / 1000,
      )} segundos antes de pedir otro código`,
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

  const { code, expiresAt } = await createActionCode(
    auth.userId,
    CANCEL_ACTION,
    undefined,
    CANCEL_CODE_TTL_MS,
  );

  const { subject, html } = subscriptionCancelCodeEmail(code);
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

/** Confirm cancellation with the emailed code (sets cancel_at_period_end). */
router.post("/subscription/cancel/confirm", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const parsed = ConfirmSubscriptionCancelBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Solicitud no válida" });
    return;
  }
  const code = parsed.data.code.trim();
  if (!/^\d{6}$/.test(code)) {
    res.status(400).json({ error: "Código no válido" });
    return;
  }

  // Consume the code FIRST (single-use guarantee) before touching Stripe.
  const result = await consumeActionCode(auth.userId, CANCEL_ACTION, code);
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

  const cancelled = await cancelSubscriptionAtPeriodEnd(auth.userId);
  if (!cancelled) {
    res
      .status(400)
      .json({ error: "No tienes una suscripción activa que cancelar." });
    return;
  }

  // Confirmation email (fire-and-forget): never block the success response.
  const email = auth.email ?? (await getUserEmail(auth.userId));
  if (email) {
    const base = appBaseUrl();
    const { subject, html } = subscriptionCancelledEmail(
      cancelled.currentPeriodEnd,
      cancelled.tier,
      base ? `${base}/` : undefined,
    );
    void sendEmail({ to: email, subject, html });
  }

  res.json({
    success: true,
    current_period_end: cancelled.currentPeriodEnd
      ? cancelled.currentPeriodEnd.toISOString()
      : null,
  });
});

export default router;
