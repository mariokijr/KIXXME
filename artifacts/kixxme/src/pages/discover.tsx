import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  MapPin,
  Loader2,
  Share2,
  Users,
  Heart,
  Star,
  BadgeCheck,
  Flag,
  Sparkles,
  X,
} from "lucide-react";
import {
  useListMyLikes,
  getListMyLikesQueryKey,
  useListOnlineProfiles,
  getListOnlineProfilesQueryKey,
  useUnlikeProfile,
  useGetStripeTrialStatus,
  getGetStripeTrialStatusQueryKey,
  PublicProfile,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useNotifications } from "@/lib/notifications";
import { useLikeActions } from "@/lib/like-actions";
import { useStartConversation } from "@/lib/use-start-conversation";
import { useAuth } from "@/lib/auth";
import { KixxMeLogo } from "@/components/brand/kixxme-logo";
import { gradFor, initialsFor, formatDistance } from "@/lib/profile-format";
import { ModeToggle, type DiscoverMode } from "@/components/discover-mode-toggle";
import { SwipeView } from "@/components/swipe-deck";
import { ReportDialog } from "@/components/report-dialog";

const TRIAL_BANNER_KEY = "kixxme:trial-banner-dismissed";

function TrialBanner() {
  const { session } = useAuth();
  const [, setLocation] = useLocation();
  const [dismissed, setDismissed] = useState(() => {
    try { return !!localStorage.getItem(TRIAL_BANNER_KEY); } catch { return false; }
  });

  const { data: trialStatus } = useGetStripeTrialStatus({
    query: {
      enabled: !!session && !dismissed,
      queryKey: getGetStripeTrialStatusQueryKey(),
    },
  });

  if (dismissed || trialStatus?.eligible !== true) return null;

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(TRIAL_BANNER_KEY, "1"); } catch { /* ignore */ }
  };

  return (
    <div
      className="fixed bottom-20 left-3 right-3 z-30 rounded-2xl px-4 py-3 flex items-center gap-3 border shadow-lg"
      style={{
        background: "linear-gradient(135deg, rgba(139,92,246,0.18) 0%, rgba(236,72,153,0.14) 100%)",
        borderColor: "rgba(139,92,246,0.45)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
    >
      <span className="text-2xl select-none" aria-hidden>👑</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-white leading-tight">5 días de Gold gratis</p>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
          Accede a todas las funciones premium sin coste
        </p>
      </div>
      <button
        onClick={() => setLocation("/trial")}
        className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold text-white transition-opacity hover:opacity-90 active:opacity-75"
        style={{ background: "linear-gradient(135deg, #8b5cf6, #ec4899)" }}
      >
        Activar
      </button>
      <button
        onClick={dismiss}
        className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-white transition-colors"
        aria-label="Cerrar banner"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export { gradFor, formatDistance } from "@/lib/profile-format";

const DISCOVER_MODE_KEY = "kixxme:discover-mode";

function readMode(): DiscoverMode {
  if (typeof window === "undefined") return "tarjetas";
  const v = window.localStorage.getItem(DISCOVER_MODE_KEY);
  return v === "cuadricula" || v === "enlinea" ? v : "tarjetas";
}

export default function Discover() {
  const [mode, setMode] = useState<DiscoverMode>(readMode);

  const changeMode = (m: DiscoverMode) => {
    setMode(m);
    try {
      window.localStorage.setItem(DISCOVER_MODE_KEY, m);
    } catch {
      /* ignore storage errors */
    }
  };

  return (
    <>
      {mode === "tarjetas" ? (
        <SwipeView mode={mode} setMode={changeMode} />
      ) : (
        <GridDiscover
          mode={mode}
          setMode={changeMode}
          source={mode === "cuadricula" ? "likes" : "online"}
        />
      )}
      <TrialBanner />
    </>
  );
}

function GridDiscover({
  mode,
  setMode,
  source,
}: {
  mode: DiscoverMode;
  setMode: (m: DiscoverMode) => void;
  source: "likes" | "online";
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { newLikes, newMatches } = useNotifications();
  const likesBadge = newLikes + newMatches;

  // Only the active source actually fetches; the other stays disabled.
  const likesQuery = useListMyLikes({
    query: { queryKey: getListMyLikesQueryKey(), enabled: source === "likes" },
  });
  const onlineQuery = useListOnlineProfiles({
    query: {
      queryKey: getListOnlineProfilesQueryKey(),
      enabled: source === "online",
    },
  });
  const {
    data: rawProfiles = [],
    isLoading,
    isError,
  } = source === "likes" ? likesQuery : onlineQuery;

  // Sort "En línea" profiles by distance (closest first, nulls last).
  // The backend already returns distance_km for each profile; sorting
  // client-side is safe here because the online list is relatively small.
  const profiles =
    source === "online"
      ? [...rawProfiles].sort((a, b) => {
          if (a.distance_km == null) return 1;
          if (b.distance_km == null) return -1;
          return a.distance_km - b.distance_km;
        })
      : rawProfiles;

  const { start } = useStartConversation();
  const likeActions = useLikeActions();
  const unlikeMut = useUnlikeProfile();

  const invalidate = () =>
    qc.invalidateQueries({
      queryKey:
        source === "likes"
          ? getListMyLikesQueryKey()
          : getListOnlineProfilesQueryKey(),
    });

  const handleToggleLike = (user: PublicProfile) => {
    if (user.liked_by_me) {
      unlikeMut.mutate({ id: user.id }, { onSettled: invalidate });
    } else {
      likeActions.like(user, { onSettled: invalidate });
    }
  };

  const handleSuperLike = (user: PublicProfile) => {
    likeActions.superLike(user, { onSettled: invalidate });
  };

  const handleShare = async () => {
    const shareData = {
      title: "KixxMe",
      text: "¡Únete a KixxMe y conecta con chicos cerca de ti! ✨",
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

  const onlineCount = profiles.filter((u) => u.is_online).length;
  const isEmpty = !isLoading && (isError || profiles.length === 0);

  const heading = source === "likes" ? "Tus Me gusta" : "En línea ahora";

  return (
    <div className="min-h-full">
      <header
        className="sticky top-0 z-20 px-4 py-3 flex items-center justify-between border-b border-border/30"
        style={{ background: "rgba(8,7,18,0.92)", backdropFilter: "blur(20px)" }}
      >
        <div className="flex items-center gap-2">
          <KixxMeLogo size={22} withWordmark />
          {!isLoading && !isError && onlineCount > 0 && (
            <span
              className="flex items-center gap-1.5 text-[10px] font-sans px-2 py-0.5 rounded-full border border-green-500/30 text-green-400"
              style={{ background: "rgba(34,197,94,0.08)" }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              {onlineCount} en línea
            </span>
          )}
        </div>
        <Link href="/matches">
          <button
            className="relative w-9 h-9 rounded-full flex items-center justify-center border border-border/40 transition-colors hover:border-primary/50"
            style={{ background: "rgba(255,255,255,0.04)" }}
            aria-label="Emparejamientos"
            data-testid="link-matches"
          >
            <Heart className="w-4 h-4 text-primary" />
            {likesBadge > 0 && (
              <span
                className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full text-[10px] font-bold text-white border border-background"
                style={{
                  background:
                    "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
                }}
                data-testid="badge-likes"
              >
                {likesBadge > 99 ? "99+" : likesBadge}
              </span>
            )}
          </button>
        </Link>
      </header>

      <div className="px-4 pt-3 flex justify-center">
        <ModeToggle mode={mode} setMode={setMode} />
      </div>

      <div className="px-4 pt-4 pb-2">
        <h2 className="font-display text-3xl tracking-wide leading-tight">
          {heading}
        </h2>
        {!isLoading && !isError && profiles.length > 0 && (
          <p className="text-muted-foreground font-sans text-sm mt-1">
            {profiles.length} perfil{profiles.length !== 1 ? "es" : ""}
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="font-sans text-sm text-muted-foreground">
            Cargando perfiles...
          </p>
        </div>
      ) : isEmpty ? (
        <EmptyState
          source={source}
          onShare={handleShare}
          onExplore={() => setMode("tarjetas")}
        />
      ) : (
        <div className="px-4 pb-6 grid grid-cols-2 gap-3">
          {profiles.map((user) => (
            <UserCard
              key={user.id}
              user={user}
              grad={gradFor(user.id)}
              onMessage={() => start(user.id)}
              onToggleLike={() => handleToggleLike(user)}
              onSuperLike={() => handleSuperLike(user)}
              superLikePending={likeActions.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({
  source,
  onShare,
  onExplore,
}: {
  source: "likes" | "online";
  onShare: () => void;
  onExplore: () => void;
}) {
  const isLikes = source === "likes";
  const title = isLikes
    ? "Aún no has dado Me gusta."
    : "Nadie en línea ahora mismo.";
  const subtitle = isLikes
    ? "Explora los perfiles y toca el corazón para guardarlos aquí."
    : "Vuelve más tarde o invita a tus amigos para llenar la app.";

  return (
    <div className="flex flex-col items-center justify-center py-16 gap-6 text-center px-8">
      <div
        className="w-24 h-24 rounded-2xl flex items-center justify-center border border-primary/20"
        style={{ background: "rgba(168,85,247,0.08)" }}
      >
        {isLikes ? (
          <Heart
            className="w-12 h-12 text-primary"
            style={{ filter: "drop-shadow(0 0 12px rgba(168,85,247,0.5))" }}
          />
        ) : (
          <Users
            className="w-12 h-12 text-primary"
            style={{ filter: "drop-shadow(0 0 12px rgba(168,85,247,0.5))" }}
          />
        )}
      </div>

      <div className="space-y-2">
        <h3 className="font-display text-2xl tracking-wide text-foreground">{title}</h3>
        <p className="font-sans text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
          {subtitle}
        </p>
      </div>

      {isLikes ? (
        <button
          onClick={onExplore}
          className="flex items-center gap-2 h-12 px-8 rounded-xl font-display text-lg tracking-widest text-white hover:opacity-90 transition-opacity border-0"
          style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))" }}
          data-testid="button-explore-cards"
        >
          <Sparkles className="w-4 h-4" />
          Explorar perfiles
        </button>
      ) : (
        <button
          onClick={onShare}
          className="flex items-center gap-2 h-12 px-8 rounded-xl font-display text-lg tracking-widest text-white hover:opacity-90 transition-opacity border-0"
          style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))" }}
        >
          <Share2 className="w-4 h-4" />
          Compartir KixxMe
        </button>
      )}
    </div>
  );
}

export function UserCard({
  user,
  grad,
  onMessage,
  onToggleLike,
  onSuperLike,
  superLikePending,
}: {
  user: PublicProfile;
  grad: string;
  onMessage: () => void;
  onToggleLike: () => void;
  onSuperLike: () => void;
  superLikePending?: boolean;
}) {
  const distance = formatDistance(user.distance_km);
  const [reportOpen, setReportOpen] = useState(false);

  return (
    <div
      className="relative rounded-2xl overflow-hidden border border-border/30 group"
      style={{ background: "rgba(13,11,26,0.8)", aspectRatio: "3/4" }}
    >
      {user.avatar_url ? (
        <img
          src={user.avatar_url}
          alt={user.username ?? ""}
          className="absolute inset-0 w-full h-full object-cover"
        />
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

      <div className="absolute top-2 left-2 flex items-center gap-1.5">
        {user.is_online && (
          <span
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-sans font-medium text-white"
            style={{ background: "rgba(34,197,94,0.85)" }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-white" />
            En línea
          </span>
        )}
        {user.matched && (
          <span
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-sans font-medium text-white"
            style={{
              background:
                "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
            }}
            data-testid="badge-match"
          >
            <Heart className="w-2.5 h-2.5" fill="white" />
            Match
          </span>
        )}
      </div>

      {user.is_verified && (
        <div className="absolute top-2 right-2">
          <BadgeCheck
            className="w-5 h-5 text-sky-400"
            style={{ filter: "drop-shadow(0 0 4px rgba(56,189,248,0.6))" }}
          />
        </div>
      )}

      <button
        onClick={onSuperLike}
        disabled={superLikePending}
        className="absolute bottom-[6.5rem] right-2 w-9 h-9 rounded-full flex items-center justify-center border border-white/25 backdrop-blur-sm transition-transform active:scale-90 disabled:opacity-50"
        style={{
          background:
            "linear-gradient(135deg, hsl(199,89%,52%), hsl(273,85%,55%))",
          boxShadow: "0 0 12px rgba(56,189,248,0.45)",
        }}
        aria-label="SuperLike"
        data-testid="button-superlike"
      >
        <Star className="w-5 h-5 text-white" fill="white" />
      </button>

      <button
        onClick={onToggleLike}
        className="absolute bottom-16 right-2 w-9 h-9 rounded-full flex items-center justify-center border border-white/20 backdrop-blur-sm transition-transform active:scale-90"
        style={{ background: "rgba(0,0,0,0.4)" }}
        aria-label={user.liked_by_me ? "Quitar me gusta" : "Me gusta"}
      >
        <Heart
          className="w-5 h-5 transition-colors"
          style={{
            color: user.liked_by_me ? "hsl(330,85%,60%)" : "white",
            fill: user.liked_by_me ? "hsl(330,85%,60%)" : "transparent",
          }}
        />
      </button>

      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2"
        style={{ background: "rgba(0,0,0,0.5)" }}
      >
        <Link href={`/profile/${user.id}`}>
          <button
            className="px-3 py-1.5 rounded-lg text-xs font-sans font-medium text-white border border-white/30"
            style={{ background: "rgba(255,255,255,0.12)" }}
          >
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
        <button
          onClick={() => setReportOpen(true)}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white/80 hover:text-red-400 border border-white/20"
          style={{ background: "rgba(0,0,0,0.4)" }}
          aria-label="Reportar"
          title="Reportar"
          data-testid="button-report-card"
        >
          <Flag className="w-3.5 h-3.5" />
        </button>
      </div>

      <div
        className="absolute bottom-0 left-0 right-0 px-3 py-3 pointer-events-none"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)" }}
      >
        <p className="font-display text-base text-white leading-tight tracking-wide truncate">
          {user.username}
        </p>
        <div className="flex items-center justify-between mt-0.5">
          <span className="font-sans text-xs text-white/70 truncate">
            {[user.age, user.city].filter(Boolean).join(" · ") || "Nuevo usuario"}
          </span>
          {distance && (
            <span className="flex items-center gap-0.5 font-sans text-[10px] text-white/60 flex-shrink-0 ml-1">
              <MapPin className="w-2.5 h-2.5" />
              {distance}
            </span>
          )}
        </div>
      </div>

      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        targetUserId={user.id}
        username={user.username}
        targetType="profile"
      />
    </div>
  );
}
