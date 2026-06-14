import React, { useState } from "react";
import { useLocation } from "wouter";
import {
  Heart, X, Star, BadgeCheck,
  MapPin, Video, PhoneOff, Mic, Camera,
} from "lucide-react";
import { useAuth, SOCIAL_AUTH_ENABLED } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { isIOS } from "@/lib/platform";
import { KixxMeLogo } from "@/components/brand/kixxme-logo";
import { Button } from "@/components/ui/button";
import { LegalFooter } from "@/components/legal-footer";
import { motion } from "framer-motion";
import faceCarlos from "@/assets/face-carlos.png";
import faceMarcos from "@/assets/face-marcos.png";
import faceAlejandro from "@/assets/face-alejandro.png";

const BRAND_GRADIENT = "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))";

/* ─────────────────────────────────────────────────────────────
   SCREEN: Video call — two guys face-to-face (KixxMe Live)
───────────────────────────────────────────────────────────── */
const FACE_CARLOS = faceCarlos;
const FACE_MARCOS = faceMarcos;
const FACE_ALEJANDRO = faceAlejandro;

function VideoCallScreen({ w, h }: { w: number; h: number }) {
  const r = Math.max(12, Math.floor(w * 0.12));

  return (
    <div style={{ position: "absolute", inset: 0, background: "#040310", display: "flex", flexDirection: "column" }}>
      {/* Live badge header */}
      <div style={{
        height: 30, flexShrink: 0, display: "flex", alignItems: "center",
        justifyContent: "space-between", padding: "0 10px",
        background: "rgba(0,0,0,0.55)", borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}>
        <span style={{
          display: "flex", alignItems: "center", gap: 3,
          padding: "1px 6px", borderRadius: 99,
          background: "rgba(239,68,68,0.9)", fontSize: 8, fontWeight: 700, color: "white",
        }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "white", flexShrink: 0 }} />
          LIVE
        </span>
        <span style={{ fontSize: 8, color: "rgba(255,255,255,0.4)", fontFamily: "Inter,sans-serif", fontWeight: 600, letterSpacing: "0.05em" }}>
          KixxMe Live
        </span>
        <Video style={{ width: 12, height: 12, color: "rgba(168,85,247,0.8)" }} />
      </div>

      {/* Caller 1 — Marcelo */}
      <div style={{ flex: 1, position: "relative", margin: "4px 4px 2px 4px", borderRadius: r, overflow: "hidden" }}>
        <img
          src={FACE_CARLOS}
          alt="Marcelo"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }}
        />
        {/* purple tint overlay */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg, rgba(88,28,220,0.25) 0%, transparent 60%)" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 45%)" }} />
        <div style={{ position: "absolute", bottom: 6, left: 8, display: "flex", alignItems: "center", gap: 4 }}>
          <BadgeCheck style={{ width: 10, height: 10, color: "hsl(199,89%,65%)" }} />
          <span style={{ fontSize: 9, color: "white", fontFamily: "Inter,sans-serif", fontWeight: 600 }}>Marcelo, 26</span>
        </div>
      </div>

      {/* Caller 2 — Marcos */}
      <div style={{ flex: 1, position: "relative", margin: "2px 4px 4px 4px", borderRadius: r, overflow: "hidden" }}>
        <img
          src={FACE_MARCOS}
          alt="Marcos"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }}
        />
        {/* pink tint overlay */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg, rgba(180,20,120,0.2) 0%, transparent 60%)" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 45%)" }} />
        <div style={{ position: "absolute", bottom: 6, left: 8 }}>
          <span style={{ fontSize: 9, color: "white", fontFamily: "Inter,sans-serif", fontWeight: 600 }}>Marcos, 24</span>
        </div>
      </div>

      {/* Controls */}
      <div style={{
        height: 40, flexShrink: 0, display: "flex", alignItems: "center",
        justifyContent: "center", gap: 12, paddingBottom: 4,
      }}>
        {[
          { Icon: Mic, bg: "rgba(255,255,255,0.08)", sz: 11 },
          { Icon: PhoneOff, bg: "rgba(239,68,68,0.85)", sz: 13 },
          { Icon: Camera, bg: "rgba(255,255,255,0.08)", sz: 11 },
        ].map(({ Icon, bg, sz }, i) => (
          <div key={i} style={{
            width: i === 1 ? 30 : 26, height: i === 1 ? 30 : 26,
            borderRadius: "50%", background: bg,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Icon style={{ width: sz, height: sz, color: "white" }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   SCREEN: Profile / Swipe card
───────────────────────────────────────────────────────────── */
function ProfileCardScreen({ w }: { w: number }) {
  return (
    <div style={{ position: "absolute", inset: 0, background: "#0a0820" }}>
      {/* Face photo */}
      <img
        src={FACE_ALEJANDRO}
        alt="Alejandro"
        style={{ position: "absolute", inset: 0, width: "100%", height: "75%", objectFit: "cover", objectPosition: "top" }}
      />
      {/* brand tint */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(160deg, rgba(88,28,220,0.18) 0%, transparent 50%)",
      }} />
      {/* Top badges */}
      <div style={{ position: "absolute", top: 10, left: 8, display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{
          display: "flex", alignItems: "center", gap: 3,
          padding: "2px 7px", borderRadius: 99,
          background: "rgba(34,197,94,0.85)", fontSize: 8, fontWeight: 600, color: "white",
        }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "white", flexShrink: 0 }} />
          En línea
        </span>
        <BadgeCheck style={{ width: 14, height: 14, color: "hsl(199,89%,65%)", filter: "drop-shadow(0 0 3px rgba(56,189,248,0.5))" }} />
      </div>
      {/* Swipe hint (faint) */}
      <div style={{
        position: "absolute", top: "28%", left: 8,
        padding: "3px 8px", borderRadius: 8,
        border: "2.5px solid rgba(34,197,94,0.6)", color: "rgba(34,197,94,0.8)",
        fontFamily: "'Bebas Neue',sans-serif", fontSize: 14, letterSpacing: "0.08em",
        transform: "rotate(-14deg)", opacity: 0.8,
      }}>ME GUSTA</div>
      {/* Gradient overlay */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 55%)",
      }} />
      {/* Info */}
      <div style={{ position: "absolute", bottom: 44, left: 10, right: 10 }}>
        <p style={{
          fontFamily: "'Bebas Neue',sans-serif", fontSize: Math.floor(w * 0.13),
          color: "white", lineHeight: 1.1, letterSpacing: "0.03em",
        }}>Alejandro, 22</p>
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3 }}>
          <span style={{
            padding: "1px 6px", borderRadius: 99, fontSize: 8,
            background: "rgba(168,85,247,0.4)", border: "1px solid rgba(168,85,247,0.5)",
            color: "rgba(255,255,255,0.9)", fontFamily: "Inter,sans-serif", fontWeight: 500,
          }}>Activo</span>
          <span style={{
            padding: "1px 6px", borderRadius: 99, fontSize: 8,
            background: "rgba(236,72,153,0.35)", border: "1px solid rgba(236,72,153,0.45)",
            color: "rgba(255,255,255,0.9)", fontFamily: "Inter,sans-serif", fontWeight: 500,
          }}>Relación</span>
          <span style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 8, color: "rgba(255,255,255,0.5)", fontFamily: "Inter,sans-serif" }}>
            <MapPin style={{ width: 8, height: 8 }} />2 km
          </span>
        </div>
      </div>
      {/* Action buttons */}
      <div style={{
        position: "absolute", bottom: 8, left: 0, right: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: Math.floor(w * 0.09),
      }}>
        {[
          { Icon: X, bg: "rgba(16,12,36,0.92)", border: "1.5px solid rgba(255,255,255,0.12)", color: "hsl(0,84%,65%)", size: 0.18 },
          { Icon: Star, bg: "linear-gradient(135deg, hsl(199,89%,52%), hsl(273,85%,55%))", border: "none", color: "white", size: 0.14, fill: true, shadow: "0 0 10px rgba(56,189,248,0.4)" },
          { Icon: Heart, bg: BRAND_GRADIENT, border: "none", color: "white", size: 0.18, fill: true, shadow: "0 0 12px rgba(168,85,247,0.45)" },
        ].map(({ Icon, bg, border, color, size, fill, shadow }, i) => (
          <div key={i} style={{
            width: Math.floor(w * size), height: Math.floor(w * size),
            borderRadius: "50%", background: bg,
            border: border as string | undefined,
            boxShadow: shadow,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Icon style={{
              width: Math.floor(w * size * 0.5), height: Math.floor(w * size * 0.5),
              color, fill: fill ? color : "transparent",
            }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   SCREEN: Real-time map
───────────────────────────────────────────────────────────── */
const MAP_DOTS = [
  // right-half — main visible strip
  { x: 52, y: 12, gold: true,  pulse: true  },
  { x: 68, y: 22, gold: false, pulse: false },
  { x: 80, y: 15, gold: true,  pulse: false },
  { x: 60, y: 36, gold: true,  pulse: true  },
  { x: 75, y: 46, gold: false, pulse: false },
  { x: 88, y: 30, gold: true,  pulse: false },
  { x: 64, y: 58, gold: false, pulse: true  },
  { x: 84, y: 62, gold: true,  pulse: false },
  { x: 55, y: 72, gold: false, pulse: false },
  { x: 70, y: 78, gold: true,  pulse: true  },
  { x: 90, y: 52, gold: false, pulse: false },
  { x: 58, y: 48, gold: true,  pulse: false },
  { x: 78, y: 38, gold: false, pulse: true  },
  { x: 93, y: 70, gold: true,  pulse: false },
  { x: 62, y: 85, gold: false, pulse: false },
  { x: 82, y: 20, gold: true,  pulse: true  },
  // left-half
  { x: 20, y: 25, gold: true,  pulse: false },
  { x: 32, y: 48, gold: false, pulse: true  },
  { x: 14, y: 65, gold: true,  pulse: false },
  { x: 42, y: 20, gold: false, pulse: false },
  { x: 28, y: 68, gold: true,  pulse: true  },
  { x: 10, y: 40, gold: false, pulse: false },
  { x: 38, y: 75, gold: true,  pulse: false },
  { x: 22, y: 85, gold: false, pulse: true  },
];

function MapScreen({ w }: { w: number }) {
  const dotR = Math.floor(w * 0.075);
  return (
    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(150deg, #070520 0%, #050318 100%)", overflow: "hidden" }}>
      {/* Grid lines */}
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        {[12, 25, 38, 51, 64, 77, 90].map(y => (
          <line key={`h${y}`} x1="0" y1={`${y}%`} x2="100%" y2={`${y}%`}
            stroke="rgba(139,92,246,0.1)" strokeWidth="0.8" />
        ))}
        {[10, 22, 34, 46, 58, 70, 82, 94].map(x => (
          <line key={`v${x}`} x1={`${x}%`} y1="0" x2={`${x}%`} y2="100%"
            stroke="rgba(139,92,246,0.1)" strokeWidth="0.8" />
        ))}
        {/* Continent blobs */}
        <ellipse cx="30%" cy="40%" rx="18%" ry="14%" fill="rgba(139,92,246,0.06)" />
        <ellipse cx="65%" cy="38%" rx="16%" ry="12%" fill="rgba(139,92,246,0.06)" />
        <ellipse cx="20%" cy="65%" rx="10%" ry="8%" fill="rgba(139,92,246,0.06)" />
        <ellipse cx="72%" cy="62%" rx="12%" ry="9%" fill="rgba(139,92,246,0.06)" />
      </svg>

      {/* Ambient purple glow */}
      <div style={{
        position: "absolute", top: "20%", left: "55%", transform: "translateX(-50%)",
        width: "70%", height: "50%", borderRadius: "50%",
        background: "radial-gradient(rgba(139,92,246,0.22), transparent 70%)",
        filter: "blur(12px)",
      }} />


      {/* User dots */}
      {MAP_DOTS.map((dot, i) => (
        <div key={i} style={{
          position: "absolute",
          left: `${dot.x}%`, top: `${dot.y}%`,
          transform: "translate(-50%,-50%)",
          zIndex: dot.gold ? 2 : 1,
        }}>
          {dot.pulse && (
            <div style={{
              position: "absolute", inset: -dotR * 0.7,
              borderRadius: "50%",
              border: `1.5px solid ${dot.gold ? "rgba(168,85,247,0.45)" : "rgba(56,189,248,0.35)"}`,
              animation: "ping 2.4s cubic-bezier(0,0,0.2,1) infinite",
            }} />
          )}
          <div style={{
            width: dotR * (dot.gold ? 2.2 : 1.8),
            height: dotR * (dot.gold ? 2.2 : 1.8),
            borderRadius: "50%",
            background: dot.gold
              ? "linear-gradient(135deg, hsl(273,90%,68%), hsl(330,90%,60%))"
              : "linear-gradient(135deg, hsl(199,95%,60%), hsl(240,80%,55%))",
            boxShadow: dot.gold
              ? "0 0 10px rgba(168,85,247,0.7), 0 0 20px rgba(168,85,247,0.3)"
              : "0 0 8px rgba(56,189,248,0.6), 0 0 16px rgba(56,189,248,0.25)",
            display: "flex", alignItems: "center", justifyContent: "center",
            border: `1.5px solid ${dot.gold ? "rgba(200,130,255,0.7)" : "rgba(120,220,255,0.6)"}`,
          }}>
            {dot.gold && (
              <span style={{ fontSize: dotR * 0.7, lineHeight: 1, userSelect: "none" }}>👑</span>
            )}
          </div>
        </div>
      ))}

      {/* Bottom pill — anchored to right so it's in the visible strip */}
      <div style={{
        position: "absolute", bottom: 8, right: 6,
        padding: "3px 8px", borderRadius: 99,
        background: "rgba(5,4,18,0.82)", border: "1px solid rgba(139,92,246,0.30)",
        backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", gap: 5,
      }}>
        <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e", flexShrink: 0, boxShadow: "0 0 5px #22c55e" }} />
        <span style={{ fontSize: 8, color: "rgba(255,255,255,0.80)", fontFamily: "Inter,sans-serif", fontWeight: 600, whiteSpace: "nowrap" }}>
          Descubre personas cerca de ti
        </span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   PHONE SHELL
───────────────────────────────────────────────────────────── */
function PhoneShell({
  screen,
  showAppHeader,
  width,
  height,
  style,
  floatDelay = 0,
  enterDelay = 0,
}: {
  screen: React.ReactNode;
  showAppHeader?: boolean;
  width: number;
  height: number;
  style: React.CSSProperties;
  floatDelay?: number;
  enterDelay?: number;
}) {
  const r = 34;
  return (
    <motion.div
      initial={{ opacity: 0, y: 28, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.75, delay: enterDelay, ease: [0.22, 1, 0.36, 1] }}
      style={{ position: "absolute", width, height, ...style }}
    >
      <motion.div
        animate={{ y: [0, -7, 0] }}
        transition={{ duration: 5.5 + floatDelay * 0.8, delay: floatDelay, repeat: Infinity, ease: "easeInOut" }}
        style={{ width: "100%", height: "100%" }}
      >
        {/* Outer shell */}
        <div style={{
          width: "100%", height: "100%", borderRadius: r,
          background: "rgba(6,4,20,0.97)",
          border: "2px solid rgba(255,255,255,0.13)",
          boxShadow: "0 28px 70px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.08)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}>
          {/* Status bar */}
          <div style={{
            height: 24, flexShrink: 0, display: "flex",
            alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.45)",
          }}>
            <div style={{
              width: 56, height: 12, borderRadius: 7,
              background: "rgba(0,0,0,0.9)",
              border: "1.5px solid rgba(255,255,255,0.09)",
            }} />
          </div>

          {/* App header */}
          {showAppHeader && (
            <div style={{
              height: 30, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "0 10px",
              background: "rgba(8,6,18,0.9)",
              borderBottom: "1px solid rgba(255,255,255,0.05)",
            }}>
              <KixxMeLogo size={11} withWordmark />
              <div style={{
                width: 22, height: 22, borderRadius: "50%",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Heart style={{ width: 10, height: 10, color: "hsl(273,85%,65%)" }} />
              </div>
            </div>
          )}

          {/* Screen content */}
          <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
            {screen}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────────
   FEATURE PILLS
───────────────────────────────────────────────────────────── */
const FEATURES = [
  { icon: "🎥", label: "Videollamadas Gold" },
  { icon: "🗺️", label: "Mapa en tiempo real" },
  { icon: "💜", label: "Perfiles verificados" },
];

/* ─────────────────────────────────────────────────────────────
   WELCOME PAGE
───────────────────────────────────────────────────────────── */
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

  /* Phone dimensions */
  const CW = 200; const CH = 395; // center (profile)
  const LW = 168; const LH = 330; // left (video call)
  const RW = 168; const RH = 330; // right (map)

  return (
    <div className="min-h-[100dvh] flex flex-col relative" style={{ background: "#060413", overflowX: "hidden", overflowY: "clip" }}>

      {/* ── BACKGROUND glows ── */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div style={{
          position: "absolute", top: "-10%", left: "20%", width: "60%", height: "55%",
          background: "radial-gradient(ellipse, rgba(139,92,246,0.12) 0%, transparent 70%)",
          filter: "blur(40px)",
        }} />
        <div style={{
          position: "absolute", top: "5%", left: "-5%", width: "40%", height: "35%",
          background: "radial-gradient(ellipse, rgba(236,72,153,0.07) 0%, transparent 70%)",
          filter: "blur(30px)",
        }} />
        <div style={{
          position: "absolute", top: "8%", right: "-5%", width: "40%", height: "35%",
          background: "radial-gradient(ellipse, rgba(56,189,248,0.06) 0%, transparent 70%)",
          filter: "blur(30px)",
        }} />
      </div>

      {/* ── PHONE MOCKUPS (absolute, z:1) ── */}
      <div className="absolute top-0 left-0 right-0 z-[1]" style={{ height: "70vh", overflow: "visible" }}>

        {/* LEFT — Video call */}
        <PhoneShell
          screen={<VideoCallScreen w={LW} h={LH} />}
          width={LW} height={LH}
          style={{ top: "4%", left: -6, transform: "rotate(-9deg)", zIndex: 2, opacity: 0.93 }}
          enterDelay={0.15}
          floatDelay={0.8}
        />

        {/* CENTER — Profile card (front & center)
             Use calc-based left so framer-motion's animated y/scale don't drop translateX(-50%) */}
        <PhoneShell
          screen={<ProfileCardScreen w={CW} />}
          showAppHeader
          width={CW} height={CH}
          style={{ top: "0%", left: `calc(50% - ${CW / 2}px)`, transform: "rotate(2.5deg)", zIndex: 4 }}
          enterDelay={0}
          floatDelay={0}
        />

        {/* RIGHT — Map */}
        <PhoneShell
          screen={<MapScreen w={RW} />}
          showAppHeader
          width={RW} height={RH}
          style={{ top: "6%", right: -6, transform: "rotate(9deg)", zIndex: 3, opacity: 0.93 }}
          enterDelay={0.25}
          floatDelay={1.5}
        />
        <div
          className="absolute flex items-center justify-center"
          style={{ top: `calc(6% + ${RH + 10}px)`, right: 0, width: RW + 20, transform: "rotate(9deg)", zIndex: 3 }}
        >
          <span className="font-sans text-[11px] font-semibold text-white/70 tracking-wide whitespace-nowrap">
            Personas cerca de ti
          </span>
        </div>
      </div>

      {/* Gradient scrim — phones fade into content */}
      <div className="absolute inset-0 z-[2] pointer-events-none" style={{
        background: "linear-gradient(to top, #060413 44%, rgba(6,4,19,0.97) 54%, rgba(6,4,19,0.5) 66%, rgba(6,4,19,0.06) 80%, transparent 100%)",
      }} />

      {/* Flow spacer — pushes content below the phone zone */}
      <div style={{ height: "48vh", flexShrink: 0 }} aria-hidden="true" />

      {/* ── CONTENT ── */}
      <div className="relative z-10 w-full max-w-md mx-auto px-5 pt-1 pb-8 flex flex-col items-center">

        {/* Logo + tagline */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.4, ease: "easeOut" }}
          className="flex flex-col items-center mb-5"
        >
          <KixxMeLogo size={54} badge glow />
          <h1 className="mt-3 font-display text-5xl tracking-tight text-gradient-brand leading-none">
            KIXXME
          </h1>
          <p className="mt-2 text-[13px] font-medium text-white/45 text-center leading-snug">
            Conoce chicos. Chatea. Haz videollamadas.
          </p>
        </motion.div>

        {/* Feature pills */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.55, ease: "easeOut" }}
          className="flex items-center justify-center gap-2 flex-wrap mb-6"
        >
          {FEATURES.map(({ icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-sans font-medium text-white/70"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.09)",
              }}
            >
              <span className="text-[13px]">{icon}</span>
              {label}
            </div>
          ))}
        </motion.div>

        {/* CTA buttons */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.65, ease: "easeOut" }}
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
              <div className="flex items-center gap-3 my-0.5">
                <span className="h-px flex-1 bg-white/8" />
                <span className="text-[11px] font-medium text-white/35">o continúa con</span>
                <span className="h-px flex-1 bg-white/8" />
              </div>

              <Button
                type="button"
                variant="outline"
                disabled={loadingProvider !== null}
                onClick={() => handleProvider("google")}
                className="w-full h-[50px] gap-3 rounded-2xl border border-white/10 bg-white/5 text-white text-[15px] font-medium hover:bg-white/10 transition-all backdrop-blur-md"
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
                  className="w-full h-[50px] gap-3 rounded-2xl border border-white/10 bg-white/5 text-white text-[15px] font-medium hover:bg-white/10 transition-all backdrop-blur-md"
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
          transition={{ duration: 0.6, delay: 0.85 }}
          className="mt-6 flex flex-col items-center gap-3 w-full"
          data-testid="section-social"
        >
          <div className="flex items-center gap-3 w-full">
            <span className="h-px flex-1" style={{ background: "rgba(255,255,255,0.07)" }} />
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: "rgba(255,255,255,0.3)" }}>
              Síguenos
            </span>
            <span className="h-px flex-1" style={{ background: "rgba(255,255,255,0.07)" }} />
          </div>

          <div className="flex items-center gap-3">
            {[
              { href: "https://www.instagram.com/kixxmeapp", label: "Instagram", Icon: InstagramIcon },
              { href: "https://www.tiktok.com/@kixxmeapp", label: "TikTok", Icon: TikTokIcon },
              { href: "https://x.com/kixxmeapp", label: "X", Icon: XIcon },
            ].map(({ href, label, Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Síguenos en ${label}`}
                className="flex items-center justify-center w-10 h-10 rounded-xl transition-all hover:scale-105 active:scale-95"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  color: "rgba(255,255,255,0.5)",
                }}
              >
                <Icon />
              </a>
            ))}
          </div>
        </motion.div>

        <LegalFooter />
      </div>

      {/* Ping animation for map dots */}
      <style>{`
        @keyframes ping {
          75%, 100% { transform: scale(2); opacity: 0; }
        }
      `}</style>
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
function AppleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="white" aria-hidden="true">
      <path d="M16.36 1.43c0 1.14-.42 2.2-1.25 3.06-.99 1.02-2.18 1.61-3.47 1.51a3.5 3.5 0 0 1-.03-.43c0-1.09.48-2.26 1.27-3.08.4-.42.9-.77 1.51-1.05.6-.27 1.17-.42 1.71-.44.02.15.03.29.03.43zM20.5 17.04c-.3.69-.45 1-.83 1.61-.54.85-1.3 1.91-2.24 1.92-.84.01-1.05-.55-2.18-.54-1.13 0-1.37.55-2.2.55-.95.01-1.67-.96-2.21-1.81-1.5-2.37-1.66-5.15-.73-6.63.66-1.05 1.69-1.66 2.67-1.66.99 0 1.61.55 2.43.55.8 0 1.28-.55 2.43-.55.86 0 1.78.47 2.43 1.28-2.13 1.17-1.79 4.22.4 5.28z" />
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
