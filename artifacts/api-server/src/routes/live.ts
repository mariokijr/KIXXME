import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { isBlockedBetween } from "../lib/blocks.js";
import { isUnavailable } from "../lib/moderation.js";
import { getPlan } from "../lib/entitlement.js";
import * as live from "../lib/live.js";
import {
  JoinLiveQueueBody,
  CreateLiveCallBody,
  EndLiveCallBody,
} from "@workspace/api-zod";

const router = Router();

const GOLD_REQUIRED = "KixxMe Live es exclusivo para miembros Gold";

/**
 * KixxMe Live (SCAFFOLD) — Gold-only video calls.
 *
 * Endpoints own the queue and the call state machine but never touch a media
 * plane: see `lib/live.ts` `issueMediaToken` for the single future WebRTC/
 * LiveKit integration point. Acceptance/decline/cancel/end are restricted to
 * the call's two participants (IDOR guard). Random matching is Gold-only;
 * private invites additionally require BOTH users to be Gold.
 */

/** Single polling endpoint: entitlement + queue status + active call. */
router.get("/live/state", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const me = auth.userId;

  const plan = await getPlan(me);
  const canAccess = plan === "gold";

  let call = await live.getActiveCall(me);
  let queueStatus: "idle" | "searching" = "idle";

  // Only re-attempt a match when there is no live call and the user is Gold.
  if (!call && canAccess) {
    const result = await live.heartbeatAndMatch(me);
    if (result?.call) call = result.call;
    else if (result?.searching) queueStatus = "searching";
  }

  res.json({
    plan,
    canAccess,
    queueStatus,
    call: call ? await live.serializeCall(call, me) : null,
  });
});

/** Start (or refresh) a random search; may match immediately. */
router.post("/live/queue", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const me = auth.userId;

  const parsed = JoinLiveQueueBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Parámetros de búsqueda no válidos" });
    return;
  }
  if (parsed.data.ageMin > parsed.data.ageMax) {
    res.status(400).json({ error: "Rango de edad no válido" });
    return;
  }

  const plan = await getPlan(me);
  if (plan !== "gold") {
    res.status(402).json({ error: GOLD_REQUIRED });
    return;
  }

  // If already in a call, surface it instead of enqueuing.
  const existing = await live.getActiveCall(me);
  const call = existing ?? (await live.enqueueAndMatch(me, parsed.data));

  res.json({
    plan,
    canAccess: true,
    queueStatus: call ? "idle" : "searching",
    call: call ? await live.serializeCall(call, me) : null,
  });
});

/** Stop searching. */
router.delete("/live/queue", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  await live.leaveQueue(auth.userId);
  res.json({ success: true });
});

/** Invite a specific user to a private call (both must be Gold). */
router.post("/live/calls", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const me = auth.userId;

  const parsed = CreateLiveCallBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Solicitud no válida" });
    return;
  }
  const recipientId = parsed.data.recipientId;
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(recipientId)) {
    res.status(400).json({ error: "Solicitud no válida" });
    return;
  }
  if (recipientId === me) {
    res.status(400).json({ error: "No puedes llamarte a ti mismo" });
    return;
  }

  const [myPlan, theirPlan] = await Promise.all([
    getPlan(me),
    getPlan(recipientId),
  ]);
  if (myPlan !== "gold") {
    res.status(402).json({ error: GOLD_REQUIRED });
    return;
  }
  if (theirPlan !== "gold") {
    res.status(402).json({ error: "El otro usuario no tiene KixxMe Gold" });
    return;
  }
  if (await isBlockedBetween(me, recipientId)) {
    res.status(403).json({ error: "No disponible" });
    return;
  }
  if (await isUnavailable(recipientId)) {
    res.status(404).json({ error: "No disponible" });
    return;
  }

  // Don't stack invites: reject if either party is already ringing/in a call.
  const [myCall, theirCall] = await Promise.all([
    live.getActiveCall(me),
    live.getActiveCall(recipientId),
  ]);
  if (myCall || theirCall) {
    res.status(409).json({ error: "Ya hay una llamada en curso" });
    return;
  }

  const call = await live.createPrivateCall(me, recipientId);
  res.status(201).json(await live.serializeCall(call, me));
});

router.post("/live/calls/:id/accept", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const result = await live.acceptCall(req.params.id, auth.userId);
  if (result === "notfound") {
    res.status(404).json({ error: "Llamada no encontrada" });
    return;
  }
  if (result === "forbidden") {
    res.status(403).json({ error: "No autorizado" });
    return;
  }
  res.json(await live.serializeCall(result, auth.userId));
});

router.post("/live/calls/:id/decline", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const result = await live.declineCall(req.params.id, auth.userId);
  if (result === "notfound") {
    res.status(404).json({ error: "Llamada no encontrada" });
    return;
  }
  if (result === "forbidden") {
    res.status(403).json({ error: "No autorizado" });
    return;
  }
  res.json({ success: true });
});

router.post("/live/calls/:id/cancel", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const result = await live.cancelCall(req.params.id, auth.userId);
  if (result === "notfound") {
    res.status(404).json({ error: "Llamada no encontrada" });
    return;
  }
  if (result === "forbidden") {
    res.status(403).json({ error: "No autorizado" });
    return;
  }
  res.json({ success: true });
});

router.post("/live/calls/:id/skip", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const me = auth.userId;

  // Skipping is part of the Gold-only roulette flow.
  const plan = await getPlan(me);
  if (plan !== "gold") {
    res.status(402).json({ error: GOLD_REQUIRED });
    return;
  }

  const result = await live.skipCall(req.params.id, me);
  if (result === "notfound") {
    res.status(404).json({ error: "Llamada no encontrada" });
    return;
  }
  if (result === "forbidden") {
    res.status(403).json({ error: "No autorizado" });
    return;
  }
  if (result === "invalid") {
    res.status(409).json({ error: "No se puede saltar esta llamada" });
    return;
  }
  if (result === "limit") {
    res.status(429).json({
      error: "Has saltado demasiadas veces seguidas. Tómate un respiro 💜",
    });
    return;
  }
  res.json({ success: true });
});

router.post("/live/calls/:id/end", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const parsed = EndLiveCallBody.safeParse(req.body ?? {});
  const reason = parsed.success ? parsed.data.reason : undefined;
  const result = await live.endCall(req.params.id, auth.userId, reason);
  if (result === "notfound") {
    res.status(404).json({ error: "Llamada no encontrada" });
    return;
  }
  if (result === "forbidden") {
    res.status(403).json({ error: "No autorizado" });
    return;
  }
  res.json({ success: true });
});

export default router;
