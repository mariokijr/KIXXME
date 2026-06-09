import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import {
  ArrowLeft,
  Send,
  Loader2,
  ImageIcon,
  MoreVertical,
  Trash2,
  Flag,
  UserRound,
  Ban,
  Check,
  CheckCheck,
} from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  useListMessages,
  getListMessagesQueryKey,
  useSendMessage,
  useListConversations,
  getListConversationsQueryKey,
  useMarkConversationRead,
  useReportConversation,
  useDeleteMessage,
  useUploadChatImage,
  useBlockProfile,
  useUnblockProfile,
  Message,
  PublicProfile,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";

function timeLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function mergeMessages(local: Message[], incoming: Message[]): Message[] {
  const map = new Map<string, Message>();
  for (const m of local) map.set(m.id, m);
  for (const m of incoming) map.set(m.id, m);
  return Array.from(map.values()).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Chat() {
  const { id: conversationId } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { session, user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const myId = user?.id ?? "";

  const [text, setText] = useState("");
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeMsg, setActiveMsg] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: serverMessages = [], isLoading } = useListMessages(conversationId ?? "", {
    query: {
      queryKey: getListMessagesQueryKey(conversationId ?? ""),
      enabled: !!conversationId,
      refetchInterval: 15000,
    },
  });

  const { data: conversations = [] } = useListConversations({
    query: { queryKey: getListConversationsQueryKey(), enabled: !!session },
  });
  const conv = conversations.find((c) => c.id === conversationId);
  const otherUser: PublicProfile | undefined = conv?.other_user;

  const sendMessage = useSendMessage();
  const markRead = useMarkConversationRead();
  const reportConv = useReportConversation();
  const deleteMsg = useDeleteMessage();
  const uploadImage = useUploadChatImage();
  const blockUser = useBlockProfile();
  const unblockUser = useUnblockProfile();

  // Reset local state when switching conversations so messages never bleed across chats.
  useEffect(() => {
    setLocalMessages([]);
  }, [conversationId]);

  // Merge server messages into local state (server is source of truth).
  useEffect(() => {
    if (serverMessages.length > 0) {
      setLocalMessages((prev) => mergeMessages(prev, serverMessages));
    }
  }, [serverMessages]);

  // Mark conversation read on open and clear the unread badge.
  useEffect(() => {
    if (!conversationId || !session) return;
    markRead.mutate(
      { id: conversationId },
      {
        onSettled: () =>
          qc.invalidateQueries({ queryKey: getListConversationsQueryKey() }),
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, session]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [localMessages]);

  // Realtime: other users' new messages + any updates (deletes / read receipts).
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
          if (msg.sender_id === myId) return; // our own handled optimistically
          setLocalMessages((prev) => mergeMessages(prev, [msg]));
          markRead.mutate({ id: conversationId });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const msg = payload.new as Message;
          setLocalMessages((prev) =>
            prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, myId]);

  const handleSend = useCallback(() => {
    const content = text.trim();
    if (!content || !conversationId) return;
    setText("");

    const optimistic: Message = {
      id: `opt-${Date.now()}`,
      conversation_id: conversationId,
      sender_id: myId,
      content,
      image_url: null,
      created_at: new Date().toISOString(),
      read_at: null,
      deleted_at: null,
    };
    setLocalMessages((prev) => mergeMessages(prev, [optimistic]));

    sendMessage.mutate(
      { id: conversationId, data: { content } },
      {
        onSuccess: (real) => {
          setLocalMessages((prev) =>
            mergeMessages(
              prev.filter((m) => m.id !== optimistic.id),
              [real]
            )
          );
          qc.invalidateQueries({ queryKey: getListConversationsQueryKey() });
        },
        onError: () => {
          setLocalMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
          setText(content);
          toast({ title: "No se pudo enviar el mensaje", variant: "destructive" });
        },
      }
    );
  }, [text, conversationId, myId, sendMessage, qc, toast]);

  const handlePickImage = () => fileRef.current?.click();

  const handleImageSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !conversationId) return;
    if (file.size > 8 * 1024 * 1024) {
      toast({ title: "La imagen es demasiado grande (máx. 8 MB)", variant: "destructive" });
      return;
    }
    try {
      const base64 = await fileToBase64(file);
      const { image_url } = await uploadImage.mutateAsync({
        id: conversationId,
        data: { base64, mime_type: file.type, filename: file.name },
      });
      const real = await sendMessage.mutateAsync({
        id: conversationId,
        data: { image_url },
      });
      setLocalMessages((prev) => mergeMessages(prev, [real]));
      qc.invalidateQueries({ queryKey: getListConversationsQueryKey() });
    } catch {
      toast({ title: "No se pudo enviar la foto", variant: "destructive" });
    }
  };

  const handleDelete = (messageId: string) => {
    setActiveMsg(null);
    setLocalMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, deleted_at: new Date().toISOString(), content: null, image_url: null }
          : m
      )
    );
    deleteMsg.mutate(
      { messageId },
      {
        onError: () => toast({ title: "No se pudo eliminar", variant: "destructive" }),
      }
    );
  };

  const handleReport = () => {
    if (!conversationId) return;
    setMenuOpen(false);
    reportConv.mutate(
      { id: conversationId, data: { reason: "Reportado desde el chat" } },
      {
        onSuccess: () =>
          toast({ title: "Usuario reportado", description: "Gracias, lo revisaremos." }),
        onError: () => toast({ title: "No se pudo reportar", variant: "destructive" }),
      }
    );
  };

  const handleBlock = () => {
    if (!otherUser) return;
    setMenuOpen(false);
    blockUser.mutate(
      { id: otherUser.id },
      {
        onSuccess: () => {
          toast({ title: "Usuario bloqueado" });
          qc.invalidateQueries({ queryKey: getListConversationsQueryKey() });
        },
        onError: () =>
          toast({ title: "No se pudo bloquear", variant: "destructive" }),
      }
    );
  };

  const handleUnblock = () => {
    if (!otherUser) return;
    setMenuOpen(false);
    unblockUser.mutate(
      { id: otherUser.id },
      {
        onSuccess: () => {
          toast({ title: "Usuario desbloqueado" });
          qc.invalidateQueries({ queryKey: getListConversationsQueryKey() });
        },
        onError: () =>
          toast({ title: "No se pudo desbloquear", variant: "destructive" }),
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const initials = (otherUser?.username || "?").slice(0, 2).toUpperCase();
  const lastMineRead = [...localMessages]
    .reverse()
    .find((m) => m.sender_id === myId && !m.deleted_at)?.read_at;

  return (
    <div
      className="flex flex-col"
      style={{
        height: "100dvh",
        background:
          "radial-gradient(ellipse 100% 50% at 50% 0%, hsl(270 30% 8%) 0%, hsl(238 25% 4%) 60%)",
      }}
    >
      <header
        className="flex-shrink-0 px-4 py-3 flex items-center gap-3 border-b border-border/30 relative"
        style={{ background: "rgba(8,7,18,0.92)", backdropFilter: "blur(20px)" }}
      >
        <button
          onClick={() => setLocation("/chats")}
          className="w-9 h-9 flex items-center justify-center rounded-xl border border-border/40 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          style={{ background: "rgba(255,255,255,0.04)" }}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => otherUser && setLocation(`/profile/${otherUser.id}`)}
          className="relative flex-shrink-0"
        >
          <Avatar className="w-9 h-9 rounded-xl border border-border/30">
            {otherUser?.avatar_url && (
              <AvatarImage src={otherUser.avatar_url} className="object-cover" />
            )}
            <AvatarFallback className="font-display text-sm bg-card text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          {otherUser?.is_online && (
            <span
              className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
              style={{ background: "hsl(142,71%,45%)", borderColor: "hsl(238,25%,6%)" }}
            />
          )}
        </button>
        <button
          onClick={() => otherUser && setLocation(`/profile/${otherUser.id}`)}
          className="flex-1 min-w-0 text-left"
        >
          <p className="font-display text-lg tracking-wide text-foreground truncate">
            {otherUser?.username ?? "..."}
          </p>
          <p className="font-sans text-xs text-muted-foreground leading-none">
            {otherUser?.is_online ? (
              <span className="text-green-400">En línea</span>
            ) : (
              "Desconectado"
            )}
          </p>
        </button>
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="w-9 h-9 flex items-center justify-center rounded-xl border border-border/40 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          style={{ background: "rgba(255,255,255,0.04)" }}
        >
          <MoreVertical className="w-4 h-4" />
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
            <div
              className="absolute right-4 top-14 z-40 w-44 rounded-xl border border-border/40 overflow-hidden"
              style={{ background: "rgba(18,15,32,0.98)", backdropFilter: "blur(20px)" }}
            >
              <button
                onClick={() => {
                  setMenuOpen(false);
                  if (otherUser) setLocation(`/profile/${otherUser.id}`);
                }}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-sans text-foreground hover:bg-white/5 transition-colors"
              >
                <UserRound className="w-4 h-4 text-muted-foreground" />
                Ver perfil
              </button>
              <button
                onClick={otherUser?.blocked_by_me ? handleUnblock : handleBlock}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-sans text-foreground hover:bg-white/5 transition-colors border-t border-border/20"
              >
                <Ban className="w-4 h-4 text-muted-foreground" />
                {otherUser?.blocked_by_me ? "Desbloquear" : "Bloquear"}
              </button>
              <button
                onClick={handleReport}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-sans text-red-400 hover:bg-white/5 transition-colors border-t border-border/20"
              >
                <Flag className="w-4 h-4" />
                Reportar
              </button>
            </div>
          </>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2" onClick={() => setActiveMsg(null)}>
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
            const isDeleted = !!msg.deleted_at;
            return (
              <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[78%] flex flex-col items-stretch">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isMine && !isDeleted && !isOptimistic) {
                        setActiveMsg(activeMsg === msg.id ? null : msg.id);
                      }
                    }}
                    className="text-left rounded-2xl overflow-hidden"
                    style={
                      isDeleted
                        ? { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }
                        : isMine
                          ? {
                              background:
                                "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
                              opacity: isOptimistic ? 0.7 : 1,
                            }
                          : {
                              background: "rgba(255,255,255,0.08)",
                              border: "1px solid rgba(255,255,255,0.1)",
                            }
                    }
                  >
                    {isDeleted ? (
                      <p className="px-4 py-2.5 font-sans text-sm italic text-muted-foreground">
                        Mensaje eliminado
                      </p>
                    ) : msg.image_url ? (
                      <div className="p-1">
                        <img
                          src={msg.image_url}
                          alt="Foto"
                          className="rounded-xl max-h-64 w-auto object-cover"
                          loading="lazy"
                        />
                      </div>
                    ) : (
                      <p className="px-4 py-2.5 font-sans text-sm text-white leading-snug break-words whitespace-pre-wrap">
                        {msg.content}
                      </p>
                    )}
                    {!isDeleted && (
                      <div
                        className={`flex items-center gap-1 px-3 pb-1.5 ${
                          isMine ? "justify-end" : "justify-start"
                        } ${msg.image_url ? "pt-0.5" : ""}`}
                      >
                        <span
                          className={`font-sans text-[10px] ${
                            isMine ? "text-white/60" : "text-white/40"
                          }`}
                        >
                          {timeLabel(msg.created_at)}
                        </span>
                        {isMine &&
                          !isOptimistic &&
                          (msg.read_at ? (
                            <CheckCheck className="w-3 h-3 text-white/80" />
                          ) : (
                            <Check className="w-3 h-3 text-white/50" />
                          ))}
                      </div>
                    )}
                  </button>

                  {isMine && activeMsg === msg.id && !isDeleted && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(msg.id);
                      }}
                      className="self-end mt-1 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-sans text-red-400 border border-red-500/30"
                      style={{ background: "rgba(239,68,68,0.08)" }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Eliminar
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
        {lastMineRead && (
          <p className="text-right font-sans text-[10px] text-muted-foreground pr-1">Visto</p>
        )}
        <div ref={bottomRef} />
      </div>

      {otherUser?.blocked_by_me ? (
        <div
          className="flex-shrink-0 px-4 py-4 border-t border-border/30 flex flex-col items-center gap-2 text-center"
          style={{ background: "rgba(8,7,18,0.92)", backdropFilter: "blur(20px)" }}
        >
          <p className="font-sans text-sm text-muted-foreground">
            Has bloqueado a este usuario. No puedes enviar mensajes.
          </p>
          <button
            onClick={handleUnblock}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-sans text-foreground border border-border/40 hover:bg-white/5 transition-colors"
            style={{ background: "rgba(255,255,255,0.04)" }}
          >
            <Ban className="w-4 h-4" />
            Desbloquear
          </button>
        </div>
      ) : (
      <div
        className="flex-shrink-0 px-4 py-3 border-t border-border/30 flex items-end gap-2"
        style={{ background: "rgba(8,7,18,0.92)", backdropFilter: "blur(20px)" }}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageSelected}
        />
        <button
          onClick={handlePickImage}
          disabled={uploadImage.isPending || sendMessage.isPending}
          className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl border border-border/40 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          style={{ background: "rgba(255,255,255,0.04)" }}
        >
          {uploadImage.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ImageIcon className="w-4 h-4" />
          )}
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
      )}
    </div>
  );
}
