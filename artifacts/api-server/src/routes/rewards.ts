import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { claimDailyReward, getRewardsState } from "../lib/rewards.js";

const router = Router();

/**
 * Gamification: the current user's daily-reward streak, claim state, and bonus
 * credit balance. Claiming grants like/SuperLike credits (see `lib/rewards.ts`)
 * that the like engine spends once the base allowance is exhausted.
 */

router.get("/me/rewards", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  res.json(await getRewardsState(auth.userId));
});

router.post("/me/rewards/claim", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const result = await claimDailyReward(auth.userId);
  if (!result.ok) {
    // ErrorResponse shape; the next-claim time is available via GET /me/rewards,
    // which the client re-fetches on 409.
    res.status(409).json({
      error:
        "Ya has reclamado tu recompensa de hoy. Vuelve mañana para mantener tu racha.",
    });
    return;
  }

  res.json({
    streak: result.streak,
    granted: result.granted,
    credits: result.credits,
    milestone: result.milestone,
  });
});

export default router;
