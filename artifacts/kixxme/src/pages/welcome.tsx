import React, { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Users, Video, Heart, ShieldCheck, BadgeCheck } from "lucide-react";
import { useAuth, SOCIAL_AUTH_ENABLED } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { isIOS } from "@/lib/platform";
import { KixxMeLogo } from "@/components/brand/kixxme-logo";
import { Button } from "@/components/ui/button";
import { LegalFooter } from "@/components/legal-footer";
import { motion, AnimatePresence } from "framer-motion";
import bgImage from "@/assets/bg-neon-bokeh.png";

const BRAND_GRADIENT = "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))";

const INFO_CARDS = [
  {
    icon: <Users className="w-8 h-8" strokeWidth={1.5} />,
    title: "Conoce gente nueva",
    desc: "Descubre chicos y perfiles cerca de ti o en cualquier parte del mundo con nuestro radar preciso.",
  },
  {
    icon: <Video className="w-8 h-8" strokeWidth={1.5} />,
    title: "Haz videollamadas seguras",
    desc: "Conecta cara a cara de forma privada, segura y sin grabaciones. Siente la química al instante.",
  },
  {
    icon: <Heart className="w-8 h-8" strokeWidth={1.5} />,
    title: "Conecta con personas",
    desc: "Un espacio diseñado para que personas auténticas creen conexiones reales en una comunidad segura y acogedora.",
  },
  {
    icon: <ShieldCheck className="w-8 h-8" strokeWidth={1.5} />,
    title: "Privacidad y seguridad",
    desc: "Tú controlas qué ven los demás. Bloquea, denuncia y mantén tu entorno libre de toxicidad.",
  },
  {
    icon: <BadgeCheck className="w-8 h-8" strokeWidth={1.5} />,
    title: "Perfiles verificados",
    desc: "Nuestra insignia de verificación te garantiza que estás hablando con la persona que ves en las fotos.",
  },
];

export default function Welcome() {
  const { loginWithProvider } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [loadingProvider, setLoadingProvider] = useState<"google" | "apple" | null>(null);
  const showApple = isIOS();

  const [activeIndex, setActiveIndex] = useState(0);

  // Auto-advance carousel
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % INFO_CARDS.length);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  const handleProvider = async (provider: "google" | "apple") => {
    setLoadingProvider(provider);
    try {
      await loginWithProvider(provider);
    } catch (e: any) {
      setLoadingProvider(null);
      toast({
        title: "No disponible",
        description: e?.message ?? `El inicio de sesión con ${provider === "google" ? "Google" : "Apple"} no está disponible ahora mismo.`,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col relative overflow-hidden bg-[#0a0715]">
      {/* Background Image & Scrim */}
      <div className="absolute inset-0 z-0">
        <img src={bgImage} alt="" className="w-full h-full object-cover opacity-60 mix-blend-screen" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0715]/40 via-[#0a0715]/80 to-[#0a0715]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,#0a0715_100%)] opacity-80" />
      </div>

      <div className="flex-1 relative z-10 w-full max-w-md mx-auto px-6 py-12 flex flex-col justify-between">
        
        {/* Header & Logo */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="flex flex-col items-center text-center mt-4"
        >
          <KixxMeLogo size={100} badge glow />
          <h1 className="mt-6 font-display text-6xl tracking-tight text-gradient-brand leading-none">
            KIXXME
          </h1>
          <p className="mt-3 text-[15px] font-medium text-white/70 max-w-[280px] leading-relaxed">
            Tu próxima conexión empieza aquí. Descubre una comunidad vibrante.
          </p>
        </motion.div>

        {/* Carousel */}
        <div className="my-10 h-[190px] relative w-full" data-testid="carousel-info">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeIndex}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
              className="absolute inset-0 flex flex-col items-center text-center px-4"
              data-testid={`card-info-${activeIndex}`}
            >
              <div 
                className="w-16 h-16 rounded-2xl flex items-center justify-center text-white mb-5 shadow-lg glow-purple"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(12px)" }}
              >
                {INFO_CARDS[activeIndex].icon}
              </div>
              <h3 className="font-display tracking-wide text-2xl text-white mb-2">
                {INFO_CARDS[activeIndex].title}
              </h3>
              <p className="text-[13px] text-white/60 leading-relaxed max-w-[300px]">
                {INFO_CARDS[activeIndex].desc}
              </p>
            </motion.div>
          </AnimatePresence>

          {/* Dots */}
          <div className="absolute -bottom-6 left-0 right-0 flex justify-center gap-2">
            {INFO_CARDS.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveIndex(i)}
                className={`transition-all duration-300 rounded-full ${
                  i === activeIndex ? "w-6 h-1.5 bg-[#d946ef] shadow-[0_0_8px_rgba(217,70,239,0.8)]" : "w-1.5 h-1.5 bg-white/20 hover:bg-white/40"
                }`}
                aria-label={`Ir a diapositiva ${i + 1}`}
              />
            ))}
          </div>
        </div>

        {/* Auth CTAs */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
          className="flex flex-col gap-3 w-full mt-4"
        >
          <Button
            type="button"
            onClick={() => setLocation("/signup")}
            className="w-full h-[52px] rounded-2xl font-display text-[22px] tracking-wider border-0 text-white shadow-xl glow-purple hover:scale-[1.02] active:scale-[0.98] transition-all"
            style={{ background: BRAND_GRADIENT }}
            data-testid="button-signup"
          >
            CREAR CUENTA
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => setLocation("/login")}
            className="w-full h-[52px] rounded-2xl font-display text-[20px] tracking-wider border border-white/10 bg-white/5 text-white hover:bg-white/10 hover:border-white/20 transition-all backdrop-blur-md"
            data-testid="button-login"
          >
            INICIAR SESIÓN
          </Button>

          {SOCIAL_AUTH_ENABLED && (
            <>
              <div className="flex items-center gap-3 my-1">
                <span className="h-px flex-1 bg-white/10" />
                <span className="text-xs font-medium text-white/40">o continúa con</span>
                <span className="h-px flex-1 bg-white/10" />
              </div>

              <Button
                type="button"
                variant="outline"
                disabled={loadingProvider !== null}
                onClick={() => handleProvider("google")}
                className="w-full h-[52px] gap-3 rounded-2xl border border-white/10 bg-white/5 text-white text-[15px] font-medium hover:bg-white/10 hover:border-white/20 transition-all backdrop-blur-md"
                data-testid="button-google"
              >
                {loadingProvider === "google" ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <GoogleIcon />
                )}
                Continuar con Google
              </Button>

              {showApple && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={loadingProvider !== null}
                  onClick={() => handleProvider("apple")}
                  className="w-full h-[52px] gap-3 rounded-2xl border border-white/10 bg-white/5 text-white text-[15px] font-medium hover:bg-white/10 hover:border-white/20 transition-all backdrop-blur-md"
                  data-testid="button-apple"
                >
                  {loadingProvider === "apple" ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <AppleIcon />
                  )}
                  Continuar con Apple
                </Button>
              )}
            </>
          )}

          <Link
            href="/forgot-password"
            className="mt-4 text-center text-sm font-medium text-white/50 hover:text-white transition-colors"
            data-testid="link-forgot"
          >
            He olvidado mi contraseña
          </Link>
        </motion.div>

        <LegalFooter />
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="white" aria-hidden="true">
      <path d="M16.36 1.43c0 1.14-.42 2.2-1.25 3.06-.99 1.02-2.18 1.61-3.47 1.51a3.5 3.5 0 0 1-.03-.43c0-1.09.48-2.26 1.27-3.08.4-.42.9-.77 1.51-1.05.6-.27 1.17-.42 1.71-.44.02.15.03.29.03.43zM20.5 17.04c-.3.69-.45 1-.83 1.61-.54.85-1.3 1.91-2.24 1.92-.84.01-1.05-.55-2.18-.54-1.13 0-1.37.55-2.2.55-.95.01-1.67-.96-2.21-1.81-1.5-2.37-1.66-5.15-.73-6.63.66-1.05 1.69-1.66 2.67-1.66.99 0 1.61.55 2.43.55.8 0 1.28-.55 2.43-.55.86 0 1.78.47 2.43 1.28-2.13 1.17-1.79 4.22.4 5.28z" />
    </svg>
  );
}
