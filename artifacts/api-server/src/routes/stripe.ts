import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import {
  createCheckoutSession,
  createTrialCheckoutSession,
  getTrialStatus,
  type Tier,
  type Interval,
} from "../lib/billing.js";

const router = Router();

const TIERS: Tier[] = ["plus", "gold"];
const INTERVALS: Interval[] = ["month", "year"];

router.post("/stripe/checkout", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { tier, interval, returnUrl } = req.body ?? {};

  if (!TIERS.includes(tier)) {
    res.status(400).json({ error: "Invalid tier" });
    return;
  }
  if (!INTERVALS.includes(interval)) {
    res.status(400).json({ error: "Invalid interval" });
    return;
  }
  if (typeof returnUrl !== "string" || returnUrl.length === 0) {
    res.status(400).json({ error: "Missing returnUrl" });
    return;
  }

  try {
    const url = await createCheckoutSession({
      userId: auth.userId,
      tier,
      interval,
      returnUrl,
    });
    res.json({ url });
  } catch (error) {
    req.log.error(
      { error: error instanceof Error ? error.message : String(error) },
      "stripe checkout: error",
    );
    res
      .status(502)
      .json({ error: "No se pudo iniciar el pago. Inténtalo de nuevo." });
  }
});

/** Returns whether the authenticated user is eligible for the free trial. */
router.get("/stripe/trial/status", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  try {
    const status = await getTrialStatus(auth.userId);
    res.json(status);
  } catch (error) {
    req.log.error(
      { error: error instanceof Error ? error.message : String(error) },
      "stripe trial status: error",
    );
    res
      .status(502)
      .json({ error: "No se pudo comprobar el estado de la prueba." });
  }
});

/**
 * Start a free 5-day Gold trial Stripe Checkout session.
 * Returns { url } on success; 409 when the trial has already been used.
 */
router.post("/stripe/trial", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { returnUrl } = req.body ?? {};
  if (typeof returnUrl !== "string" || returnUrl.length === 0) {
    res.status(400).json({ error: "Missing returnUrl" });
    return;
  }

  try {
    const url = await createTrialCheckoutSession({
      userId: auth.userId,
      returnUrl,
    });
    res.json({ url });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.startsWith("TRIAL_NOT_ELIGIBLE:")) {
      const reason = msg.split(":")[1] ?? "unknown";
      res.status(409).json({ error: "trial_not_eligible", reason });
      return;
    }
    req.log.error({ error: msg }, "stripe trial: error");
    res
      .status(502)
      .json({ error: "No se pudo iniciar la prueba gratuita. Inténtalo de nuevo." });
  }
});

export default router;
