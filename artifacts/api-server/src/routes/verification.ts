import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import {
  getVerificationStatus,
  requestVerification,
} from "../lib/verification.js";

const router = Router();

/**
 * Self-service profile verification. The verified badge is Supabase
 * `profiles.is_verified`; these endpoints manage the user's place in the
 * repo-owned review queue. Admin review lives in `routes/admin.ts`.
 */

router.get("/me/verification", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  res.json(await getVerificationStatus(auth.userId));
});

router.post("/me/verification", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const result = await requestVerification(auth.userId);
  if (!result.ok) {
    const message =
      result.code === "already_verified"
        ? "Tu perfil ya está verificado."
        : "Ya tienes una solicitud de verificación pendiente.";
    res.status(409).json({ error: message, status: result.status });
    return;
  }
  res.json(result.status);
});

export default router;
