import { useEffect, useState } from "react";
import {
  useGetBoostStatus,
  useActivateBoost,
  getGetBoostStatusQueryKey,
  getGetLikeQuotaQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Zap, Loader2 } from "lucide-react";

const BOOST_COST = 5;

function useCountdown(expiresAt: string | null | undefined): string | null {
  const [remaining, setRemaining] = useState<string | null>(null);

  useEffect(() => {
    if (!expiresAt) {
      setRemaining(null);
      return;
    }
    const tick = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) {
        setRemaining(null);
        return;
      }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${m}:${s.toString().padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return remaining;
}

/**
 * Boost de perfil: 30 minutos al top de Descubrir, cuesta 5 créditos de like.
 */
export function BoostCard() {
  const { session } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useGetBoostStatus({
    query: { enabled: !!session, queryKey: getGetBoostStatusQueryKey() },
  });
  const boost = useActivateBoost();
  const countdown = useCountdown(data?.active ? data.expires_at : null);

  if (isLoading || !data) return null;

  const handleBoost = () => {
    boost.mutate(undefined, {
      onSuccess: () => {
        toast({ title: "🚀 ¡Boost activado!", description: "Aparecerás primero en Descubrir durante 30 minutos." });
        qc.invalidateQueries({ queryKey: getGetBoostStatusQueryKey() });
        qc.invalidateQueries({ queryKey: getGetLikeQuotaQueryKey() });
      },
      onError: (err: any) => {
        const msg =
          err?.status === 409
            ? "Ya tienes un boost activo."
            : err?.status === 402
            ? `Necesitas ${BOOST_COST} créditos de Me gusta para hacer boost.`
            : (err?.data?.error ?? "No se pudo activar el boost.");
        toast({ title: "Boost no disponible", description: msg, variant: err?.status === 402 || err?.status === 409 ? undefined : "destructive" });
        qc.invalidateQueries({ queryKey: getGetBoostStatusQueryKey() });
      },
    });
  };

  const canAfford = (data.credits_available ?? 0) >= BOOST_COST;

  return (
    <div
      className="mx-4 mb-4 border border-violet-500/30 rounded-2xl p-5"
      style={{ background: "rgba(139,92,246,0.05)" }}
      data-testid="card-boost"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-violet-400" />
          <h3 className="font-display text-lg tracking-widest text-foreground">
            Boost de perfil
          </h3>
        </div>
        {data.credits_available > 0 && (
          <div className="text-right">
            <div className="font-display text-2xl leading-none text-violet-300">
              {data.credits_available}
            </div>
            <div className="font-sans text-[10px] uppercase tracking-wider text-muted-foreground">
              créditos
            </div>
          </div>
        )}
      </div>

      <p className="font-sans text-sm text-muted-foreground mt-2">
        Aparece primero en Descubrir durante 30 minutos. Cuesta {BOOST_COST}{" "}
        créditos de Me gusta (los ganas con tu racha diaria).
      </p>

      <button
        type="button"
        onClick={data.active ? undefined : handleBoost}
        disabled={data.active || boost.isPending || !canAfford}
        className="w-full h-12 mt-4 rounded-xl flex items-center justify-center gap-2 font-display text-lg tracking-widest text-white transition-opacity disabled:opacity-50"
        style={{
          background: data.active
            ? "rgba(139,92,246,0.25)"
            : canAfford
            ? "linear-gradient(135deg, hsl(263,85%,55%), hsl(330,85%,52%))"
            : "rgba(255,255,255,0.06)",
        }}
        data-testid="button-activate-boost"
      >
        {boost.isPending ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : data.active ? (
          <>
            <Zap className="w-5 h-5 text-violet-300 fill-violet-300" />
            <span>
              Boost activo{countdown ? ` · ${countdown}` : ""}
            </span>
          </>
        ) : canAfford ? (
          <>
            <Zap className="w-5 h-5" />
            Activar boost · {BOOST_COST} créditos
          </>
        ) : (
          <>
            <Zap className="w-5 h-5" />
            Sin créditos suficientes
          </>
        )}
      </button>
    </div>
  );
}
