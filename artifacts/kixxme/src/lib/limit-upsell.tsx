import React, { createContext, useContext, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { Heart, Star, Eye, Sparkles, X } from "lucide-react";

type LimitKind = "like" | "superlike";

interface LimitUpsellValue {
  /** Show the "out of likes/superlikes → go Premium" modal. */
  showLimit: (kind: LimitKind, message?: string | null) => void;
}

const LimitUpsellContext = createContext<LimitUpsellValue>({
  showLimit: () => {},
});

const ADVANTAGES = [
  { icon: Heart, text: "Me gusta ilimitados" },
  { icon: Star, text: "Más SuperLikes para destacar" },
  { icon: Eye, text: "Mira quién visitó tu perfil" },
  { icon: Sparkles, text: "Filtros avanzados y KixxMe Live" },
];

/**
 * Mounted once near the app root. Any surface that hits a like/SuperLike quota
 * (discover, favorites, public profile, swipe, map) calls
 * `useLimitUpsell().showLimit(kind)` to block the action with a clear,
 * on-brand "Hazte Premium" modal instead of a transient toast.
 */
export function LimitUpsellProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ kind: LimitKind; message?: string | null } | null>(null);
  const [, setLocation] = useLocation();

  const showLimit = useCallback((kind: LimitKind, message?: string | null) => {
    setState({ kind, message });
  }, []);
  const close = useCallback(() => setState(null), []);

  const goPremium = () => {
    close();
    setLocation("/premium");
  };

  const isSuper = state?.kind === "superlike";
  const title = isSuper ? "Sin SuperLikes disponibles" : "Has alcanzado tu límite de Me gusta";
  const subtitle =
    state?.message ||
    (isSuper
      ? "Has usado tu SuperLike de hoy. Hazte Premium para enviar más y destacar entre la multitud."
      : "Has usado todos tus Me gusta por ahora. Hazte Premium para dar Me gusta sin límites.");

  return (
    <LimitUpsellContext.Provider value={{ showLimit }}>
      {children}
      {state && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center px-6 animate-in fade-in duration-200"
          style={{ background: "rgba(8,7,18,0.92)", backdropFilter: "blur(12px)" }}
          onClick={close}
          data-testid="overlay-limit-upsell"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm rounded-2xl border p-7 flex flex-col items-center text-center gap-5 animate-in zoom-in-95 duration-200"
            style={{
              background: "linear-gradient(160deg, hsl(270 35% 11%), hsl(238 28% 7%))",
              borderColor: "rgba(168,85,247,0.35)",
              boxShadow: "0 0 60px rgba(168,85,247,0.25)",
            }}
          >
            <button
              onClick={close}
              aria-label="Cerrar"
              className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              data-testid="button-limit-close"
            >
              <X className="w-5 h-5" />
            </button>

            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
                boxShadow: "0 0 36px rgba(236,72,153,0.5)",
              }}
            >
              {isSuper ? (
                <Star className="w-8 h-8 text-white" fill="currentColor" />
              ) : (
                <Heart className="w-8 h-8 text-white" fill="currentColor" />
              )}
            </div>

            <div className="flex flex-col gap-2">
              <h2 className="font-display text-2xl tracking-wide text-foreground">{title}</h2>
              <p className="font-sans text-sm text-muted-foreground leading-relaxed">{subtitle}</p>
            </div>

            <ul className="w-full flex flex-col gap-2.5 text-left">
              {ADVANTAGES.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3">
                  <span
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: "rgba(168,85,247,0.15)" }}
                  >
                    <Icon className="w-4 h-4 text-[hsl(280,80%,72%)]" />
                  </span>
                  <span className="font-sans text-sm text-foreground/90">{text}</span>
                </li>
              ))}
            </ul>

            <div className="flex flex-col gap-2.5 w-full pt-1">
              <button
                onClick={goPremium}
                className="h-12 rounded-xl font-display text-lg tracking-widest text-white hover:opacity-90 transition-opacity border-0"
                style={{
                  background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
                }}
                data-testid="button-limit-premium"
              >
                Hazte Premium
              </button>
              <button
                onClick={close}
                className="h-11 rounded-xl font-sans text-sm text-muted-foreground border border-border/40 hover:text-foreground transition-colors"
                data-testid="button-limit-dismiss"
              >
                Ahora no
              </button>
            </div>
          </div>
        </div>
      )}
    </LimitUpsellContext.Provider>
  );
}

export function useLimitUpsell() {
  return useContext(LimitUpsellContext);
}
