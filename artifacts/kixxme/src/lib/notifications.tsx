import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { useLocation } from "wouter";
import {
  useListConversations,
  getListConversationsQueryKey,
  useGetNotificationsSummary,
  getGetNotificationsSummaryQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "./auth";
import { useToast } from "@/hooks/use-toast";

interface NotificationsValue {
  totalUnread: number;
  newLikes: number;
  newMatches: number;
  markLikesSeen: () => void;
  markMatchesSeen: () => void;
}

const NotificationsContext = createContext<NotificationsValue>({
  totalUnread: 0,
  newLikes: 0,
  newMatches: 0,
  markLikesSeen: () => {},
  markMatchesSeen: () => {},
});

// Seen-markers are scoped per user id so a shared browser never leaks one
// account's baseline onto another.
const LAST_SEEN_LIKE = "kixxme:lastSeenLikeAt";
const LAST_SEEN_MATCH = "kixxme:lastSeenMatchAt";

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore (private mode / storage disabled) */
  }
}

function newestTs(items: Array<{ ts: string }>): number {
  return items.reduce((max, i) => Math.max(max, Date.parse(i.ts)), 0);
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { session, user } = useAuth();
  const { toast } = useToast();
  const [location] = useLocation();

  // --- New messages -------------------------------------------------------
  const { data: conversations = [] } = useListConversations({
    query: {
      queryKey: getListConversationsQueryKey(),
      enabled: !!session,
      refetchInterval: 8000,
    },
  });

  const prevRef = useRef<Map<string, number>>(new Map());
  const initRef = useRef(false);

  const totalUnread = conversations.reduce(
    (sum, c) => sum + (c.unread_count ?? 0),
    0
  );

  useEffect(() => {
    const next = new Map<string, number>();
    for (const c of conversations) next.set(c.id, c.unread_count ?? 0);

    if (initRef.current) {
      for (const c of conversations) {
        const before = prevRef.current.get(c.id) ?? 0;
        const now = c.unread_count ?? 0;
        const onThisChat = location.startsWith(`/chats/${c.id}`);
        if (now > before && !onThisChat) {
          toast({
            title: `💬 ${c.other_user?.username ?? "Nuevo mensaje"}`,
            description: c.last_message ?? "Te ha enviado un mensaje",
          });
        }
      }
    }

    prevRef.current = next;
    initRef.current = true;
  }, [conversations, location, toast]);

  // --- New likes & matches ------------------------------------------------
  const userId = user?.id ?? null;
  const likeKey = userId ? `${LAST_SEEN_LIKE}:${userId}` : null;
  const matchKey = userId ? `${LAST_SEEN_MATCH}:${userId}` : null;

  const { data: summary } = useGetNotificationsSummary({
    query: {
      queryKey: getGetNotificationsSummaryQueryKey(),
      enabled: !!session,
      refetchInterval: 12000,
    },
  });

  const likes = summary?.likes ?? [];
  const matches = summary?.matches ?? [];

  // Latest data behind refs so the mark-seen callbacks stay referentially
  // stable (avoids re-running the favorites mark-seen effect every poll).
  const likesRef = useRef(likes);
  const matchesRef = useRef(matches);
  const likeKeyRef = useRef(likeKey);
  const matchKeyRef = useRef(matchKey);
  likesRef.current = likes;
  matchesRef.current = matches;
  likeKeyRef.current = likeKey;
  matchKeyRef.current = matchKey;

  const [lastSeenLike, setLastSeenLike] = useState<string | null>(null);
  const [lastSeenMatch, setLastSeenMatch] = useState<string | null>(null);

  const baselineRef = useRef(false);
  const toastLikeRef = useRef(0);
  const toastMatchRef = useRef(0);
  const toastInitRef = useRef(false);

  // On account change, reload that user's markers and reset session trackers.
  useEffect(() => {
    baselineRef.current = false;
    toastInitRef.current = false;
    toastLikeRef.current = 0;
    toastMatchRef.current = 0;
    setLastSeenLike(likeKey ? readStored(likeKey) : null);
    setLastSeenMatch(matchKey ? readStored(matchKey) : null);
  }, [likeKey, matchKey]);

  // First load: baseline the markers to the newest existing item (server
  // timestamps, so clock skew is irrelevant) so history isn't flagged as new.
  useEffect(() => {
    if (!summary || !userId || baselineRef.current) return;
    baselineRef.current = true;
    const newestLike = newestTs(likes.map((l) => ({ ts: l.created_at })));
    const newestMatch = newestTs(matches.map((m) => ({ ts: m.matched_at })));
    if (likeKey && readStored(likeKey) == null) {
      const v = (newestLike ? new Date(newestLike) : new Date()).toISOString();
      writeStored(likeKey, v);
      setLastSeenLike(v);
    }
    if (matchKey && readStored(matchKey) == null) {
      const v = (newestMatch ? new Date(newestMatch) : new Date()).toISOString();
      writeStored(matchKey, v);
      setLastSeenMatch(v);
    }
  }, [summary, userId, likeKey, matchKey]);

  const newLikes = lastSeenLike
    ? likes.filter((l) => Date.parse(l.created_at) > Date.parse(lastSeenLike))
        .length
    : 0;
  const newMatches = lastSeenMatch
    ? matches.filter((m) => Date.parse(m.matched_at) > Date.parse(lastSeenMatch))
        .length
    : 0;

  const markLikesSeen = useCallback(() => {
    const key = likeKeyRef.current;
    if (!key) return;
    const newest = newestTs(likesRef.current.map((l) => ({ ts: l.created_at })));
    const v = (newest ? new Date(newest) : new Date()).toISOString();
    writeStored(key, v);
    setLastSeenLike(v);
  }, []);

  const markMatchesSeen = useCallback(() => {
    const key = matchKeyRef.current;
    if (!key) return;
    const newest = newestTs(
      matchesRef.current.map((m) => ({ ts: m.matched_at }))
    );
    const v = (newest ? new Date(newest) : new Date()).toISOString();
    writeStored(key, v);
    setLastSeenMatch(v);
  }, []);

  // Real-time toasts for likes/matches, tracked separately from the persisted
  // badge so reloads don't re-toast old activity.
  useEffect(() => {
    if (!summary) return;
    const newestLike = newestTs(likes.map((l) => ({ ts: l.created_at })));
    const newestMatch = newestTs(matches.map((m) => ({ ts: m.matched_at })));

    if (toastInitRef.current) {
      const freshMatches = matches.filter(
        (m) => Date.parse(m.matched_at) > toastMatchRef.current
      );
      const freshMatchUserIds = new Set(freshMatches.map((m) => m.user_id));
      // A like that completes a match is announced as a match, not a like.
      const freshLikes = likes.filter(
        (l) =>
          Date.parse(l.created_at) > toastLikeRef.current &&
          !freshMatchUserIds.has(l.user_id)
      );

      if (freshMatches.length > 0) {
        const m = freshMatches[0];
        toast({
          title: "🔥 ¡Nuevo match!",
          description: m.username
            ? `${m.username} y tú os habéis gustado`
            : "Tienes un nuevo match",
        });
      }
      if (freshLikes.length > 0) {
        toast({
          title: "💜 A alguien le gustas",
          description:
            freshLikes.length > 1
              ? `Tienes ${freshLikes.length} nuevos me gusta`
              : "Tienes un nuevo me gusta",
        });
      }
    }

    toastLikeRef.current = Math.max(toastLikeRef.current, newestLike);
    toastMatchRef.current = Math.max(toastMatchRef.current, newestMatch);
    toastInitRef.current = true;
  }, [summary, toast]);

  return (
    <NotificationsContext.Provider
      value={{
        totalUnread,
        newLikes,
        newMatches,
        markLikesSeen,
        markMatchesSeen,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationsContext);
}
