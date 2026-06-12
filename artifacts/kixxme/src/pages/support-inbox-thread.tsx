import { useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import { ChevronLeft, Loader2, ShieldCheck, Send, Crown } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMyProfile,
  useGetMyModeration,
  useGetSupportInboxThread,
  getGetSupportInboxThreadQueryKey,
  useStartSupportInboxThread,
} from "@workspace/api-client-react";
import { SupportComposer, SupportMessageBubble } from "@/components/support-chat";
import { ImageLightbox } from "@/components/image-lightbox";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const GRADIENT = "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

/**
 * Operator-side support conversation. Resolves a target user's canonical thread
 * (official Gold thread or most-recent ticket); when none exists yet the operator
 * can start one (Gold-aware on the server). Reuses the shared support bubble +
 * composer, with operator (admin) messages rendered as "mine".
 */
export default function SupportInboxThread() {
  const { userId } = useParams<{ userId: string }>();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: me } = useGetMyProfile({});
  const { data: moderation } = useGetMyModeration({});
  const queryKey = getGetSupportInboxThreadQueryKey(userId);

  const { data, isLoading } = useGetSupportInboxThread(userId, {
    query: { queryKey, refetchInterval: 5000 },
  });

  const ticket = data?.ticket ?? null;
  const messages = data?.messages ?? [];

  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [starterText, setStarterText] = useState("");
  const startThread = useStartSupportInboxThread();

  const refresh = () => {
    qc.invalidateQueries({ queryKey });
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  // UX-only guard: the real boundary is server-side requireOperator (system
  // account OR admin). Wait for moderation to resolve before blocking an admin.
  if (me && !me.is_system && moderation && !moderation.isAdmin) {
    return (
      <div className="flex flex-col h-full items-center justify-center px-8 text-center gap-3">
        <ShieldCheck className="w-10 h-10 text-muted-foreground" />
        <p className="font-sans text-sm text-muted-foreground">
          Esta sección es solo para el equipo de soporte.
        </p>
        <button
          type="button"
          onClick={() => setLocation("/chats")}
          className="font-display text-sm text-primary tracking-wide"
        >
          Volver
        </button>
      </div>
    );
  }

  const targetName = ticket?.username || "Usuario";

  const handleStart = () => {
    const message = starterText.trim();
    if (message.length < 1) return;
    startThread.mutate(
      { userId, data: { message } },
      {
        onSuccess: () => {
          setStarterText("");
          refresh();
        },
        onError: () =>
          toast({ title: "No se pudo iniciar la conversación", variant: "destructive" }),
      },
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div
        className="flex items-center gap-3 px-4 py-3 border-b border-border/40 flex-shrink-0"
        style={{ background: "rgba(13,11,26,0.9)" }}
      >
        <button
          type="button"
          onClick={() => setLocation("/chats")}
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/5"
          data-testid="button-support-inbox-back"
        >
          <ChevronLeft className="w-5 h-5 text-foreground" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-display text-base tracking-wide text-foreground truncate flex items-center gap-1.5">
            {targetName}
            {ticket?.username == null && (
              <span className="font-sans text-xs text-muted-foreground">(soporte)</span>
            )}
          </p>
          {ticket && (
            <p className="font-sans text-xs text-muted-foreground truncate">
              {ticket.subject}
            </p>
          )}
        </div>
        <ShieldCheck className="w-5 h-5 text-amber-400 flex-shrink-0" />
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
        data-testid="support-inbox-messages"
      >
        {isLoading ? (
          <p className="font-sans text-sm text-muted-foreground text-center py-8">
            Cargando conversación…
          </p>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center gap-2 py-12">
            <Crown className="w-8 h-8 text-amber-400" />
            <p className="font-sans text-sm text-muted-foreground">
              {ticket
                ? "Aún no hay mensajes en esta conversación."
                : "Este usuario todavía no tiene una conversación de soporte. Escríbele para empezar."}
            </p>
          </div>
        ) : (
          messages.map((m) => (
            <SupportMessageBubble
              key={m.id}
              message={m}
              mine={m.senderRole === "admin"}
              topLabel={targetName}
              footLabel={timeAgo(m.createdAt)}
              onImageClick={setLightboxSrc}
            />
          ))
        )}
      </div>

      <div
        className="px-4 py-3 border-t border-border/40 flex-shrink-0"
        style={{ background: "rgba(13,11,26,0.9)" }}
      >
        {ticket ? (
          <SupportComposer
            ticketId={ticket.id}
            onSent={refresh}
            placeholder="Responder al usuario…"
          />
        ) : (
          <div className="flex items-end gap-2">
            <Textarea
              value={starterText}
              onChange={(e) => setStarterText(e.target.value)}
              maxLength={5000}
              rows={1}
              placeholder="Escribe un mensaje para empezar…"
              className="resize-none min-h-[44px] max-h-32"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleStart();
                }
              }}
              data-testid="input-support-inbox-start"
            />
            <button
              type="button"
              onClick={handleStart}
              disabled={startThread.isPending || starterText.trim().length < 1}
              className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-xl text-white disabled:opacity-50"
              style={{ background: GRADIENT }}
              data-testid="button-support-inbox-start"
            >
              {startThread.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
        )}
      </div>

      <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
    </div>
  );
}
