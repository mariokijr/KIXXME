import React from "react";
import { Link, useLocation } from "wouter";
import { MessageCircle, Search, Edit2, Lock, Loader2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useListConversations, getListConversationsQueryKey, Conversation } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export default function Chats() {
  const { session } = useAuth();
  const [, setLocation] = useLocation();

  const { data: conversations = [], isLoading } = useListConversations({
    query: { queryKey: getListConversationsQueryKey(), refetchInterval: 10000 },
  });

  return (
    <div className="flex flex-col h-full">
      <header
        className="sticky top-0 z-20 px-4 py-3 flex items-center justify-between border-b border-border/30"
        style={{ background: "rgba(8,7,18,0.9)", backdropFilter: "blur(20px)" }}
      >
        <h1 className="font-display text-2xl tracking-wide">Mensajes</h1>
        <Link href="/discover">
          <button
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-border/40 text-muted-foreground hover:text-foreground transition-colors"
            style={{ background: "rgba(255,255,255,0.04)" }}
          >
            <Edit2 className="w-4 h-4" />
          </button>
        </Link>
      </header>

      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border/40" style={{ background: "rgba(255,255,255,0.04)" }}>
          <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span className="font-sans text-sm text-muted-foreground">Buscar conversaciones...</span>
        </div>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : conversations.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-6 py-16">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center border border-primary/20" style={{ background: "rgba(168,85,247,0.08)" }}>
            <MessageCircle className="w-10 h-10 text-primary" style={{ filter: "drop-shadow(0 0 10px rgba(168,85,247,0.5))" }} />
          </div>
          <div className="space-y-2">
            <h2 className="font-display text-2xl tracking-wide text-foreground">Nadie te ha escrito... todavía</h2>
            <p className="font-sans text-sm text-muted-foreground leading-relaxed">Explora perfiles, conecta con alguien y déjate llevar.</p>
          </div>
          <Link href="/discover">
            <Button className="h-12 px-8 rounded-xl font-display text-lg tracking-widest border-0 text-white hover:opacity-90 transition-opacity"
              style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))" }}>
              Ir a Descubrir
            </Button>
          </Link>
          <div className="w-full p-4 rounded-xl border border-yellow-500/20 flex items-start gap-3 text-left" style={{ background: "rgba(234,179,8,0.06)" }}>
            <Lock className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-display text-sm text-yellow-400 tracking-wide">Chats ilimitados con Premium</p>
              <p className="font-sans text-xs text-muted-foreground mt-0.5">Con KixxMe Plus o Gold puedes enviar mensajes sin límites.</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {conversations.map((conv) => (
            <ConvCard key={conv.id} conv={conv} onClick={() => setLocation(`/chats/${conv.id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ConvCard({ conv, onClick }: { conv: Conversation; onClick: () => void }) {
  const u = conv.other_user;
  const initials = (u.username || "?").slice(0, 2).toUpperCase();

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-border/20 hover:bg-white/[0.02] transition-colors text-left"
    >
      <Avatar className="w-12 h-12 rounded-xl flex-shrink-0 border border-border/30">
        {u.avatar_url && <AvatarImage src={u.avatar_url} className="object-cover" />}
        <AvatarFallback className="font-display text-lg bg-card text-primary">{initials}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="font-display text-base text-foreground tracking-wide truncate">{u.username}</span>
          {conv.last_message_at && (
            <span className="font-sans text-xs text-muted-foreground ml-2 flex-shrink-0">
              {timeAgo(conv.last_message_at)}
            </span>
          )}
        </div>
        <p className="font-sans text-sm text-muted-foreground truncate mt-0.5">
          {u.city ? `${u.city}` : "Nuevo usuario"}{u.age ? ` · ${u.age} años` : ""}
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground/50 flex-shrink-0" />
    </button>
  );
}
