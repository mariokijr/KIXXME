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
  Heart,
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
  Check,
  Minus,
} from "lucide-react";
import { KixxMeLogo } from "@/components/brand/kixxme-logo";

type Billing = "mensual" | "anual";

// Free / Plus / Gold feature matrix. `true` => check, `false` => not included,
// string => the specific limit/value for that tier.
type CompareCell = boolean | string;
const COMPARISON: { label: string; free: CompareCell; plus: CompareCell; gold: CompareCell }[] = [
  { label: "Me gusta", free: "10 / 6 h", plus: "Ilimitados", gold: "Ilimitados" },
  { label: "SuperLikes", free: "1 / día", plus: "5 / día", gold: "Ilimitados" },
  { label: "Quién te da SuperLike", free: false, plus: true, gold: true },
  { label: "Quién visitó tu perfil", free: false, plus: true, gold: true },
  { label: "Chats", free: "Básicos", plus: "Ilimitados", gold: "Ilimitados" },
  { label: "Filtros avanzados", free: false, plus: true, gold: true },
  { label: "Perfil verificado", free: false, plus: true, gold: true },
  { label: "Boost", free: false, plus: "Semanal", gold: "Diario" },
  { label: "Modo incógnito", free: false, plus: false, gold: true },
  { label: "KixxMe Live", free: false, plus: false, gold: true },
  { label: "Soporte", free: "Estándar", plus: "Prioritario", gold: "VIP 24/7" },
];

function CompareValue({ value, gold }: { value: CompareCell; gold?: boolean }) {
  if (value === true)
    return (
      <Check
        className="w-4 h-4 mx-auto"
        style={{ color: gold ? "rgb(250,204,21)" : "rgb(74,222,128)" }}
      />
    );
  if (value === false)
    return <Minus className="w-4 h-4 mx-auto text-muted-foreground/30" />;
  return (
    <span className="font-sans text-[11px] leading-tight text-foreground/80">
      {value}
    </span>
  );
}

const PLUS_FEATURES = [
  { icon: Heart, text: "Likes ilimitados" },
  { icon: Star, text: "5 SuperLikes al día" },
  { icon: Eye, text: "Descubre quién te da SuperLike" },
  { icon: Eye, text: "Quién visitó tu perfil" },
  { icon: MessageCircle, text: "Chats ilimitados" },
  { icon: SlidersHorizontal, text: "Filtros avanzados" },
  { icon: Zap, text: "1 boost semanal" },
  { icon: Shield, text: "Perfil verificado" },
];

const GOLD_FEATURES = [
  { icon: Crown, text: "Todo lo de Plus" },
  { icon: Star, text: "SuperLikes ilimitados" },
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

    // Stripe Checkout refuses to render inside an iframe (e.g. the Replit
    // preview), so when embedded we open it in a new tab. The tab is opened
    // synchronously inside the click gesture so the browser doesn't block it
    // as a popup once the async request resolves ~2s later.
    const embedded = window.self !== window.top;
    const preopened = embedded ? window.open("", "_blank") : null;

    checkout.mutate(
      { data: { tier, interval, returnUrl } },
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
          toast({
            title: "No se pudo iniciar el pago",
            description: err?.data?.error ?? err?.message,
            variant: "destructive",
          });
        },
      },
    );
  }

  const PRICING = {
    plus: {
      monthly: "4,99",
      yearMonthly: "2,50",
      yearTotal: "29,99",
      yearSavings: "29,89",
    },
    gold: {
      monthly: "9,99",
      yearMonthly: "5,00",
      yearTotal: "59,99",
      yearSavings: "59,89",
    },
  } as const;

  return (
    <div className="min-h-full pb-4">
      <div
        className="relative px-4 pt-10 pb-8 text-center overflow-hidden"
        style={{
          background: "radial-gradient(ellipse 100% 80% at 50% 0%, hsl(270 40% 12%) 0%, hsl(238 25% 5%) 70%)",
        }}
      >
        <div className="flex items-center justify-center gap-2.5 mb-2">
          <KixxMeLogo size={34} />
          <h1 className="font-display text-4xl tracking-tight text-gradient-brand">
            KIXXME PREMIUM
          </h1>
        </div>
        <p className="font-sans text-sm text-muted-foreground">
          Desbloquea todo KixxMe. Sin límites.
        </p>

        <div className="relative inline-block mt-5">
        <div
          className="absolute -top-2.5 left-1/2 -translate-x-1/2 z-10 px-2.5 py-0.5 rounded-full text-[9px] font-display tracking-widest whitespace-nowrap"
          style={{ background: "linear-gradient(135deg, hsl(142,70%,42%), hsl(160,72%,38%))", color: "white", boxShadow: "0 2px 10px rgba(34,197,94,0.35)" }}
        >
          MEJOR OFERTA · AHORRA 50%
        </div>
        <div
          className="inline-flex items-center gap-1 p-1 rounded-xl border border-border/30"
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
                <div>
                  <span className="font-display text-3xl text-foreground">
                    {billing === "mensual"
                      ? PRICING.plus.monthly
                      : PRICING.plus.yearMonthly}
                    €
                  </span>
                  <span className="font-sans text-xs text-muted-foreground">
                    /mes
                  </span>
                </div>
                {billing === "anual" && (
                  <div className="mt-1 space-y-0.5">
                    <p className="font-sans text-[10px] text-muted-foreground/70">
                      Facturado anualmente · {PRICING.plus.yearTotal}€/año
                    </p>
                    <p
                      className="font-sans text-[10px] font-semibold"
                      style={{ color: "rgb(74,222,128)" }}
                    >
                      Ahorras {PRICING.plus.yearSavings}€ (50%)
                    </p>
                  </div>
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
                <div>
                  <span className="font-display text-3xl text-foreground">
                    {billing === "mensual"
                      ? PRICING.gold.monthly
                      : PRICING.gold.yearMonthly}
                    €
                  </span>
                  <span className="font-sans text-xs text-muted-foreground">
                    /mes
                  </span>
                </div>
                {billing === "anual" && (
                  <div className="mt-1 space-y-0.5">
                    <p className="font-sans text-[10px] text-muted-foreground/70">
                      Facturado anualmente · {PRICING.gold.yearTotal}€/año
                    </p>
                    <p
                      className="font-sans text-[10px] font-semibold"
                      style={{ color: "rgb(74,222,128)" }}
                    >
                      Ahorras {PRICING.gold.yearSavings}€ (50%)
                    </p>
                  </div>
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
            <h3 className="font-display text-lg tracking-wide">Compara los planes</h3>
          </div>
          <table className="w-full table-fixed">
            <thead>
              <tr className="border-b border-border/20">
                <th className="w-[40%] py-3 pl-5 pr-1 text-left font-sans text-[11px] font-normal uppercase tracking-wide text-muted-foreground">
                  &nbsp;
                </th>
                <th className="py-3 px-1 text-center font-display text-sm tracking-wide text-muted-foreground">
                  Free
                </th>
                <th className="py-3 px-1 text-center font-display text-sm tracking-wide text-primary">
                  Plus
                </th>
                <th className="py-3 px-1 text-center font-display text-sm tracking-wide text-yellow-400">
                  Gold
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row) => (
                <tr key={row.label} className="border-b border-border/10 last:border-0">
                  <td className="py-3 pl-5 pr-1 font-sans text-xs text-foreground/90">
                    {row.label}
                  </td>
                  <td className="py-3 px-1 text-center align-middle">
                    <CompareValue value={row.free} />
                  </td>
                  <td className="py-3 px-1 text-center align-middle">
                    <CompareValue value={row.plus} />
                  </td>
                  <td
                    className="py-3 px-1 text-center align-middle"
                    style={{ background: "rgba(234,179,8,0.05)" }}
                  >
                    <CompareValue value={row.gold} gold />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
          ].map((faq, i) => {
            const open = faqOpen === i;
            return (
              <div key={i} className="border-b border-border/20 last:border-0">
                <button
                  className="w-full px-5 py-4 flex items-center justify-between text-left"
                  onClick={() => setFaqOpen(open ? null : i)}
                  aria-expanded={open}
                  data-testid={`button-faq-${i}`}
                >
                  <span className="font-sans text-sm text-foreground/90 pr-4">{faq.q}</span>
                  {open
                    ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  }
                </button>
                {open && (
                  <div className="px-5 pb-4 -mt-1" data-testid={`text-faq-answer-${i}`}>
                    <p className="font-sans text-sm text-muted-foreground leading-relaxed">
                      {faq.a}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-center font-sans text-xs text-muted-foreground/60 pb-2">
          Al suscribirte aceptas nuestros Términos de Servicio y Política de Privacidad.
        </p>
      </div>
    </div>
  );
}
