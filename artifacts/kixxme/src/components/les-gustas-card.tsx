import {
  useGetReceivedLikes,
  getGetReceivedLikesQueryKey,
} from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Heart, Lock, Star } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

/**
 * Compact card shown in the Profile page. Shows count to everyone; Plus/Gold
 * also see avatar previews. Tapping opens the full /les-gustas page.
 */
export function LesGustasCard() {
  const { session } = useAuth();
  const [, setLocation] = useLocation();

  const { data, isLoading } = useGetReceivedLikes({
    query: { enabled: !!session, queryKey: getGetReceivedLikesQueryKey() },
  });

  if (isLoading || !data) return null;

  const { count, can_see, profiles } = data;

  return (
    <div
      className="mx-4 mb-4 border border-pink-500/30 rounded-2xl p-5 cursor-pointer hover:border-pink-500/50 transition-colors"
      style={{ background: "rgba(236,72,153,0.05)" }}
      onClick={() => setLocation("/les-gustas")}
      data-testid="card-les-gustas"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Heart className="w-5 h-5 text-pink-400 fill-pink-400" />
          <h3 className="font-display text-lg tracking-widest text-foreground">
            Les gustas
          </h3>
        </div>
        <div className="text-right">
          <div className="font-display text-2xl leading-none text-pink-300">
            {count}
          </div>
          <div className="font-sans text-[10px] uppercase tracking-wider text-muted-foreground">
            {count === 1 ? "like" : "likes"}
          </div>
        </div>
      </div>

      {count === 0 && (
        <p className="font-sans text-sm text-muted-foreground mt-2">
          Aún nadie te ha dado like. Cuando ocurra aparecerá aquí.
        </p>
      )}

      {count > 0 && !can_see && (
        <div className="flex items-center gap-2 mt-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(139,92,246,0.15)" }}
          >
            <Lock className="w-4 h-4 text-violet-400" />
          </div>
          <p className="font-sans text-sm text-muted-foreground">
            Hazte Plus o Gold para ver quién te dio like.
          </p>
        </div>
      )}

      {count > 0 && can_see && profiles.length > 0 && (
        <div className="flex items-center gap-2 mt-3">
          <div className="flex -space-x-2">
            {profiles.slice(0, 5).map((p) => (
              <Avatar
                key={p.id}
                className="w-9 h-9 border-2 border-background"
              >
                <AvatarImage src={p.avatar_url ?? undefined} className="object-cover" />
                <AvatarFallback className="text-xs font-display" style={{ background: "rgba(236,72,153,0.15)" }}>
                  {initials(p.username)}
                </AvatarFallback>
              </Avatar>
            ))}
            {count > 5 && (
              <div
                className="w-9 h-9 rounded-full border-2 border-background flex items-center justify-center font-sans text-xs text-muted-foreground"
                style={{ background: "rgba(255,255,255,0.06)" }}
              >
                +{count - 5}
              </div>
            )}
          </div>
          {profiles.some((p) => p.is_super) && (
            <span className="flex items-center gap-1 font-sans text-xs text-sky-300">
              <Star className="w-3.5 h-3.5 fill-sky-400 text-sky-400" />
              SuperLike
            </span>
          )}
        </div>
      )}

      <p className="font-sans text-xs text-muted-foreground/60 mt-3 text-right">
        Ver todos →
      </p>
    </div>
  );
}
