import React from "react";
import { Link, useLocation } from "wouter";
import { MessageCircle, Edit2, Lock, Loader2, BadgeCheck, Crown, Pin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  useListConversations,
  getListConversationsQueryKey,
  useGetOfficialSupportTicket,
  getGetOfficialSupportTicketQueryKey,
  useGetMyProfile,
  Conversation,
  SupportTicket,
} from "@workspace/api-client-react";
import SupportInbox from "@/components/support-inbox";

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
  const [, setLocation] = useLocation();

  // The system support account turns "Mensajes" into the support console.
  const { data: me } = useGetMyProfile({});

  const { data: conversations = [], isLoading } = useListConversations({
    query: { queryKey: getListConversationsQueryKey(), refetchInterval: 20_000 },
  });

  // The official "👑 Soporte KixxMe" thread (Gold only; server returns null
  // otherwise). Pinned above all conversations and always visible while Gold.
  const { data: officialData } = useGetOfficialSupportTicket({
    query: {
      queryKey: getGetOfficialSupportTicketQueryKey(),
      refetchInterval: 30_000,
    },
  });
  const official = officialData?.ticket ?? null;

  // Support console for the system account (all hooks above run unconditionally).
  if (me?.is_system) return <SupportInbox />;

  const hasContent = conversations.length > 0 || !!official;

  return (
    <div className="flex flex-col h-full relative overflow-hidden" style={{ background: "hsl(238,32%,4%)" }}>
      {/* ── Ambient background orbs ── */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div
          className="absolute -top-28 -left-16 w-[28rem] h-[28rem] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(168,85,247,0.38) 0%, rgba(168,85,247,0.10) 52%, transparent 72%)", filter: "blur(56px)" }}
        />
        <div
          className="absolute bottom-1/3 -right-20 w-72 h-72 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(236,72,153,0.30) 0%, transparent 68%)", filter: "blur(48px)" }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[26rem] h-[26rem] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(139,92,246,0.10) 0%, transparent 65%)", filter: "blur(60px)" }}
        />
      </div>

      <header
        className="sticky top-0 z-20 px-4 py-3 flex items-center justify-between relative"
        style={{ background: "rgba(8,7,18,0.95)", backdropFilter: "blur(28px)" }}
      >
        {/* Neon gradient line */}
        <div
          className="absolute bottom-0 left-0 right-0 h-[1.5px]"
          style={{
            background: "linear-gradient(90deg, transparent 0%, rgba(139,92,246,0.80) 25%, rgba(236,72,153,0.70) 55%, rgba(139,92,246,0.70) 80%, transparent 100%)",
            boxShadow: "0 0 8px rgba(168,85,247,0.35)",
          }}
        />
        <h1
          className="font-display text-2xl tracking-wide"
          style={{
            background: "linear-gradient(110deg, hsl(273,90%,85%) 0%, hsl(290,85%,80%) 40%, hsl(330,90%,82%) 75%, #fff 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            filter: "drop-shadow(0 0 18px rgba(168,85,247,0.45))",
          }}
        >
          Mensajes
        </h1>
        <Link href="/discover">
          <button
            className="w-9 h-9 flex items-center justify-center rounded-xl border text-muted-foreground hover:text-foreground transition-colors"
            style={{ background: "rgba(168,85,247,0.07)", border: "1px solid rgba(168,85,247,0.22)" }}
          >
            <Edit2 className="w-4 h-4" />
          </button>
        </Link>
      </header>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : !hasContent ? (
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
          {official && (
            <OfficialCard
              ticket={official}
              onClick={() => setLocation(`/support?ticket=${official.id}`)}
            />
          )}
          {conversations.length === 0 ? (
            <p className="font-sans text-sm text-muted-foreground text-center px-8 py-10 leading-relaxed">
              Explora perfiles y conecta con alguien para empezar a chatear.
            </p>
          ) : (
            conversations.map((conv) => (
              <ConvCard key={conv.id} conv={conv} onClick={() => setLocation(`/chats/${conv.id}`)} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function OfficialCard({ ticket, onClick }: { ticket: SupportTicket; onClick: () => void }) {
  const preview =
    ticket.lastMessagePreview?.trim() || "Bienvenido a KixxMe Gold";
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-yellow-500/20 hover:bg-yellow-500/[0.04] transition-colors text-left"
      style={{ background: "rgba(234,179,8,0.06)" }}
    >
      <div className="relative flex-shrink-0">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center border border-yellow-500/40"
          style={{ background: "linear-gradient(135deg, hsl(38,95%,52%), hsl(25,100%,50%))" }}
        >
          <Crown className="w-6 h-6 text-white" style={{ filter: "drop-shadow(0 0 6px rgba(234,179,8,0.6))" }} />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="font-display text-base text-foreground tracking-wide truncate flex items-center gap-1.5">
            {ticket.subject}
            <Pin className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" style={{ transform: "rotate(45deg)" }} />
          </span>
          {ticket.lastMessageAt && (
            <span
              className={`font-sans text-xs ml-2 flex-shrink-0 ${
                ticket.unread ? "text-yellow-400 font-semibold" : "text-muted-foreground"
              }`}
            >
              {timeAgo(ticket.lastMessageAt)}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p
            className={`font-sans text-sm truncate ${
              ticket.unread ? "text-foreground font-medium" : "text-muted-foreground"
            }`}
          >
            {preview}
          </p>
          {ticket.unread && (
            <span
              className="flex-shrink-0 w-2.5 h-2.5 rounded-full"
              style={{ background: "linear-gradient(135deg, hsl(38,95%,52%), hsl(25,100%,50%))" }}
            />
          )}
        </div>
      </div>
    </button>
  );
}

function planBorderStyle(plan?: string | null): React.CSSProperties {
  if (plan === "gold")
    return { border: "2px solid rgba(251,191,36,0.70)", boxShadow: "0 0 10px rgba(251,191,36,0.30)" };
  if (plan === "plus")
    return { border: "2px solid rgba(168,85,247,0.55)", boxShadow: "0 0 8px rgba(168,85,247,0.22)" };
  return { border: "1.5px solid rgba(255,255,255,0.10)" };
}

function ConvCard({ conv, onClick }: { conv: Conversation; onClick: () => void }) {
  const u = conv.other_user;
  const initials = (u.username || "?").slice(0, 2).toUpperCase();
  const unread = conv.unread_count ?? 0;
  const hasUnread = unread > 0;
  const preview = conv.last_message?.trim() || (u.city ? u.city : "Nuevo usuario");

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 border-b transition-colors text-left relative z-10"
      style={{
        borderBottomColor: "rgba(168,85,247,0.10)",
        background: hasUnread ? "rgba(168,85,247,0.04)" : "transparent",
      }}
    >
      <div className="relative flex-shrink-0">
        <Avatar className="w-12 h-12 rounded-xl overflow-hidden" style={planBorderStyle(u.plan)}>
          {u.avatar_url && <AvatarImage src={u.avatar_url} className="object-cover" />}
          <AvatarFallback className="font-display text-lg bg-card text-primary">{initials}</AvatarFallback>
        </Avatar>
        {u.is_online && (
          <span
            className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2"
            style={{ background: "hsl(142,71%,45%)", borderColor: "hsl(238,25%,6%)", boxShadow: "0 0 6px rgba(34,197,94,0.55)" }}
          />
        )}
        {u.plan === "gold" && (
          <span
            className="absolute -top-1.5 -right-1.5 text-sm leading-none"
            style={{ filter: "drop-shadow(0 0 4px rgba(251,191,36,0.8))" }}
          >👑</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="font-display text-base text-foreground tracking-wide truncate flex items-center gap-1">
            {u.username}
            {u.is_verified && (
              <BadgeCheck className="w-4 h-4 text-sky-400 flex-shrink-0" style={{ filter: "drop-shadow(0 0 4px rgba(56,189,248,0.55))" }} />
            )}
          </span>
          {conv.last_message_at && (
            <span
              className={`font-sans text-xs ml-2 flex-shrink-0 ${
                hasUnread ? "font-semibold" : "text-muted-foreground"
              }`}
              style={hasUnread ? { color: "hsl(273,80%,72%)" } : undefined}
            >
              {timeAgo(conv.last_message_at)}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p
            className={`font-sans text-sm truncate ${
              hasUnread ? "text-foreground font-medium" : "text-muted-foreground"
            }`}
          >
            {preview}
          </p>
          {hasUnread && (
            <span
              className="flex-shrink-0 min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full text-[11px] font-bold text-white"
              style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))", boxShadow: "0 0 8px rgba(168,85,247,0.50)" }}
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
