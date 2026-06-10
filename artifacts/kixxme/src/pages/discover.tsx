import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { MapPin, Loader2, Share2, Users, Heart, BadgeCheck } from "lucide-react";
import {
  useListProfiles,
  getListProfilesQueryKey,
  useCreateOrGetConversation,
  useLikeProfile,
  useUnlikeProfile,
  PublicProfile,
  type ListProfilesSort,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useNotifications } from "@/lib/notifications";
import { KixxMeLogo } from "@/components/brand/kixxme-logo";

type ViewType = "todos" | "cerca" | "online" | "con-foto";

const VIEW_LABEL: Record<ViewType, string> = {
  todos: "Todos",
  cerca: "Cerca",
  online: "Online",
  "con-foto": "Con foto",
};

const VIEW_SORT: Record<ViewType, ListProfilesSort> = {
  todos: "recent",
  cerca: "distance",
  online: "online",
  "con-foto": "recent",
};

const GRAD_PALETTE = [
  "from-violet-700 to-purple-900",
  "from-pink-600 to-rose-900",
  "from-orange-600 to-red-900",
  "from-cyan-600 to-blue-900",
  "from-emerald-600 to-teal-900",
  "from-fuchsia-600 to-purple-900",
  "from-blue-600 to-indigo-900",
  "from-rose-600 to-pink-900",
];

export function gradFor(id: string) {
  let h = 0;
  for (const c of id) {
    h = (h << 5) - h + c.charCodeAt(0);
    h |= 0;
  }
  return GRAD_PALETTE[Math.abs(h) % GRAD_PALETTE.length];
}

function initialsFor(username: string | null) {
  return (username || "?").slice(0, 2).toUpperCase();
}

export function formatDistance(km: number | null | undefined): string | null {
  if (km == null) return null;
  if (km < 1) return "< 1 km";
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

export default function Discover() {
  const [view, setView] = useState<ViewType>("todos");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { newLikes, newMatches } = useNotifications();
  const likesBadge = newLikes + newMatches;

  const {
    data: profiles = [],
    isLoading,
    isError,
  } = useListProfiles({ sort: VIEW_SORT[view] });

  const createConv = useCreateOrGetConversation();
  const likeMut = useLikeProfile();
  const unlikeMut = useUnlikeProfile();

  const filtered = profiles.filter((u) => {
    if (view === "con-foto") return !!u.avatar_url;
    if (view === "online") return !!u.is_online;
    return true;
  });

  const isEmpty = !isLoading && (isError || filtered.length === 0);

  const handleMessage = (userId: string) => {
    createConv.mutate(
      { data: { other_user_id: userId } },
      { onSuccess: (conv) => setLocation(`/chats/${conv.id}`) }
    );
  };

  const handleToggleLike = (user: PublicProfile) => {
    const onSettled = () =>
      qc.invalidateQueries({ queryKey: getListProfilesQueryKey() });
    if (user.liked_by_me) {
      unlikeMut.mutate({ id: user.id }, { onSettled });
    } else {
      likeMut.mutate(
        { id: user.id },
        {
          onSuccess: () => toast({ title: `Te gusta ${user.username ?? "este perfil"} ❤️` }),
          onSettled,
        }
      );
    }
  };

  const handleShare = async () => {
    const shareData = {
      title: "KixxMe",
      text: "¡Únete a KixxMe y conecta con chicos cerca de ti! ✨",
      url: window.location.origin,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        /* cancelled */
      }
    } else {
      await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
      toast({ title: "¡Enlace copiado!" });
    }
  };

  const onlineCount = profiles.filter((u) => u.is_online).length;

  return (
    <div className="min-h-full">
      <header
        className="sticky top-0 z-20 px-4 py-3 flex items-center justify-between border-b border-border/30"
        style={{ background: "rgba(8,7,18,0.92)", backdropFilter: "blur(20px)" }}
      >
        <div className="flex items-center gap-2">
          <KixxMeLogo size={22} withWordmark />
          {!isLoading && !isError && onlineCount > 0 && (
            <span
              className="flex items-center gap-1.5 text-[10px] font-sans px-2 py-0.5 rounded-full border border-green-500/30 text-green-400"
              style={{ background: "rgba(34,197,94,0.08)" }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              {onlineCount} en línea
            </span>
          )}
        </div>
        <Link href="/favorites">
          <button
            className="relative w-9 h-9 rounded-full flex items-center justify-center border border-border/40 transition-colors hover:border-primary/50"
            style={{ background: "rgba(255,255,255,0.04)" }}
            aria-label="Favoritos"
            data-testid="link-favorites"
          >
            <Heart className="w-4 h-4 text-primary" />
            {likesBadge > 0 && (
              <span
                className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full text-[10px] font-bold text-white border border-background"
                style={{
                  background:
                    "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
                }}
                data-testid="badge-likes"
              >
                {likesBadge > 99 ? "99+" : likesBadge}
              </span>
            )}
          </button>
        </Link>
      </header>

      <div className="px-4 pt-4 pb-2">
        <h2 className="font-display text-3xl tracking-wide leading-tight">
          Conecta con chicos cerca de ti
        </h2>
        {!isLoading && !isError && filtered.length > 0 && (
          <p className="text-muted-foreground font-sans text-sm mt-1">
            {filtered.length} perfil{filtered.length !== 1 ? "es" : ""} disponible
            {filtered.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      <div className="px-4 py-3 flex gap-2 overflow-x-auto no-scrollbar">
        {(["todos", "cerca", "online", "con-foto"] as ViewType[]).map((f) => (
          <button
            key={f}
            onClick={() => setView(f)}
            className="flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-sans font-medium border transition-all duration-200"
            style={
              view === f
                ? {
                    background:
                      "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
                    borderColor: "transparent",
                    color: "white",
                  }
                : {
                    background: "rgba(255,255,255,0.04)",
                    borderColor: "rgba(255,255,255,0.1)",
                    color: "hsl(240,10%,55%)",
                  }
            }
          >
            {VIEW_LABEL[f]}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="font-sans text-sm text-muted-foreground">Cargando perfiles...</p>
        </div>
      ) : isEmpty ? (
        <EmptyState view={view} onShare={handleShare} />
      ) : (
        <div className="px-4 pb-6 grid grid-cols-2 gap-3">
          {filtered.map((user) => (
            <UserCard
              key={user.id}
              user={user}
              grad={gradFor(user.id)}
              onMessage={() => handleMessage(user.id)}
              onToggleLike={() => handleToggleLike(user)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ view, onShare }: { view: ViewType; onShare: () => void }) {
  const title =
    view === "online"
      ? "Nadie en línea ahora mismo."
      : view === "con-foto"
        ? "Nadie con foto por aquí todavía."
        : "Todavía no hay usuarios cerca.";

  return (
    <div className="flex flex-col items-center justify-center py-16 gap-6 text-center px-8">
      <div
        className="w-24 h-24 rounded-2xl flex items-center justify-center border border-primary/20"
        style={{ background: "rgba(168,85,247,0.08)" }}
      >
        <Users
          className="w-12 h-12 text-primary"
          style={{ filter: "drop-shadow(0 0 12px rgba(168,85,247,0.5))" }}
        />
      </div>

      <div className="space-y-2">
        <h3 className="font-display text-2xl tracking-wide text-foreground">{title}</h3>
        <p className="font-sans text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
          Invita a tus amigos para empezar.
        </p>
      </div>

      <button
        onClick={onShare}
        className="flex items-center gap-2 h-12 px-8 rounded-xl font-display text-lg tracking-widest text-white hover:opacity-90 transition-opacity border-0"
        style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))" }}
      >
        <Share2 className="w-4 h-4" />
        Compartir KixxMe
      </button>
    </div>
  );
}

export function UserCard({
  user,
  grad,
  onMessage,
  onToggleLike,
}: {
  user: PublicProfile;
  grad: string;
  onMessage: () => void;
  onToggleLike: () => void;
}) {
  const distance = formatDistance(user.distance_km);

  return (
    <div
      className="relative rounded-2xl overflow-hidden border border-border/30 group"
      style={{ background: "rgba(13,11,26,0.8)", aspectRatio: "3/4" }}
    >
      {user.avatar_url ? (
        <img
          src={user.avatar_url}
          alt={user.username ?? ""}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <>
          <div className={`absolute inset-0 bg-gradient-to-br ${grad} opacity-60`} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-5xl text-white/90 drop-shadow-lg">
              {initialsFor(user.username)}
            </span>
          </div>
        </>
      )}

      <div className="absolute top-2 left-2 flex items-center gap-1.5">
        {user.is_online && (
          <span
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-sans font-medium text-white"
            style={{ background: "rgba(34,197,94,0.85)" }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-white" />
            En línea
          </span>
        )}
      </div>

      {user.is_verified && (
        <div className="absolute top-2 right-2">
          <BadgeCheck
            className="w-5 h-5 text-sky-400"
            style={{ filter: "drop-shadow(0 0 4px rgba(56,189,248,0.6))" }}
          />
        </div>
      )}

      <button
        onClick={onToggleLike}
        className="absolute bottom-16 right-2 w-9 h-9 rounded-full flex items-center justify-center border border-white/20 backdrop-blur-sm transition-transform active:scale-90"
        style={{ background: "rgba(0,0,0,0.4)" }}
        aria-label={user.liked_by_me ? "Quitar me gusta" : "Me gusta"}
      >
        <Heart
          className="w-5 h-5 transition-colors"
          style={{
            color: user.liked_by_me ? "hsl(330,85%,60%)" : "white",
            fill: user.liked_by_me ? "hsl(330,85%,60%)" : "transparent",
          }}
        />
      </button>

      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2"
        style={{ background: "rgba(0,0,0,0.5)" }}
      >
        <Link href={`/profile/${user.id}`}>
          <button
            className="px-3 py-1.5 rounded-lg text-xs font-sans font-medium text-white border border-white/30"
            style={{ background: "rgba(255,255,255,0.12)" }}
          >
            Ver
          </button>
        </Link>
        <button
          onClick={onMessage}
          className="px-3 py-1.5 rounded-lg text-xs font-sans font-medium text-white border border-primary/50"
          style={{ background: "rgba(168,85,247,0.3)" }}
        >
          Mensaje
        </button>
      </div>

      <div
        className="absolute bottom-0 left-0 right-0 px-3 py-3 pointer-events-none"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)" }}
      >
        <p className="font-display text-base text-white leading-tight tracking-wide truncate">
          {user.username}
        </p>
        <div className="flex items-center justify-between mt-0.5">
          <span className="font-sans text-xs text-white/70 truncate">
            {[user.age, user.city].filter(Boolean).join(" · ") || "Nuevo usuario"}
          </span>
          {distance && (
            <span className="flex items-center gap-0.5 font-sans text-[10px] text-white/60 flex-shrink-0 ml-1">
              <MapPin className="w-2.5 h-2.5" />
              {distance}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
