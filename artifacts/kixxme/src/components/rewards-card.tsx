import {
  useGetRewards,
  useClaimDailyReward,
  useGetLikeQuota,
  getGetRewardsQueryKey,
  getGetLikeQuotaQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Flame, Gift, Heart, Star, Loader2, Trophy } from "lucide-react";

const MILESTONE_DAYS = 7;

/**
 * Daily-reward + streak card. Claiming once per UTC day keeps the streak alive
 * and grants bonus like/SuperLike CREDITS, which the like engine spends once the
 * base allowance is exhausted. On a successful claim we invalidate both the
 * rewards state and the like-quota query so the swipe-deck chip reflects the new
 * credits immediately.
 */
export function RewardsCard() {
  const { session } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useGetRewards({
    query: { enabled: !!session, queryKey: getGetRewardsQueryKey() },
  });
  const { data: quota } = useGetLikeQuota({
    query: { enabled: !!session, queryKey: getGetLikeQuotaQueryKey() },
  });
  const claim = useClaimDailyReward();

  if (isLoading || !data) return null;

  const { streak, claimable, credits } = data;
  // Only surface credit chips for kinds the user can actually spend them on:
  // an unlimited tier never consumes credits (they only become spendable on a
  // downgrade), so showing them as "N extra" would be misleading.
  const showLikeCredits = !!quota && !quota.likes.unlimited && credits.likes > 0;
  const showSuperCredits =
    !!quota && !quota.superlikes.unlimited && credits.superlikes > 0;
  // Position within the current 7-day milestone cycle (1..7), 0 when no streak.
  const weekProgress =
    streak.current === 0 ? 0 : ((streak.current - 1) % MILESTONE_DAYS) + 1;

  const handleClaim = () => {
    claim.mutate(undefined, {
      onSuccess: (res) => {
        const parts = [`+${res.granted.likes} Me gusta`];
        if (res.granted.superlikes > 0) {
          parts.push(`+${res.granted.superlikes} SuperLike`);
        }
        toast({
          title: res.milestone
            ? `🏆 ¡Racha de ${res.streak.current} días!`
            : `🔥 Racha de ${res.streak.current} ${res.streak.current === 1 ? "día" : "días"}`,
          description: `Has ganado ${parts.join(" y ")}.`,
        });
        qc.invalidateQueries({ queryKey: getGetRewardsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetLikeQuotaQueryKey() });
      },
      onError: (err: any) => {
        qc.invalidateQueries({ queryKey: getGetRewardsQueryKey() });
        toast({
          title: "No se pudo reclamar",
          description:
            err?.status === 409
              ? "Ya has reclamado tu recompensa de hoy."
              : (err?.data?.error ?? "Inténtalo de nuevo."),
          variant: err?.status === 409 ? undefined : "destructive",
        });
      },
    });
  };

  return (
    <div
      className="mx-4 mb-4 border border-amber-500/30 rounded-2xl p-5"
      style={{ background: "rgba(245,158,11,0.05)" }}
      data-testid="card-rewards"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Flame className="w-5 h-5 text-amber-400" />
          <h3 className="font-display text-lg tracking-widest text-foreground">
            Recompensas diarias
          </h3>
        </div>
        <div className="text-right">
          <div
            className="font-display text-2xl leading-none text-amber-300"
            data-testid="text-streak-current"
          >
            {streak.current}
          </div>
          <div className="font-sans text-[10px] uppercase tracking-wider text-muted-foreground">
            {streak.current === 1 ? "día" : "días"} de racha
          </div>
        </div>
      </div>

      <p className="font-sans text-sm text-muted-foreground mt-2">
        Vuelve cada día para mantener tu racha y ganar Me gusta y SuperLikes
        extra. ¡Al 7º día consigues un SuperLike!
      </p>

      {/* 7-day milestone progress */}
      <div className="flex items-center gap-1.5 mt-3" data-testid="streak-week-progress">
        {Array.from({ length: MILESTONE_DAYS }).map((_, i) => {
          const filled = i < weekProgress;
          const isMilestone = i === MILESTONE_DAYS - 1;
          return (
            <div
              key={i}
              className="flex-1 h-1.5 rounded-full transition-colors"
              style={{
                background: filled
                  ? isMilestone
                    ? "hsl(45,93%,58%)"
                    : "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))"
                  : "rgba(255,255,255,0.08)",
              }}
            />
          );
        })}
      </div>

      {/* Bonus credit balance (only for kinds the user can spend them on) */}
      {(showLikeCredits || showSuperCredits) && (
        <div className="flex items-center gap-4 mt-4" data-testid="rewards-credits">
          {showLikeCredits && (
            <span className="flex items-center gap-1.5 font-sans text-sm text-pink-300">
              <Heart className="w-4 h-4 fill-pink-400 text-pink-400" />
              {credits.likes} extra
            </span>
          )}
          {showSuperCredits && (
            <span className="flex items-center gap-1.5 font-sans text-sm text-sky-300">
              <Star className="w-4 h-4 fill-sky-400 text-sky-400" />
              {credits.superlikes} SuperLike
            </span>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={handleClaim}
        disabled={!claimable || claim.isPending}
        className="w-full h-12 mt-4 rounded-xl flex items-center justify-center gap-2 font-display text-lg tracking-widest text-white transition-opacity disabled:opacity-50"
        style={{
          background: claimable
            ? "linear-gradient(135deg, hsl(38,92%,50%), hsl(330,85%,52%))"
            : "rgba(255,255,255,0.06)",
        }}
        data-testid="button-claim-reward"
      >
        {claim.isPending ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : claimable ? (
          <>
            <Gift className="w-5 h-5" />
            Reclamar recompensa
          </>
        ) : (
          <>
            <Trophy className="w-5 h-5 text-amber-400" />
            Reclamada · vuelve mañana
          </>
        )}
      </button>

      {streak.longest > 0 && (
        <p className="font-sans text-[11px] text-muted-foreground text-center mt-2">
          Tu mejor racha: {streak.longest}{" "}
          {streak.longest === 1 ? "día" : "días"}
        </p>
      )}
    </div>
  );
}
