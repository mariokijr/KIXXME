import React, { useEffect } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import {
  useListMyMatches,
  getListMyMatchesQueryKey,
  useUnlikeProfile,
  PublicProfile,
} from "@workspace/api-client-react";
import { UserCard, gradFor } from "./discover";
import { useNotifications } from "@/lib/notifications";
import { useLikeActions } from "@/lib/like-actions";
import { useStartConversation } from "@/lib/use-start-conversation";

/**
 * "Empareja" — the mutual-match list. A match auto-creates a conversation
 * server-side, so the primary action here is to message. Reached from the heart
 * icon in Discover (→ /matches).
 */
export default function Matches() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { markLikesSeen, markMatchesSeen } = useNotifications();

  useEffect(() => {
    markLikesSeen();
    markMatchesSeen();
  }, [markLikesSeen, markMatchesSeen]);

  const {
    data: matches = [],
    isLoading,
    isError,
  } = useListMyMatches({ query: { queryKey: getListMyMatchesQueryKey() } });

  const { start } = useStartConversation();
  const likeActions = useLikeActions();
  const unlikeMut = useUnlikeProfile();

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: getListMyMatchesQueryKey() });

  const handleToggleLike = (user: PublicProfile) => {
    if (user.liked_by_me) {
      unlikeMut.mutate({ id: user.id }, { onSettled: invalidate });
    } else {
      likeActions.like(user, { onSettled: invalidate });
    }
  };

  const isEmpty = !isLoading && (isError || matches.length === 0);

  return (
    <div className="min-h-full relative overflow-hidden" style={{ background: "hsl(238,32%,4%)" }}>
      {/* Ambient orbs */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute -top-20 left-1/3 w-[24rem] h-[24rem] rounded-full" style={{ background: "radial-gradient(circle, rgba(168,85,247,0.32) 0%, transparent 68%)", filter: "blur(52px)" }} />
        <div className="absolute bottom-1/3 -right-16 w-64 h-64 rounded-full" style={{ background: "radial-gradient(circle, rgba(236,72,153,0.25) 0%, transparent 68%)", filter: "blur(44px)" }} />
      </div>
      <header
        className="sticky top-0 z-20 px-4 py-3 flex items-center gap-3 relative"
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
        <button
          onClick={() => setLocation("/discover")}
          className="p-1 -ml-1"
          aria-label="Volver"
          data-testid="button-back"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <h1
          className="font-display text-2xl tracking-wide"
          style={{
            background: "linear-gradient(110deg, hsl(273,90%,85%) 0%, hsl(290,85%,80%) 40%, hsl(330,90%,82%) 75%, #fff 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            filter: "drop-shadow(0 0 18px rgba(168,85,247,0.45))",
          }}
        >
          Empareja
        </h1>
        {!isLoading && !isEmpty && (
          <span
            className="font-sans text-sm px-2 py-0.5 rounded-full"
            style={{ background: "rgba(168,85,247,0.12)", color: "hsl(273,80%,72%)", border: "1px solid rgba(168,85,247,0.25)" }}
          >
            {matches.length}
          </span>
        )}
        <button
          type="button"
          onClick={() => setLocation("/les-gustas")}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-sans text-xs font-medium transition-all active:scale-95"
          style={{
            background: "rgba(236,72,153,0.12)",
            border: "1px solid rgba(236,72,153,0.25)",
            color: "hsl(330,80%,72%)",
          }}
          data-testid="button-les-gustas"
        >
          <Sparkles className="w-3 h-3" />
          Les gustas
        </button>
      </header>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="font-sans text-sm text-muted-foreground">
            Cargando matches...
          </p>
        </div>
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center py-16 gap-6 text-center px-8">
          <div
            className="w-24 h-24 rounded-2xl flex items-center justify-center border border-primary/20"
            style={{ background: "rgba(168,85,247,0.08)" }}
          >
            <Sparkles
              className="w-12 h-12 text-primary"
              style={{ filter: "drop-shadow(0 0 12px rgba(168,85,247,0.5))" }}
            />
          </div>
          <div className="space-y-2">
            <h3 className="font-display text-2xl tracking-wide text-foreground">
              Todavía no tienes matches
            </h3>
            <p className="font-sans text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
              Cuando a alguien que te gusta también le gustes, aparecerá aquí y
              podréis chatear.
            </p>
          </div>
          <button
            onClick={() => setLocation("/discover")}
            className="h-12 px-8 rounded-xl font-display text-lg tracking-widest text-white hover:opacity-90 transition-opacity border-0"
            style={{
              background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
            }}
          >
            Explorar perfiles
          </button>
        </div>
      ) : (
        <div className="px-4 pt-4 pb-6 grid grid-cols-2 gap-3">
          {matches.map((user) => (
            <UserCard
              key={user.id}
              user={user}
              grad={gradFor(user.id)}
              onMessage={() => start(user.id)}
              onToggleLike={() => handleToggleLike(user)}
              onSuperLike={() => likeActions.superLike(user, { onSettled: invalidate })}
              superLikePending={likeActions.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}
