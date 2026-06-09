import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { Bell, SlidersHorizontal, MapPin, Wifi, Loader2, Share2, Users, FlaskConical } from "lucide-react";
import {
  useListProfiles,
  useCreateOrGetConversation,
  PublicProfile,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

type FilterType = "todos" | "online" | "con-foto";

const GRAD_PALETTE = [
  "from-violet-700 to-purple-900",
  "from-pink-600 to-rose-900",
  "from-orange-600 to-red-900",
  "from-cyan-600 to-blue-900",
  "from-emerald-600 to-teal-900",
  "from-fuchsia-600 to-purple-900",
  "from-blue-600 to-indigo-900",
  "from-rose-600 to-pink-900",
];

function gradFor(id: string) {
  let h = 0;
  for (const c of id) { h = ((h << 5) - h) + c.charCodeAt(0); h |= 0; }
  return GRAD_PALETTE[Math.abs(h) % GRAD_PALETTE.length];
}

function initialsFor(username: string) {
  return (username || "?").slice(0, 2).toUpperCase();
}

export default function Discover() {
  const { session } = useAuth();
  const [filter, setFilter] = useState<FilterType>("todos");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [seeding, setSeeding] = useState(false);

  const { data: profiles = [], isLoading, isError } = useListProfiles();

  const createConv = useCreateOrGetConversation();

  const filtered = profiles.filter((u) => {
    if (filter === "con-foto") return !!u.avatar_url;
    return true;
  });

  const isEmpty = !isLoading && (isError || filtered.length === 0);

  const handleMessage = (userId: string) => {
    createConv.mutate(
      { data: { other_user_id: userId } },
      {
        onSuccess: (conv) => setLocation(`/chats/${conv.id}`),
      }
    );
  };

  const handleShare = async () => {
    const shareData = {
      title: "KixxMe",
      text: "¡Únete a KixxMe y conecta con chicos cerca de ti! 🔥",
      url: window.location.origin,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        /* cancelled */
      }
    } else {
      await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
      toast({ title: "¡Enlace copiado!" });
    }
  };

  const handleSeedUsers = async () => {
    setSeeding(true);
    try {
      const res = await fetch("/api/dev/seed-users", { method: "POST" });
      const json = await res.json();
      const created = json.results?.filter((r: any) => r.status === "created").length ?? 0;
      toast({ title: `${created} usuario${created !== 1 ? "s" : ""} creado${created !== 1 ? "s" : ""} ✓` });
    } catch {
      toast({ title: "Error al crear usuarios", variant: "destructive" });
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="min-h-full">
      <header
        className="sticky top-0 z-20 px-4 py-3 flex items-center justify-between border-b border-border/30"
        style={{ background: "rgba(8,7,18,0.92)", backdropFilter: "blur(20px)" }}
      >
        <div className="flex items-center gap-2">
          <span className="font-display text-2xl tracking-tight text-gradient-brand leading-none">
            KIXXME
          </span>
          {!isLoading && !isError && profiles.length > 0 && (
            <span
              className="flex items-center gap-1 text-[10px] font-sans px-2 py-0.5 rounded-full border border-green-500/30 text-green-400"
              style={{ background: "rgba(34,197,94,0.08)" }}
            >
              <Wifi className="w-2.5 h-2.5" />
              {profiles.length} perfil{profiles.length !== 1 ? "es" : ""}
            </span>
          )}
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
        {!isLoading && !isError && filtered.length > 0 && (
          <p className="text-muted-foreground font-sans text-sm mt-1">
            {filtered.length} perfil{filtered.length !== 1 ? "es" : ""} disponible{filtered.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      <div className="px-4 py-3 flex gap-2 overflow-x-auto no-scrollbar">
        {(["todos", "con-foto", "online"] as FilterType[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-sans font-medium border transition-all duration-200"
            style={
              filter === f
                ? { background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))", borderColor: "transparent", color: "white" }
                : { background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.1)", color: "hsl(240,10%,55%)" }
            }
          >
            {f === "todos" ? "Todos" : f === "con-foto" ? "Con foto" : "Online"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="font-sans text-sm text-muted-foreground">Cargando perfiles...</p>
        </div>
      ) : isEmpty ? (
        <EmptyState onShare={handleShare} onSeed={handleSeedUsers} seeding={seeding} />
      ) : (
        <div className="px-4 pb-6 grid grid-cols-2 gap-3">
          {filtered.map((user) => (
            <UserCard
              key={user.id}
              user={user}
              grad={gradFor(user.id)}
              onMessage={() => handleMessage(user.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({
  onShare,
  onSeed,
  seeding,
}: {
  onShare: () => void;
  onSeed: () => void;
  seeding: boolean;
}) {
  const isDev = import.meta.env.DEV;

  return (
    <div className="flex flex-col items-center justify-center py-16 gap-6 text-center px-8">
      <div
        className="w-24 h-24 rounded-2xl flex items-center justify-center border border-primary/20"
        style={{ background: "rgba(168,85,247,0.08)" }}
      >
        <Users
          className="w-12 h-12 text-primary"
          style={{ filter: "drop-shadow(0 0 12px rgba(168,85,247,0.5))" }}
        />
      </div>

      <div className="space-y-2">
        <h3 className="font-display text-2xl tracking-wide text-foreground">
          Todavía no hay usuarios cerca.
        </h3>
        <p className="font-sans text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
          Invita a tus amigos para empezar.
        </p>
      </div>

      <button
        onClick={onShare}
        className="flex items-center gap-2 h-12 px-8 rounded-xl font-display text-lg tracking-widest text-white hover:opacity-90 transition-opacity border-0"
        style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))" }}
      >
        <Share2 className="w-4 h-4" />
        Compartir KixxMe
      </button>

      {isDev && (
        <button
          onClick={onSeed}
          disabled={seeding}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-sans text-sm font-medium border border-amber-500/30 text-amber-400 hover:border-amber-500/60 transition-colors disabled:opacity-50"
          style={{ background: "rgba(234,179,8,0.06)" }}
        >
          {seeding ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <FlaskConical className="w-3.5 h-3.5" />
          )}
          {seeding ? "Creando..." : "Crear 5 usuarios de prueba"}
        </button>
      )}
    </div>
  );
}

function UserCard({
  user,
  grad,
  onMessage,
}: {
  user: PublicProfile;
  grad: string;
  onMessage: () => void;
}) {
  return (
    <div
      className="relative rounded-2xl overflow-hidden border border-border/30 group"
      style={{ background: "rgba(13,11,26,0.8)", aspectRatio: "3/4" }}
    >
      {user.avatar_url ? (
        <img src={user.avatar_url} alt={user.username} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <>
          <div className={`absolute inset-0 bg-gradient-to-br ${grad} opacity-60`} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-5xl text-white/90 drop-shadow-lg">
              {initialsFor(user.username)}
            </span>
          </div>
        </>
      )}

      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2"
        style={{ background: "rgba(0,0,0,0.5)" }}
      >
        <Link href={`/profile/${user.id}`}>
          <button className="px-3 py-1.5 rounded-lg text-xs font-sans font-medium text-white border border-white/30"
            style={{ background: "rgba(255,255,255,0.12)" }}>
            Ver
          </button>
        </Link>
        <button
          onClick={onMessage}
          className="px-3 py-1.5 rounded-lg text-xs font-sans font-medium text-white border border-primary/50"
          style={{ background: "rgba(168,85,247,0.3)" }}
        >
          Mensaje
        </button>
      </div>

      <div
        className="absolute bottom-0 left-0 right-0 px-3 py-3"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)" }}
      >
        <p className="font-display text-base text-white leading-tight tracking-wide truncate">
          {user.username}
        </p>
        <div className="flex items-center justify-between mt-0.5">
          <span className="font-sans text-xs text-white/70">
            {[user.age, user.city].filter(Boolean).join(" · ") || "Nuevo usuario"}
          </span>
          {user.city && (
            <span className="flex items-center gap-0.5 font-sans text-[10px] text-white/60">
              <MapPin className="w-2.5 h-2.5" />
              {user.city}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
