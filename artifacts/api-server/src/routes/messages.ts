import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth } from "../lib/auth.js";

const router = Router();

router.delete("/messages/:messageId", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { messageId } = req.params;

  const { data: message } = await supabase
    .from("messages")
    .select("id, sender_id")
    .eq("id", messageId)
    .maybeSingle();

  if (!message) {
    res.status(404).json({ error: "Message not found" });
    return;
  }
  if (message.sender_id !== auth.userId) {
    res.status(403).json({ error: "Can only delete your own messages" });
    return;
  }

  const { error } = await supabase
    .from("messages")
    .update({ deleted_at: new Date().toISOString(), content: null, image_url: null })
    .eq("id", messageId);

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.json({ success: true });
});

export default router;
