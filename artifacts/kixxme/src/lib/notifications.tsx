import React, { createContext, useContext, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  useListConversations,
  getListConversationsQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "./auth";
import { useToast } from "@/hooks/use-toast";

interface NotificationsValue {
  totalUnread: number;
}

const NotificationsContext = createContext<NotificationsValue>({ totalUnread: 0 });

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const { toast } = useToast();
  const [location] = useLocation();

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

  return (
    <NotificationsContext.Provider value={{ totalUnread }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationsContext);
}
