import React, { createContext, useContext, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { MessageCircle, Loader2 } from "lucide-react";
import { useCreateOrGetConversation } from "@workspace/api-client-react";

interface MatchUser {
  userId: string;
  username: string | null;
  avatarUrl: string | null;
}

interface MatchCelebrationValue {
  celebrate: (user: MatchUser) => void;
}

const MatchCelebrationContext = createContext<MatchCelebrationValue>({
  celebrate: () => {},
});

/**
 * Full-screen "It's a Match!" celebration. Mounted once near the app root so any
 * surface that creates a mutual like (discover, favorites, public profile) can
 * trigger it via `useMatchCelebration().celebrate(...)`.
 */
export function MatchCelebrationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [match, setMatch] = useState<MatchUser | null>(null);
  const [, setLocation] = useLocation();
  const createConv = useCreateOrGetConversation();

  const celebrate = useCallback((user: MatchUser) => setMatch(user), []);
  const close = useCallback(() => setMatch(null), []);

  const handleMessage = () => {
    if (!match) return;
    createConv.mutate(
      { data: { other_user_id: match.userId } },
      {
        onSuccess: (conv) => {
          close();
          setLocation(`/chats/${conv.id}`);
        },
      },
    );
  };

  const initials = (match?.username || "?").slice(0, 2).toUpperCase();

  return (
    <MatchCelebrationContext.Provider value={{ celebrate }}>
      {children}
      {match && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center px-6 text-center animate-in fade-in duration-300"
          style={{ background: "rgba(8,7,18,0.94)", backdropFilter: "blur(14px)" }}
          onClick={close}
          data-testid="overlay-match"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex flex-col items-center gap-7 max-w-sm w-full"
          >
            <h2 className="font-display text-5xl leading-tight tracking-wide text-gradient-brand">
              🎉 ¡Es un Match!
            </h2>

            <div
              className="w-32 h-32 rounded-full overflow-hidden border-4"
              style={{
                borderColor: "hsl(330,85%,55%)",
                boxShadow: "0 0 60px rgba(236,72,153,0.55)",
              }}
            >
              {match.avatarUrl ? (
                <img
                  src={match.avatarUrl}
                  alt={match.username ?? ""}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-violet-700 to-pink-900">
                  <span className="font-display text-4xl text-white/90">
                    {initials}
                  </span>
                </div>
              )}
            </div>

            <p className="font-sans text-base text-foreground/90 leading-relaxed">
              A ti y a{" "}
              <span className="text-foreground font-semibold">
                {match.username ?? "este perfil"}
              </span>{" "}
              os gustáis. ¡Es el momento de hablar!
            </p>

            <div className="flex flex-col gap-3 w-full">
              <button
                onClick={handleMessage}
                disabled={createConv.isPending}
                className="h-12 rounded-xl font-display text-lg tracking-widest text-white hover:opacity-90 transition-opacity border-0 disabled:opacity-60 flex items-center justify-center gap-2"
                style={{
                  background:
                    "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
                }}
                data-testid="button-match-message"
              >
                {createConv.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <MessageCircle className="w-5 h-5" />
                    Enviar mensaje
                  </>
                )}
              </button>
              <button
                onClick={close}
                className="h-11 rounded-xl font-sans text-sm text-muted-foreground border border-border/40 hover:text-foreground transition-colors"
                data-testid="button-match-dismiss"
              >
                Seguir explorando
              </button>
            </div>
          </div>
        </div>
      )}
    </MatchCelebrationContext.Provider>
  );
}

export function useMatchCelebration() {
  return useContext(MatchCelebrationContext);
}
