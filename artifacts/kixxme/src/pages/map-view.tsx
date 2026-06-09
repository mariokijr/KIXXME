import React, { useState } from "react";
import { MapPin, Users, Flame } from "lucide-react";

type TimeFilter = "ahora" | "hoy" | "semana";

const PINS = [
  { id: "1", x: "41%", y: "33%", count: 4, online: true, label: "Madrid" },
  { id: "2", x: "47%", y: "31%", count: 2, online: true, label: "Barcelona" },
  { id: "3", x: "38%", y: "37%", count: 1, online: false, label: "Lisboa" },
  { id: "4", x: "51%", y: "28%", count: 3, online: true, label: "París" },
  { id: "5", x: "55%", y: "30%", count: 2, online: false, label: "Roma" },
  { id: "6", x: "57%", y: "26%", count: 1, online: true, label: "Berlín" },
  { id: "7", x: "26%", y: "44%", count: 5, online: true, label: "NYC" },
  { id: "8", x: "20%", y: "50%", count: 2, online: false, label: "México" },
  { id: "9", x: "23%", y: "57%", count: 3, online: true, label: "Bogotá" },
  { id: "10", x: "27%", y: "62%", count: 1, online: false, label: "Lima" },
  { id: "11", x: "68%", y: "36%", count: 6, online: true, label: "Dubái" },
  { id: "12", x: "78%", y: "32%", count: 2, online: true, label: "Mumbai" },
  { id: "13", x: "82%", y: "28%", count: 4, online: false, label: "Beijing" },
  { id: "14", x: "88%", y: "40%", count: 3, online: true, label: "Tokio" },
  { id: "15", x: "85%", y: "58%", count: 2, online: false, label: "Sídney" },
];

const REGION_LABELS = [
  { x: "24%", y: "47%", text: "AMÉRICAS" },
  { x: "44%", y: "23%", text: "EUROPA" },
  { x: "62%", y: "32%", text: "ORIENTE MEDIO" },
  { x: "80%", y: "30%", text: "ASIA" },
  { x: "55%", y: "62%", text: "ÁFRICA" },
];

export default function MapView() {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("ahora");
  const [selected, setSelected] = useState<string | null>(null);

  const totalOnline = PINS.filter((p) => p.online).reduce((acc, p) => acc + p.count, 0);
  const totalUsers = PINS.reduce((acc, p) => acc + p.count, 0);

  return (
    <div className="flex flex-col h-full">
      <header
        className="sticky top-0 z-20 px-4 py-3 flex items-center justify-between border-b border-border/30"
        style={{ background: "rgba(8,7,18,0.9)", backdropFilter: "blur(20px)" }}
      >
        <h1 className="font-display text-2xl tracking-wide">Mapa Global</h1>
        <div className="flex items-center gap-2 text-sm font-sans">
          <span className="flex items-center gap-1 text-green-400">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
            </span>
            {totalOnline} online
          </span>
          <span className="text-muted-foreground">· {totalUsers} total</span>
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

        <div
          className="absolute inset-0"
          style={{
            background: "radial-gradient(ellipse 50% 30% at 50% 50%, rgba(168,85,247,0.04) 0%, transparent 70%)",
          }}
        />

        {REGION_LABELS.map((r) => (
          <span
            key={r.text}
            className="absolute font-display text-[9px] tracking-widest select-none pointer-events-none"
            style={{ left: r.x, top: r.y, color: "rgba(168,85,247,0.25)", transform: "translate(-50%,-50%)" }}
          >
            {r.text}
          </span>
        ))}

        {PINS.map((pin) => {
          const isSelected = selected === pin.id;
          return (
            <button
              key={pin.id}
              className="absolute transform -translate-x-1/2 -translate-y-1/2 group"
              style={{ left: pin.x, top: pin.y }}
              onClick={() => setSelected(isSelected ? null : pin.id)}
            >
              {pin.online && (
                <span
                  className="absolute inset-0 rounded-full animate-ping"
                  style={{
                    background: "rgba(168,85,247,0.25)",
                    transform: "scale(1.8)",
                  }}
                />
              )}
              <div
                className="relative w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold font-display shadow-lg transition-transform group-hover:scale-110"
                style={{
                  background: pin.online
                    ? "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))"
                    : "rgba(80,70,110,0.8)",
                  boxShadow: pin.online ? "0 0 12px rgba(168,85,247,0.5)" : "none",
                }}
              >
                {pin.count}
              </div>
              {isSelected && (
                <div
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 rounded-lg text-[10px] font-sans whitespace-nowrap border border-border/40"
                  style={{ background: "rgba(13,11,26,0.95)" }}
                >
                  <span className="text-foreground font-medium">{pin.label}</span>
                  <span className="text-muted-foreground ml-1">· {pin.count} usuarios</span>
                </div>
              )}
            </button>
          );
        })}

        <div
          className="absolute bottom-3 left-3 right-3 px-4 py-3 rounded-xl border border-primary/20 flex items-center gap-3"
          style={{ background: "rgba(13,11,26,0.9)", backdropFilter: "blur(10px)" }}
        >
          <Flame className="w-4 h-4 text-orange-400 flex-shrink-0" style={{ filter: "drop-shadow(0 0 6px rgba(249,115,22,0.8))" }} />
          <div>
            <p className="font-display text-sm tracking-wide text-primary">Mapa en tiempo real</p>
            <p className="font-sans text-[10px] text-muted-foreground">Próximamente: ve quién está cerca ahora mismo</p>
          </div>
        </div>
      </div>

      <div className="px-4 pb-4 grid grid-cols-3 gap-2">
        {[
          { icon: Users, label: "Conectados", value: `${totalOnline}` },
          { icon: MapPin, label: "Ciudades", value: `${PINS.length}` },
          { icon: Flame, label: "Países", value: "12" },
        ].map(({ icon: Icon, label, value }) => (
          <div
            key={label}
            className="flex flex-col items-center py-3 rounded-xl border border-border/30"
            style={{ background: "rgba(13,11,26,0.7)" }}
          >
            <span className="font-display text-xl text-primary">{value}</span>
            <span className="font-sans text-[10px] text-muted-foreground mt-0.5">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
