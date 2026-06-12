import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { RegisterDeviceBody, UnregisterDeviceBody } from "@workspace/api-zod";
import { saveDeviceToken, removeDeviceToken } from "../lib/push.js";

const router = Router();

/**
 * Push-notification device registry. Native clients register their FCM token on
 * launch/login and remove it on logout. The token travels in the body (even for
 * DELETE) so it never lands in access logs.
 */

router.post("/me/devices", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const parsed = RegisterDeviceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Token o plataforma inválidos." });
    return;
  }
  await saveDeviceToken(auth.userId, parsed.data.token, parsed.data.platform);
  res.json({ success: true });
});

router.delete("/me/devices", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const parsed = UnregisterDeviceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Token inválido." });
    return;
  }
  await removeDeviceToken(auth.userId, parsed.data.token);
  res.json({ success: true });
});

export default router;
