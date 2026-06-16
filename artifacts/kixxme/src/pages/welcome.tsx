import React, { useState } from "react";
import { useLocation } from "wouter";
import { Menu, Shield, Video, Map as MapIcon, Mic, PhoneOff } from "lucide-react";
import { useAuth, SOCIAL_AUTH_ENABLED } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { KixxMeLogo } from "@/components/brand/kixxme-logo";
import { LegalSidebar } from "@/components/legal-sidebar";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import faceCarlos from "@/assets/face-carlos.png";
import faceMarcos from "@/assets/face-marcos.png";

/* ─────────────────────────────────────────────
   VIDEO CALL CARD — cinematic live call frame
───────────────────────────────────────────── */
function VideoCallCard({
  img, name, startSecs = 0, accent = "#22c55e", callLabel = "EN VIVO",
}: {
  img: string; name: string; startSecs?: number; accent?: string; callLabel?: string;
}) {
  const [elapsed, setElapsed] = React.useState(startSecs);
  React.useEffect(() => {
    const id = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <motion.div
      animate={{
        boxShadow: [
          `0 0 0 1.5px ${accent}cc, 0 0 22px ${accent}66, 0 0 48px ${accent}30, 0 10px 34px rgba(0,0,0,0.75)`,
          `0 0 0 2.5px ${accent}, 0 0 42px ${accent}aa, 0 0 90px ${accent}44, 0 10px 34px rgba(0,0,0,0.75)`,
          `0 0 0 1.5px ${accent}cc, 0 0 22px ${accent}66, 0 0 48px ${accent}30, 0 10px 34px rgba(0,0,0,0.75)`,
        ],
      }}
      transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
      style={{ width: 158, height: 230, borderRadius: 20, overflow: "hidden", position: "relative", flexShrink: 0 }}
    >
      <img src={img} alt={name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />

      {/* Top scrim */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "55%", background: "linear-gradient(to bottom, rgba(0,0,0,0.72), transparent)" }} />
      {/* Bottom scrim */}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.97) 0%, rgba(0,0,0,0.55) 36%, transparent 60%)" }} />

      {/* Subtle color tint by accent */}
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${accent}0a 0%, transparent 50%)`, pointerEvents: "none" }} />

      {/* Top bar: live badge + timer */}
      <div style={{ position: "absolute", top: 10, left: 10, right: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, background: `${accent}22`, border: `1px solid ${accent}77`, borderRadius: 99, padding: "3px 9px 3px 6px", backdropFilter: "blur(8px)" }}>
          <motion.span
            animate={{ opacity: [1, 0.15, 1] }}
            transition={{ duration: 1.0, repeat: Infinity, ease: "easeInOut" }}
            style={{ width: 6, height: 6, borderRadius: "50%", background: accent, flexShrink: 0, boxShadow: `0 0 6px ${accent}` }}
          />
          <span style={{ fontSize: 8.5, fontWeight: 800, color: accent, fontFamily: "Inter,sans-serif", letterSpacing: "0.07em" }}>{callLabel}</span>
        </div>
        <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.88)", fontFamily: "'Courier New',monospace", fontWeight: 700, letterSpacing: "0.06em", textShadow: "0 0 8px rgba(255,255,255,0.4)" }}>
          {fmt(elapsed)}
        </span>
      </div>

      {/* Bottom: name + controls */}
      <div style={{ position: "absolute", bottom: 10, left: 10, right: 10 }}>
        <p style={{ color: "white", fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, letterSpacing: "0.03em", lineHeight: 1.1, marginBottom: 8, textShadow: "0 1px 8px rgba(0,0,0,0.6)" }}>{name}</p>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.13)", border: "1px solid rgba(255,255,255,0.26)", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(6px)" }}>
            <Mic style={{ width: 12, height: 12, color: "white" }} />
          </div>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(239,68,68,0.90)", boxShadow: "0 0 12px rgba(239,68,68,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <PhoneOff style={{ width: 12, height: 12, color: "white" }} />
          </div>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.13)", border: "1px solid rgba(255,255,255,0.26)", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(6px)" }}>
            <Video style={{ width: 12, height: 12, color: "white" }} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────
   PULSE CONNECTOR — neon signal between cards
───────────────────────────────────────────── */
function PulseConnector() {
  return (
    <div style={{ position: "relative", width: 42, height: 42, flexShrink: 0 }}>
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          style={{
            position: "absolute", inset: 0, borderRadius: "50%",
            border: "1.5px solid rgba(168,85,247,0.60)",
          }}
          animate={{ scale: [1, 3.0], opacity: [0.80, 0] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut", delay: i * 0.72 }}
        />
      ))}
      <div style={{
        position: "absolute", inset: 4, borderRadius: "50%",
        background: "conic-gradient(from 180deg, #a855f7, #ec4899, #6366f1, #a855f7)",
        boxShadow: "0 0 18px rgba(168,85,247,1.0), 0 0 38px rgba(168,85,247,0.55), 0 0 70px rgba(168,85,247,0.25)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <KixxMeLogo size={15} />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   WELCOME PAGE
───────────────────────────────────────────── */
const BRAND_GRADIENT = "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))";

const CHIP_ITEMS = [
  { icon: "🚀", label: "Descubre",    active: true  },
  { icon: "📍", label: "Cerca de ti", active: false },
  { icon: "🟢", label: "En línea",    active: false },
  { icon: "⭐", label: "Nuevos",      active: false },
];

const FEATURE_CARDS = [
  { Icon: Video,   label: "Videollamadas",       sub: "Conecta cara a cara"   },
  { Icon: MapIcon, label: "Mapa en tiempo real",  sub: "Descubre chicos cerca" },
  { Icon: Shield,  label: "Perfiles verificados", sub: "Mayor seguridad"       },
];

export default function Welcome() {
  const { loginWithProvider } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [loadingProvider, setLoadingProvider] = useState<"google" | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleProvider = async (provider: "google") => {
    setLoadingProvider(provider);
    try {
      await loginWithProvider(provider);
    } catch (e: any) {
      setLoadingProvider(null);
      toast({
        title: "No disponible",
        description: e?.message ?? "El inicio de sesión con Google no está disponible ahora mismo.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: "#050213", overflowX: "hidden" }}>
      <style>{`
        @keyframes blob1 {
          0%, 100% { transform: translate(0%, 0%) scale(1); }
          30%  { transform: translate(14%, -18%) scale(1.16); }
          65%  { transform: translate(-10%, 12%) scale(0.91); }
        }
        @keyframes blob2 {
          0%, 100% { transform: translate(0%, 0%) scale(1); }
          45%  { transform: translate(-15%, 16%) scale(1.14); }
          80%  { transform: translate(11%, -10%) scale(0.94); }
        }
        @keyframes blob3 {
          0%, 100% { transform: translate(0%, 0%) scale(1); }
          55%  { transform: translate(13%, 15%) scale(1.10); }
        }
      `}</style>

      <LegalSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* ── HEADER ── */}
      <div
        className="relative z-10 sticky top-0"
        style={{ background: "rgba(5,2,19,0.85)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", borderBottom: "1px solid rgba(168,85,247,0.12)" }}
      >
        <div className="flex items-center justify-between px-4 py-3 max-w-[430px] mx-auto">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="w-10 h-10 flex items-center justify-center rounded-xl"
            style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)" }}
            aria-label="Menú"
            data-testid="button-hamburger"
          >
            <Menu className="w-5 h-5 text-white/80" />
          </button>

          <h1
            className="font-display text-[30px] tracking-widest leading-none"
            style={{
              background: "linear-gradient(90deg, hsl(330,90%,68%), hsl(273,90%,74%), hsl(199,88%,68%), hsl(273,90%,74%), hsl(330,90%,68%))",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
              filter: "drop-shadow(0 0 20px rgba(168,85,247,0.70))",
            }}
          >
            KIXXME
          </h1>

          <div className="w-10 h-10" />
        </div>

        <p className="text-center text-white/45 text-[12.5px] font-medium pb-2.5 tracking-wide">
          Conoce chicos. Chatea. Haz videollamadas.
        </p>
      </div>

      {/* ── CATEGORY CHIPS ── */}
      <div className="relative z-10 flex justify-center gap-2 px-3 pt-3 pb-1 max-w-[430px] mx-auto w-full">
        {CHIP_ITEMS.map(({ icon, label, active }) => (
          <div
            key={label}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-sans font-semibold flex-shrink-0"
            style={{
              background: active ? BRAND_GRADIENT : "rgba(255,255,255,0.06)",
              border: active ? "none" : "1px solid rgba(255,255,255,0.12)",
              color: active ? "white" : "rgba(255,255,255,0.58)",
              boxShadow: active ? "0 0 14px rgba(168,85,247,0.42)" : "none",
            }}
          >
            <span>{icon}</span> {label}
          </div>
        ))}
      </div>

      {/* ── HERO LIVE STAGE ── */}
      <div className="relative z-10 w-full overflow-hidden" style={{ paddingBottom: 6 }}>

        {/* Animated aurora blobs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div style={{
            position: "absolute", top: "-15%", left: "-5%", width: "80%", height: "100%",
            background: "radial-gradient(ellipse, rgba(139,92,246,0.38) 0%, transparent 62%)",
            filter: "blur(52px)", animation: "blob1 17s ease-in-out infinite",
          }} />
          <div style={{
            position: "absolute", top: "0%", right: "-15%", width: "65%", height: "85%",
            background: "radial-gradient(ellipse, rgba(236,72,153,0.32) 0%, transparent 62%)",
            filter: "blur(46px)", animation: "blob2 22s ease-in-out infinite",
          }} />
          <div style={{
            position: "absolute", bottom: "-10%", left: "15%", width: "60%", height: "65%",
            background: "radial-gradient(ellipse, rgba(99,102,241,0.28) 0%, transparent 65%)",
            filter: "blur(48px)", animation: "blob3 26s ease-in-out infinite",
          }} />
          {/* Warm gold accent */}
          <div style={{
            position: "absolute", top: "30%", left: "40%", width: "30%", height: "40%",
            background: "radial-gradient(ellipse, rgba(251,191,36,0.10) 0%, transparent 70%)",
            filter: "blur(40px)",
          }} />
        </div>

        {/* "KIXXME LIVE" floating badge */}
        <div className="relative z-10 flex justify-center" style={{ paddingTop: 20, paddingBottom: 18 }}>
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.08 }}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "rgba(255,255,255,0.055)",
              border: "1px solid rgba(168,85,247,0.30)",
              borderRadius: 99, padding: "6px 18px 6px 12px",
              backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
              boxShadow: "0 0 0 1px rgba(168,85,247,0.08), 0 4px 24px rgba(0,0,0,0.40)",
            }}
          >
            <motion.span
              animate={{ opacity: [1, 0.12, 1] }}
              transition={{ duration: 0.85, repeat: Infinity }}
              style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", flexShrink: 0, boxShadow: "0 0 8px #ef4444dd" }}
            />
            <span style={{ fontSize: 11.5, fontWeight: 800, color: "white", fontFamily: "Inter,sans-serif", letterSpacing: "0.09em" }}>KIXXME LIVE</span>
            <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.18)", flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.52)", fontFamily: "Inter,sans-serif", fontWeight: 500 }}>1.247 en línea</span>
          </motion.div>
        </div>

        {/* ── Cards + Connector ── */}
        <div className="relative z-10 flex justify-center items-end" style={{ gap: 16, paddingLeft: 14, paddingRight: 14 }}>

          {/* Marcelo — left, tilted -7° */}
          <motion.div
            initial={{ opacity: 0, x: -28, scale: 0.91 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: 0.70, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
            style={{ rotate: -7, zIndex: 2, flexShrink: 0, transformOrigin: "bottom center" }}
          >
            <motion.div
              animate={{ y: [0, -12, 0] }}
              transition={{ duration: 4.3, repeat: Infinity, ease: "easeInOut" }}
            >
              <VideoCallCard img={faceCarlos} name="Marcelo, 26" startSecs={42} accent="#22c55e" callLabel="EN VIVO" />
            </motion.div>
          </motion.div>

          {/* Pulse Connector */}
          <motion.div
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.55, delay: 0.52, ease: [0.34, 1.56, 0.64, 1] }}
            style={{ marginBottom: 22, flexShrink: 0 }}
          >
            <PulseConnector />
          </motion.div>

          {/* Marcos — right, tilted +6° */}
          <motion.div
            initial={{ opacity: 0, x: 28, scale: 0.91 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: 0.70, delay: 0.28, ease: [0.22, 1, 0.36, 1] }}
            style={{ rotate: 6, zIndex: 1, flexShrink: 0, transformOrigin: "bottom center" }}
          >
            <motion.div
              animate={{ y: [0, -12, 0] }}
              transition={{ duration: 4.9, repeat: Infinity, ease: "easeInOut", delay: 0.9 }}
            >
              <VideoCallCard img={faceMarcos} name="Marcos, 24" startSecs={127} accent="#a855f7" callLabel="LIVE" />
            </motion.div>
          </motion.div>
        </div>

        {/* Stats bar */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.62, delay: 0.58 }}
          className="relative z-10 flex justify-center"
          style={{ paddingTop: 22, paddingBottom: 2 }}
        >
          <div style={{
            display: "inline-flex", alignItems: "stretch",
            background: "rgba(255,255,255,0.042)",
            border: "1px solid rgba(255,255,255,0.095)",
            borderRadius: 18, overflow: "hidden",
            backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
            boxShadow: "0 0 0 1px rgba(168,85,247,0.08), 0 8px 32px rgba(0,0,0,0.45)",
          }}>
            {[
              { value: "1.247", label: "EN LÍNEA", accent: "rgba(34,197,94,0.85)"  },
              { value: "28s",   label: "AL MATCH",  accent: "rgba(168,85,247,0.85)" },
              { value: "98K",   label: "USUARIOS",  accent: "rgba(56,189,248,0.85)" },
            ].map(({ value, label, accent }, i) => (
              <React.Fragment key={label}>
                {i > 0 && <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.08)" }} />}
                <div style={{ padding: "11px 22px", textAlign: "center" }}>
                  <p style={{ fontSize: 17, fontWeight: 800, color: "white", fontFamily: "'Bebas Neue',sans-serif", letterSpacing: "0.05em", lineHeight: 1, textShadow: `0 0 12px ${accent}` }}>{value}</p>
                  <p style={{ fontSize: 7.5, color: "rgba(255,255,255,0.40)", fontFamily: "Inter,sans-serif", letterSpacing: "0.10em", fontWeight: 600, marginTop: 4 }}>{label}</p>
                </div>
              </React.Fragment>
            ))}
          </div>
        </motion.div>
      </div>

      {/* ── CONTENT ── */}
      <div className="relative z-10 w-full max-w-[430px] mx-auto px-5 pt-4 pb-4 flex flex-col items-center">

        {/* Feature strip */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.45 }}
          className="flex items-stretch justify-center gap-2 w-full mb-5"
        >
          {FEATURE_CARDS.map(({ Icon, label, sub }) => (
            <div
              key={label}
              className="flex-1 flex flex-col items-center gap-1.5 px-2 py-3 rounded-2xl text-center"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(168,85,247,0.14)" }}
            >
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, rgba(168,85,247,0.28), rgba(236,72,153,0.18))" }}>
                <Icon className="w-4 h-4 text-purple-300" />
              </div>
              <p className="text-[10px] font-sans font-semibold text-white/85 leading-tight">{label}</p>
              <p className="text-[9px] font-sans text-white/40 leading-tight">{sub}</p>
            </div>
          ))}
        </motion.div>

        {/* CTA buttons */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.58 }}
          className="flex flex-col gap-3 w-full"
        >
          <Button
            type="button"
            onClick={() => setLocation("/signup")}
            className="w-full h-[54px] rounded-2xl font-display text-[22px] tracking-wider border-0 text-white shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all"
            style={{ background: BRAND_GRADIENT, boxShadow: "0 4px 32px rgba(168,85,247,0.50), 0 2px 8px rgba(0,0,0,0.4)" }}
            data-testid="button-signup"
          >
            CREAR CUENTA
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => setLocation("/login")}
            className="w-full h-[52px] rounded-2xl font-display text-[20px] tracking-wider border text-white hover:bg-white/[0.08] transition-all"
            style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.16)" }}
            data-testid="button-login"
          >
            INICIAR SESIÓN
          </Button>

          {SOCIAL_AUTH_ENABLED && (
            <>
              <div className="flex items-center gap-3 my-0.5">
                <span className="h-px flex-1" style={{ background: "rgba(255,255,255,0.08)" }} />
                <span className="text-[11px] font-medium" style={{ color: "rgba(255,255,255,0.35)" }}>o continúa con</span>
                <span className="h-px flex-1" style={{ background: "rgba(255,255,255,0.08)" }} />
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={loadingProvider !== null}
                onClick={() => handleProvider("google")}
                className="w-full h-[50px] gap-3 rounded-2xl border border-white/10 bg-white/[0.08] text-white text-[15px] font-medium hover:bg-white/[0.13] transition-all"
                data-testid="button-google"
              >
                {loadingProvider === "google"
                  ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <GoogleIcon />}
                Continuar con Google
              </Button>
            </>
          )}
        </motion.div>

        {/* Social links */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.85 }}
          className="mt-6 flex flex-col items-center gap-3 w-full"
          data-testid="section-social"
        >
          <div className="flex items-center gap-3 w-full">
            <span className="h-px flex-1" style={{ background: "rgba(255,255,255,0.07)" }} />
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: "rgba(255,255,255,0.30)" }}>Síguenos</span>
            <span className="h-px flex-1" style={{ background: "rgba(255,255,255,0.07)" }} />
          </div>
          <div className="flex items-center gap-3">
            {[
              { href: "https://www.instagram.com/kixxmeapp", label: "Instagram", Icon: InstagramIcon },
              { href: "https://www.tiktok.com/@kixxmeapp",  label: "TikTok",    Icon: TikTokIcon    },
              { href: "https://x.com/kixxmeapp",            label: "X",         Icon: XIcon         },
            ].map(({ href, label, Icon }) => (
              <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={`Síguenos en ${label}`}
                className="flex items-center justify-center w-10 h-10 rounded-xl transition-all hover:scale-105 active:scale-95"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.50)" }}
              >
                <Icon />
              </a>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Footer */}
      <div className="relative z-10 pb-6 pt-1 text-center">
        <span className="text-[11px] font-sans" style={{ color: "rgba(255,255,255,0.22)" }}>🔒 kixxme.com</span>
      </div>
    </div>
  );
}

/* ── Icon helpers ── */
function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}
function InstagramIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17.5" cy="6.5" r="1.25" fill="currentColor" />
    </svg>
  );
}
function TikTokIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.6 5.82a4.28 4.28 0 0 1-2.6-3.82h-3.2v12.86a2.6 2.6 0 1 1-2.6-2.6c.27 0 .53.04.78.12V8.98a5.86 5.86 0 0 0-.78-.05A5.74 5.74 0 1 0 14.4 14.6V8.6a7.45 7.45 0 0 0 4.36 1.4V6.8a4.28 4.28 0 0 1-2.16-.98z" />
    </svg>
  );
}
function XIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817-5.967 6.817H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
