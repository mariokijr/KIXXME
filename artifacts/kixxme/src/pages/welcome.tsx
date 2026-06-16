import React, { useState } from "react";
import { useLocation } from "wouter";
import { Heart, X, BadgeCheck, MapPin, Menu, Shield, Video, Map as MapIcon, Mic, PhoneOff } from "lucide-react";
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
   VIDEO CALL CARD — animated live call frame
───────────────────────────────────────────── */
function VideoCallCard({
  img, name, startSecs = 0, accent = "#22c55e", floatDelay = 0, callLabel = "EN VIVO",
}: {
  img: string; name: string; startSecs?: number; accent?: string; floatDelay?: number; callLabel?: string;
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
        y: [0, -7, 0],
        boxShadow: [
          `0 0 0 1.5px ${accent}bb, 0 0 14px ${accent}55, 0 6px 22px rgba(0,0,0,0.65)`,
          `0 0 0 2px ${accent}, 0 0 28px ${accent}99, 0 6px 22px rgba(0,0,0,0.65)`,
          `0 0 0 1.5px ${accent}bb, 0 0 14px ${accent}55, 0 6px 22px rgba(0,0,0,0.65)`,
        ],
      }}
      transition={{ duration: 3.4 + floatDelay * 0.7, repeat: Infinity, ease: "easeInOut", delay: floatDelay }}
      style={{ width: "100%", height: 134, borderRadius: 16, overflow: "hidden", position: "relative" }}
    >
      {/* Video feed */}
      <img src={img} alt={name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />

      {/* Top scrim */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "48%", background: "linear-gradient(to bottom, rgba(0,0,0,0.62), transparent)" }} />
      {/* Bottom scrim */}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.94) 0%, rgba(0,0,0,0.42) 42%, transparent 66%)" }} />

      {/* Top bar: live badge + timer */}
      <div style={{ position: "absolute", top: 7, left: 7, right: 7, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 3, background: `${accent}28`, border: `1px solid ${accent}70`, borderRadius: 99, padding: "2px 6px 2px 4px" }}>
          <motion.span
            animate={{ opacity: [1, 0.25, 1] }}
            transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
            style={{ width: 5, height: 5, borderRadius: "50%", background: accent, flexShrink: 0 }}
          />
          <span style={{ fontSize: 7.5, fontWeight: 800, color: accent, fontFamily: "Inter,sans-serif", letterSpacing: "0.06em" }}>{callLabel}</span>
        </div>
        <span style={{ fontSize: 9.5, color: "rgba(255,255,255,0.80)", fontFamily: "'Courier New',monospace", fontWeight: 700, letterSpacing: "0.04em" }}>
          {fmt(elapsed)}
        </span>
      </div>

      {/* Bottom: name + call controls */}
      <div style={{ position: "absolute", bottom: 7, left: 7, right: 7 }}>
        <p style={{ color: "white", fontFamily: "'Bebas Neue',sans-serif", fontSize: 13, letterSpacing: "0.02em", lineHeight: 1.1, marginBottom: 5 }}>{name}</p>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.22)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Mic style={{ width: 9, height: 9, color: "white" }} />
          </div>
          <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(239,68,68,0.85)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <PhoneOff style={{ width: 9, height: 9, color: "white" }} />
          </div>
          <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.22)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Video style={{ width: 9, height: 9, color: "white" }} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────
   RIGHT PANEL — "Personas cerca de ti" network
───────────────────────────────────────────── */
const NODES = [
  { x: 56, y: 10, r: 18, photo: null,         grad: "linear-gradient(135deg,hsl(273,85%,56%),hsl(240,80%,55%))", stroke: "rgba(168,85,247,0.75)" },
  { x: 68, y: 52, r: 18, photo: faceMarcos,   grad: null,                                                          stroke: "rgba(255,255,255,0.22)" },
  { x: 24, y: 88, r: 14, photo: null,         grad: "linear-gradient(135deg,hsl(186,86%,55%),hsl(220,80%,60%))", stroke: "rgba(34,211,238,0.65)"  },
  { x: 62, y: 118,r: 16, photo: faceCarlos,   grad: null,                                                          stroke: "rgba(255,255,255,0.20)" },
  { x: 78, y: 155,r: 13, photo: null,         grad: "linear-gradient(135deg,hsl(140,75%,48%),hsl(160,70%,43%))", stroke: "rgba(34,197,94,0.65)"   },
  { x: 36, y: 160,r: 13, photo: faceAlejandro,grad: null,                                                          stroke: "rgba(255,255,255,0.18)" },
] as const;

const LINES: [number, number][] = [[0,1],[1,2],[2,3],[3,4],[3,5],[1,3]];

function RightPanel() {
  const W = 100; const SH = 192;
  return (
    <div style={{ width: W }}>
      <p style={{ fontSize: 9, fontFamily: "Inter,sans-serif", color: "rgba(255,255,255,0.55)", fontWeight: 600, letterSpacing: "0.04em", marginBottom: 7, textAlign: "right", paddingRight: 2, whiteSpace: "nowrap" }}>
        Personas cerca de ti
      </p>

      <div style={{ position: "relative", width: W, height: SH }}>
        <svg width={W} height={SH} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          {LINES.map(([a, b], i) => {
            const A = NODES[a]; const B = NODES[b];
            return (
              <line key={i}
                x1={A.x + A.r} y1={A.y + A.r}
                x2={B.x + B.r} y2={B.y + B.r}
                stroke="rgba(139,92,246,0.38)"
                strokeWidth="0.75"
                strokeLinecap="round"
              />
            );
          })}
        </svg>

        {NODES.map((n, i) => (
          <div key={i} style={{
            position: "absolute", left: n.x, top: n.y,
            width: n.r * 2, height: n.r * 2, borderRadius: "50%",
            background: n.photo ? "#050315" : (n.grad as string),
            border: `1.5px solid ${n.stroke}`,
            overflow: "hidden",
            boxShadow: "0 0 8px rgba(0,0,0,0.55)",
          }}>
            {n.photo && <img src={n.photo as string} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
        <span style={{
          display: "inline-block", padding: "5px 11px", borderRadius: 99,
          background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.16)",
          fontSize: 9, fontFamily: "Inter,sans-serif", fontWeight: 700,
          color: "rgba(255,255,255,0.82)", letterSpacing: "0.06em",
        }}>
          VER TODOS
        </span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   CENTER PHONE — neon glow border + profile card
───────────────────────────────────────────── */
function CenterPhone({ innerW }: { innerW: number }) {
  const BORDER = 3;
  const innerH = Math.round(innerW * 2.14);
  const BTN = 44;
  const KBTN = 56;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
      style={{
        padding: BORDER,
        borderRadius: 40,
        background: "conic-gradient(from 175deg at 50% 50%, #a855f7 0%, #ec4899 28%, #6366f1 58%, #8b5cf6 78%, #a855f7 100%)",
        boxShadow: [
          "0 0 0 1px rgba(168,85,247,0.22)",
          "0 0 40px rgba(168,85,247,0.80)",
          "0 0 90px rgba(168,85,247,0.45)",
          "0 0 160px rgba(236,72,153,0.25)",
          "0 0 220px rgba(168,85,247,0.12)",
          "0 24px 60px rgba(0,0,0,0.70)",
        ].join(", "),
      }}
    >
      <div style={{
        width: innerW, height: innerH, borderRadius: 37,
        background: "#08061c", overflow: "hidden",
        display: "flex", flexDirection: "column",
      }}>
        {/* Notch */}
        <div style={{ height: 22, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <div style={{ width: 52, height: 12, borderRadius: 7, background: "#000" }} />
        </div>

        {/* Photo + overlay content */}
        <div style={{ flex: 1, position: "relative" }}>
          <img
            src={faceAlejandro} alt="Alejandro"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center" }}
          />

          {/* Colour tint at top */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "45%", background: "linear-gradient(to bottom, rgba(30,15,65,0.18), transparent)" }} />

          {/* Bottom scrim */}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(4,2,16,0.97) 0%, rgba(6,4,20,0.90) 26%, rgba(8,5,22,0.52) 50%, transparent 70%)" }} />

          {/* En línea badge */}
          <div style={{ position: "absolute", top: 11, left: 10, display: "flex", alignItems: "center", gap: 5, background: "rgba(34,197,94,0.90)", borderRadius: 99, padding: "3px 9px 3px 6px" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "white" }} />
            <span style={{ fontSize: 9.5, fontFamily: "Inter,sans-serif", fontWeight: 700, color: "white" }}>En línea</span>
          </div>

          {/* Bookmark heart top-right */}
          <div style={{ position: "absolute", top: 11, right: 10, width: 30, height: 30, borderRadius: "50%", background: "rgba(255,255,255,0.09)", border: "1.5px solid rgba(255,255,255,0.24)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Heart style={{ width: 13, height: 13, color: "white" }} />
          </div>

          {/* Name + verified + distance + tags */}
          <div style={{ position: "absolute", bottom: 68, left: 10, right: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: Math.floor(innerW * 0.154), color: "white", letterSpacing: "0.02em", lineHeight: 1 }}>
                ALEJANDRO, 22
              </span>
              <BadgeCheck style={{ width: 17, height: 17, color: "hsl(199,89%,65%)", filter: "drop-shadow(0 0 4px rgba(56,189,248,0.65))", flexShrink: 0 }} />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }}>
              <MapPin style={{ width: 10, height: 10, color: "rgba(255,255,255,0.60)" }} />
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.62)", fontFamily: "Inter,sans-serif" }}>A 2 km de ti</span>
            </div>

            <div style={{ display: "flex", gap: 5 }}>
              {["Activo", "Relación", "Chat"].map(tag => (
                <span key={tag} style={{
                  padding: "3px 9px", borderRadius: 99, fontSize: 9,
                  color: "rgba(255,255,255,0.88)", background: "rgba(255,255,255,0.09)",
                  border: "1px solid rgba(255,255,255,0.18)", fontFamily: "Inter,sans-serif",
                }}>
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ position: "absolute", bottom: 12, left: 0, right: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 14 }}>
            {/* ✕ */}
            <div style={{ width: BTN, height: BTN, borderRadius: "50%", background: "rgba(14,10,30,0.93)", border: "1.5px solid rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <X style={{ width: 18, height: 18, color: "rgba(255,255,255,0.82)" }} />
            </div>

            {/* K logo — neon ring, largest */}
            <div style={{ padding: 2.5, borderRadius: "50%", background: "conic-gradient(from 180deg, #a855f7, #ec4899, #8b5cf6, #a855f7)", boxShadow: "0 0 20px rgba(168,85,247,0.70), 0 0 40px rgba(168,85,247,0.35)" }}>
              <div style={{ width: KBTN - 5, height: KBTN - 5, borderRadius: "50%", background: "linear-gradient(135deg, #0e0927, #0a0718)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <KixxMeLogo size={25} />
              </div>
            </div>

            {/* ❤️ */}
            <div style={{ width: BTN, height: BTN, borderRadius: "50%", background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))", boxShadow: "0 0 16px rgba(236,72,153,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Heart style={{ width: 18, height: 18, color: "white", fill: "white" }} />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
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

  const PHONE_INNER_W = 172;

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: "#060413", overflowX: "hidden" }}>
      <LegalSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Ambient background glows */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div style={{ position: "absolute", top: "-8%", left: "20%", width: "60%", height: "50%", background: "radial-gradient(ellipse, rgba(139,92,246,0.18) 0%, transparent 70%)", filter: "blur(44px)" }} />
        <div style={{ position: "absolute", top: "5%", left: "-5%", width: "42%", height: "38%", background: "radial-gradient(ellipse, rgba(236,72,153,0.10) 0%, transparent 70%)", filter: "blur(32px)" }} />
        <div style={{ position: "absolute", top: "10%", right: "-5%", width: "38%", height: "32%", background: "radial-gradient(ellipse, rgba(56,189,248,0.07) 0%, transparent 70%)", filter: "blur(32px)" }} />
      </div>

      {/* ── HEADER ── */}
      <div
        className="relative z-10 sticky top-0"
        style={{ background: "rgba(6,4,19,0.80)", backdropFilter: "blur(22px)", WebkitBackdropFilter: "blur(22px)", borderBottom: "1px solid rgba(168,85,247,0.10)" }}
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
              background: "linear-gradient(90deg, hsl(330,90%,68%), hsl(273,90%,72%), hsl(330,90%,68%))",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
              filter: "drop-shadow(0 0 18px rgba(168,85,247,0.60))",
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
              boxShadow: active ? "0 0 14px rgba(168,85,247,0.38)" : "none",
            }}
          >
            <span>{icon}</span> {label}
          </div>
        ))}
      </div>

      {/* ── 3-PANEL PHONE MOCKUP ── */}
      <div className="relative z-10 w-full max-w-[430px] mx-auto px-0 py-4">
        <div
          className="flex items-start"
          style={{ gap: 6, paddingLeft: 0, paddingRight: 0, justifyContent: "center" }}
        >
          {/* LEFT — 2 stacked video call cards */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.65, delay: 0.10, ease: [0.22, 1, 0.36, 1] }}
            style={{ width: 100, paddingTop: 30, display: "flex", flexDirection: "column", gap: 10, flexShrink: 0 }}
          >
            <VideoCallCard img={faceCarlos} name="Marcelo, 26" startSecs={42}  accent="#22c55e" floatDelay={0}   callLabel="EN VIVO" />
            <VideoCallCard img={faceMarcos} name="Marcos, 24"  startSecs={127} accent="#a855f7" floatDelay={1.1} callLabel="LIVE"    />
          </motion.div>

          {/* CENTER — neon phone */}
          <div style={{ flexShrink: 0 }}>
            <CenterPhone innerW={PHONE_INNER_W} />
          </div>

          {/* RIGHT — avatar network */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.65, delay: 0.20, ease: [0.22, 1, 0.36, 1] }}
            style={{ width: 100, paddingTop: 130, flexShrink: 0 }}
          >
            <RightPanel />
          </motion.div>
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div className="relative z-10 w-full max-w-[430px] mx-auto px-5 pt-1 pb-4 flex flex-col items-center">

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
            style={{ background: BRAND_GRADIENT, boxShadow: "0 4px 32px rgba(168,85,247,0.45), 0 2px 8px rgba(0,0,0,0.4)" }}
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
