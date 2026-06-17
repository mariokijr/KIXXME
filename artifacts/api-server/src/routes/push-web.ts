import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import {
  isWebPushConfigured,
  getVapidPublicKey,
  saveWebPushSubscription,
  removeWebPushSubscription,
} from "../lib/web-push.js";

const router = Router();

/** GET /push/web/vapid-public-key — expose the VAPID public key to the frontend. */
router.get("/push/web/vapid-public-key", async (req, res) => {
  const key = getVapidPublicKey();
  if (!key) {
    res.status(503).json({ error: "Web push not configured" });
    return;
  }
  res.json({ public_key: key });
});

/** POST /push/web/subscribe — save a PushSubscription. */
router.post("/push/web/subscribe", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  if (!isWebPushConfigured()) {
    res.status(503).json({ error: "Web push not configured" });
    return;
  }

  const { endpoint, p256dh, auth: authKey } = req.body as {
    endpoint?: string;
    p256dh?: string;
    auth?: string;
  };

  if (!endpoint || !p256dh || !authKey) {
    res.status(400).json({ error: "endpoint, p256dh and auth are required" });
    return;
  }

  await saveWebPushSubscription(auth.userId, endpoint, p256dh, authKey);
  res.json({ success: true });
});

/** DELETE /push/web/unsubscribe — remove a PushSubscription. */
router.delete("/push/web/unsubscribe", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { endpoint } = req.body as { endpoint?: string };
  if (!endpoint) {
    res.status(400).json({ error: "endpoint is required" });
    return;
  }

  await removeWebPushSubscription(auth.userId, endpoint);
  res.json({ success: true });
});

export default router;
