import React, { useEffect } from "react";
import { useLocation } from "wouter";
import {
  useGetStripeTrialStatus,
  getGetStripeTrialStatusQueryKey,
  useStartStripeTrial,
  getGetMyProfileQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import {
  Crown,
  Star,
  Eye,
  MessageCircle,
  SlidersHorizontal,
  Zap,
  EyeOff,
  Shield,
  Loader2,
  XCircle,
  Clock,
} from "lucide-react";
import { KixxMeLogo } from "@/components/brand/kixxme-logo";

const GOLD_FEATURES = [
  { icon: Crown, text: "Likes y SuperLikes ilimitados" },
  { icon: Star, text: "Descubre quién te da SuperLike" },
  { icon: Eye, text: "Quién visitó tu perfil" },
  { icon: MessageCircle, text: "Chats ilimitados" },
  { icon: SlidersHorizontal, text: "Filtros avanzados y exclusivos" },
  { icon: EyeOff, text: "Modo incógnito" },
  { icon: Zap, text: "Boost diario prioritario" },
  { icon: Shield, text: "Soporte VIP 24/7" },
];

export default function Trial() {
  const [, setLocation] = useLocation();
  const { session } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: trialStatus, isLoading: statusLoading } = useGetStripeTrialStatus({
    query: { enabled: !!session, queryKey: getGetStripeTrialStatusQueryKey() },
  });
  const startTrial = useStartStripeTrial();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("checkout");
    if (!status) return;
    if (status === "success") {
      toast({
        title: "¡Prueba activada!",
        description: "Tu Gold está listo. Disfrútalo 5 días gratis.",
      });
      queryClient.invalidateQueries({ queryKey: getGetMyProfileQueryKey() });
      setTimeout(
        () => queryClient.invalidateQueries({ queryKey: getGetMyProfileQueryKey() }),
        3000,
      );
      cleanUrl(params);
      setTimeout(() => setLocation("/discover"), 1500);
    } else if (status === "cancel") {
      toast({ title: "Proceso cancelado", variant: "destructive" });
      cleanUrl(params);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function cleanUrl(params: URLSearchParams) {
    params.delete("checkout");
    const query = params.toString();
    window.history.replaceState(
      {},
      "",
      window.location.pathname + (query ? `?${query}` : ""),
    );
  }

  function activate() {
    const returnUrl =
      window.location.origin + import.meta.env.BASE_URL + "trial";
    const embedded = window.self !== window.top;
    const preopened = embedded ? window.open("", "_blank") : null;

    startTrial.mutate(
      { data: { returnUrl } },
      {
        onSuccess: (res) => {
          if (preopened && !preopened.closed) {
            preopened.location.href = res.url;
          } else if (embedded) {
            window.open(res.url, "_blank", "noopener");
          } else {
            window.location.href = res.url;
          }
        },
        onError: (err: any) => {
          preopened?.close();
          const code = err?.data?.code;
          if (code === "trial_not_eligible") {
            toast({
              title: "Ya usaste tu prueba",
              description: "Solo se permite una prueba gratuita por cuenta.",
              variant: "destructive",
            });
          } else {
            toast({
              title: "No se pudo iniciar la prueba",
              description: err?.data?.error ?? err?.message,
              variant: "destructive",
            });
          }
        },
      },
    );
  }

  const alreadyUsed = trialStatus?.eligible === false;
  const isPending = startTrial.isPending;

  return (
    <div className="min-h-full pb-10">
      <div
        className="relative px-4 pt-10 pb-8 text-center overflow-hidden"
        style={{
          background:
            "radial-gradient(ellipse 100% 80% at 50% 0%, hsl(38 60% 12%) 0%, hsl(238 25% 5%) 70%)",
        }}
      >
        <div className="flex items-center justify-center gap-2.5 mb-2">
          <KixxMeLogo size={30} />
          <h1
            className="font-display text-3xl tracking-tight"
            style={{ color: "hsl(38 95% 55%)" }}
          >
            PRUEBA GOLD GRATIS
          </h1>
        </div>
        <div className="flex items-center justify-center gap-1.5 mt-3">
          <Clock className="w-4 h-4" style={{ color: "rgb(250,204,21)" }} />
          <span
            className="font-display text-xl tracking-widest"
            style={{ color: "rgb(250,204,21)" }}
          >
            5 DÍAS GRATIS
          </span>
        </div>
        <p className="font-sans text-sm text-muted-foreground mt-2">
          Sin compromiso · Cancela antes del día 5 y no pagas nada
        </p>
        <p className="font-sans text-xs text-muted-foreground/60 mt-1">
          Después, 9,99 €/mes. Cancela cuando quieras.
        </p>
      </div>

      <div className="px-4 space-y-4 mt-2 max-w-md mx-auto">
        <div
          className="rounded-2xl border border-yellow-500/30 overflow-hidden"
          style={{
            background: "rgba(13,11,26,0.8)",
            boxShadow: "0 0 40px rgba(234,179,8,0.10)",
          }}
        >
          <div
            className="px-5 py-4"
            style={{
              background:
                "linear-gradient(135deg, rgba(234,179,8,0.10), rgba(249,115,22,0.05))",
            }}
          >
            <div className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-yellow-400" />
              <span className="font-display text-xl tracking-wide text-yellow-400">
                TODO GOLD INCLUIDO
              </span>
            </div>
          </div>
          <div className="px-5 py-4 space-y-3">
            {GOLD_FEATURES.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(234,179,8,0.10)" }}
                >
                  <Icon className="w-3.5 h-3.5 text-yellow-400" />
                </div>
                <span className="font-sans text-sm text-foreground/90">{text}</span>
              </div>
            ))}
          </div>
        </div>

        {statusLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : alreadyUsed ? (
          <div
            className="rounded-2xl border border-border/40 p-5 text-center space-y-3"
            style={{ background: "rgba(13,11,26,0.7)" }}
          >
            <XCircle className="w-10 h-10 text-muted-foreground mx-auto" />
            <p className="font-sans text-sm text-muted-foreground">
              Ya utilizaste tu prueba gratuita de Gold. Solo se permite una por cuenta.
            </p>
            <button
              onClick={() => setLocation("/premium")}
              className="w-full h-12 rounded-xl font-display text-lg tracking-widest text-white hover:opacity-90 transition-opacity"
              style={{
                background: "linear-gradient(135deg, hsl(38,95%,52%), hsl(25,100%,50%))",
              }}
            >
              Ver planes Gold
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <button
              onClick={activate}
              disabled={isPending}
              className="w-full h-14 rounded-2xl font-display text-xl tracking-widest text-white hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{
                background:
                  "linear-gradient(135deg, hsl(38,95%,52%), hsl(25,100%,50%))",
                boxShadow: "0 4px 20px rgba(234,179,8,0.30)",
              }}
              data-testid="button-activate-trial"
            >
              {isPending && <Loader2 className="w-5 h-5 animate-spin" />}
              {isPending ? "Iniciando…" : "Activar 5 días gratis"}
            </button>
            <p className="text-center font-sans text-[11px] text-muted-foreground/60">
              Al continuar aceptas nuestros Términos de Servicio. Cancela antes del día 5
              desde Ajustes → Cancelar prueba gratuita.
            </p>
          </div>
        )}

        <div
          className="rounded-2xl border border-border/30 p-5 space-y-4"
          style={{ background: "rgba(13,11,26,0.6)" }}
        >
          <h3 className="font-display text-base tracking-wide text-foreground">
            ¿Cómo funciona?
          </h3>
          {[
            {
              day: "Hoy",
              text: "Activas la prueba gratuita. Todo Gold desbloqueado al instante.",
            },
            {
              day: "Días 1–5",
              text: "Disfruta de todas las funciones Gold sin pagar nada.",
            },
            {
              day: "Día 5",
              text: "Si no cancelas antes, se activa tu suscripción Gold (9,99 €/mes).",
            },
          ].map(({ day, text }) => (
            <div key={day} className="flex gap-3">
              <div className="w-16 flex-shrink-0">
                <span
                  className="font-display text-xs tracking-wide"
                  style={{ color: "hsl(38 95% 55%)" }}
                >
                  {day}
                </span>
              </div>
              <p className="font-sans text-xs text-muted-foreground/80">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
