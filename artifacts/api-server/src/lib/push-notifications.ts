import { supabase } from "./supabase.js";
import { logger } from "./logger.js";
import { getPlan } from "./entitlement.js";
import { isPushConfigured, sendPushToUser } from "./push.js";
import { sendWebPushToUser } from "./web-push.js";
import type { MessageMediaKind } from "./message-notifications.js";

/**
 * Native push notifications mirroring the engagement emails (new message, match,
 * SuperLike). All fire-and-forget (callers `void` them) and never throw. Each
 * short-circuits immediately when push isn't configured, so there is ZERO cost
 * (not even a DB query) until Firebase is wired up.
 *
 * Unlike the email nudges these are NOT rate-limited or gated on "offline": a
 * push IS the real-time signal, and the OS suppresses it while the app is in the
 * foreground. SuperLike sender identity follows the same Plus/Gold redaction as
 * in-app and email.
 */

async function getUsername(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle();
  return (data?.username as string | undefined) ?? null;
}

export async function pushNewMessage(opts: {
  conversationId: string;
  senderId: string;
  recipientId: string;
  mediaKind: MessageMediaKind;
}): Promise<void> {
  try {
    const senderName = (await getUsername(opts.senderId)) ?? "Alguien";
    const body =
      opts.mediaKind === "photo"
        ? "📷 Te ha enviado una foto"
        : opts.mediaKind === "voice"
          ? "🎤 Te ha enviado una nota de voz"
          : "Te ha enviado un mensaje";
    await Promise.allSettled([
      isPushConfigured()
        ? sendPushToUser(opts.recipientId, {
            title: senderName,
            body,
            data: { type: "message", conversationId: opts.conversationId },
          })
        : Promise.resolve(),
      sendWebPushToUser(opts.recipientId, {
        title: senderName,
        body,
        url: `/chat/${opts.conversationId}`,
      }),
    ]);
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "pushNewMessage failed",
    );
  }
}

export async function pushMatch(
  userAId: string,
  userBId: string,
): Promise<void> {
  try {
    const [nameA, nameB] = await Promise.all([
      getUsername(userAId),
      getUsername(userBId),
    ]);
    await Promise.allSettled([
      isPushConfigured()
        ? Promise.all([
            sendPushToUser(userAId, {
              title: "¡Nuevo match! 🔥",
              body: `Has hecho match con ${nameB ?? "alguien"}`,
              data: { type: "match" },
            }),
            sendPushToUser(userBId, {
              title: "¡Nuevo match! 🔥",
              body: `Has hecho match con ${nameA ?? "alguien"}`,
              data: { type: "match" },
            }),
          ])
        : Promise.resolve(),
      sendWebPushToUser(userAId, {
        title: "¡Nuevo match! 🔥",
        body: `Has hecho match con ${nameB ?? "alguien"}`,
        url: "/matches",
      }),
      sendWebPushToUser(userBId, {
        title: "¡Nuevo match! 🔥",
        body: `Has hecho match con ${nameA ?? "alguien"}`,
        url: "/matches",
      }),
    ]);
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "pushMatch failed",
    );
  }
}

export async function pushSuperLike(
  recipientId: string,
  senderId: string,
): Promise<void> {
  try {
    const plan = await getPlan(recipientId);
    const senderName = plan !== "free" ? await getUsername(senderId) : null;
    const body = senderName
      ? `${senderName} te ha enviado un SuperLike`
      : "Alguien te ha enviado un SuperLike";
    await Promise.allSettled([
      isPushConfigured()
        ? sendPushToUser(recipientId, {
            title: "SuperLike ⭐",
            body,
            data: { type: "superlike" },
          })
        : Promise.resolve(),
      sendWebPushToUser(recipientId, {
        title: "SuperLike ⭐",
        body,
        url: "/likes-received",
      }),
    ]);
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "pushSuperLike failed",
    );
  }
}
