import React from "react";
import { useLikeProfile } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useMatchCelebration } from "./match-celebration";
import { useLimitUpsell } from "./limit-upsell";
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
 * - a 429 (quota exhausted) opens the full "Hazte Premium" upsell modal
 *   (see limit-upsell.tsx), blocking the action with the server's Spanish message
 */
export function useLikeActions() {
  const likeMut = useLikeProfile();
  const { toast } = useToast();
  const { celebrate } = useMatchCelebration();
  const { showLimit } = useLimitUpsell();

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
            showLimit(kind, err?.data?.error);
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
