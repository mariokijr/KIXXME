import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { KixxMeLogo } from "@/components/brand/kixxme-logo";

const KEY_PREFIX = "kixxme:welcome-pending:";

/** localStorage key for the one-time post-registration welcome flag. */
export function welcomeKey(userId: string) {
  return `${KEY_PREFIX}${userId}`;
}

/**
 * Clear the pending welcome flag for a user. Used by the onboarding tutorial,
 * which supersedes the welcome modal — once the mandatory tour runs we never want
 * the standalone welcome popping up later.
 */
export function clearWelcomePending(userId: string) {
  try {
    localStorage.removeItem(welcomeKey(userId));
  } catch {
    // localStorage unavailable — nothing to clear.
  }
}

/**
 * Mounted once near the app root. After a successful registration the signup
 * flow writes `kixxme:welcome-pending:<userId>` to localStorage; this modal
 * shows once for that user and clears the flag on dismiss, so it never appears
 * again and never shows for pre-existing accounts.
 */
export function WelcomeModal() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) {
      setOpen(false);
      return;
    }
    try {
      if (localStorage.getItem(welcomeKey(user.id))) setOpen(true);
    } catch {
      // localStorage unavailable — skip the welcome rather than crash.
    }
  }, [user]);

  const dismiss = () => {
    if (user) {
      try {
        localStorage.removeItem(welcomeKey(user.id));
      } catch {
        // ignore storage errors
      }
    }
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-6 animate-in fade-in duration-200"
      style={{ background: "rgba(8,7,18,0.92)", backdropFilter: "blur(12px)" }}
      onClick={dismiss}
      data-testid="overlay-welcome"
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
        <KixxMeLogo size={64} badge />

        <div className="flex flex-col gap-3">
          <h2
            className="font-display text-3xl tracking-wide text-gradient-brand"
            data-testid="text-welcome-title"
          >
            ¡Bienvenido a KixxMe! 🎉
          </h2>
          <p className="font-sans text-sm text-muted-foreground leading-relaxed">
            Esperamos que disfrutes de la experiencia.
          </p>
          <div
            className="flex items-start gap-3 rounded-xl p-3 text-left"
            style={{ background: "rgba(168,85,247,0.10)" }}
          >
            <ShieldCheck className="w-5 h-5 text-[hsl(280,80%,72%)] shrink-0 mt-0.5" />
            <p className="font-sans text-sm text-foreground/90 leading-relaxed">
              Respeta siempre a los demás usuarios, sé educado y ayuda a crear una comunidad
              agradable para todos.
            </p>
          </div>
          <p className="font-sans text-sm text-muted-foreground leading-relaxed">
            Diviértete, conoce gente nueva y disfruta de KixxMe.
          </p>
        </div>

        <button
          onClick={dismiss}
          className="h-12 w-full rounded-xl font-display text-lg tracking-widest text-white hover:opacity-90 transition-opacity border-0"
          style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))" }}
          data-testid="button-welcome-start"
        >
          Empezar
        </button>
      </div>
    </div>
  );
}
