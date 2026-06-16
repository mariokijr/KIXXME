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
   VIDEO CALL CARD
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
          `0 0 0 1.5px ${accent}cc, 0 0 22px ${accent}66, 0 0 48px ${accent}28, 0 10px 32px rgba(0,0,0,0.78)`,
          `0 0 0 2.5px ${accent}, 0 0 40px ${accent}aa, 0 0 90px ${accent}40, 0 10px 32px rgba(0,0,0,0.78)`,
          `0 0 0 1.5px ${accent}cc, 0 0 22px ${accent}66, 0 0 48px ${accent}28, 0 10px 32px rgba(0,0,0,0.78)`,
        ],
      }}
      transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
      style={{ width: 142, height: 188, borderRadius: 18, overflow: "hidden", position: "relative", flexShrink: 0 }}
    >
      <img src={img} alt={name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "55%", background: "linear-gradient(to bottom, rgba(0,0,0,0.74), transparent)" }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.97) 0%, rgba(0,0,0,0.52) 36%, transparent 60%)" }} />

      <div style={{ position: "absolute", top: 9, left: 9, right: 9, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, background: `${accent}22`, border: `1px solid ${accent}77`, borderRadius: 99, padding: "3px 8px 3px 5px" }}>
          <motion.span
            animate={{ opacity: [1, 0.15, 1] }}
            transition={{ duration: 0.95, repeat: Infinity }}
            style={{ width: 5.5, height: 5.5, borderRadius: "50%", background: accent, flexShrink: 0 }}
          />
          <span style={{ fontSize: 7.5, fontWeight: 800, color: accent, fontFamily: "Inter,sans-serif", letterSpacing: "0.07em" }}>{callLabel}</span>
        </div>
        <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.86)", fontFamily: "'Courier New',monospace", fontWeight: 700 }}>
          {fmt(elapsed)}
        </span>
      </div>

      <div style={{ position: "absolute", bottom: 9, left: 9, right: 9 }}>
        <p style={{ color: "white", fontFamily: "'Bebas Neue',sans-serif", fontSize: 14, letterSpacing: "0.03em", lineHeight: 1.1, marginBottom: 7 }}>{name}</p>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {[Mic, PhoneOff, Video].map((Icon, i) => (
            <div key={i} style={{ width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: i === 1 ? "rgba(239,68,68,0.90)" : "rgba(255,255,255,0.13)", border: i !== 1 ? "1px solid rgba(255,255,255,0.24)" : "none", boxShadow: i === 1 ? "0 0 10px rgba(239,68,68,0.50)" : "none" }}>
              <Icon style={{ width: 11, height: 11, color: "white" }} />
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────
   PULSE CONNECTOR
───────────────────────────────────────────── */
function PulseConnector() {
  return (
    <div style={{ position: "relative", width: 38, height: 38, flexShrink: 0 }}>
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "1.5px solid rgba(168,85,247,0.58)" }}
          animate={{ scale: [1, 3.0], opacity: [0.78, 0] }}
          transition={{ duration: 2.1, repeat: Infinity, ease: "easeOut", delay: i * 0.70 }}
        />
      ))}
      <div style={{
        position: "absolute", inset: 4, borderRadius: "50%",
        background: "conic-gradient(from 180deg, #a855f7, #ec4899, #6366f1, #a855f7)",
        boxShadow: "0 0 18px rgba(168,85,247,1.0), 0 0 36px rgba(168,85,247,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <KixxMeLogo size={14} />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   MAP PREVIEW — dark city map with user pins
───────────────────────────────────────────── */
const MAP_PINS = [
  { x: 22, y: 26, photo: faceCarlos, isGold: true,  size: 32 },
  { x: 70, y: 52, photo: faceMarcos, isGold: false, size: 30 },
  { x: 83, y: 20, photo: null as null, grad: "linear-gradient(135deg,#a855f7,#6366f1)", isGold: false, size: 26 },
  { x: 12, y: 58, photo: null as null, grad: "linear-gradient(135deg,#22c55e,#16a34a)", isGold: true,  size: 25 },
  { x: 56, y: 74, photo: null as null, grad: "linear-gradient(135deg,#ec4899,#8b5cf6)", isGold: false, size: 28 },
  { x: 40, y: 14, photo: null as null, grad: "linear-gradient(135deg,#38bdf8,#6366f1)", isGold: false, size: 22 },
  { x: 90, y: 66, photo: null as null, grad: "linear-gradient(135deg,#f97316,#ec4899)", isGold: false, size: 24 },
];

const MAP_BUILDINGS = [
  { left: "4%",  top: "5%",  width: "19%", height: "17%" },
  { left: "28%", top: "3%",  width: "14%", height: "13%" },
  { left: "56%", top: "7%",  width: "12%", height: "16%" },
  { left: "76%", top: "4%",  width: "16%", height: "17%" },
  { left: "3%",  top: "34%", width: "20%", height: "21%" },
  { left: "38%", top: "32%", width: "16%", height: "15%" },
  { left: "63%", top: "37%", width: "14%", height: "14%" },
  { left: "83%", top: "33%", width: "13%", height: "22%" },
  { left: "5%",  top: "68%", width: "18%", height: "28%" },
  { left: "31%", top: "66%", width: "15%", height: "30%" },
  { left: "57%", top: "70%", width: "19%", height: "26%" },
  { left: "82%", top: "68%", width: "14%", height: "28%" },
];

function MapPreview() {
  return (
    <div style={{ position: "absolute", inset: 0, background: "#060218", overflow: "hidden" }}>
      {/* City grid */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 42px,rgba(168,85,247,0.055) 42px,rgba(168,85,247,0.055) 43.5px),repeating-linear-gradient(90deg,transparent,transparent 52px,rgba(168,85,247,0.055) 52px,rgba(168,85,247,0.055) 53.5px)",
      }} />

      {/* Building blocks */}
      {MAP_BUILDINGS.map((b, i) => (
        <div key={i} style={{ position: "absolute", left: b.left, top: b.top, width: b.width, height: b.height, background: "rgba(255,255,255,0.020)", borderRadius: 3 }} />
      ))}

      {/* Main roads */}
      <div style={{ position: "absolute", top: "30%", left: 0, right: 0, height: 3, background: "rgba(139,92,246,0.16)" }} />
      <div style={{ position: "absolute", top: "64%", left: 0, right: 0, height: 2.5, background: "rgba(139,92,246,0.12)" }} />
      <div style={{ position: "absolute", left: "32%", top: 0, bottom: 0, width: 3, background: "rgba(139,92,246,0.14)" }} />
      <div style={{ position: "absolute", left: "70%", top: 0, bottom: 0, width: 2.5, background: "rgba(139,92,246,0.10)" }} />

      {/* YOU glow */}
      <div style={{ position: "absolute", top: "44%", left: "47%", transform: "translate(-50%,-50%)", width: 110, height: 110, borderRadius: "50%", background: "radial-gradient(circle, rgba(56,189,248,0.20) 0%, transparent 70%)" }} />
      <div style={{ position: "absolute", top: "44%", left: "47%", transform: "translate(-50%,-50%)", width: 145, height: 145, borderRadius: "50%", border: "1px solid rgba(56,189,248,0.15)" }} />

      {/* User pins */}
      {MAP_PINS.map(({ x, y, photo, isGold, size, grad }, i) => (
        <div key={i} style={{ position: "absolute", left: `${x}%`, top: `${y}%`, transform: "translate(-50%,-50%)" }}>
          <div style={{
            width: size, height: size, borderRadius: "50%", overflow: "hidden",
            border: `1.5px solid ${isGold ? "#fbbf24" : "rgba(168,85,247,0.80)"}`,
            background: photo ? "transparent" : (grad ?? undefined),
            boxShadow: isGold
              ? "0 0 11px rgba(251,191,36,0.60), 0 2px 8px rgba(0,0,0,0.55)"
              : "0 0 9px rgba(168,85,247,0.45), 0 2px 6px rgba(0,0,0,0.50)",
          }}>
            {photo && <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
          </div>
          {isGold && <div style={{ position: "absolute", top: -5, right: -5, fontSize: 9, lineHeight: 1 }}>👑</div>}
        </div>
      ))}

      {/* YOU pin */}
      <div style={{ position: "absolute", top: "44%", left: "47%", transform: "translate(-50%,-50%)" }}>
        <motion.div
          animate={{ scale: [1, 2.6], opacity: [0.55, 0] }}
          transition={{ duration: 2.3, repeat: Infinity, ease: "easeOut" }}
          style={{ position: "absolute", inset: -2, borderRadius: "50%", background: "rgba(56,189,248,0.50)" }}
        />
        <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#38bdf8", border: "2.5px solid white", boxShadow: "0 0 12px #38bdf8cc, 0 0 24px rgba(56,189,248,0.40)" }} />
      </div>
      {/* "Tú" label */}
      <div style={{ position: "absolute", top: "44%", left: "calc(47% + 13px)", transform: "translateY(-50%)", background: "rgba(56,189,248,0.16)", border: "1px solid rgba(56,189,248,0.32)", borderRadius: 7, padding: "2px 6px" }}>
        <span style={{ fontSize: 8, color: "rgba(56,189,248,0.92)", fontFamily: "Inter,sans-serif", fontWeight: 700 }}>Tú</span>
      </div>

      {/* Top bar */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 30, background: "linear-gradient(to bottom, rgba(6,2,24,0.80), transparent)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px" }}>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.46)", fontFamily: "Inter,sans-serif", fontWeight: 500, letterSpacing: "0.02em" }}>📍 Madrid, España</span>
        <div style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(168,85,247,0.14)", border: "1px solid rgba(168,85,247,0.28)", borderRadius: 6, padding: "2px 8px" }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#a855f7", display: "inline-block" }} />
          <span style={{ fontSize: 8, color: "rgba(168,85,247,0.90)", fontFamily: "Inter,sans-serif", fontWeight: 700 }}>Cerca de ti</span>
        </div>
      </div>

      {/* Bottom vignette */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 36, background: "linear-gradient(to top, rgba(6,2,24,0.70), transparent)" }} />
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
          33%  { transform: translate(12%, -16%) scale(1.14); }
          66%  { transform: translate(-9%, 11%) scale(0.91); }
        }
        @keyframes blob2 {
          0%, 100% { transform: translate(0%, 0%) scale(1); }
          45%  { transform: translate(-14%, 15%) scale(1.13); }
          80%  { transform: translate(10%, -9%) scale(0.94); }
        }
        @keyframes blob3 {
          0%, 100% { transform: translate(0%, 0%) scale(1); }
          55%  { transform: translate(12%, 14%) scale(1.09); }
        }
      `}</style>

      <LegalSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* ── HEADER ── */}
      <div
        className="relative z-10 sticky top-0"
        style={{ background: "rgba(5,2,19,0.88)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", borderBottom: "1px solid rgba(168,85,247,0.12)" }}
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

      {/* ── FEATURE HERO ── */}
      <div className="relative z-10 px-4 pt-4 pb-2 max-w-[430px] mx-auto w-full flex flex-col gap-3">

        {/* ── CARD 1: VIDEO CALLS ── */}
        <motion.div
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.68, delay: 0.10, ease: [0.22, 1, 0.36, 1] }}
          style={{ borderRadius: 24, overflow: "hidden", border: "1px solid rgba(168,85,247,0.22)", boxShadow: "0 8px 50px rgba(0,0,0,0.60)", position: "relative" }}
        >
          {/* Visual area */}
          <div style={{ height: 222, position: "relative", background: "#060316", overflow: "hidden" }}>
            {/* Aurora blobs (inside card) */}
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
              <div style={{ position: "absolute", top: "-20%", left: "-10%", width: "80%", height: "100%", background: "radial-gradient(ellipse, rgba(139,92,246,0.40) 0%, transparent 65%)", filter: "blur(50px)", animation: "blob1 16s ease-in-out infinite" }} />
              <div style={{ position: "absolute", top: "0%", right: "-15%", width: "65%", height: "90%", background: "radial-gradient(ellipse, rgba(236,72,153,0.30) 0%, transparent 65%)", filter: "blur(44px)", animation: "blob2 21s ease-in-out infinite" }} />
            </div>

            {/* Feature label top-left */}
            <div style={{ position: "absolute", top: 11, left: 12, zIndex: 3, display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(168,85,247,0.28)", borderRadius: 99, padding: "4px 10px 4px 8px" }}>
              <Video style={{ width: 10, height: 10, color: "rgba(168,85,247,0.90)" }} />
              <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.80)", fontFamily: "Inter,sans-serif", letterSpacing: "0.06em" }}>KIXXME LIVE</span>
            </div>

            {/* Two call cards */}
            <div style={{ position: "absolute", inset: 0, display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 14, paddingBottom: 12, paddingTop: 32, paddingLeft: 12, paddingRight: 12, zIndex: 2 }}>
              {/* Marcelo */}
              <motion.div
                initial={{ opacity: 0, x: -18, scale: 0.93 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                transition={{ duration: 0.60, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
                style={{ rotate: -6, zIndex: 2, flexShrink: 0, transformOrigin: "bottom center" }}
              >
                <motion.div animate={{ y: [0, -11, 0] }} transition={{ duration: 4.3, repeat: Infinity, ease: "easeInOut" }}>
                  <VideoCallCard img={faceCarlos} name="Marcelo, 26" startSecs={42} accent="#22c55e" callLabel="EN VIVO" />
                </motion.div>
              </motion.div>

              {/* Connector */}
              <motion.div
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.50, ease: [0.34, 1.56, 0.64, 1] }}
                style={{ marginBottom: 20, flexShrink: 0 }}
              >
                <PulseConnector />
              </motion.div>

              {/* Marcos */}
              <motion.div
                initial={{ opacity: 0, x: 18, scale: 0.93 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                transition={{ duration: 0.60, delay: 0.30, ease: [0.22, 1, 0.36, 1] }}
                style={{ rotate: 5, zIndex: 1, flexShrink: 0, transformOrigin: "bottom center" }}
              >
                <motion.div animate={{ y: [0, -11, 0] }} transition={{ duration: 4.9, repeat: Infinity, ease: "easeInOut", delay: 0.9 }}>
                  <VideoCallCard img={faceMarcos} name="Marcos, 24" startSecs={127} accent="#a855f7" callLabel="LIVE" />
                </motion.div>
              </motion.div>
            </div>
          </div>

          {/* Label */}
          <div style={{ background: "rgba(6,2,22,0.97)", padding: "12px 16px 14px", display: "flex", alignItems: "center", gap: 11, borderTop: "1px solid rgba(168,85,247,0.10)" }}>
            <div style={{ width: 38, height: 38, borderRadius: 12, flexShrink: 0, background: "linear-gradient(135deg, rgba(168,85,247,0.30), rgba(236,72,153,0.22))", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(168,85,247,0.20)" }}>
              <Video style={{ width: 16, height: 16, color: "rgba(168,85,247,0.90)" }} />
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: "white", fontFamily: "Inter,sans-serif", lineHeight: 1.2 }}>Videollamadas cara a cara</p>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.48)", fontFamily: "Inter,sans-serif", marginTop: 2 }}>Conéctate con chicos en tiempo real</p>
            </div>
          </div>
        </motion.div>

        {/* ── CARD 2: MAP ── */}
        <motion.div
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.68, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
          style={{ borderRadius: 24, overflow: "hidden", border: "1px solid rgba(168,85,247,0.18)", boxShadow: "0 8px 50px rgba(0,0,0,0.55)" }}
        >
          {/* Map visual */}
          <div style={{ height: 178, position: "relative" }}>
            <MapPreview />
          </div>

          {/* Label */}
          <div style={{ background: "rgba(6,2,22,0.97)", padding: "12px 16px 14px", display: "flex", alignItems: "center", gap: 11, borderTop: "1px solid rgba(168,85,247,0.08)" }}>
            <div style={{ width: 38, height: 38, borderRadius: 12, flexShrink: 0, background: "linear-gradient(135deg, rgba(99,102,241,0.28), rgba(56,189,248,0.20))", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(99,102,241,0.22)" }}>
              <MapIcon style={{ width: 16, height: 16, color: "rgba(99,102,241,0.95)" }} />
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: "white", fontFamily: "Inter,sans-serif", lineHeight: 1.2 }}>Mapa en Tiempo Real</p>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.48)", fontFamily: "Inter,sans-serif", marginTop: 2 }}>Ve quién hay cerca de ti en el mapa</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── CONTENT ── */}
      <div className="relative z-10 w-full max-w-[430px] mx-auto px-5 pt-3 pb-4 flex flex-col items-center">

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
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(168,85,247,0.13)" }}
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
