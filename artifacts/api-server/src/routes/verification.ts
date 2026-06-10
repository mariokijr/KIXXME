import { Router } from "express";
import { RequestVerificationBody } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth.js";
import {
  getVerificationStatus,
  requestVerification,
} from "../lib/verification.js";

const router = Router();

// Decoded-selfie size cap. The client downscales to ~1024px JPEG q0.8 (well
// under this); the cap is a server-side guard against oversized uploads.
const MAX_SELFIE_BYTES = 5 * 1024 * 1024;

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

  // Shape + mime allowlist via generated Zod; size + emptiness checked here.
  const parsed = RequestVerificationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Debes adjuntar un selfie válido (JPG, PNG o WebP).",
    });
    return;
  }
  const { selfie_base64, selfie_mime_type } = parsed.data;
  const buffer = Buffer.from(selfie_base64, "base64");
  if (buffer.length === 0) {
    res.status(400).json({ error: "El selfie está vacío o no es válido." });
    return;
  }
  if (buffer.length > MAX_SELFIE_BYTES) {
    res.status(400).json({
      error: "El selfie es demasiado grande. Inténtalo de nuevo.",
    });
    return;
  }

  const result = await requestVerification(auth.userId, {
    buffer,
    mime: selfie_mime_type,
  });
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
