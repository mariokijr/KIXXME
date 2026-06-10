import { Router } from "express";
import { createHash } from "node:crypto";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db, supportReportsTable, accountFlagsTable } from "@workspace/db";
import { supabase } from "../lib/supabase.js";
import { requireAuth, isAdminEmail } from "../lib/auth.js";
import { getBlockRelations } from "../lib/blocks.js";
import { getUnavailableIds } from "../lib/moderation.js";
import { getPlan } from "../lib/entitlement.js";
import { getSuperLikerIds } from "../lib/likes.js";
import { countUserUnread, adminTicketStats } from "../lib/support-tickets.js";

const router = Router();

/**
 * Opaque, stable id for an unrevealed SuperLiker. Used only as a React key so a
 * free viewer never receives the real liker id (which would defeat the paywall
 * by letting them fetch the profile directly). Stable across polls per pair.
 */
function opaqueId(likerId: string, likedId: string): string {
  return createHash("sha256")
    .update(`${likerId}:${likedId}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Aggregated in-app notification state for the current user:
 * - unread message count (across visible conversations)
 * - recent likes received (people who liked me), flagged is_super / revealed
 * - matches (mutual likes), with the moment the match was completed
 *
 * Block enforcement: users on either side of a block are excluded, matching
 * every other surface that exposes another user.
 *
 * SuperLike privacy: a received SuperLike is fully redacted (opaque id, null
 * username/avatar) for FREE viewers — they learn one arrived but not from whom —
 * UNLESS it is already mutual, in which case identity is known via the match
 * anyway. Plus/Gold viewers always see the sender. Each liker appears exactly
 * once, so a redacted SuperLike can never leak alongside a named regular like.
 */
router.get("/notifications/summary", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const me = auth.userId;
  const { iBlocked, blockedMe } = await getBlockRelations(me);
  const unavailable = await getUnavailableIds();
  // Unavailable users (deactivated or moderated) are hidden everywhere, like a block.
  const isBlocked = (id: string) =>
    iBlocked.has(id) || blockedMe.has(id) || unavailable.has(id);

  // People who liked me (most recent first).
  const { data: received, error: receivedError } = await supabase
    .from("likes")
    .select("liker_id, created_at")
    .eq("liked_id", me)
    .order("created_at", { ascending: false })
    .limit(100);

  if (receivedError) {
    req.log.error({ error: receivedError.message }, "notifications: likes query error");
    res.status(500).json({ error: receivedError.message });
    return;
  }

  // People I liked, for mutual-like (match) detection.
  const { data: sent } = await supabase
    .from("likes")
    .select("liked_id, created_at")
    .eq("liker_id", me);

  const myLikes = new Map<string, string>();
  for (const r of sent ?? []) {
    myLikes.set(r.liked_id as string, r.created_at as string);
  }

  // One entry per liker (likes are unique per pair, but dedupe defensively,
  // keeping the newest since `received` is ordered desc).
  const seenLiker = new Set<string>();
  const receivedVisible: { liker_id: string; created_at: string }[] = [];
  for (const r of received ?? []) {
    const liker = r.liker_id as string;
    if (isBlocked(liker) || seenLiker.has(liker)) continue;
    seenLiker.add(liker);
    receivedVisible.push({ liker_id: liker, created_at: r.created_at as string });
  }

  const userIds = receivedVisible.map((r) => r.liker_id);

  // Viewer tier + which of these received likes are currently SuperLikes.
  const [viewerPlan, superLikerIds] = await Promise.all([
    getPlan(me),
    getSuperLikerIds(me, userIds),
  ]);
  const canReveal = viewerPlan !== "free";

  // Hydrate the profiles involved in one query.
  const profileMap = new Map<
    string,
    { username: string | null; avatar_url: string | null }
  >();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, avatar_url")
      .in("id", userIds);
    for (const p of profiles ?? []) {
      profileMap.set(p.id as string, {
        username: (p.username as string | null) ?? null,
        avatar_url: (p.avatar_url as string | null) ?? null,
      });
    }
  }

  const likes = receivedVisible.map((r) => {
    const liker = r.liker_id;
    const isSuper = superLikerIds.has(liker);
    const isMatch = myLikes.has(liker);
    // Regular likes are always shown. A SuperLike is hidden from free viewers
    // unless it's already mutual (identity then known via the match).
    const revealed = !isSuper || canReveal || isMatch;
    if (revealed) {
      const info = profileMap.get(liker);
      return {
        user_id: liker,
        username: info?.username ?? null,
        avatar_url: info?.avatar_url ?? null,
        created_at: r.created_at,
        is_super: isSuper,
        revealed: true,
      };
    }
    return {
      user_id: opaqueId(liker, me),
      username: null,
      avatar_url: null,
      created_at: r.created_at,
      is_super: true,
      revealed: false,
    };
  });

  // A match is a like received from someone I also liked. The match is
  // "completed" at the later of the two like timestamps.
  const matches = receivedVisible
    .filter((r) => myLikes.has(r.liker_id))
    .map((r) => {
      const theirAt = r.created_at;
      const myAt = myLikes.get(r.liker_id) as string;
      const matchedAt = Date.parse(theirAt) >= Date.parse(myAt) ? theirAt : myAt;
      const info = profileMap.get(r.liker_id);
      return {
        user_id: r.liker_id,
        username: info?.username ?? null,
        avatar_url: info?.avatar_url ?? null,
        matched_at: matchedAt,
      };
    })
    .sort((a, b) => Date.parse(b.matched_at) - Date.parse(a.matched_at));

  // Unread messages across conversations where the other user hasn't blocked me.
  const { data: convs } = await supabase
    .from("conversations")
    .select("id, user1_id, user2_id")
    .or(`user1_id.eq.${me},user2_id.eq.${me}`)
    .limit(200);

  const visibleConvIds = (convs ?? [])
    .filter((c) => {
      const otherId = c.user1_id === me ? c.user2_id : c.user1_id;
      return (
        !blockedMe.has(otherId as string) &&
        !unavailable.has(otherId as string)
      );
    })
    .map((c) => c.id as string);

  let unreadMessages = 0;
  if (visibleConvIds.length > 0) {
    const { count } = await supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .in("conversation_id", visibleConvIds)
      .neq("sender_id", me)
      .is("read_at", null)
      .is("deleted_at", null);
    unreadMessages = count ?? 0;
  }

  // Admin-only moderation notifications: every filed report (and auto-raised
  // flag) surfaces here so an admin's bell announces new moderation work the
  // same way users are notified of likes/matches. Derived from open rows (no
  // separate notifications table), mirroring the /admin/summary definition of
  // "open". Absent entirely for non-admins.
  let admin:
    | {
        open_reports: number;
        open_flags: number;
        latest_report_at: string | null;
        open_tickets: number;
        latest_ticket_at: string | null;
      }
    | undefined;
  if (isAdminEmail(auth.email)) {
    const openReport = and(
      isNotNull(supportReportsTable.reportType),
      eq(supportReportsTable.status, "open"),
    );
    const [reportRows, flagRows, latestRows, ticketStats] = await Promise.all([
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(supportReportsTable)
        .where(openReport),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(accountFlagsTable)
        .where(eq(accountFlagsTable.status, "open")),
      db
        .select({ at: supportReportsTable.createdAt })
        .from(supportReportsTable)
        .where(openReport)
        .orderBy(desc(supportReportsTable.createdAt))
        .limit(1),
      adminTicketStats(),
    ]);
    const latest = latestRows[0]?.at ?? null;
    admin = {
      open_reports: reportRows[0]?.c ?? 0,
      open_flags: flagRows[0]?.c ?? 0,
      latest_report_at: latest ? latest.toISOString() : null,
      open_tickets: ticketStats.openTickets,
      latest_ticket_at: ticketStats.latestTicketAt,
    };
  }

  // The user's own unread support replies (admin answered after they last read).
  const supportUnread = await countUserUnread(me);

  res.json({
    unread_messages: unreadMessages,
    support_unread: supportUnread,
    likes,
    matches,
    ...(admin ? { admin } : {}),
  });
});

export default router;
