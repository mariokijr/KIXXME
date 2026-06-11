import React from "react";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { KixxMeLogo } from "@/components/brand/kixxme-logo";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import bgImage from "@/assets/bg-neon-bokeh.png";

export default function AuthCallback() {
  const { adoptOAuthSession } = useAuth();
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const raw = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
    const params = new URLSearchParams(raw);

    const errDesc = params.get("error_description") || params.get("error");
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const expiresAtRaw = params.get("expires_at");
    const expiresInRaw = params.get("expires_in");

    window.history.replaceState({}, "", window.location.pathname + window.location.search);

    // A disabled/unconfigured provider (or a user-cancelled grant) lands here with
    // an error param instead of tokens. URLSearchParams already decoded the value,
    // so we don't re-decode (a literal "%" would throw); we show a friendly Spanish
    // message rather than the raw GoTrue text.
    if (errDesc) {
      setError(
        "No se pudo iniciar sesión con el proveedor. Es posible que no esté disponible ahora mismo. Inténtalo de nuevo o entra con tu correo.",
      );
      return;
    }
    if (!accessToken || !refreshToken) {
      setError("No se pudo completar el inicio de sesión. Inténtalo de nuevo.");
      return;
    }

    const expires_at = expiresAtRaw ? Number(expiresAtRaw) : Math.floor(Date.now() / 1000) + (expiresInRaw ? Number(expiresInRaw) : 3600);

    adoptOAuthSession({ access_token: accessToken, refresh_token: refreshToken, expires_at }).catch((e: any) => {
      setError(e?.message ?? "No se pudo completar el inicio de sesión.");
    });
  }, []);

  return (
    <div className="min-h-[100dvh] flex flex-col relative bg-[#0a0715] overflow-x-hidden items-center justify-center">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <img src={bgImage} alt="" className="w-full h-full object-cover opacity-50 mix-blend-screen" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0715]/60 via-[#0a0715]/80 to-[#0a0715]" />
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm text-center px-6 relative z-10"
      >
        <div className="flex justify-center mb-8">
          <KixxMeLogo size={80} badge glow />
        </div>

        {error ? (
          <div className="border border-red-500/30 rounded-3xl p-8 space-y-6 bg-red-500/5 backdrop-blur-md shadow-2xl" data-testid="panel-oauth-error">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-500 to-orange-500 p-[1px] shadow-[0_0_20px_rgba(239,68,68,0.3)]">
                <div className="w-full h-full bg-[#0a0715] rounded-2xl flex items-center justify-center">
                  <AlertTriangle className="w-8 h-8 text-red-400" strokeWidth={1.5} />
                </div>
              </div>
            </div>
            <p className="text-[15px] font-medium text-white/80 leading-relaxed">
              {error}
            </p>
            <Link href="/login" data-testid="link-back-login">
              <Button
                type="button"
                className="w-full h-[52px] mt-2 rounded-2xl font-display text-[20px] tracking-wider border-0 text-white shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all"
                style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))" }}
              >
                VOLVER
              </Button>
            </Link>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-6" data-testid="panel-oauth-loading">
            <Loader2 className="w-10 h-10 animate-spin text-[#d946ef] drop-shadow-[0_0_8px_rgba(217,70,239,0.8)]" />
            <p className="text-white/80 font-medium tracking-wide">
              Autenticando...
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
