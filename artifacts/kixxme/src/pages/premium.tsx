import React, { useState, useEffect } from "react";
import {
  useCreateStripeCheckout,
  useGetMyProfile,
  getGetMyProfileQueryKey,
  type CheckoutRequestTier,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import {
  Star,
  Flame,
  MessageCircle,
  Eye,
  SlidersHorizontal,
  Zap,
  Crown,
  EyeOff,
  Shield,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";

type Billing = "mensual" | "anual";

const PLUS_FEATURES = [
  { icon: MessageCircle, text: "Chats ilimitados" },
  { icon: Eye, text: "Ve quién visita tu perfil" },
  { icon: SlidersHorizontal, text: "Filtros avanzados" },
  { icon: Zap, text: "1 boost semanal" },
  { icon: Shield, text: "Perfil verificado" },
];

const GOLD_FEATURES = [
  { icon: Crown, text: "Todo lo de Plus" },
  { icon: EyeOff, text: "Modo incógnito" },
  { icon: Zap, text: "Boost diario prioritario" },
  { icon: Eye, text: "Visitas en detalle" },
  { icon: SlidersHorizontal, text: "Filtros exclusivos" },
  { icon: Star, text: "Soporte VIP 24/7" },
];

export default function Premium() {
  const [billing, setBilling] = useState<Billing>("mensual");
  const [faqOpen, setFaqOpen] = useState<number | null>(null);

  const { session } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: profile } = useGetMyProfile({
    query: { enabled: !!session, queryKey: getGetMyProfileQueryKey() },
  });
  const currentPlan = profile?.plan ?? "free";

  const checkout = useCreateStripeCheckout();
  const pendingTier = checkout.isPending
    ? checkout.variables?.data.tier
    : undefined;

  // Handle the redirect back from Stripe Checkout.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("checkout");
    if (!status) return;

    if (status === "success") {
      toast({
        title: "¡Pago completado!",
        description: "Tu plan se está activando…",
      });
      // The webhook updates the plan; refetch now and shortly after.
      queryClient.invalidateQueries({ queryKey: getGetMyProfileQueryKey() });
      const t = setTimeout(
        () =>
          queryClient.invalidateQueries({
            queryKey: getGetMyProfileQueryKey(),
          }),
        3000,
      );
      cleanUrl(params);
      return () => clearTimeout(t);
    }

    if (status === "cancel") {
      toast({ title: "Pago cancelado", variant: "destructive" });
    }
    cleanUrl(params);
    return;
  }, [queryClient, toast]);

  function cleanUrl(params: URLSearchParams) {
    params.delete("checkout");
    const query = params.toString();
    window.history.replaceState(
      {},
      "",
      window.location.pathname + (query ? `?${query}` : ""),
    );
  }

  function startCheckout(tier: CheckoutRequestTier) {
    const interval = billing === "mensual" ? "month" : "year";
    const returnUrl =
      window.location.origin + import.meta.env.BASE_URL + "premium";
    checkout.mutate(
      { data: { tier, interval, returnUrl } },
      {
        onSuccess: (res) => {
          window.location.href = res.url;
        },
        onError: (err: any) => {
          toast({
            title: "No se pudo iniciar el pago",
            description: err?.data?.error ?? err?.message,
            variant: "destructive",
          });
        },
      },
    );
  }

  const plusPrice = billing === "mensual" ? "9,99" : "5,00";
  const goldPrice = billing === "mensual" ? "19,99" : "10,00";

  return (
    <div className="min-h-full pb-4">
      <div
        className="relative px-4 pt-10 pb-8 text-center overflow-hidden"
        style={{
          background: "radial-gradient(ellipse 100% 80% at 50% 0%, hsl(270 40% 12%) 0%, hsl(238 25% 5%) 70%)",
        }}
      >
        <div className="flex items-center justify-center gap-2 mb-2">
          <Flame
            className="w-7 h-7 text-orange-400"
            style={{ filter: "drop-shadow(0 0 10px rgba(249,115,22,0.9))" }}
          />
          <h1 className="font-display text-4xl tracking-tight text-gradient-brand">
            KIXXME PREMIUM
          </h1>
          <Flame
            className="w-7 h-7 text-orange-400"
            style={{ filter: "drop-shadow(0 0 10px rgba(249,115,22,0.9))" }}
          />
        </div>
        <p className="font-sans text-sm text-muted-foreground">
          Desbloquea todo KixxMe. Sin límites.
        </p>

        <div
          className="inline-flex items-center gap-1 mt-5 p-1 rounded-xl border border-border/30"
          style={{ background: "rgba(13,11,26,0.8)" }}
        >
          {(["mensual", "anual"] as Billing[]).map((b) => (
            <button
              key={b}
              onClick={() => setBilling(b)}
              className="px-5 py-2 rounded-lg font-sans text-sm font-medium transition-all duration-200"
              style={
                billing === b
                  ? { background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))", color: "white" }
                  : { color: "hsl(240,10%,55%)" }
              }
            >
              {b === "mensual" ? "Mensual" : "Anual"}
              {b === "anual" && (
                <span
                  className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full"
                  style={{ background: "rgba(34,197,94,0.2)", color: "rgb(74,222,128)" }}
                >
                  −50%
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 space-y-4 mt-2">
        <div
          className="rounded-2xl border border-primary/30 overflow-hidden"
          style={{ background: "rgba(13,11,26,0.8)", boxShadow: "0 0 40px rgba(168,85,247,0.15)" }}
        >
          <div
            className="px-5 py-4"
            style={{ background: "linear-gradient(135deg, rgba(168,85,247,0.15), rgba(236,72,153,0.08))" }}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Star className="w-5 h-5 text-primary" />
                  <span className="font-display text-2xl tracking-wide text-primary">PLUS</span>
                </div>
                <p className="font-sans text-xs text-muted-foreground mt-0.5">Para empezar a brillar</p>
              </div>
              <div className="text-right">
                <span className="font-display text-3xl text-foreground">{plusPrice}€</span>
                <span className="font-sans text-xs text-muted-foreground">/mes</span>
                {billing === "anual" && (
                  <p className="font-sans text-[10px] text-muted-foreground/70">
                    59,99€ facturado anualmente
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="px-5 py-4 space-y-3">
            {PLUS_FEATURES.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(168,85,247,0.12)" }}
                >
                  <Icon className="w-3.5 h-3.5 text-primary" />
                </div>
                <span className="font-sans text-sm text-foreground/90">{text}</span>
              </div>
            ))}
            <button
              onClick={() => startCheckout("plus")}
              disabled={currentPlan === "plus" || checkout.isPending}
              className="w-full mt-4 h-12 rounded-xl font-display text-xl tracking-widest text-white hover:opacity-90 transition-opacity border-0 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))" }}
            >
              {pendingTier === "plus" && (
                <Loader2 className="w-5 h-5 animate-spin" />
              )}
              {currentPlan === "plus" ? "Plan actual" : "Activar Plus"}
            </button>
          </div>
        </div>

        <div
          className="rounded-2xl border border-yellow-500/30 overflow-hidden relative"
          style={{ background: "rgba(13,11,26,0.8)", boxShadow: "0 0 40px rgba(234,179,8,0.12)" }}
        >
          <div
            className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-[10px] font-display tracking-widest"
            style={{ background: "linear-gradient(135deg, hsl(38,95%,55%), hsl(25,100%,52%))", color: "white" }}
          >
            MÁS POPULAR
          </div>
          <div
            className="px-5 py-4"
            style={{ background: "linear-gradient(135deg, rgba(234,179,8,0.12), rgba(249,115,22,0.06))" }}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Crown className="w-5 h-5 text-yellow-400" />
                  <span className="font-display text-2xl tracking-wide text-yellow-400">GOLD</span>
                </div>
                <p className="font-sans text-xs text-muted-foreground mt-0.5">La experiencia completa</p>
              </div>
              <div className="text-right">
                <span className="font-display text-3xl text-foreground">{goldPrice}€</span>
                <span className="font-sans text-xs text-muted-foreground">/mes</span>
                {billing === "anual" && (
                  <p className="font-sans text-[10px] text-muted-foreground/70">
                    119,99€ facturado anualmente
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="px-5 py-4 space-y-3">
            {GOLD_FEATURES.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(234,179,8,0.1)" }}
                >
                  <Icon className="w-3.5 h-3.5 text-yellow-400" />
                </div>
                <span className="font-sans text-sm text-foreground/90">{text}</span>
              </div>
            ))}
            <button
              onClick={() => startCheckout("gold")}
              disabled={currentPlan === "gold" || checkout.isPending}
              className="w-full mt-4 h-12 rounded-xl font-display text-xl tracking-widest text-white hover:opacity-90 transition-opacity border-0 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{ background: "linear-gradient(135deg, hsl(38,95%,52%), hsl(25,100%,50%))" }}
            >
              {pendingTier === "gold" && (
                <Loader2 className="w-5 h-5 animate-spin" />
              )}
              {currentPlan === "gold" ? "Plan actual" : "Activar Gold"}
            </button>
          </div>
        </div>

        <div
          className="rounded-2xl border border-border/30 overflow-hidden"
          style={{ background: "rgba(13,11,26,0.6)" }}
        >
          <div className="px-5 py-4 border-b border-border/20">
            <h3 className="font-display text-lg tracking-wide">Preguntas frecuentes</h3>
          </div>
          {[
            { q: "¿Puedo cancelar en cualquier momento?", a: "Sí. Puedes cancelar tu suscripción cuando quieras desde los ajustes de tu perfil sin penalizaciones." },
            { q: "¿Mis datos están seguros?", a: "KixxMe usa cifrado de extremo a extremo. Nunca vendemos tus datos a terceros." },
            { q: "¿Qué es el modo incógnito?", a: "Con Gold puedes navegar perfiles sin que aparezca en la lista de visitantes. Tu privacidad, tu elección." },
          ].map((faq, i) => (
            <button
              key={i}
              className="w-full px-5 py-4 flex items-center justify-between text-left border-b border-border/20 last:border-0"
              onClick={() => setFaqOpen(faqOpen === i ? null : i)}
            >
              <span className="font-sans text-sm text-foreground/90 pr-4">{faq.q}</span>
              {faqOpen === i
                ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              }
              {faqOpen === i && (
                <div className="absolute" />
              )}
            </button>
          ))}
          {faqOpen !== null && (
            <div className="px-5 pb-4">
              <p className="font-sans text-sm text-muted-foreground leading-relaxed">
                {[
                  "Sí. Puedes cancelar tu suscripción cuando quieras desde los ajustes de tu perfil sin penalizaciones.",
                  "KixxMe usa cifrado de extremo a extremo. Nunca vendemos tus datos a terceros.",
                  "Con Gold puedes navegar perfiles sin que aparezca en la lista de visitantes. Tu privacidad, tu elección.",
                ][faqOpen]}
              </p>
            </div>
          )}
        </div>

        <p className="text-center font-sans text-xs text-muted-foreground/60 pb-2">
          Al suscribirte aceptas nuestros Términos de Servicio y Política de Privacidad.
        </p>
      </div>
    </div>
  );
}
