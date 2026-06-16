import React, { useState } from "react";
import { useLocation } from "wouter";
import { Menu, Shield, Video, Map as MapIcon, Mic, PhoneOff, Users } from "lucide-react";
import { useAuth, SOCIAL_AUTH_ENABLED } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { KixxMeLogo } from "@/components/brand/kixxme-logo";
import { LegalSidebar } from "@/components/legal-sidebar";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import faceCarlos from "@/assets/face-carlos.png";
import faceMarcos from "@/assets/face-marcos.png";
import faceAlejandro from "@/assets/face-alejandro.png";

/* ─────────────────────────────────────────────
   JOINT CALL CARD — Marcelo izquierda, Marcos derecha
───────────────────────────────────────────── */
function JointCallCard() {
  return (
    <div style={{ height: 216, position: "relative", background: "#050212", overflow: "hidden" }}>
      {/* LEFT: Marcelo */}
      <div style={{ position: "absolute", left: 0, top: 0, width: "50%", bottom: 0, overflow: "hidden" }}>
        <img src={faceCarlos} alt="Marcelo" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.22) 38%, transparent 65%)" }} />
        <motion.div
          style={{ position: "absolute", inset: 0, border: "2px solid rgba(34,197,94,0.80)", borderRight: "none" }}
          animate={{ opacity: [0.40, 1.0, 0.40] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        />
        <div style={{ position: "absolute", bottom: 40, left: 7 }}>
          <p style={{ color: "white", fontFamily: "'Bebas Neue',sans-serif", fontSize: 11.5, letterSpacing: "0.05em", textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}>
            Marcelo, 26
          </p>
        </div>
      </div>

      {/* RIGHT: Marcos */}
      <div style={{ position: "absolute", right: 0, top: 0, width: "50%", bottom: 0, overflow: "hidden" }}>
        <img src={faceMarcos} alt="Marcos" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.22) 38%, transparent 65%)" }} />
        <div style={{ position: "absolute", bottom: 40, left: 7 }}>
          <p style={{ color: "white", fontFamily: "'Bebas Neue',sans-serif", fontSize: 11.5, letterSpacing: "0.05em", textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}>
            Marcos, 24
          </p>
        </div>
      </div>

      {/* Divider */}
      <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "rgba(0,0,0,0.70)", zIndex: 3 }} />

      {/* Top bar */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 6, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 8px", background: "linear-gradient(to bottom, rgba(0,0,0,0.78), transparent)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(168,85,247,0.30)", borderRadius: 99, padding: "3px 8px 3px 6px" }}>
          <Video style={{ width: 9, height: 9, color: "rgba(168,85,247,0.90)" }} />
          <span style={{ fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,0.82)", fontFamily: "Inter,sans-serif", letterSpacing: "0.06em" }}>LIVE</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 3, background: "rgba(34,197,94,0.14)", border: "1px solid rgba(34,197,94,0.48)", borderRadius: 99, padding: "3px 7px 3px 5px" }}>
          <motion.div
            animate={{ opacity: [1, 0.12, 1] }}
            transition={{ duration: 0.9, repeat: Infinity }}
            style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }}
          />
          <span style={{ fontSize: 7.5, fontWeight: 800, color: "#22c55e", fontFamily: "Inter,sans-serif", letterSpacing: "0.06em" }}>EN VIVO</span>
        </div>
      </div>

      {/* Controls */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 6, display: "flex", justifyContent: "center", gap: 12, padding: "6px 8px 8px", background: "linear-gradient(to top, rgba(0,0,0,0.85), transparent)" }}>
        {[
          { Icon: Mic,      bg: "rgba(255,255,255,0.12)", border: "rgba(255,255,255,0.20)", glow: "none",                            color: "rgba(255,255,255,0.85)" },
          { Icon: PhoneOff, bg: "rgba(239,68,68,0.88)",   border: "transparent",           glow: "0 0 12px rgba(239,68,68,0.55)",   color: "white" },
          { Icon: Video,    bg: "rgba(255,255,255,0.12)", border: "rgba(255,255,255,0.20)", glow: "none",                            color: "rgba(255,255,255,0.85)" },
        ].map(({ Icon, bg, border, glow, color }, i) => (
          <div key={i} style={{ width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: bg, border: `1px solid ${border}`, boxShadow: glow }}>
            <Icon style={{ width: 12, height: 12, color }} />
          </div>
        ))}
      </div>

      {/* Outer pulsing border */}
      <motion.div
        style={{ position: "absolute", inset: 0, border: "2px solid rgba(34,197,94,0.52)", pointerEvents: "none", zIndex: 7 }}
        animate={{ opacity: [0.42, 0.90, 0.42] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────
   SWIPE SHOWCASE — Alejandro en un móvil con dedo grande
───────────────────────────────────────────── */
const SD = 5.8;
const ST = [0, 0.12, 0.32, 0.44, 0.56, 0.70, 0.85, 0.94, 1.0];
const SX    = [0, 0,  42,  42, 0,  -42,  -42, 0, 0];
const SR    = [0, 0,   8,   8, 0,   -8,   -8, 0, 0];
const LIKEO = [0, 0, 0.92, 0.92, 0,    0,    0, 0, 0];
const NOPEO = [0, 0,    0,    0, 0, 0.92, 0.92, 0, 0];

function SwipeShowcase() {
  const tr = { duration: SD, repeat: Infinity, ease: "easeInOut" as const, times: ST };

  return (
    <div style={{ height: 216, position: "relative", background: "#08031c", overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center" }}>
      {/* Glow */}
      <div style={{ position: "absolute", top: "10%", left: "30%", width: 180, height: 180, borderRadius: "50%", background: "radial-gradient(circle, rgba(168,85,247,0.18) 0%, transparent 65%)", filter: "blur(30px)", pointerEvents: "none" }} />

      {/* Phone (centered, starts 8px from top) */}
      <div style={{
        marginTop: 8,
        width: 112, height: 152,
        borderRadius: 20, overflow: "hidden",
        border: "1.5px solid rgba(255,255,255,0.14)",
        boxShadow: "0 0 44px rgba(168,85,247,0.30), 0 16px 48px rgba(0,0,0,0.90)",
        background: "#0e082a",
        flexShrink: 0,
        zIndex: 2,
        position: "relative",
      }}>
        {/* Notch */}
        <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 30, height: 4, background: "#0e082a", borderRadius: "0 0 6px 6px", zIndex: 22 }} />

        {/* Swipeable card */}
        <motion.div
          style={{ position: "absolute", inset: 0, transformOrigin: "center bottom" }}
          animate={{ x: SX, rotate: SR }}
          transition={tr}
        >
          <img src={faceAlejandro} alt="Alejandro" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "42%", background: "linear-gradient(to bottom, rgba(0,0,0,0.50), transparent)" }} />
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "55%", background: "linear-gradient(to top, rgba(0,0,0,0.97) 0%, rgba(0,0,0,0.60) 42%, transparent 100%)" }} />

          {/* LIKE stamp */}
          <motion.div style={{ position: "absolute", inset: 0 }} animate={{ opacity: LIKEO }} transition={tr}>
            <div style={{ position: "absolute", top: "32%", left: "50%", transform: "translate(-50%, -50%) rotate(-22deg)" }}>
              <div style={{ padding: "2px 9px", border: "2.5px solid #22c55e", borderRadius: 6, background: "rgba(34,197,94,0.16)" }}>
                <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: "#22c55e", letterSpacing: "0.07em", display: "block", lineHeight: 1 }}>LIKE</span>
              </div>
            </div>
          </motion.div>

          {/* NOPE stamp */}
          <motion.div style={{ position: "absolute", inset: 0 }} animate={{ opacity: NOPEO }} transition={tr}>
            <div style={{ position: "absolute", top: "32%", left: "50%", transform: "translate(-50%, -50%) rotate(22deg)" }}>
              <div style={{ padding: "2px 9px", border: "2.5px solid #ef4444", borderRadius: 6, background: "rgba(239,68,68,0.16)" }}>
                <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: "#ef4444", letterSpacing: "0.07em", display: "block", lineHeight: 1 }}>NOPE</span>
              </div>
            </div>
          </motion.div>

          {/* Name */}
          <div style={{ position: "absolute", bottom: 30, left: 9 }}>
            <p style={{ color: "white", fontFamily: "'Bebas Neue',sans-serif", fontSize: 12.5, letterSpacing: "0.04em", lineHeight: 1.1 }}>Alejandro, 28</p>
          </div>

          {/* Buttons */}
          <div style={{ position: "absolute", bottom: 6, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 18 }}>
            <div style={{ width: 24, height: 24, borderRadius: "50%", background: "rgba(239,68,68,0.22)", border: "1.5px solid rgba(239,68,68,0.70)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#ef4444" }}>✕</div>
            <div style={{ width: 24, height: 24, borderRadius: "50%", background: "rgba(34,197,94,0.22)", border: "1.5px solid rgba(34,197,94,0.70)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#22c55e" }}>♥</div>
          </div>
        </motion.div>
      </div>

      {/* ── BIG FINGER (below phone, always visible) ── */}
      {/* Phone bottom = 8 + 152 = 160px. Card height = 216px. Space = 56px. */}
      <div style={{ position: "absolute", bottom: 6, left: 0, right: 0, display: "flex", justifyContent: "center", zIndex: 10 }}>
        <motion.div
          animate={{ x: SX }}
          transition={tr}
          style={{ position: "relative", width: 48, height: 48 }}
        >
          {/* Ripple 1 */}
          <motion.div
            animate={{ scale: [1, 2.0], opacity: [0.60, 0] }}
            transition={{ duration: 1.0, repeat: Infinity, ease: "easeOut" }}
            style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "rgba(255,255,255,0.55)" }}
          />
          {/* Ripple 2 */}
          <motion.div
            animate={{ scale: [1, 2.0], opacity: [0.40, 0] }}
            transition={{ duration: 1.0, repeat: Infinity, ease: "easeOut", delay: 0.35 }}
            style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "rgba(255,255,255,0.45)" }}
          />
          {/* Core circle */}
          <div style={{
            position: "absolute", inset: 0, borderRadius: "50%",
            background: "rgba(255,255,255,0.92)",
            border: "2.5px solid white",
            boxShadow: "0 0 22px rgba(255,255,255,0.65), 0 0 44px rgba(255,255,255,0.28), 0 4px 14px rgba(0,0,0,0.70)",
          }} />
        </motion.div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   MAP PREVIEW
───────────────────────────────────────────── */
const MAP_PINS = [
  { x: 22, y: 26, photo: faceCarlos,   isGold: true,  size: 30 },
  { x: 70, y: 52, photo: faceMarcos,   isGold: false, size: 28 },
  { x: 83, y: 20, photo: null as null, isGold: false, grad: "linear-gradient(135deg,#a855f7,#6366f1)", size: 24 },
  { x: 12, y: 58, photo: null as null, isGold: true,  grad: "linear-gradient(135deg,#22c55e,#16a34a)", size: 23 },
  { x: 56, y: 74, photo: null as null, isGold: false, grad: "linear-gradient(135deg,#ec4899,#8b5cf6)", size: 26 },
  { x: 40, y: 14, photo: null as null, isGold: false, grad: "linear-gradient(135deg,#38bdf8,#6366f1)", size: 20 },
  { x: 90, y: 66, photo: null as null, isGold: false, grad: "linear-gradient(135deg,#f97316,#ec4899)", size: 22 },
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
      <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 42px,rgba(168,85,247,0.055) 42px,rgba(168,85,247,0.055) 43.5px),repeating-linear-gradient(90deg,transparent,transparent 52px,rgba(168,85,247,0.055) 52px,rgba(168,85,247,0.055) 53.5px)" }} />
      {MAP_BUILDINGS.map((b, i) => (
        <div key={i} style={{ position: "absolute", left: b.left, top: b.top, width: b.width, height: b.height, background: "rgba(255,255,255,0.022)", borderRadius: 3 }} />
      ))}
      <div style={{ position: "absolute", top: "30%", left: 0, right: 0, height: 3, background: "rgba(139,92,246,0.16)" }} />
      <div style={{ position: "absolute", top: "64%", left: 0, right: 0, height: 2.5, background: "rgba(139,92,246,0.12)" }} />
      <div style={{ position: "absolute", left: "32%", top: 0, bottom: 0, width: 3, background: "rgba(139,92,246,0.14)" }} />
      <div style={{ position: "absolute", left: "70%", top: 0, bottom: 0, width: 2.5, background: "rgba(139,92,246,0.10)" }} />
      <div style={{ position: "absolute", top: "44%", left: "47%", transform: "translate(-50%,-50%)", width: 110, height: 110, borderRadius: "50%", background: "radial-gradient(circle, rgba(56,189,248,0.22) 0%, transparent 70%)" }} />
      <div style={{ position: "absolute", top: "44%", left: "47%", transform: "translate(-50%,-50%)", width: 148, height: 148, borderRadius: "50%", border: "1px solid rgba(56,189,248,0.15)" }} />
      {MAP_PINS.map(({ x, y, photo, isGold, size, grad }, i) => (
        <div key={i} style={{ position: "absolute", left: `${x}%`, top: `${y}%`, transform: "translate(-50%,-50%)" }}>
          <div style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden", border: `1.5px solid ${isGold ? "#fbbf24" : "rgba(168,85,247,0.80)"}`, background: photo ? "transparent" : (grad ?? undefined), boxShadow: isGold ? "0 0 10px rgba(251,191,36,0.60),0 2px 8px rgba(0,0,0,0.55)" : "0 0 8px rgba(168,85,247,0.45),0 2px 6px rgba(0,0,0,0.50)" }}>
            {photo && <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
          </div>
          {isGold && <div style={{ position: "absolute", top: -4, right: -4, fontSize: 8.5, lineHeight: 1 }}>👑</div>}
        </div>
      ))}
      <div style={{ position: "absolute", top: "44%", left: "47%", transform: "translate(-50%,-50%)" }}>
        <motion.div animate={{ scale: [1, 2.6], opacity: [0.55, 0] }} transition={{ duration: 2.3, repeat: Infinity, ease: "easeOut" }} style={{ position: "absolute", inset: -2, borderRadius: "50%", background: "rgba(56,189,248,0.50)" }} />
        <div style={{ width: 13, height: 13, borderRadius: "50%", background: "#38bdf8", border: "2.5px solid white", boxShadow: "0 0 12px #38bdf8cc,0 0 24px rgba(56,189,248,0.40)" }} />
      </div>
      <div style={{ position: "absolute", top: "44%", left: "calc(47% + 12px)", transform: "translateY(-50%)", background: "rgba(56,189,248,0.16)", border: "1px solid rgba(56,189,248,0.32)", borderRadius: 7, padding: "2px 5px" }}>
        <span style={{ fontSize: 7.5, color: "rgba(56,189,248,0.92)", fontFamily: "Inter,sans-serif", fontWeight: 700 }}>Tú</span>
      </div>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 28, background: "linear-gradient(to bottom, rgba(6,2,24,0.80), transparent)", display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "0 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(168,85,247,0.14)", border: "1px solid rgba(168,85,247,0.28)", borderRadius: 6, padding: "2px 7px" }}>
          <span style={{ width: 4.5, height: 4.5, borderRadius: "50%", background: "#a855f7", display: "inline-block" }} />
          <span style={{ fontSize: 7.5, color: "rgba(168,85,247,0.90)", fontFamily: "Inter,sans-serif", fontWeight: 700 }}>Cerca de ti</span>
        </div>
      </div>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 32, background: "linear-gradient(to top, rgba(6,2,24,0.72), transparent)" }} />
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
      <LegalSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* ── HEADER compacto ── */}
      <div
        className="relative z-10 sticky top-0"
        style={{ background: "rgba(5,2,19,0.90)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", borderBottom: "1px solid rgba(168,85,247,0.12)" }}
      >
        <div className="flex items-center justify-between px-4 py-2.5 max-w-[430px] mx-auto">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="w-9 h-9 flex items-center justify-center rounded-xl"
            style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)" }}
            aria-label="Menú"
            data-testid="button-hamburger"
          >
            <Menu className="w-4.5 h-4.5 text-white/80" />
          </button>

          <h1
            className="font-display text-[28px] tracking-widest leading-none"
            style={{
              background: "linear-gradient(90deg, hsl(330,90%,68%), hsl(273,90%,74%), hsl(199,88%,68%), hsl(273,90%,74%), hsl(330,90%,68%))",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
              filter: "drop-shadow(0 0 18px rgba(168,85,247,0.70))",
            }}
          >
            KIXXME
          </h1>

          <div className="w-9 h-9" />
        </div>
      </div>

      {/* ── CHIPS ── */}
      <div className="relative z-10 flex justify-center gap-2 px-3 pt-2 pb-0.5 max-w-[430px] mx-auto w-full">
        {CHIP_ITEMS.map(({ icon, label, active }) => (
          <div
            key={label}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10.5px] font-sans font-semibold flex-shrink-0"
            style={{
              background: active ? BRAND_GRADIENT : "rgba(255,255,255,0.06)",
              border: active ? "none" : "1px solid rgba(255,255,255,0.11)",
              color: active ? "white" : "rgba(255,255,255,0.55)",
              boxShadow: active ? "0 0 12px rgba(168,85,247,0.40)" : "none",
            }}
          >
            <span>{icon}</span> {label}
          </div>
        ))}
      </div>

      {/* ── FEATURE HERO ── */}
      <div className="relative z-10 px-3 pt-2.5 pb-2 max-w-[430px] mx-auto w-full flex flex-col gap-2.5">

        {/* ROW: Video Call | Swipe side-by-side */}
        <div className="flex gap-2.5">
          {/* LEFT: Videollamada */}
          <motion.div
            className="flex-1"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.60, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            style={{ borderRadius: 20, overflow: "hidden", border: "1px solid rgba(34,197,94,0.22)", boxShadow: "0 6px 40px rgba(0,0,0,0.65)", minWidth: 0 }}
          >
            <JointCallCard />
            <div style={{ background: "rgba(6,2,22,0.97)", padding: "9px 11px 11px", borderTop: "1px solid rgba(34,197,94,0.10)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <div style={{ width: 28, height: 28, borderRadius: 9, flexShrink: 0, background: "linear-gradient(135deg,rgba(34,197,94,0.30),rgba(168,85,247,0.18))", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(34,197,94,0.22)" }}>
                  <Video style={{ width: 13, height: 13, color: "rgba(34,197,94,0.92)" }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 11.5, fontWeight: 700, color: "white", fontFamily: "Inter,sans-serif", lineHeight: 1.2 }}>KixxMe Live</p>
                  <p style={{ fontSize: 9.5, color: "rgba(255,255,255,0.45)", fontFamily: "Inter,sans-serif", marginTop: 1 }}>Videollamadas cara a cara</p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* RIGHT: Swipe */}
          <motion.div
            className="flex-1"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.60, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
            style={{ borderRadius: 20, overflow: "hidden", border: "1px solid rgba(168,85,247,0.20)", boxShadow: "0 6px 40px rgba(0,0,0,0.60)", minWidth: 0 }}
          >
            <SwipeShowcase />
            <div style={{ background: "rgba(6,2,22,0.97)", padding: "9px 11px 11px", borderTop: "1px solid rgba(168,85,247,0.10)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <div style={{ width: 28, height: 28, borderRadius: 9, flexShrink: 0, background: "linear-gradient(135deg,rgba(168,85,247,0.30),rgba(236,72,153,0.18))", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(168,85,247,0.22)" }}>
                  <Users style={{ width: 13, height: 13, color: "rgba(168,85,247,0.92)" }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 11.5, fontWeight: 700, color: "white", fontFamily: "Inter,sans-serif", lineHeight: 1.2 }}>Descubre</p>
                  <p style={{ fontSize: 9.5, color: "rgba(255,255,255,0.45)", fontFamily: "Inter,sans-serif", marginTop: 1 }}>Desliza para conectar</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* MAP full-width */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.60, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
          style={{ borderRadius: 20, overflow: "hidden", border: "1px solid rgba(99,102,241,0.18)", boxShadow: "0 6px 40px rgba(0,0,0,0.55)" }}
        >
          <div style={{ height: 148, position: "relative" }}>
            <MapPreview />
          </div>
          <div style={{ background: "rgba(6,2,22,0.97)", padding: "9px 14px 11px", display: "flex", alignItems: "center", gap: 9, borderTop: "1px solid rgba(99,102,241,0.10)" }}>
            <div style={{ width: 28, height: 28, borderRadius: 9, flexShrink: 0, background: "linear-gradient(135deg,rgba(99,102,241,0.28),rgba(56,189,248,0.18))", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(99,102,241,0.22)" }}>
              <MapIcon style={{ width: 13, height: 13, color: "rgba(99,102,241,0.95)" }} />
            </div>
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: "white", fontFamily: "Inter,sans-serif", lineHeight: 1.2 }}>Mapa en Tiempo Real</p>
              <p style={{ fontSize: 9.5, color: "rgba(255,255,255,0.45)", fontFamily: "Inter,sans-serif", marginTop: 1 }}>Ve quién hay cerca de ti</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── CTAs ── */}
      <div className="relative z-10 w-full max-w-[430px] mx-auto px-4 pt-2 pb-4 flex flex-col gap-3">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.38 }}
          className="flex flex-col gap-2.5"
        >
          <Button
            type="button"
            onClick={() => setLocation("/signup")}
            className="w-full h-[52px] rounded-2xl font-display text-[21px] tracking-wider border-0 text-white shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all"
            style={{ background: BRAND_GRADIENT, boxShadow: "0 4px 28px rgba(168,85,247,0.50),0 2px 8px rgba(0,0,0,0.4)" }}
            data-testid="button-signup"
          >
            CREAR CUENTA
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => setLocation("/login")}
            className="w-full h-[48px] rounded-2xl font-display text-[19px] tracking-wider border text-white hover:bg-white/[0.08] transition-all"
            style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.16)" }}
            data-testid="button-login"
          >
            INICIAR SESIÓN
          </Button>

          {SOCIAL_AUTH_ENABLED && (
            <>
              <div className="flex items-center gap-3">
                <span className="h-px flex-1" style={{ background: "rgba(255,255,255,0.08)" }} />
                <span className="text-[10.5px] font-medium" style={{ color: "rgba(255,255,255,0.35)" }}>o continúa con</span>
                <span className="h-px flex-1" style={{ background: "rgba(255,255,255,0.08)" }} />
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={loadingProvider !== null}
                onClick={() => handleProvider("google")}
                className="w-full h-[48px] gap-3 rounded-2xl border border-white/10 bg-white/[0.08] text-white text-[14px] font-medium hover:bg-white/[0.13] transition-all"
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

        {/* Social */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.75 }}
          className="flex flex-col items-center gap-2.5"
          data-testid="section-social"
        >
          <div className="flex items-center gap-3 w-full">
            <span className="h-px flex-1" style={{ background: "rgba(255,255,255,0.07)" }} />
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.2em]" style={{ color: "rgba(255,255,255,0.28)" }}>Síguenos</span>
            <span className="h-px flex-1" style={{ background: "rgba(255,255,255,0.07)" }} />
          </div>
          <div className="flex items-center gap-3">
            {[
              { href: "https://www.instagram.com/kixxmeapp", label: "Instagram", Icon: InstagramIcon },
              { href: "https://www.tiktok.com/@kixxmeapp",  label: "TikTok",    Icon: TikTokIcon    },
              { href: "https://x.com/kixxmeapp",            label: "X",         Icon: XIcon         },
            ].map(({ href, label, Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Síguenos en ${label}`}
                className="flex items-center justify-center w-9 h-9 rounded-xl transition-all hover:scale-105 active:scale-95"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.48)" }}
              >
                <Icon />
              </a>
            ))}
          </div>
        </motion.div>
      </div>

      <div className="relative z-10 pb-5 pt-0 text-center">
        <span className="text-[10px] font-sans" style={{ color: "rgba(255,255,255,0.20)" }}>🔒 kixxme.com</span>
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
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17.5" cy="6.5" r="1.25" fill="currentColor" />
    </svg>
  );
}
function TikTokIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.6 5.82a4.28 4.28 0 0 1-2.6-3.82h-3.2v12.86a2.6 2.6 0 1 1-2.6-2.6c.27 0 .53.04.78.12V8.98a5.86 5.86 0 0 0-.78-.05A5.74 5.74 0 1 0 14.4 14.6V8.6a7.45 7.45 0 0 0 4.36 1.4V6.8a4.28 4.28 0 0 1-2.16-.98z" />
    </svg>
  );
}
function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817-5.967 6.817H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
