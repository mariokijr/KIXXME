import React, { createContext, useContext, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { Crown, X, Sparkles, Video, MessageCircle } from "lucide-react";

interface GoldUpsellOptions {
  title?: string;
  subtitle?: string;
}

interface GoldUpsellValue {
  /** Show the "this needs Gold → upgrade" modal. */
  showGold: (opts?: GoldUpsellOptions) => void;
}

const GoldUpsellContext = createContext<GoldUpsellValue>({
  showGold: () => {},
});

const ADVANTAGES = [
  { icon: MessageCircle, text: "Inicia chats sin necesidad de match" },
  { icon: Video, text: "Videollamadas privadas en KixxMe Live" },
  { icon: Sparkles, text: "Mapa en tiempo real y filtros avanzados" },
];

/**
 * Mounted once near the app root. Any surface that hits a Gold-only gate
 * (starting a conversation without a match, KixxMe Live video calls) calls
 * `useGoldUpsell().showGold()` to block the action with a clear, on-brand
 * "Hazte Gold" modal instead of a transient toast.
 */
export function GoldUpsellProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GoldUpsellOptions | null>(null);
  const [, setLocation] = useLocation();

  const showGold = useCallback((opts?: GoldUpsellOptions) => {
    setState(opts ?? {});
  }, []);
  const close = useCallback(() => setState(null), []);

  const goPremium = () => {
    close();
    setLocation("/premium");
  };

  const title = state?.title || "Función exclusiva de Gold";
  const subtitle =
    state?.subtitle ||
    "Hazte Gold para desbloquear esta función y conectar sin límites.";

  return (
    <GoldUpsellContext.Provider value={{ showGold }}>
      {children}
      {state && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center px-6 animate-in fade-in duration-200"
          style={{ background: "rgba(8,7,18,0.92)", backdropFilter: "blur(12px)" }}
          onClick={close}
          data-testid="overlay-gold-upsell"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm rounded-2xl border p-7 flex flex-col items-center text-center gap-5 animate-in zoom-in-95 duration-200"
            style={{
              background: "linear-gradient(160deg, hsl(38 38% 11%), hsl(238 28% 7%))",
              borderColor: "rgba(245,200,90,0.4)",
              boxShadow: "0 0 60px rgba(245,200,90,0.22)",
            }}
          >
            <button
              onClick={close}
              aria-label="Cerrar"
              className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              data-testid="button-gold-close"
            >
              <X className="w-5 h-5" />
            </button>

            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, hsl(45,92%,58%), hsl(36,92%,50%))",
                boxShadow: "0 0 36px rgba(245,200,90,0.5)",
              }}
            >
              <Crown className="w-8 h-8 text-white" fill="currentColor" />
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
                    style={{ background: "rgba(245,200,90,0.15)" }}
                  >
                    <Icon className="w-4 h-4 text-[hsl(44,90%,66%)]" />
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
                  background: "linear-gradient(135deg, hsl(45,92%,55%), hsl(36,92%,48%))",
                }}
                data-testid="button-gold-premium"
              >
                Hazte Gold
              </button>
              <button
                onClick={close}
                className="h-11 rounded-xl font-sans text-sm text-muted-foreground border border-border/40 hover:text-foreground transition-colors"
                data-testid="button-gold-dismiss"
              >
                Ahora no
              </button>
            </div>
          </div>
        </div>
      )}
    </GoldUpsellContext.Provider>
  );
}

export function useGoldUpsell() {
  return useContext(GoldUpsellContext);
}
