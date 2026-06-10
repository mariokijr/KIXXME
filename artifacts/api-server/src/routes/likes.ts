import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { getLikeQuota } from "../lib/likes.js";

const router = Router();

/** Current like & SuperLike allowances for the authenticated user. */
router.get("/likes/quota", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  res.json(await getLikeQuota(auth.userId));
});

export default router;
