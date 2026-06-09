import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, Send, Loader2, ImageIcon } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  useListMessages,
  getListMessagesQueryKey,
  useSendMessage,
  useCreateOrGetConversation,
  Message,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import BottomNav from "@/components/layout/bottom-nav";

function timeLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

export default function Chat() {
  const { id: conversationId } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { session, user } = useAuth();
  const qc = useQueryClient();

  const [text, setText] = useState("");
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: serverMessages = [], isLoading } = useListMessages(conversationId ?? "", {
    query: { queryKey: getListMessagesQueryKey(conversationId ?? ""), enabled: !!conversationId },
  });

  const getConv = useCreateOrGetConversation();
  const [otherUser, setOtherUser] = React.useState<{ username: string; avatar_url?: string | null } | null>(null);

  useEffect(() => {
    if (!conversationId || !session) return;
    getConv.mutate(
      { data: { other_user_id: user?.id ?? "" } },
      {
        onError: () => {},
      }
    );
  }, []);

  useEffect(() => {
    if (serverMessages.length > 0 && localMessages.length === 0) {
      setLocalMessages(serverMessages);
    } else if (serverMessages.length > localMessages.length) {
      setLocalMessages(serverMessages);
    }
  }, [serverMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [localMessages]);

  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`chat:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const msg = payload.new as Message;
          setLocalMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId || !session) return;
    fetch(`/api/conversations/${conversationId}/messages`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => r.json())
      .then((msgs: Message[]) => {
        if (Array.isArray(msgs)) setLocalMessages(msgs);
        if (msgs.length > 0) {
          fetch(`/api/profiles/${msgs[0].sender_id === user?.id ? msgs[msgs.length - 1]?.sender_id : msgs[0].sender_id}`)
            .then((r) => r.json())
            .then((p) => setOtherUser(p))
            .catch(() => {});
        }
      })
      .catch(() => {});

    fetch(`/api/conversations`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => r.json())
      .then((convs: any[]) => {
        const conv = convs.find((c: any) => c.id === conversationId);
        if (conv?.other_user) setOtherUser(conv.other_user);
      })
      .catch(() => {});
  }, [conversationId, session]);

  const sendMessage = useSendMessage();

  const handleSend = useCallback(() => {
    const content = text.trim();
    if (!content || !conversationId) return;
    setText("");

    const optimistic: Message = {
      id: `opt-${Date.now()}`,
      conversation_id: conversationId,
      sender_id: user?.id ?? "",
      content,
      created_at: new Date().toISOString(),
      read_at: null,
    };
    setLocalMessages((prev) => [...prev, optimistic]);

    sendMessage.mutate(
      { id: conversationId, data: { content } },
      {
        onSuccess: (real) => {
          setLocalMessages((prev) =>
            prev.map((m) => (m.id === optimistic.id ? real : m))
          );
        },
        onError: () => {
          setLocalMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
          setText(content);
        },
      }
    );
  }, [text, conversationId, user?.id, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const myId = user?.id ?? "";
  const initials = (otherUser?.username || "?").slice(0, 2).toUpperCase();

  return (
    <div
      className="flex flex-col"
      style={{ height: "100dvh", background: "radial-gradient(ellipse 100% 50% at 50% 0%, hsl(270 30% 8%) 0%, hsl(238 25% 4%) 60%)" }}
    >
      <header
        className="flex-shrink-0 px-4 py-3 flex items-center gap-3 border-b border-border/30"
        style={{ background: "rgba(8,7,18,0.92)", backdropFilter: "blur(20px)" }}
      >
        <button
          onClick={() => setLocation("/chats")}
          className="w-9 h-9 flex items-center justify-center rounded-xl border border-border/40 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          style={{ background: "rgba(255,255,255,0.04)" }}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <Avatar className="w-9 h-9 rounded-xl border border-border/30 flex-shrink-0">
          {otherUser?.avatar_url && <AvatarImage src={otherUser.avatar_url} className="object-cover" />}
          <AvatarFallback className="font-display text-sm bg-card text-primary">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-display text-lg tracking-wide text-foreground truncate">
            {otherUser?.username ?? "..."}
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {isLoading && localMessages.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        ) : localMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <span className="text-3xl">👋</span>
            <p className="font-sans text-sm text-muted-foreground">Sé el primero en decir hola</p>
          </div>
        ) : (
          localMessages.map((msg) => {
            const isMine = msg.sender_id === myId;
            const isOptimistic = msg.id.startsWith("opt-");
            return (
              <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                <div
                  className="max-w-[75%] px-4 py-2.5 rounded-2xl"
                  style={
                    isMine
                      ? { background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))", opacity: isOptimistic ? 0.7 : 1 }
                      : { background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }
                  }
                >
                  <p className="font-sans text-sm text-white leading-snug break-words">{msg.content}</p>
                  <p className={`font-sans text-[10px] mt-1 ${isMine ? "text-white/60 text-right" : "text-white/40"}`}>
                    {timeLabel(msg.created_at)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div
        className="flex-shrink-0 px-4 py-3 border-t border-border/30 flex items-end gap-2"
        style={{ background: "rgba(8,7,18,0.92)", backdropFilter: "blur(20px)" }}
      >
        <button className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl border border-border/40 text-muted-foreground hover:text-foreground transition-colors"
          style={{ background: "rgba(255,255,255,0.04)" }}>
          <ImageIcon className="w-4 h-4" />
        </button>
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escribe un mensaje..."
          rows={1}
          className="flex-1 resize-none rounded-xl px-4 py-2.5 font-sans text-sm text-foreground placeholder:text-muted-foreground border border-border/60 focus:outline-none focus:border-primary/60 bg-input/40 min-h-[40px] max-h-[120px]"
          style={{ lineHeight: "1.4" }}
        />
        <button
          onClick={handleSend}
          disabled={!text.trim()}
          className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl text-white transition-all disabled:opacity-40 border-0"
          style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))" }}
        >
          <Send className="w-4 h-4" />
        </button>
      </div>

      <BottomNav />
    </div>
  );
}
