import React from "react";
import { useLocation } from "wouter";
import { useLikeProfile } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useMatchCelebration } from "./match-celebration";
import { playSound } from "./sound";

interface LikeTarget {
  id: string;
  username?: string | null;
  avatar_url?: string | null;
}

type LikeOpts = { onSettled?: () => void };

/**
 * Centralizes the like / SuperLike side effects shared across discover,
 * favorites and the public profile:
 * - a mutual like triggers the Match celebration overlay
 * - a successful like/SuperLike shows the matching confirmation toast
 * - a 429 (quota exhausted) shows the server's Spanish limit message plus a
 *   "Hazte Premium" upsell action
 */
export function useLikeActions() {
  const likeMut = useLikeProfile();
  const { toast } = useToast();
  const { celebrate } = useMatchCelebration();
  const [, setLocation] = useLocation();

  const run = (
    user: LikeTarget,
    kind: "like" | "superlike",
    opts?: LikeOpts,
  ) => {
    likeMut.mutate(
      { id: user.id, data: { kind } },
      {
        onSuccess: (res) => {
          if (res.matched) {
            celebrate({
              userId: user.id,
              username: user.username ?? null,
              avatarUrl: user.avatar_url ?? null,
            });
          } else if (kind === "superlike") {
            playSound("superlike");
            toast({
              title: `⭐ SuperLike enviado a ${user.username ?? "este perfil"}`,
            });
          } else {
            playSound("like");
            toast({
              title: `Te gusta ${user.username ?? "este perfil"} ❤️`,
            });
          }
        },
        onError: (err: any) => {
          if (err?.status === 429) {
            toast({
              title:
                kind === "superlike"
                  ? "Sin SuperLikes disponibles"
                  : "Has alcanzado tu límite",
              description: err?.data?.error,
              variant: "destructive",
              action: (
                <ToastAction
                  altText="Ver planes Premium"
                  onClick={() => setLocation("/premium")}
                >
                  Hazte Premium
                </ToastAction>
              ),
            });
          } else {
            toast({
              title: "No se pudo completar la acción",
              variant: "destructive",
            });
          }
        },
        onSettled: opts?.onSettled,
      },
    );
  };

  return {
    like: (user: LikeTarget, opts?: LikeOpts) => run(user, "like", opts),
    superLike: (user: LikeTarget, opts?: LikeOpts) => run(user, "superlike", opts),
    isPending: likeMut.isPending,
  };
}
