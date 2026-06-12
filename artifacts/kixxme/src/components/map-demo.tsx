import React from "react";
import { Crown, Radar, Globe, Zap, MapPin } from "lucide-react";

/**
 * Gold map premium sales screen.
 *
 * Shown to NON-Gold users in place of the real world map. It's a self-contained
 * "trailer": a stylized radar backdrop with illustrative (fake) member markers,
 * a clear explanation of the feature, the three marketing messages, and a Gold
 * CTA. It deliberately uses NO real data or coordinates — every marker is a
 * gradient/initials avatar so it always reads as a preview, never live data.
 */

interface DemoMarker {
  initials: string;
  top: string;
  left: string;
  online: boolean;
  delay: string;
}

// Illustrative members scattered around the radar center. Positions are tuned to
// stay clear of the centered "tú" dot and the bottom sales gradient.
const DEMO_MARKERS: DemoMarker[] = [
  { initials: "M", top: "20%", left: "32%", online: true, delay: "0s" },
  { initials: "J", top: "27%", left: "66%", online: false, delay: "0.7s" },
  { initials: "D", top: "46%", left: "20%", online: true, delay: "1.3s" },
  { initials: "A", top: "44%", left: "78%", online: false, delay: "0.4s" },
  { initials: "R", top: "63%", left: "40%", online: true, delay: "1.0s" },
  { initials: "C", top: "60%", left: "70%", online: false, delay: "1.7s" },
];

const MESSAGES: { icon: React.ComponentType<{ className?: string }>; text: string }[] =
  [
    {
      icon: Radar,
      text: "Con Mapa Gold podrás ver en tiempo real qué usuarios están conectados cerca de ti.",
    },
    {
      icon: Globe,
      text: "Descubre personas en tu ciudad o en cualquier parte del mundo que tengan activada la ubicación.",
    },
    {
      icon: Zap,
      text: "Explora perfiles cercanos y conecta de forma instantánea.",
    },
  ];

const GOLD_GRADIENT = "linear-gradient(135deg, hsl(45,95%,60%), hsl(38,92%,50%))";
const AVATAR_GRADIENT =
  "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))";

export function MapDemo({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <div className="flex flex-col h-full">
      <style>{`
        @keyframes kx-sweep { to { transform: rotate(360deg); } }
        @keyframes kx-ping {
          0% { transform: scale(1); opacity: 0.55; }
          80%, 100% { transform: scale(2.4); opacity: 0; }
        }
        @keyframes kx-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes kx-glow {
          0%, 100% { opacity: 0.85; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.12); }
        }
        @keyframes kx-pulse-ring {
          0% { transform: scale(0.6); opacity: 0.5; }
          100% { transform: scale(1.05); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .kx-anim { animation: none !important; }
        }
      `}</style>

      <header
        className="sticky top-0 z-20 px-4 py-3 flex items-center justify-between border-b border-border/30"
        style={{ background: "rgba(8,7,18,0.9)", backdropFilter: "blur(20px)" }}
      >
        <h1 className="font-display text-2xl tracking-wide flex items-center gap-2">
          Mapa
          <Crown className="w-4 h-4 text-amber-400" />
        </h1>
        <span
          className="font-sans text-[11px] font-medium px-2.5 py-1 rounded-full text-amber-300 border border-amber-500/30"
          style={{ background: "rgba(45,35,10,0.5)" }}
        >
          Vista previa
        </span>
      </header>

      {/* Radar demo stage */}
      <div
        className="relative flex-1 mx-4 mt-3 rounded-2xl overflow-hidden border border-amber-500/20"
        style={{
          minHeight: "320px",
          background:
            "radial-gradient(circle at 50% 42%, hsl(273,40%,12%) 0%, hsl(238,35%,6%) 55%, hsl(240,40%,3%) 100%)",
        }}
      >
        {/* concentric radar rings */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {[0.95, 0.66, 0.38].map((scale, i) => (
            <span
              key={i}
              className="absolute rounded-full border border-amber-400/10"
              style={{
                width: `${scale * 100}%`,
                paddingBottom: `${scale * 100}%`,
                maxWidth: "560px",
              }}
            />
          ))}
        </div>

        {/* rotating radar sweep */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
          <div
            className="kx-anim absolute rounded-full"
            style={{
              width: "150%",
              paddingBottom: "150%",
              background:
                "conic-gradient(from 0deg, rgba(168,85,247,0) 0deg, rgba(168,85,247,0.18) 40deg, rgba(236,72,153,0.05) 70deg, rgba(168,85,247,0) 90deg)",
              animation: "kx-sweep 7s linear infinite",
            }}
          />
        </div>

        {/* center "tú" marker */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative">
            <span
              className="kx-anim absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                width: "60px",
                height: "60px",
                border: "2px solid hsl(330,85%,55%)",
                animation: "kx-pulse-ring 2.6s ease-out infinite",
              }}
            />
            <div
              className="kx-anim w-5 h-5 rounded-full"
              style={{
                background: "hsl(330,85%,55%)",
                border: "3px solid #fff",
                boxShadow: "0 0 16px rgba(236,72,153,0.9)",
                animation: "kx-glow 2.6s ease-in-out infinite",
              }}
            />
            <span className="absolute left-1/2 -translate-x-1/2 top-7 font-sans text-[10px] text-pink-300/90 whitespace-nowrap">
              Tú
            </span>
          </div>
        </div>

        {/* illustrative member markers */}
        {DEMO_MARKERS.map((m, i) => (
          <div
            key={i}
            className="absolute"
            style={{ top: m.top, left: m.left, transform: "translate(-50%, -50%)" }}
          >
            <div
              className="kx-anim relative"
              style={{ animation: `kx-float 4.5s ease-in-out ${m.delay} infinite` }}
            >
              {m.online && (
                <span
                  className="kx-anim absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{
                    width: "40px",
                    height: "40px",
                    border: "2px solid hsl(142,71%,45%)",
                    animation: `kx-ping 2.4s ease-out ${m.delay} infinite`,
                  }}
                />
              )}
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-xs"
                style={{
                  background: AVATAR_GRADIENT,
                  border: "2px solid hsl(45,90%,55%)",
                  boxShadow: m.online
                    ? "0 0 0 2px hsl(142,71%,45%), 0 0 12px rgba(168,85,247,0.7)"
                    : "0 0 10px rgba(168,85,247,0.5)",
                }}
              >
                {m.initials}
              </div>
              <span
                className="absolute text-[12px]"
                style={{
                  top: "-7px",
                  right: "-5px",
                  filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.7))",
                }}
              >
                👑
              </span>
            </div>
          </div>
        ))}

        {/* caption + bottom fade */}
        <div
          className="absolute bottom-0 left-0 right-0 pt-12 pb-3 px-4 pointer-events-none"
          style={{
            background:
              "linear-gradient(to top, rgba(8,7,18,0.95) 0%, rgba(8,7,18,0.6) 55%, rgba(8,7,18,0) 100%)",
          }}
        >
          <p className="font-sans text-[11px] text-muted-foreground flex items-center gap-1.5">
            <MapPin className="w-3 h-3 text-amber-400" />
            Así se ve el Mapa Gold — ejemplo ilustrativo
          </p>
        </div>
      </div>

      {/* Sales panel */}
      <div className="px-4 pt-4 pb-5">
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: GOLD_GRADIENT }}
          >
            <Crown className="w-6 h-6 text-black" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-xl tracking-wide text-amber-300 leading-tight">
              Mapa Gold
            </h2>
            <p className="font-sans text-xs text-muted-foreground leading-tight">
              El mapa en tiempo real, exclusivo para usuarios Gold.
            </p>
          </div>
        </div>

        <ul className="space-y-2.5 mb-5">
          {MESSAGES.map(({ icon: Icon, text }, i) => (
            <li
              key={i}
              className="flex items-start gap-3 p-3 rounded-xl border border-amber-500/15"
              style={{ background: "rgba(20,16,30,0.7)" }}
            >
              <span
                className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: "rgba(45,35,10,0.6)" }}
              >
                <Icon className="w-4 h-4 text-amber-300" />
              </span>
              <p className="font-sans text-[13px] text-foreground/90 leading-snug">
                {text}
              </p>
            </li>
          ))}
        </ul>

        <button
          onClick={onUpgrade}
          data-testid="button-map-upsell"
          className="w-full py-3 rounded-xl text-black font-sans font-semibold flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
          style={{
            background: GOLD_GRADIENT,
            boxShadow: "0 8px 24px rgba(234,179,8,0.25)",
          }}
        >
          <Crown className="w-5 h-5" />
          Hazte Gold
        </button>
        <p className="mt-2 text-center font-sans text-[11px] text-muted-foreground">
          Desbloquea el mapa y conecta con quien está cerca.
        </p>
      </div>
    </div>
  );
}
