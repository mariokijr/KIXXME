import React, { useState } from "react";
import { useLocation } from "wouter";
import { Heart, X, Star, BadgeCheck } from "lucide-react";
import { useAuth, SOCIAL_AUTH_ENABLED } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { isIOS } from "@/lib/platform";
import { KixxMeLogo } from "@/components/brand/kixxme-logo";
import { Button } from "@/components/ui/button";
import { LegalFooter } from "@/components/legal-footer";
import { motion } from "framer-motion";

const BRAND_GRADIENT = "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))";

const PHONE_PROFILES = [
  {
    name: "Carlos",
    age: 24,
    city: "Barcelona",
    initials: "C",
    bg: "linear-gradient(160deg, hsl(260,75%,32%) 0%, hsl(220,80%,22%) 100%)",
    accent: "rgba(139,92,246,0.6)",
    online: true,
    verified: true,
  },
  {
    name: "Marcos",
    age: 29,
    city: "Madrid",
    initials: "M",
    bg: "linear-gradient(160deg, hsl(330,80%,30%) 0%, hsl(270,65%,22%) 100%)",
    accent: "rgba(236,72,153,0.6)",
    online: true,
    verified: false,
  },
  {
    name: "Alejandro",
    age: 26,
    city: "Valencia",
    initials: "A",
    bg: "linear-gradient(160deg, hsl(190,70%,22%) 0%, hsl(260,75%,28%) 100%)",
    accent: "rgba(56,189,248,0.5)",
    online: false,
    verified: true,
  },
];

function PhoneCard({
  profile,
  width,
  height,
  style,
  delay,
}: {
  profile: typeof PHONE_PROFILES[0];
  width: number;
  height: number;
  style: React.CSSProperties;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay, ease: "easeOut" }}
      style={{
        position: "absolute",
        width,
        height,
        ...style,
      }}
    >
      {/* Phone shell */}
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 36,
          overflow: "hidden",
          background: "rgba(8,6,20,0.96)",
          border: "2px solid rgba(255,255,255,0.12)",
          boxShadow: "0 32px 80px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.04)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Status bar */}
        <div
          style={{
            height: 28,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.4)",
          }}
        >
          <div
            style={{
              width: 64,
              height: 14,
              borderRadius: 8,
              background: "rgba(0,0,0,0.8)",
              border: "1.5px solid rgba(255,255,255,0.1)",
            }}
          />
        </div>

        {/* App header — KixxMe mini */}
        <div
          style={{
            height: 36,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 12px",
            background: "rgba(8,6,18,0.88)",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <KixxMeLogo size={13} withWordmark />
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Heart style={{ width: 11, height: 11, color: "hsl(273,85%,65%)" }} />
          </div>
        </div>

        {/* Profile card */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: profile.bg,
            }}
          />

          {/* Decorative pattern */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: `radial-gradient(circle at 70% 30%, ${profile.accent} 0%, transparent 60%)`,
            }}
          />

          {/* Avatar initials */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: Math.floor(width * 0.45),
                color: "rgba(255,255,255,0.18)",
                lineHeight: 1,
                userSelect: "none",
              }}
            >
              {profile.initials}
            </span>
          </div>

          {/* Top badges */}
          <div
            style={{
              position: "absolute",
              top: 8,
              left: 8,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {profile.online && (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                  padding: "2px 6px",
                  borderRadius: 999,
                  background: "rgba(34,197,94,0.85)",
                  fontSize: 8,
                  fontFamily: "Inter, sans-serif",
                  fontWeight: 600,
                  color: "white",
                }}
              >
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: "white",
                    flexShrink: 0,
                  }}
                />
                En línea
              </span>
            )}
            {profile.verified && (
              <BadgeCheck
                style={{
                  width: Math.floor(width * 0.11),
                  height: Math.floor(width * 0.11),
                  color: "hsl(199,89%,68%)",
                  filter: "drop-shadow(0 0 3px rgba(56,189,248,0.5))",
                }}
              />
            )}
          </div>

          {/* Gradient overlay */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 55%)",
            }}
          />

          {/* Info overlay */}
          <div
            style={{
              position: "absolute",
              bottom: 44,
              left: 10,
              right: 10,
            }}
          >
            <p
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: Math.floor(width * 0.13),
                color: "white",
                lineHeight: 1.1,
                letterSpacing: "0.03em",
              }}
            >
              {profile.name}, {profile.age}
            </p>
            <p
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: Math.floor(width * 0.07),
                color: "rgba(255,255,255,0.65)",
                marginTop: 2,
              }}
            >
              {profile.city}
            </p>
          </div>

          {/* Action buttons */}
          <div
            style={{
              position: "absolute",
              bottom: 8,
              left: 0,
              right: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: Math.floor(width * 0.1),
            }}
          >
            <div
              style={{
                width: Math.floor(width * 0.18),
                height: Math.floor(width * 0.18),
                borderRadius: "50%",
                background: "rgba(20,16,40,0.92)",
                border: "1.5px solid rgba(255,255,255,0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <X
                style={{
                  width: Math.floor(width * 0.1),
                  height: Math.floor(width * 0.1),
                  color: "hsl(0,84%,65%)",
                }}
              />
            </div>
            <div
              style={{
                width: Math.floor(width * 0.14),
                height: Math.floor(width * 0.14),
                borderRadius: "50%",
                background: "linear-gradient(135deg, hsl(199,89%,52%), hsl(273,85%,55%))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 10px rgba(56,189,248,0.35)",
              }}
            >
              <Star
                style={{
                  width: Math.floor(width * 0.08),
                  height: Math.floor(width * 0.08),
                  color: "white",
                  fill: "white",
                }}
              />
            </div>
            <div
              style={{
                width: Math.floor(width * 0.18),
                height: Math.floor(width * 0.18),
                borderRadius: "50%",
                background: "linear-gradient(135deg, hsl(330,85%,52%), hsl(273,85%,55%))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 12px rgba(168,85,247,0.4)",
              }}
            >
              <Heart
                style={{
                  width: Math.floor(width * 0.1),
                  height: Math.floor(width * 0.1),
                  color: "white",
                  fill: "white",
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function Welcome() {
  const { loginWithProvider } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [loadingProvider, setLoadingProvider] = useState<"google" | "apple" | null>(null);
  const showApple = isIOS();

  const handleProvider = async (provider: "google" | "apple") => {
    setLoadingProvider(provider);
    try {
      await loginWithProvider(provider);
    } catch (e: any) {
      setLoadingProvider(null);
      toast({
        title: "No disponible",
        description:
          e?.message ??
          `El inicio de sesión con ${provider === "google" ? "Google" : "Apple"} no está disponible ahora mismo.`,
        variant: "destructive",
      });
    }
  };

  const PW = 210;
  const PH = 400;
  const SW = 180;
  const SH = 345;

  return (
    <div
      className="min-h-[100dvh] flex flex-col relative overflow-hidden"
      style={{ background: "#080612" }}
    >
      {/* ── PHONE MOCKUPS ── */}
      <div className="absolute top-0 left-0 right-0 bottom-0 z-0 overflow-hidden">
        {/* Ambient glow */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 90% 55% at 50% 35%, rgba(139,92,246,0.14) 0%, transparent 70%)",
          }}
        />

        {/* Left phone */}
        <PhoneCard
          profile={PHONE_PROFILES[1]}
          width={SW}
          height={SH}
          style={{
            top: "6%",
            left: "calc(50% - 220px)",
            transform: "rotate(-13deg)",
            zIndex: 1,
            opacity: 0.88,
          }}
          delay={0.15}
        />

        {/* Center phone */}
        <PhoneCard
          profile={PHONE_PROFILES[0]}
          width={PW}
          height={PH}
          style={{
            top: "2%",
            left: "50%",
            transform: "translateX(-50%) rotate(4deg)",
            zIndex: 3,
          }}
          delay={0}
        />

        {/* Right phone */}
        <PhoneCard
          profile={PHONE_PROFILES[2]}
          width={SW}
          height={SH}
          style={{
            top: "9%",
            left: "calc(50% + 70px)",
            transform: "rotate(16deg)",
            zIndex: 2,
            opacity: 0.88,
          }}
          delay={0.25}
        />
      </div>

      {/* Bottom gradient scrim */}
      <div
        className="absolute inset-0 z-[1] pointer-events-none"
        style={{
          background:
            "linear-gradient(to top, #080612 38%, rgba(8,6,18,0.95) 54%, rgba(8,6,18,0.6) 68%, rgba(8,6,18,0.15) 82%, transparent 100%)",
        }}
      />

      {/* ── CONTENT ── */}
      <div className="relative z-10 mt-auto w-full max-w-md mx-auto px-6 pt-4 pb-8 flex flex-col items-center">
        {/* Logo + tagline */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3, ease: "easeOut" }}
          className="flex flex-col items-center mb-7"
        >
          <KixxMeLogo size={56} badge glow />
          <h1 className="mt-4 font-display text-5xl tracking-tight text-gradient-brand leading-none">
            KIXXME
          </h1>
          <p className="mt-2 text-[14px] font-medium text-white/50 text-center leading-snug max-w-[240px]">
            Conoce chicos. Haz conexiones reales.
          </p>
        </motion.div>

        {/* CTA buttons */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.45, ease: "easeOut" }}
          className="flex flex-col gap-3 w-full"
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
        </motion.div>

        {/* Social links */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.65, ease: "easeOut" }}
          className="mt-7 flex flex-col items-center gap-3 w-full"
          data-testid="section-social"
        >
          <div className="flex items-center gap-3 w-full">
            <span className="h-px flex-1 bg-white/8" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/35">
              Síguenos en redes
            </span>
            <span className="h-px flex-1 bg-white/8" />
          </div>

          <div className="flex items-center gap-3">
            <a
              href="https://www.instagram.com/kixxmeapp"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Síguenos en Instagram"
              data-testid="link-instagram"
              className="flex items-center justify-center w-11 h-11 rounded-xl border border-white/8 bg-white/4 text-white/60 hover:bg-white/10 hover:text-white transition-all"
            >
              <InstagramIcon />
            </a>
            <a
              href="https://www.tiktok.com/@kixxmeapp"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Síguenos en TikTok"
              data-testid="link-tiktok"
              className="flex items-center justify-center w-11 h-11 rounded-xl border border-white/8 bg-white/4 text-white/60 hover:bg-white/10 hover:text-white transition-all"
            >
              <TikTokIcon />
            </a>
            <a
              href="https://x.com/kixxmeapp"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Síguenos en X"
              data-testid="link-x"
              className="flex items-center justify-center w-11 h-11 rounded-xl border border-white/8 bg-white/4 text-white/60 hover:bg-white/10 hover:text-white transition-all"
            >
              <XIcon />
            </a>
          </div>
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

function InstagramIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17.5" cy="6.5" r="1.25" fill="currentColor" />
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.6 5.82a4.28 4.28 0 0 1-2.6-3.82h-3.2v12.86a2.6 2.6 0 1 1-2.6-2.6c.27 0 .53.04.78.12V8.98a5.86 5.86 0 0 0-.78-.05A5.74 5.74 0 1 0 14.4 14.6V8.6a7.45 7.45 0 0 0 4.36 1.4V6.8a4.28 4.28 0 0 1-2.16-.98z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817-5.967 6.817H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
