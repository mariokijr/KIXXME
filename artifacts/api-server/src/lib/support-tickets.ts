import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import {
  db,
  supportTicketsTable,
  supportTicketMessagesTable,
  type SupportTicket as SupportTicketRow,
  type SupportTicketMessage as SupportTicketMessageRow,
  type SupportTicketStatus,
  type SupportActorRole,
} from "@workspace/db";
import { supabase } from "./supabase.js";
import { hasGold } from "./entitlement.js";
import { clampAudioDuration } from "./chat-media.js";

/**
 * Priority support chat — all ticket transitions live here so routes never
 * touch status directly (see schema doc in `lib/db/.../support-tickets.ts`).
 *
 * Every message-insert is paired with the owning ticket's bookkeeping update
 * (status / lastMessageAt / lastSenderRole / the sender's lastReadAt) inside a
 * single `db.transaction`, so a thread can never end up with a message that the
 * list/notification queries don't reflect. There is NO realtime (Replit
 * Postgres has none); the client polls.
 */

const PREVIEW_LEN = 140;

/**
 * Sentinel sender id for system-authored messages (the official "Soporte
 * KixxMe" welcome). `support_ticket_messages.senderId` is a plain `uuid` with
 * NO foreign key, and message bubbles are aligned by `senderRole` (never by id),
 * so an all-zeros UUID is safe and distinguishable from any real user.
 */
const SYSTEM_SENDER_ID = "00000000-0000-0000-0000-000000000000";

/** Subject of the auto-created Gold welcome conversation. */
export const OFFICIAL_TICKET_SUBJECT = "👑 Soporte KixxMe";

/** Spanish welcome posted into every Gold member's official support thread. */
const OFFICIAL_WELCOME_BODY = [
  "Hola 👋 Gracias por formar parte de KixxMe Gold.",
  "",
  "Ahora tienes atención prioritaria dentro de la app. Si necesitas ayuda con tu cuenta, tu suscripción o cualquier incidencia, escríbenos por aquí y te responderemos lo antes posible.",
  "",
  "📩 Atención prioritaria",
  "💎 Exclusiva para miembros Gold",
  "🕒 Soporte 24/7",
].join("\n");

/** API-facing ticket shape (mirrors the OpenAPI `SupportTicket` schema). */
export interface TicketView {
  id: string;
  userId: string;
  status: SupportTicketStatus;
  subject: string;
  openedByRole: SupportActorRole;
  lastMessageAt: string;
  lastSenderRole: SupportActorRole;
  lastMessagePreview: string | null;
  unread: boolean;
  createdAt: string;
  updatedAt: string;
  username?: string | null;
  avatarUrl?: string | null;
  // Whether THIS viewer may post a new message. Premium ("official" or
  // user-opened) tickets are Gold-only to send into; admins and non-premium
  // (admin-initiated outreach) tickets are always replyable. Only set by
  // getTicketDetail (the only surface with a composer); undefined = allowed.
  canReply?: boolean;
}

export interface MessageView {
  id: string;
  ticketId: string;
  senderId: string;
  senderRole: SupportActorRole;
  // Nullable: an attachment-only message (photo or voice note) has no body.
  body: string | null;
  imageUrl: string | null;
  audioUrl: string | null;
  audioDuration: number | null;
  createdAt: string;
}

/** Attachment payload accepted alongside (or instead of) a text body. */
export interface MessageAttachments {
  body?: string | null;
  imageUrl?: string | null;
  audioUrl?: string | null;
  audioDuration?: number | null;
}

export interface TicketDetail {
  ticket: TicketView;
  messages: MessageView[];
}

export interface TicketList {
  tickets: TicketView[];
  total: number;
}

/**
 * Is the ticket unread from `viewer`'s perspective? A side has unread mail when
 * the OTHER side sent the most recent message after this side last read.
 */
function computeUnread(row: SupportTicketRow, viewer: SupportActorRole): boolean {
  if (viewer === "user") {
    if (row.lastSenderRole !== "admin") return false;
    return !row.userLastReadAt || row.lastMessageAt > row.userLastReadAt;
  }
  if (row.lastSenderRole !== "user") return false;
  return !row.adminLastReadAt || row.lastMessageAt > row.adminLastReadAt;
}

function mapMessage(m: SupportTicketMessageRow): MessageView {
  return {
    id: m.id,
    ticketId: m.ticketId,
    senderId: m.senderId,
    senderRole: m.senderRole,
    body: m.body,
    imageUrl: m.imageUrl,
    audioUrl: m.audioUrl,
    audioDuration: m.audioDuration,
    createdAt: m.createdAt.toISOString(),
  };
}

function mapTicket(
  row: SupportTicketRow,
  viewer: SupportActorRole,
  opts?: {
    preview?: string | null;
    owner?: { username: string | null; avatarUrl: string | null } | null;
  },
): TicketView {
  const base: TicketView = {
    id: row.id,
    userId: row.userId,
    status: row.status,
    subject: row.subject,
    openedByRole: row.openedByRole,
    lastMessageAt: row.lastMessageAt.toISOString(),
    lastSenderRole: row.lastSenderRole,
    lastMessagePreview: opts?.preview ?? null,
    unread: computeUnread(row, viewer),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  if (opts?.owner !== undefined) {
    base.username = opts.owner?.username ?? null;
    base.avatarUrl = opts.owner?.avatarUrl ?? null;
  }
  return base;
}

/**
 * One-line preview for a message: the trimmed text body, or an emoji label for
 * an attachment-only message (photo / voice note). Used by the ticket list, the
 * detail header, and the outbound email notifications.
 */
function previewOf(m: {
  body: string | null;
  imageUrl: string | null;
  audioUrl: string | null;
}): string {
  const text = m.body?.replace(/\s+/g, " ").trim() ?? "";
  if (text) return text.length > PREVIEW_LEN ? `${text.slice(0, PREVIEW_LEN)}…` : text;
  if (m.imageUrl) return "📷 Foto";
  if (m.audioUrl) return "🎤 Nota de voz";
  return "";
}

/** Latest message preview per ticket, in one query (no N+1). */
async function loadPreviews(ticketIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ticketIds.length === 0) return map;
  const rows = await db
    .selectDistinctOn([supportTicketMessagesTable.ticketId], {
      ticketId: supportTicketMessagesTable.ticketId,
      body: supportTicketMessagesTable.body,
      imageUrl: supportTicketMessagesTable.imageUrl,
      audioUrl: supportTicketMessagesTable.audioUrl,
    })
    .from(supportTicketMessagesTable)
    .where(inArray(supportTicketMessagesTable.ticketId, ticketIds))
    .orderBy(
      supportTicketMessagesTable.ticketId,
      desc(supportTicketMessagesTable.createdAt),
    );
  for (const r of rows) map.set(r.ticketId, previewOf(r));
  return map;
}

/** Batch-hydrate ticket owners' public profile bits (admin views only). */
async function loadOwners(
  userIds: string[],
): Promise<Map<string, { username: string | null; avatarUrl: string | null }>> {
  const map = new Map<
    string,
    { username: string | null; avatarUrl: string | null }
  >();
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return map;
  const { data } = await supabase
    .from("profiles")
    .select("id, username, avatar_url")
    .in("id", unique);
  for (const p of data ?? []) {
    map.set(p.id as string, {
      username: (p.username as string | null) ?? null,
      avatarUrl: (p.avatar_url as string | null) ?? null,
    });
  }
  return map;
}

async function loadMessages(ticketId: string): Promise<MessageView[]> {
  const rows = await db
    .select()
    .from(supportTicketMessagesTable)
    .where(eq(supportTicketMessagesTable.ticketId, ticketId))
    .orderBy(supportTicketMessagesTable.createdAt);
  return rows.map(mapMessage);
}

/** True when a Supabase profile exists for `userId` (admin-create guard). */
export async function profileExists(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  return Boolean(data);
}

/**
 * Open a ticket from the user side. The Gold gate is enforced by the caller
 * (route) before this runs; here we just create pending + the first message.
 */
export async function createTicket(
  userId: string,
  subject: string,
  body: string,
): Promise<TicketDetail> {
  const now = new Date();
  const ticketId = await db.transaction(async (tx) => {
    const [ticket] = await tx
      .insert(supportTicketsTable)
      .values({
        userId,
        status: "pending",
        subject,
        openedByRole: "user",
        lastMessageAt: now,
        lastSenderRole: "user",
        userLastReadAt: now,
      })
      .returning({ id: supportTicketsTable.id });
    if (!ticket) throw new Error("ticket insert returned no row");
    await tx.insert(supportTicketMessagesTable).values({
      ticketId: ticket.id,
      senderId: userId,
      senderRole: "user",
      body,
    });
    return ticket.id;
  });
  return (await getTicketDetail(ticketId, userId, false))!;
}

/**
 * Admin starts a ticket with ANY user (even free). Status begins `answered`
 * (the ball is in the user's court). Caller must verify the target exists.
 */
export async function adminCreateTicket(
  adminId: string,
  targetUserId: string,
  subject: string,
  body: string,
): Promise<TicketDetail> {
  const now = new Date();
  const ticketId = await db.transaction(async (tx) => {
    const [ticket] = await tx
      .insert(supportTicketsTable)
      .values({
        userId: targetUserId,
        status: "answered",
        subject,
        openedByRole: "admin",
        lastMessageAt: now,
        lastSenderRole: "admin",
        adminLastReadAt: now,
      })
      .returning({ id: supportTicketsTable.id });
    if (!ticket) throw new Error("ticket insert returned no row");
    await tx.insert(supportTicketMessagesTable).values({
      ticketId: ticket.id,
      senderId: adminId,
      senderRole: "admin",
      body,
    });
    return ticket.id;
  });
  return (await getTicketDetail(ticketId, adminId, true))!;
}

/** Load a user's single official "Soporte KixxMe" ticket row, if any. */
async function loadOfficialRow(
  userId: string,
): Promise<SupportTicketRow | null> {
  const [row] = await db
    .select()
    .from(supportTicketsTable)
    .where(
      and(
        eq(supportTicketsTable.userId, userId),
        eq(supportTicketsTable.kind, "official"),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * User-perspective view of an official ticket WITHOUT the read side-effect of
 * `getTicketDetail` — the chats list polls this, so it must never auto-clear the
 * unread badge. Opening the thread (via getTicketDetail) is what marks it read.
 */
async function officialTicketView(row: SupportTicketRow): Promise<TicketView> {
  const previews = await loadPreviews([row.id]);
  return mapTicket(row, "user", { preview: previews.get(row.id) ?? null });
}

/**
 * Idempotently ensure the user's official "👑 Soporte KixxMe" welcome thread
 * exists and return its user-perspective view (no read side-effect). Called
 * eagerly on Gold activation (Stripe webhook) and lazily by GET /support/official
 * as a safety net (e.g. GOLD_TEST_EMAILS users who never hit the webhook). The
 * partial unique index `(userId) WHERE kind='official'` + `onConflictDoNothing`
 * make concurrent callers race-safe: the loser inserts nothing and re-reads.
 */
export async function ensureOfficialTicket(
  userId: string,
): Promise<TicketView> {
  const existing = await loadOfficialRow(userId);
  if (existing) return officialTicketView(existing);

  const now = new Date();
  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(supportTicketsTable)
      .values({
        userId,
        kind: "official",
        status: "answered",
        subject: OFFICIAL_TICKET_SUBJECT,
        openedByRole: "admin",
        lastMessageAt: now,
        lastSenderRole: "admin",
        // Admin side is implicitly caught up; the USER has it unread (new).
        adminLastReadAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: supportTicketsTable.id });
    const ticketId = inserted[0]?.id;
    if (!ticketId) return; // Lost the race — another caller created it.
    await tx.insert(supportTicketMessagesTable).values({
      ticketId,
      senderId: SYSTEM_SENDER_ID,
      senderRole: "admin",
      body: OFFICIAL_WELCOME_BODY,
    });
  });

  const row = await loadOfficialRow(userId);
  if (!row) throw new Error("official ticket missing after ensure");
  return officialTicketView(row);
}

async function loadTicketRow(
  ticketId: string,
): Promise<SupportTicketRow | null> {
  const [row] = await db
    .select()
    .from(supportTicketsTable)
    .where(eq(supportTicketsTable.id, ticketId))
    .limit(1);
  return row ?? null;
}

/** Owner-or-admin authorization. Returns the row, or null (→ 404). */
async function authorizeTicket(
  ticketId: string,
  viewerId: string,
  isAdmin: boolean,
): Promise<SupportTicketRow | null> {
  const row = await loadTicketRow(ticketId);
  if (!row) return null;
  if (row.userId !== viewerId && !isAdmin) return null;
  return row;
}

/**
 * Full thread for the owner or an admin. Side-effect: marks the thread read for
 * whichever role is viewing (mirrors GET conversations/:id/messages), so the
 * caller's unread badge clears. Returns null when not found / not authorized.
 */
export async function getTicketDetail(
  ticketId: string,
  viewerId: string,
  isAdmin: boolean,
): Promise<TicketDetail | null> {
  const row = await authorizeTicket(ticketId, viewerId, isAdmin);
  if (!row) return null;
  // The owner reads as "user" even when they are also an admin (it's their
  // own ticket); a non-owner admin reads as "admin".
  const viewer: SupportActorRole = row.userId === viewerId ? "user" : "admin";

  const now = new Date();
  const patch =
    viewer === "user" ? { userLastReadAt: now } : { adminLastReadAt: now };
  await db
    .update(supportTicketsTable)
    .set(patch)
    .where(eq(supportTicketsTable.id, ticketId));

  const fresh = (await loadTicketRow(ticketId)) ?? row;
  const messages = await loadMessages(ticketId);
  const preview = messages.length
    ? previewOf(messages[messages.length - 1]!)
    : null;
  const owner =
    viewer === "admin"
      ? (await loadOwners([row.userId])).get(row.userId) ?? null
      : undefined;
  const ticket = mapTicket(fresh, viewer, { preview, owner });

  // Sending into a PREMIUM ticket (the official welcome thread, or one the user
  // opened themselves) requires Gold. Admins always reply; admin-initiated
  // outreach (kind='support', openedByRole='admin') stays free-answerable so a
  // moderated/free user can respond. Use the `isAdmin` param — NOT the derived
  // viewer role — because an admin viewing their OWN ticket reads as "user" but
  // must still keep canReply. hasGold (a cached read) only runs for the one case
  // that needs it, since getTicketDetail is polled.
  const isPremiumTicket =
    row.kind === "official" || row.openedByRole === "user";
  ticket.canReply =
    isAdmin || !isPremiumTicket || (await hasGold(viewerId));

  return { ticket, messages };
}

/**
 * Immutable gate fields for a ticket (userId/kind/openedByRole never change
 * after insert), used by the POST messages route to decide the Gold send gate
 * before delegating to postMessage. Returns null when the ticket doesn't exist.
 */
export async function getTicketGate(ticketId: string): Promise<{
  userId: string;
  kind: SupportTicketRow["kind"];
  openedByRole: SupportActorRole;
} | null> {
  const row = await loadTicketRow(ticketId);
  if (!row) return null;
  return { userId: row.userId, kind: row.kind, openedByRole: row.openedByRole };
}

/**
 * Read-only view of the user's official "Soporte KixxMe" thread WITHOUT
 * creating it. Used for lapsed-Gold members: they keep reading their existing
 * history but can no longer trigger creation (that stays Gold-gated). Returns
 * null when no official ticket exists yet.
 */
export async function getExistingOfficialTicket(
  userId: string,
): Promise<TicketView | null> {
  const row = await loadOfficialRow(userId);
  return row ? officialTicketView(row) : null;
}

/**
 * Post a message to an existing ticket. `senderRole` is derived server-side:
 * the owner is always "user" (even if they're an admin), a non-owner admin is
 * "admin", anyone else is unauthorized (null → 404). Status transitions:
 * user → pending (urgent sticks; closed reopens to pending); admin → answered
 * (reopens closed, clears urgent).
 */
export async function postMessage(
  ticketId: string,
  senderId: string,
  isAdmin: boolean,
  input: MessageAttachments,
): Promise<TicketDetail | null> {
  const row = await authorizeTicket(ticketId, senderId, isAdmin);
  if (!row) return null;
  const senderRole: SupportActorRole =
    row.userId === senderId ? "user" : "admin";

  const body = input.body?.trim() || null;
  const imageUrl = input.imageUrl ?? null;
  const audioUrl = input.audioUrl ?? null;
  const audioDuration = audioUrl ? clampAudioDuration(input.audioDuration) : null;

  const now = new Date();
  const nextStatus: SupportTicketStatus =
    senderRole === "admin"
      ? "answered"
      : row.status === "urgent"
        ? "urgent"
        : "pending";

  await db.transaction(async (tx) => {
    await tx.insert(supportTicketMessagesTable).values({
      ticketId,
      senderId,
      senderRole,
      body,
      imageUrl,
      audioUrl,
      audioDuration,
    });
    await tx
      .update(supportTicketsTable)
      .set({
        status: nextStatus,
        lastMessageAt: now,
        lastSenderRole: senderRole,
        // The sender has implicitly read everything up to their own message.
        ...(senderRole === "user"
          ? { userLastReadAt: now }
          : { adminLastReadAt: now }),
        // A reply (re)opens a closed ticket; clear the closed bookkeeping.
        ...(row.status === "closed" ? { closedBy: null, closedAt: null } : {}),
      })
      .where(eq(supportTicketsTable.id, ticketId));
  });

  return getTicketDetail(ticketId, senderId, isAdmin);
}

/** Admin force-sets a ticket's status (close / mark urgent / reopen). */
export async function setTicketStatus(
  ticketId: string,
  adminId: string,
  status: SupportTicketStatus,
): Promise<TicketDetail | null> {
  const row = await loadTicketRow(ticketId);
  if (!row) return null;
  await db
    .update(supportTicketsTable)
    .set({
      status,
      ...(status === "closed"
        ? { closedBy: adminId, closedAt: new Date() }
        : { closedBy: null, closedAt: null }),
    })
    .where(eq(supportTicketsTable.id, ticketId));
  return getTicketDetail(ticketId, adminId, true);
}

/** The caller's own tickets, newest activity first (user perspective). */
export async function listMine(userId: string): Promise<TicketList> {
  const rows = await db
    .select()
    .from(supportTicketsTable)
    .where(eq(supportTicketsTable.userId, userId))
    .orderBy(desc(supportTicketsTable.lastMessageAt));
  const previews = await loadPreviews(rows.map((r) => r.id));
  const tickets = rows.map((r) =>
    mapTicket(r, "user", { preview: previews.get(r.id) ?? null }),
  );
  return { tickets, total: tickets.length };
}

/**
 * Admin queue across ALL users, optional status filter + offset paging. Owner
 * usernames/avatars are hydrated (batched) for display, but emails NEVER leak
 * here — those live only in the per-ticket detail route.
 */
export async function listAdmin(opts: {
  status?: SupportTicketStatus;
  limit: number;
  offset: number;
}): Promise<TicketList> {
  const where = opts.status
    ? eq(supportTicketsTable.status, opts.status)
    : undefined;
  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(supportTicketsTable)
      .where(where)
      .orderBy(desc(supportTicketsTable.lastMessageAt))
      .limit(opts.limit)
      .offset(opts.offset),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(supportTicketsTable)
      .where(where),
  ]);
  const [previews, owners] = await Promise.all([
    loadPreviews(rows.map((r) => r.id)),
    loadOwners(rows.map((r) => r.userId)),
  ]);
  const tickets = rows.map((r) =>
    mapTicket(r, "admin", {
      preview: previews.get(r.id) ?? null,
      owner: owners.get(r.userId) ?? null,
    }),
  );
  return { tickets, total: totalRows[0]?.c ?? tickets.length };
}

/** Count of the user's tickets with an unread admin reply (bell badge). */
export async function countUserUnread(userId: string): Promise<number> {
  const rows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(supportTicketsTable)
    .where(
      and(
        eq(supportTicketsTable.userId, userId),
        eq(supportTicketsTable.lastSenderRole, "admin"),
        or(
          isNull(supportTicketsTable.userLastReadAt),
          gt(
            supportTicketsTable.lastMessageAt,
            supportTicketsTable.userLastReadAt,
          ),
        ),
      ),
    );
  return rows[0]?.c ?? 0;
}

/**
 * 1 when the official "Soporte KixxMe" thread has an unread admin message for
 * the user, else 0 (there is at most one official ticket per user). Folded into
 * the Messages-tab badge so the pinned card shows a dot like any conversation.
 */
export async function countOfficialUnread(userId: string): Promise<number> {
  const rows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(supportTicketsTable)
    .where(
      and(
        eq(supportTicketsTable.userId, userId),
        eq(supportTicketsTable.kind, "official"),
        eq(supportTicketsTable.lastSenderRole, "admin"),
        or(
          isNull(supportTicketsTable.userLastReadAt),
          gt(
            supportTicketsTable.lastMessageAt,
            supportTicketsTable.userLastReadAt,
          ),
        ),
      ),
    );
  return rows[0]?.c ?? 0;
}

/** Admin notification figures: open (pending+urgent) count + newest activity. */
export async function adminTicketStats(): Promise<{
  openTickets: number;
  latestTicketAt: string | null;
}> {
  const openWhere = inArray(supportTicketsTable.status, ["pending", "urgent"]);
  const [countRows, latestRows] = await Promise.all([
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(supportTicketsTable)
      .where(openWhere),
    db
      .select({ at: supportTicketsTable.lastMessageAt })
      .from(supportTicketsTable)
      .where(openWhere)
      .orderBy(desc(supportTicketsTable.lastMessageAt))
      .limit(1),
  ]);
  const latest = latestRows[0]?.at ?? null;
  return {
    openTickets: countRows[0]?.c ?? 0,
    latestTicketAt: latest ? latest.toISOString() : null,
  };
}

/** GDPR: drop a user's tickets (messages cascade via the FK). */
export async function purgeUserTickets(userId: string): Promise<void> {
  await db
    .delete(supportTicketsTable)
    .where(eq(supportTicketsTable.userId, userId));
}
