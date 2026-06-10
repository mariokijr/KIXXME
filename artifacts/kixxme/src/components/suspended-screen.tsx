import React from "react";
import { useAuth } from "@/lib/auth";
import { KixxMeLogo } from "@/components/brand/kixxme-logo";
import { ShieldAlert, Ban, Trash2 } from "lucide-react";

interface SuspendedScreenProps {
  state: "suspended" | "banned" | "removed";
  reason?: string | null;
  suspendedUntil?: string | null;
}

function formatUntil(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-ES", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/**
 * Full-screen block shown to a suspended or banned user. The server already
 * rejects their API calls with 403; this gives them a clear Spanish explanation
 * plus a way to contact support or sign out.
 */
export function SuspendedScreen({
  state,
  reason,
  suspendedUntil,
}: SuspendedScreenProps) {
  const { logout } = useAuth();
  const banned = state === "banned";
  const removed = state === "removed";
  const permanent = banned || removed;

  const title = removed
    ? "Cuenta eliminada"
    : banned
      ? "Cuenta bloqueada"
      : "Cuenta suspendida";
  const description = removed
    ? "Tu cuenta ha sido eliminada por un administrador por incumplir las normas de la comunidad de KixxMe."
    : banned
      ? "Tu cuenta ha sido bloqueada de forma permanente por incumplir las normas de la comunidad de KixxMe."
      : "Tu cuenta está temporalmente suspendida por incumplir las normas de la comunidad de KixxMe.";

  return (
    <div
      className="min-h-[100dvh] w-full flex flex-col items-center justify-center gap-6 px-6 text-center"
      style={{
        background:
          "radial-gradient(ellipse 80% 60% at 50% 0%, hsl(270 40% 12%) 0%, hsl(238 25% 5%) 65%)",
      }}
    >
      <KixxMeLogo size={64} badge />

      <div
        className={`flex h-16 w-16 items-center justify-center rounded-2xl ${
          permanent
            ? "bg-red-500/15 text-red-400"
            : "bg-amber-500/15 text-amber-400"
        }`}
      >
        {removed ? (
          <Trash2 className="h-8 w-8" />
        ) : banned ? (
          <Ban className="h-8 w-8" />
        ) : (
          <ShieldAlert className="h-8 w-8" />
        )}
      </div>

      <div className="space-y-2 max-w-sm">
        <h1 className="font-display text-3xl tracking-widest text-gradient-brand">
          {title}
        </h1>
        <p className="font-sans text-sm text-muted-foreground">{description}</p>
        {!permanent && suspendedUntil && (
          <p className="font-sans text-sm text-foreground">
            Podrás volver a acceder el{" "}
            <span className="font-semibold">{formatUntil(suspendedUntil)}</span>.
          </p>
        )}
        {reason && (
          <p className="font-sans text-xs text-muted-foreground/80 italic">
            Motivo: {reason}
          </p>
        )}
      </div>

      <div className="flex flex-col items-center gap-3 w-full max-w-xs">
        <a
          href="mailto:supportkixxme@gmail.com"
          className="w-full h-11 rounded-xl border border-border/60 bg-input/30 flex items-center justify-center font-display text-sm tracking-widest text-foreground hover:border-primary/50 transition-colors"
          data-testid="link-suspended-support"
        >
          Contactar soporte
        </a>
        <button
          type="button"
          onClick={logout}
          className="w-full h-11 rounded-xl font-display text-sm tracking-widest text-muted-foreground hover:text-foreground transition-colors"
          data-testid="button-suspended-logout"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
