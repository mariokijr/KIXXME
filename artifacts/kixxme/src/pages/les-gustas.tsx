import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import {
  useGetReceivedLikes,
  getGetReceivedLikesQueryKey,
} from "@workspace/api-client-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ArrowLeft, Heart, Star, Lock, Crown, BadgeCheck } from "lucide-react";

function timeAgo(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days} d`;
  return new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

export default function LesGustas() {
  const [, setLocation] = useLocation();
  const { session } = useAuth();

  const { data, isLoading } = useGetReceivedLikes({
    query: { enabled: !!session, queryKey: getGetReceivedLikesQueryKey() },
  });

  const canSee = data?.can_see ?? false;
  const count = data?.count ?? 0;
  const profiles = data?.profiles ?? [];

  return (
    <div className="min-h-screen pb-24" style={{ background: "radial-gradient(ellipse 100% 50% at 50% 0%, hsl(270 30% 8%) 0%, hsl(238 25% 4%) 60%)" }}>
      {/* Header */}
      <div
        className="sticky top-0 z-20 flex items-center gap-3 px-4 py-4 border-b border-border/30"
        style={{ background: "rgba(8,7,18,0.92)", backdropFilter: "blur(20px)" }}
      >
        <button
          type="button"
          onClick={() => setLocation("/profile")}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/5 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-muted-foreground" />
        </button>
        <div className="flex-1">
          <h1 className="font-display text-xl tracking-widest text-foreground">
            Les gustas
          </h1>
          {count > 0 && (
            <p className="font-sans text-xs text-muted-foreground">
              {count} {count === 1 ? "persona te" : "personas te"} ha dado like
            </p>
          )}
        </div>
        <Heart className="w-5 h-5 text-pink-400 fill-pink-400" />
      </div>

      <div className="max-w-xl mx-auto px-4 pt-4">
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          </div>
        )}

        {!isLoading && count === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{ background: "rgba(236,72,153,0.1)", border: "1.5px solid rgba(236,72,153,0.2)" }}
            >
              <Heart className="w-10 h-10 text-pink-400" />
            </div>
            <p className="font-display text-2xl tracking-widest text-foreground">Aún nadie</p>
            <p className="font-sans text-sm text-muted-foreground max-w-xs">
              Cuando alguien te dé like aparecerá aquí. Completa tu perfil y añade fotos para conseguir más.
            </p>
          </div>
        )}

        {!isLoading && !canSee && count > 0 && (
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            {/* Blurred preview grid */}
            {profiles.length === 0 && (
              <div className="grid grid-cols-3 gap-3 w-full mb-4">
                {Array.from({ length: Math.min(count, 9) }).map((_, i) => (
                  <div
                    key={i}
                    className="aspect-square rounded-2xl"
                    style={{ background: "rgba(255,255,255,0.06)", filter: "blur(2px)" }}
                  />
                ))}
              </div>
            )}
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ background: "rgba(139,92,246,0.15)", border: "1.5px solid rgba(139,92,246,0.3)" }}
            >
              <Lock className="w-8 h-8 text-violet-400" />
            </div>
            <p className="font-display text-xl tracking-widest text-foreground">
              {count} {count === 1 ? "like" : "likes"} pendiente{count === 1 ? "" : "s"}
            </p>
            <p className="font-sans text-sm text-muted-foreground max-w-xs">
              Hazte Plus o Gold para ver quién te dio like y dar like de vuelta.
            </p>
            <button
              type="button"
              onClick={() => setLocation("/premium")}
              className="h-12 px-8 rounded-xl font-display text-base tracking-widest text-white"
              style={{ background: "linear-gradient(135deg, hsl(263,85%,55%), hsl(330,85%,52%))" }}
            >
              Ver planes
            </button>
          </div>
        )}

        {!isLoading && canSee && profiles.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {profiles.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setLocation(`/profile/${p.id}`)}
                className="relative rounded-2xl overflow-hidden text-left group hover:scale-[1.01] transition-transform"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                data-testid={`received-like-card-${p.id}`}
              >
                <Avatar className="w-full h-44 rounded-none">
                  <AvatarImage
                    src={p.avatar_url ?? undefined}
                    className="w-full h-full object-cover"
                  />
                  <AvatarFallback className="w-full h-44 rounded-none text-3xl font-display" style={{ background: "rgba(139,92,246,0.1)" }}>
                    {initials(p.username)}
                  </AvatarFallback>
                </Avatar>

                {/* Gradient overlay */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ background: "linear-gradient(to top, rgba(8,7,18,0.85) 0%, transparent 55%)" }}
                />

                {/* SuperLike badge */}
                {p.is_super && (
                  <span
                    className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full font-sans text-[10px] font-bold text-sky-200"
                    style={{ background: "rgba(14,165,233,0.3)", border: "1px solid rgba(14,165,233,0.4)" }}
                  >
                    <Star className="w-3 h-3 fill-sky-300 text-sky-300" />
                    SuperLike
                  </span>
                )}

                {/* Info */}
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <div className="flex items-center gap-1.5">
                    {p.is_verified && (
                      <BadgeCheck className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                    )}
                    {p.plan === "gold" && (
                      <Crown className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                    )}
                    <span className="font-display text-sm tracking-wide text-white truncate">
                      {p.username}
                      {p.age ? `, ${p.age}` : ""}
                    </span>
                  </div>
                  {p.city && (
                    <p className="font-sans text-[10px] text-white/60 mt-0.5 truncate">{p.city}</p>
                  )}
                  <p className="font-sans text-[10px] text-white/40 mt-0.5">{timeAgo(p.liked_at)}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
