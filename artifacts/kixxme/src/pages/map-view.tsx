import React, { useState } from "react";
import { MapPin, Users, Flame, Loader2 } from "lucide-react";
import { useListProfiles, PublicProfile, useCreateOrGetConversation } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";

type TimeFilter = "ahora" | "hoy" | "semana";

function idToPos(id: string): { x: number; y: number } {
  let h = 0;
  for (const c of id) { h = ((h << 5) - h) + c.charCodeAt(0); h |= 0; }
  const h2 = Math.abs(h >> 8);
  const x = 15 + (Math.abs(h) % 1000) / 1000 * 70;
  const y = 20 + (h2 % 1000) / 1000 * 55;
  return { x, y };
}

function initialsFor(u: string) {
  return (u || "?").slice(0, 2).toUpperCase();
}

const REGION_LABELS = [
  { x: "24%", y: "47%", text: "AMÉRICAS" },
  { x: "44%", y: "23%", text: "EUROPA" },
  { x: "62%", y: "32%", text: "ORIENTE MEDIO" },
  { x: "80%", y: "30%", text: "ASIA" },
  { x: "55%", y: "62%", text: "ÁFRICA" },
];

export default function MapView() {
  const { session } = useAuth();
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("ahora");
  const [selected, setSelected] = useState<string | null>(null);
  const [, setLocation] = useLocation();

  const { data: profiles = [], isLoading } = useListProfiles();

  const createConv = useCreateOrGetConversation();

  const handleMessage = (userId: string) => {
    createConv.mutate(
      { data: { other_user_id: userId } },
      { onSuccess: (conv) => setLocation(`/chats/${conv.id}`) }
    );
  };

  return (
    <div className="flex flex-col h-full">
      <header
        className="sticky top-0 z-20 px-4 py-3 flex items-center justify-between border-b border-border/30"
        style={{ background: "rgba(8,7,18,0.9)", backdropFilter: "blur(20px)" }}
      >
        <h1 className="font-display text-2xl tracking-wide">Mapa Global</h1>
        <div className="flex items-center gap-2 text-sm font-sans">
          <span className="text-muted-foreground">
            {isLoading ? "..." : `${profiles.length} usuarios`}
          </span>
        </div>
      </header>

      <div className="px-4 pt-3 pb-2 flex gap-2">
        {(["ahora", "hoy", "semana"] as TimeFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setTimeFilter(f)}
            className="px-3 py-1 rounded-full text-xs font-sans font-medium border transition-all"
            style={
              timeFilter === f
                ? { background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))", borderColor: "transparent", color: "white" }
                : { background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.1)", color: "hsl(240,10%,55%)" }
            }
          >
            {f === "ahora" ? "Ahora" : f === "hoy" ? "Hoy" : "Esta semana"}
          </button>
        ))}
      </div>

      <div
        className="relative flex-1 mx-4 mb-4 rounded-2xl overflow-hidden border border-border/30"
        style={{ minHeight: "380px" }}
      >
        <div
          className="absolute inset-0"
          style={{
            background: "hsl(238 30% 4%)",
            backgroundImage: `
              linear-gradient(rgba(168,85,247,0.07) 1px, transparent 1px),
              linear-gradient(90deg, rgba(168,85,247,0.07) 1px, transparent 1px),
              radial-gradient(ellipse 80% 70% at 50% 50%, hsl(270 25% 7%) 0%, hsl(238 30% 3%) 100%)
            `,
            backgroundSize: "36px 36px, 36px 36px, 100% 100%",
          }}
        />
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 50% 30% at 50% 50%, rgba(168,85,247,0.04) 0%, transparent 70%)" }} />

        {REGION_LABELS.map((r) => (
          <span key={r.text} className="absolute font-display text-[9px] tracking-widest select-none pointer-events-none"
            style={{ left: r.x, top: r.y, color: "rgba(168,85,247,0.25)", transform: "translate(-50%,-50%)" }}>
            {r.text}
          </span>
        ))}

        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : profiles.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-8">
            <span className="text-4xl">🌍</span>
            <p className="font-display text-lg tracking-wide text-foreground/60">
              Todavía no hay usuarios cerca.
            </p>
          </div>
        ) : (
          profiles.map((user) => {
            const pos = idToPos(user.id);
            const isSelected = selected === user.id;
            return (
              <button
                key={user.id}
                className="absolute transform -translate-x-1/2 -translate-y-1/2 group"
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                onClick={() => setSelected(isSelected ? null : user.id)}
              >
                <span className="absolute inset-0 rounded-full animate-ping"
                  style={{ background: "rgba(168,85,247,0.2)", transform: "scale(1.8)" }} />
                {user.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={user.username}
                    className="relative w-8 h-8 rounded-full object-cover border-2 border-primary/50 shadow-lg"
                    style={{ boxShadow: "0 0 8px rgba(168,85,247,0.5)" }}
                  />
                ) : (
                  <div
                    className="relative w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold font-display shadow-lg"
                    style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))", boxShadow: "0 0 8px rgba(168,85,247,0.5)" }}
                  >
                    {initialsFor(user.username)}
                  </div>
                )}
                {isSelected && (
                  <div
                    className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-xl text-[10px] font-sans whitespace-nowrap border border-border/40 flex flex-col items-center gap-1 z-10"
                    style={{ background: "rgba(13,11,26,0.97)" }}
                  >
                    <span className="text-foreground font-medium">{user.username}</span>
                    {user.city && <span className="text-muted-foreground">{user.city}</span>}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleMessage(user.id); }}
                      className="mt-0.5 px-3 py-1 rounded-lg text-white text-[10px] font-sans font-medium"
                      style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))" }}
                    >
                      Mensaje
                    </button>
                  </div>
                )}
              </button>
            );
          })
        )}

        <div
          className="absolute bottom-3 left-3 right-3 px-4 py-3 rounded-xl border border-primary/20 flex items-center gap-3"
          style={{ background: "rgba(13,11,26,0.9)", backdropFilter: "blur(10px)" }}
        >
          <Flame className="w-4 h-4 text-orange-400 flex-shrink-0" style={{ filter: "drop-shadow(0 0 6px rgba(249,115,22,0.8))" }} />
          <div>
            <p className="font-display text-sm tracking-wide text-primary">Mapa en tiempo real</p>
            <p className="font-sans text-[10px] text-muted-foreground">Próximamente: posiciones GPS reales</p>
          </div>
        </div>
      </div>

      <div className="px-4 pb-4 grid grid-cols-3 gap-2">
        {[
          { icon: Users, label: "Usuarios", value: String(profiles.length) },
          { icon: MapPin, label: "Con foto", value: String(profiles.filter(p => p.avatar_url).length) },
          { icon: Flame, label: "Sin foto", value: String(profiles.filter(p => !p.avatar_url).length) },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex flex-col items-center py-3 rounded-xl border border-border/30" style={{ background: "rgba(13,11,26,0.7)" }}>
            <span className="font-display text-xl text-primary">{value}</span>
            <span className="font-sans text-[10px] text-muted-foreground mt-0.5">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
