import {
  useGetMyVerification,
  useRequestVerification,
  getGetMyVerificationQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { BadgeCheck, Clock, ShieldCheck, Loader2, XCircle } from "lucide-react";

/**
 * Self-service verification card for the user's own profile. Shows the current
 * standing (verified / pending / rejected / none) and lets the user request
 * manual review. The badge itself is `profiles.is_verified`; this only manages
 * the request queue.
 */
export function VerificationCard() {
  const { session } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useGetMyVerification({
    query: { enabled: !!session, queryKey: getGetMyVerificationQueryKey() },
  });
  const request = useRequestVerification();

  if (isLoading || !data) return null;

  const handleRequest = () => {
    request.mutate(undefined, {
      onSuccess: () => {
        toast({
          title: "Solicitud enviada",
          description: "Revisaremos tu perfil lo antes posible.",
        });
        qc.invalidateQueries({ queryKey: getGetMyVerificationQueryKey() });
      },
      onError: (err: any) => {
        qc.invalidateQueries({ queryKey: getGetMyVerificationQueryKey() });
        toast({
          title: "No se pudo enviar",
          description: err?.data?.error ?? "Inténtalo de nuevo.",
          variant: "destructive",
        });
      },
    });
  };

  if (data.is_verified) {
    return (
      <div
        className="mx-4 mb-4 border border-sky-500/30 rounded-2xl p-5"
        style={{ background: "rgba(14,165,233,0.06)" }}
        data-testid="card-verification-approved"
      >
        <div className="flex items-center gap-2 mb-1">
          <BadgeCheck className="w-5 h-5 text-sky-400" />
          <h3 className="font-display text-lg tracking-widest text-foreground">
            Perfil verificado
          </h3>
        </div>
        <p className="font-sans text-sm text-muted-foreground">
          Tu identidad está verificada. La insignia azul aparece en tu perfil y
          en tus tarjetas.
        </p>
      </div>
    );
  }

  if (data.status === "pending") {
    return (
      <div
        className="mx-4 mb-4 border border-amber-500/30 rounded-2xl p-5"
        style={{ background: "rgba(245,158,11,0.05)" }}
        data-testid="card-verification-pending"
      >
        <div className="flex items-center gap-2 mb-1">
          <Clock className="w-5 h-5 text-amber-400" />
          <h3 className="font-display text-lg tracking-widest text-foreground">
            Verificación en revisión
          </h3>
        </div>
        <p className="font-sans text-sm text-muted-foreground">
          Hemos recibido tu solicitud. Te avisaremos cuando nuestro equipo la
          revise.
        </p>
      </div>
    );
  }

  const rejected = data.status === "rejected";

  return (
    <div
      className="mx-4 mb-4 border border-border/40 rounded-2xl p-5 space-y-3"
      style={{ background: "rgba(13,11,26,0.7)" }}
      data-testid="card-verification-request"
    >
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-5 h-5 text-primary" />
        <h3 className="font-display text-lg tracking-widest text-foreground">
          Verifica tu perfil
        </h3>
      </div>
      <p className="font-sans text-sm text-muted-foreground">
        Consigue la insignia azul para demostrar que eres real. Los perfiles
        verificados generan más confianza y reciben más likes.
      </p>
      {rejected && (
        <div
          className="flex items-start gap-2 rounded-xl border border-red-500/30 p-3"
          style={{ background: "rgba(239,68,68,0.06)" }}
        >
          <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
          <p className="font-sans text-xs text-red-300/90">
            {data.note?.trim()
              ? data.note
              : "Tu solicitud anterior fue rechazada. Asegúrate de que tu foto principal muestre tu cara con claridad e inténtalo de nuevo."}
          </p>
        </div>
      )}
      <button
        type="button"
        onClick={handleRequest}
        disabled={request.isPending}
        className="w-full h-11 rounded-xl border border-primary/30 flex items-center justify-center gap-2 font-sans text-sm font-medium text-primary hover:bg-primary/5 transition-colors disabled:opacity-60"
        style={{ background: "rgba(168,85,247,0.06)" }}
        data-testid="button-request-verification"
      >
        {request.isPending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <BadgeCheck className="w-4 h-4" />
        )}
        {rejected ? "Volver a solicitar verificación" : "Solicitar verificación"}
      </button>
    </div>
  );
}
