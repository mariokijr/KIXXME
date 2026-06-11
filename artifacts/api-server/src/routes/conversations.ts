import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth } from "../lib/auth.js";
import { isOnline } from "../lib/geo.js";
import { getBlockRelations, isBlockedBetween } from "../lib/blocks.js";
import {
  isUnavailable,
  getUnavailableIds,
  detectSpamFromMessage,
} from "../lib/moderation.js";
import {
  decodeMedia,
  uploadChatObject,
  chatMediaPath,
  clampAudioDuration,
} from "../lib/chat-media.js";

const router = Router();

async function getOtherProfile(userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("id, username, bio, avatar_url, city, age, gender, location, created_at, last_active_at, is_verified")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    username: data.username,
    bio: data.bio,
    avatar_url: data.avatar_url,
    city: data.city,
    age: data.age,
    gender: data.gender,
    location: data.location,
    created_at: data.created_at,
    is_online: isOnline(data.last_active_at),
    is_verified: Boolean(data.is_verified),
  };
}

async function isParticipant(convId: string, userId: string) {
  const { data } = await supabase
    .from("conversations")
    .select("user1_id, user2_id")
    .eq("id", convId)
    .maybeSingle();
  if (!data) return null;
  if (data.user1_id !== userId && data.user2_id !== userId) return null;
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
    .limit(100);

  if (error) {
    req.log.error({ error: error.message }, "conversations GET: error");
    res.status(500).json({ error: error.message });
    return;
  }

  const { iBlocked, blockedMe } = await getBlockRelations(auth.userId);
  const unavailable = await getUnavailableIds();

  // Hide conversations where the other user has blocked the viewer or is
  // unavailable (deactivated or suspended/banned).
  const visibleConversations = (conversations ?? []).filter((conv) => {
    const otherId = conv.user1_id === auth.userId ? conv.user2_id : conv.user1_id;
    return !blockedMe.has(otherId) && !unavailable.has(otherId);
  });

  const enriched = await Promise.all(
    visibleConversations.map(async (conv) => {
      const otherId = conv.user1_id === auth.userId ? conv.user2_id : conv.user1_id;
      const otherUser = await getOtherProfile(otherId);

      const { count } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("conversation_id", conv.id)
        .neq("sender_id", auth.userId)
        .is("read_at", null)
        .is("deleted_at", null);

      const { data: last } = await supabase
        .from("messages")
        .select("content, image_url, audio_url, created_at, deleted_at")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let lastMessage: string | null = null;
      if (last) {
        if (last.deleted_at) lastMessage = "Mensaje eliminado";
        else if (last.content) lastMessage = last.content;
        else if (last.image_url) lastMessage = "📷 Foto";
        else if (last.audio_url) lastMessage = "🎤 Nota de voz";
      }

      return {
        ...conv,
        other_user: otherUser
          ? { ...otherUser, blocked_by_me: iBlocked.has(otherId) }
          : otherUser,
        unread_count: count ?? 0,
        last_message: lastMessage,
      };
    }),
  );

  res.json(enriched);
});

router.post("/conversations", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { other_user_id } = req.body as { other_user_id?: string };

  if (!other_user_id) {
    res.status(400).json({ error: "other_user_id is required" });
    return;
  }
  if (other_user_id === auth.userId) {
    res.status(400).json({ error: "Cannot chat with yourself" });
    return;
  }

  if (await isBlockedBetween(auth.userId, other_user_id)) {
    res.status(403).json({ error: "No puedes contactar a este usuario" });
    return;
  }

  if (await isUnavailable(other_user_id)) {
    res.status(404).json({ error: "Perfil no disponible" });
    return;
  }

  const [u1, u2] = [auth.userId, other_user_id].sort();

  const { data: existing } = await supabase
    .from("conversations")
    .select("*")
    .eq("user1_id", u1)
    .eq("user2_id", u2)
    .maybeSingle();

  const otherUser = await getOtherProfile(other_user_id);

  if (existing) {
    res.json({ ...existing, other_user: otherUser, unread_count: 0, last_message: null });
    return;
  }

  const { data: created, error } = await supabase
    .from("conversations")
    .insert({ user1_id: u1, user2_id: u2 })
    .select()
    .single();

  if (error) {
    req.log.error({ error: error.message }, "conversations POST: create error");
    res.status(400).json({ error: error.message });
    return;
  }

  res.status(201).json({ ...created, other_user: otherUser, unread_count: 0, last_message: null });
});

router.get("/conversations/:id/messages", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { id } = req.params;
  const conv = await isParticipant(id, auth.userId);
  if (!conv) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  const otherId = conv.user1_id === auth.userId ? conv.user2_id : conv.user1_id;
  if (await isBlockedBetween(auth.userId, otherId)) {
    res.status(403).json({ error: "No tienes acceso a esta conversación" });
    return;
  }
  // Suspended/banned (or deactivated) users are hidden from everyone — never
  // serve their conversation history, even via a stale or direct URL.
  if (await isUnavailable(otherId)) {
    res.status(404).json({ error: "Perfil no disponible" });
    return;
  }

  const { data: messages, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  // Mark incoming messages as read on open.
  await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_id", id)
    .neq("sender_id", auth.userId)
    .is("read_at", null);

  res.json(messages ?? []);
});

router.post("/conversations/:id/messages", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { id } = req.params;
  const { content, image_url, audio_url, audio_duration } = req.body as {
    content?: string;
    image_url?: string;
    audio_url?: string;
    audio_duration?: number;
  };

  const trimmed = content?.trim() ?? "";
  if (!trimmed && !image_url && !audio_url) {
    res.status(400).json({ error: "content, image_url or audio_url is required" });
    return;
  }

  const conv = await isParticipant(id, auth.userId);
  if (!conv) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  const otherId = conv.user1_id === auth.userId ? conv.user2_id : conv.user1_id;
  if (await isBlockedBetween(auth.userId, otherId)) {
    res.status(403).json({ error: "No puedes enviar mensajes a este usuario" });
    return;
  }
  if (await isUnavailable(otherId)) {
    res.status(404).json({ error: "Perfil no disponible" });
    return;
  }

  const { data: message, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: id,
      sender_id: auth.userId,
      // `messages.content` is NOT NULL in Supabase; media-only messages carry
      // an empty string (the media lives in image_url/audio_url and always
      // takes render precedence over text, so an empty content never shows).
      content: trimmed || "",
      image_url: image_url ?? null,
      audio_url: audio_url ?? null,
      audio_duration: audio_url ? clampAudioDuration(audio_duration) : null,
    })
    .select()
    .single();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", id);

  res.status(201).json(message);

  // Fire-and-forget spam/copy-paste detection AFTER responding — never blocks
  // or fails the send. Raises a `spam_pattern` review flag when the same body
  // is sent to several conversations in a short window.
  void detectSpamFromMessage(auth.userId, trimmed || null);
});

router.post("/conversations/:id/images", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { id } = req.params;
  const conv = await isParticipant(id, auth.userId);
  if (!conv) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  const otherId = conv.user1_id === auth.userId ? conv.user2_id : conv.user1_id;
  if (await isBlockedBetween(auth.userId, otherId)) {
    res.status(403).json({ error: "No puedes enviar contenido a este usuario" });
    return;
  }
  if (await isUnavailable(otherId)) {
    res.status(404).json({ error: "Perfil no disponible" });
    return;
  }

  const { base64, mime_type } = req.body as {
    base64?: string;
    mime_type?: string;
  };

  if (!base64 || !mime_type) {
    res.status(400).json({ error: "base64 and mime_type are required" });
    return;
  }

  const decoded = decodeMedia(base64, mime_type, "image");
  if (!decoded.ok) {
    res.status(400).json({ error: decoded.error });
    return;
  }

  try {
    const url = await uploadChatObject(
      chatMediaPath(auth.userId, id, decoded.value),
      decoded.value,
    );
    res.status(201).json({ image_url: url });
  } catch (error) {
    req.log.error(
      { error: error instanceof Error ? error.message : String(error) },
      "chat image upload: error",
    );
    res.status(400).json({ error: "No se pudo subir la imagen" });
  }
});

router.post("/conversations/:id/audio", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { id } = req.params;
  const conv = await isParticipant(id, auth.userId);
  if (!conv) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  const otherId = conv.user1_id === auth.userId ? conv.user2_id : conv.user1_id;
  if (await isBlockedBetween(auth.userId, otherId)) {
    res.status(403).json({ error: "No puedes enviar contenido a este usuario" });
    return;
  }
  if (await isUnavailable(otherId)) {
    res.status(404).json({ error: "Perfil no disponible" });
    return;
  }

  const { base64, mime_type } = req.body as {
    base64?: string;
    mime_type?: string;
  };

  if (!base64 || !mime_type) {
    res.status(400).json({ error: "base64 and mime_type are required" });
    return;
  }

  const decoded = decodeMedia(base64, mime_type, "audio");
  if (!decoded.ok) {
    res.status(400).json({ error: decoded.error });
    return;
  }

  try {
    const url = await uploadChatObject(
      chatMediaPath(auth.userId, id, decoded.value),
      decoded.value,
    );
    res.status(201).json({ audio_url: url });
  } catch (error) {
    req.log.error(
      { error: error instanceof Error ? error.message : String(error) },
      "chat audio upload: error",
    );
    res.status(400).json({ error: "No se pudo subir la nota de voz" });
  }
});

router.post("/conversations/:id/read", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { id } = req.params;
  const conv = await isParticipant(id, auth.userId);
  if (!conv) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  const otherId = conv.user1_id === auth.userId ? conv.user2_id : conv.user1_id;
  // Hidden (suspended/banned/deactivated) users are not interactable anywhere.
  if (await isUnavailable(otherId)) {
    res.status(404).json({ error: "Perfil no disponible" });
    return;
  }

  await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_id", id)
    .neq("sender_id", auth.userId)
    .is("read_at", null);

  res.json({ success: true });
});

export default router;
