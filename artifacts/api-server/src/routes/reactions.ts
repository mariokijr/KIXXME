import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db, messageReactionsTable } from "@workspace/db";
import { requireAuth } from "../lib/auth.js";

const router = Router();

const ALLOWED_EMOJIS = new Set(["❤️", "👍", "😂", "😮", "😢", "🔥", "👏", "🙏"]);

/** Aggregate reactions for a message, including whether the viewer reacted. */
async function getReactions(
  messageId: string,
  viewerId: string,
): Promise<{ emoji: string; count: number; reacted_by_me: boolean }[]> {
  const rows = await db
    .select({
      emoji: messageReactionsTable.emoji,
      count: sql<number>`count(*)::int`,
      reacted_by_me: sql<boolean>`bool_or(${messageReactionsTable.userId} = ${viewerId})`,
    })
    .from(messageReactionsTable)
    .where(eq(messageReactionsTable.messageId, messageId))
    .groupBy(messageReactionsTable.emoji)
    .orderBy(messageReactionsTable.emoji);
  return rows as { emoji: string; count: number; reacted_by_me: boolean }[];
}

// POST /messages/:messageId/react — add a reaction
router.post("/messages/:messageId/react", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { messageId } = req.params as { messageId: string };
  const { emoji } = req.body as { emoji?: string };

  if (!emoji || !ALLOWED_EMOJIS.has(emoji)) {
    res.status(400).json({ error: "Emoji no permitido" });
    return;
  }

  await db
    .insert(messageReactionsTable)
    .values({ userId: auth.userId, messageId, emoji })
    .onConflictDoNothing();

  const reactions = await getReactions(messageId, auth.userId);
  res.json(reactions);
});

// DELETE /messages/:messageId/react/:emoji — remove a reaction
router.delete("/messages/:messageId/react/:emoji", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { messageId, emoji } = req.params as { messageId: string; emoji: string };

  const decodedEmoji = decodeURIComponent(emoji);

  await db
    .delete(messageReactionsTable)
    .where(
      and(
        eq(messageReactionsTable.userId, auth.userId),
        eq(messageReactionsTable.messageId, messageId),
        eq(messageReactionsTable.emoji, decodedEmoji),
      ),
    );

  const reactions = await getReactions(messageId, auth.userId);
  res.json(reactions);
});

// GET /messages/:messageId/reactions — fetch reactions for a message
router.get("/messages/:messageId/reactions", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { messageId } = req.params as { messageId: string };
  const reactions = await getReactions(messageId, auth.userId);
  res.json(reactions);
});

export default router;
