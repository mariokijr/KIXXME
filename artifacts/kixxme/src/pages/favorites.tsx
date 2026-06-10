import React, { useEffect } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Heart } from "lucide-react";
import {
  useListMyLikes,
  getListMyLikesQueryKey,
  useCreateOrGetConversation,
  useLikeProfile,
  useUnlikeProfile,
  PublicProfile,
} from "@workspace/api-client-react";
import { UserCard, gradFor } from "./discover";
import { useNotifications } from "@/lib/notifications";

export default function Favorites() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { markLikesSeen, markMatchesSeen } = useNotifications();

  useEffect(() => {
    markLikesSeen();
    markMatchesSeen();
  }, [markLikesSeen, markMatchesSeen]);

  const {
    data: likes = [],
    isLoading,
    isError,
  } = useListMyLikes({ query: { queryKey: getListMyLikesQueryKey() } });

  const createConv = useCreateOrGetConversation();
  const likeMut = useLikeProfile();
  const unlikeMut = useUnlikeProfile();

  const handleMessage = (userId: string) => {
    createConv.mutate(
      { data: { other_user_id: userId } },
      { onSuccess: (conv) => setLocation(`/chats/${conv.id}`) }
    );
  };

  const handleToggleLike = (user: PublicProfile) => {
    const onSettled = () =>
      qc.invalidateQueries({ queryKey: getListMyLikesQueryKey() });
    if (user.liked_by_me) {
      unlikeMut.mutate({ id: user.id }, { onSettled });
    } else {
      likeMut.mutate({ id: user.id }, { onSettled });
    }
  };

  const isEmpty = !isLoading && (isError || likes.length === 0);

  return (
    <div className="min-h-full">
      <header
        className="sticky top-0 z-20 px-4 py-3 flex items-center gap-3 border-b border-border/30"
        style={{ background: "rgba(8,7,18,0.92)", backdropFilter: "blur(20px)" }}
      >
        <button
          onClick={() => setLocation("/discover")}
          className="p-1 -ml-1"
          aria-label="Volver"
          data-testid="button-back"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <h1 className="font-display text-2xl tracking-wide">Favoritos</h1>
        {!isLoading && !isEmpty && (
          <span className="font-sans text-sm text-muted-foreground ml-auto">
            {likes.length}
          </span>
        )}
      </header>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="font-sans text-sm text-muted-foreground">
            Cargando favoritos...
          </p>
        </div>
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center py-16 gap-6 text-center px-8">
          <div
            className="w-24 h-24 rounded-2xl flex items-center justify-center border border-primary/20"
            style={{ background: "rgba(168,85,247,0.08)" }}
          >
            <Heart
              className="w-12 h-12 text-primary"
              style={{ filter: "drop-shadow(0 0 12px rgba(168,85,247,0.5))" }}
            />
          </div>
          <div className="space-y-2">
            <h3 className="font-display text-2xl tracking-wide text-foreground">
              Aún no tienes favoritos
            </h3>
            <p className="font-sans text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
              Toca el corazón en un perfil para guardarlo aquí.
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
          {likes.map((user) => (
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
