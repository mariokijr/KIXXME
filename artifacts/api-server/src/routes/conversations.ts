import { Router } from "express";
import { supabase, supabaseAuth } from "../lib/supabase.js";

const router = Router();

function getToken(req: { headers: { authorization?: string } }): string | null {
  return req.headers.authorization?.replace("Bearer ", "") ?? null;
}

async function requireAuth(
  req: Parameters<typeof getToken>[0],
  res: { status: (n: number) => { json: (o: unknown) => void } }
): Promise<{ userId: string; token: string } | null> {
  const token = getToken(req);
  if (!token) { res.status(401).json({ error: "Unauthorized" }); return null; }
  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error || !data.user) { res.status(401).json({ error: "Invalid or expired token" }); return null; }
  return { userId: data.user.id, token };
}

async function getOtherProfile(userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("id, username, bio, avatar_url, city, age, gender, location, created_at")
    .eq("id", userId)
    .maybeSingle();
  return data;
}

router.get("/conversations", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { data: conversations, error } = await supabase
    .from("conversations")
    .select("*")
    .or(`user1_id.eq.${auth.userId},user2_id.eq.${auth.userId}`)
    .order("last_message_at", { ascending: false })
    .limit(50);

  if (error) { req.log.error({ error: error.message }, "conversations GET: error"); res.status(500).json({ error: error.message }); return; }

  const enriched = await Promise.all(
    (conversations ?? []).map(async (conv) => {
      const otherId = conv.user1_id === auth.userId ? conv.user2_id : conv.user1_id;
      const otherUser = await getOtherProfile(otherId);
      return { ...conv, other_user: otherUser };
    })
  );

  res.json(enriched);
});

router.post("/conversations", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { other_user_id } = req.body as { other_user_id?: string };

  if (!other_user_id) { res.status(400).json({ error: "other_user_id is required" }); return; }
  if (other_user_id === auth.userId) { res.status(400).json({ error: "Cannot chat with yourself" }); return; }

  const [u1, u2] = [auth.userId, other_user_id].sort();

  const { data: existing } = await supabase
    .from("conversations")
    .select("*")
    .eq("user1_id", u1)
    .eq("user2_id", u2)
    .maybeSingle();

  const otherUser = await getOtherProfile(other_user_id);

  if (existing) {
    res.json({ ...existing, other_user: otherUser });
    return;
  }

  const { data: created, error } = await supabase
    .from("conversations")
    .insert({ user1_id: u1, user2_id: u2 })
    .select()
    .single();

  if (error) { req.log.error({ error: error.message }, "conversations POST: create error"); res.status(400).json({ error: error.message }); return; }

  res.status(201).json({ ...created, other_user: otherUser });
});

router.get("/conversations/:id/messages", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { id } = req.params;

  const { data: conv } = await supabase
    .from("conversations")
    .select("user1_id, user2_id")
    .eq("id", id)
    .maybeSingle();

  if (!conv || (conv.user1_id !== auth.userId && conv.user2_id !== auth.userId)) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  const { data: messages, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) { res.status(500).json({ error: error.message }); return; }

  res.json(messages ?? []);
});

router.post("/conversations/:id/messages", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { id } = req.params;
  const { content } = req.body as { content?: string };

  if (!content?.trim()) { res.status(400).json({ error: "content is required" }); return; }

  const { data: conv } = await supabase
    .from("conversations")
    .select("user1_id, user2_id")
    .eq("id", id)
    .maybeSingle();

  if (!conv || (conv.user1_id !== auth.userId && conv.user2_id !== auth.userId)) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  const { data: message, error } = await supabase
    .from("messages")
    .insert({ conversation_id: id, sender_id: auth.userId, content: content.trim() })
    .select()
    .single();

  if (error) { res.status(400).json({ error: error.message }); return; }

  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", id);

  res.status(201).json(message);
});

export default router;
