import React, { useState } from "react";
import { Link } from "wouter";
import { Bell, SlidersHorizontal, MapPin, Wifi } from "lucide-react";

type FilterType = "todos" | "cerca" | "online";

const MOCK_USERS = [
  { id: "1", username: "alejandro_94", age: 28, city: "Madrid", online: true, distance: "1.2 km", grad: "from-violet-700 to-purple-900", initials: "AJ" },
  { id: "2", username: "sofia_yg", age: 24, city: "Barcelona", online: true, distance: "3.4 km", grad: "from-pink-600 to-rose-900", initials: "SF" },
  { id: "3", username: "carlos_mx", age: 31, city: "Valencia", online: false, distance: "2.1 km", grad: "from-orange-600 to-red-900", initials: "CM" },
  { id: "4", username: "luna_fit", age: 26, city: "Sevilla", online: true, distance: "5.7 km", grad: "from-cyan-600 to-blue-900", initials: "LF" },
  { id: "5", username: "marcos_gym", age: 29, city: "Madrid", online: false, distance: "0.8 km", grad: "from-emerald-600 to-teal-900", initials: "MG" },
  { id: "6", username: "nadia_beach", age: 23, city: "Málaga", online: true, distance: "4.2 km", grad: "from-fuchsia-600 to-purple-900", initials: "NB" },
  { id: "7", username: "ivan_pro", age: 33, city: "Madrid", online: true, distance: "6.1 km", grad: "from-blue-600 to-indigo-900", initials: "IP" },
  { id: "8", username: "paula_run", age: 27, city: "Bilbao", online: false, distance: "9.3 km", grad: "from-rose-600 to-pink-900", initials: "PR" },
];

export default function Discover() {
  const [filter, setFilter] = useState<FilterType>("todos");

  const filtered = MOCK_USERS.filter((u) => {
    if (filter === "online") return u.online;
    if (filter === "cerca") return parseFloat(u.distance) < 5;
    return true;
  });

  const onlineCount = MOCK_USERS.filter((u) => u.online).length;

  return (
    <div className="min-h-full">
      <header
        className="sticky top-0 z-20 px-4 py-3 flex items-center justify-between border-b border-border/30"
        style={{ background: "rgba(8,7,18,0.9)", backdropFilter: "blur(20px)" }}
      >
        <div className="flex items-center gap-2">
          <span
            className="font-display text-2xl tracking-tight text-gradient-brand leading-none"
          >
            KIXXME
          </span>
          <span
            className="flex items-center gap-1 text-[10px] font-sans px-2 py-0.5 rounded-full border border-green-500/30 text-green-400"
            style={{ background: "rgba(34,197,94,0.08)" }}
          >
            <Wifi className="w-2.5 h-2.5" />
            {onlineCount} online
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button className="w-9 h-9 flex items-center justify-center rounded-xl border border-border/40 text-muted-foreground hover:text-foreground transition-colors"
            style={{ background: "rgba(255,255,255,0.04)" }}>
            <Bell className="w-4 h-4" />
          </button>
          <button className="w-9 h-9 flex items-center justify-center rounded-xl border border-border/40 text-muted-foreground hover:text-foreground transition-colors"
            style={{ background: "rgba(255,255,255,0.04)" }}>
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="px-4 pt-4 pb-2">
        <h2 className="font-display text-3xl tracking-wide leading-tight">
          Conecta con chicos cerca de ti
        </h2>
        <p className="text-muted-foreground font-sans text-sm mt-1">
          {MOCK_USERS.length} perfiles cerca de ti
        </p>
      </div>

      <div className="px-4 py-3 flex gap-2 overflow-x-auto no-scrollbar">
        {(["todos", "cerca", "online"] as FilterType[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-sans font-medium border transition-all duration-200"
            style={
              filter === f
                ? {
                    background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
                    borderColor: "transparent",
                    color: "white",
                  }
                : {
                    background: "rgba(255,255,255,0.04)",
                    borderColor: "rgba(255,255,255,0.1)",
                    color: "hsl(240,10%,55%)",
                  }
            }
          >
            {f === "todos" ? "Todos" : f === "cerca" ? "Cerca" : "Online"}
          </button>
        ))}
      </div>

      <div className="px-4 pb-6 grid grid-cols-2 gap-3">
        {filtered.map((user) => (
          <Link key={user.id} href={`/profile/${user.id}`}>
            <div
              className="relative rounded-2xl overflow-hidden border border-border/30 cursor-pointer group"
              style={{ background: "rgba(13,11,26,0.8)", aspectRatio: "3/4" }}
            >
              <div
                className={`absolute inset-0 bg-gradient-to-br ${user.grad} opacity-60 group-hover:opacity-70 transition-opacity`}
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-display text-5xl text-white/90 drop-shadow-lg">
                  {user.initials}
                </span>
              </div>

              {user.online && (
                <div className="absolute top-2.5 right-2.5">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-400" />
                  </span>
                </div>
              )}

              <div
                className="absolute bottom-0 left-0 right-0 px-3 py-3"
                style={{ background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)" }}
              >
                <p className="font-display text-base text-white leading-tight tracking-wide truncate">
                  {user.username}
                </p>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="font-sans text-xs text-white/70">
                    {user.age} · {user.city}
                  </span>
                  <span className="flex items-center gap-0.5 font-sans text-[10px] text-white/60">
                    <MapPin className="w-2.5 h-2.5" />
                    {user.distance}
                  </span>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
