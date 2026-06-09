import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import {
  createCheckoutSession,
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

export default router;
