import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type PanInfo,
} from "framer-motion";
import {
  Heart,
  Star,
  X,
  Loader2,
  Info,
  MapPin,
  BadgeCheck,
  RefreshCw,
  Sparkles,
  Flag,
  Globe2,
  Navigation,
} from "lucide-react";
import {
  useListProfiles,
  getListProfilesQueryKey,
  useListProfilePhotos,
  getListProfilePhotosQueryKey,
  useGetLikeQuota,
  getGetLikeQuotaQueryKey,
  useGetMyProfile,
  getGetMyProfileQueryKey,
  type PublicProfile,
} from "@workspace/api-client-react";
import { useNotifications } from "@/lib/notifications";
import { useLikeActions } from "@/lib/like-actions";
import { usePassProfile } from "@workspace/api-client-react";
import { playSound } from "@/lib/sound";
import { KixxMeLogo } from "@/components/brand/kixxme-logo";
import { gradFor, initialsFor, formatDistance } from "@/lib/profile-format";
import { ModeToggle, type DiscoverMode } from "@/components/discover-mode-toggle";
import { ReportDialog } from "@/components/report-dialog";
import { useGeolocation } from "@/lib/use-geolocation";
import { useAuth } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Scope filter (persisted in localStorage)
// ---------------------------------------------------------------------------
const SWIPE_SCOPE_KEY = "kixxme:swipe-scope";
type DiscoverScope = "nearby" | "province" | "spain" | "worldwide";

const SCOPE_LABELS: Record<DiscoverScope, string> = {
  nearby: "Cerca",
  province: "Provincia",
  spain: "España",
  worldwide: "Mundo",
};

function readScope(): DiscoverScope {
  try {
    const v = localStorage.getItem(SWIPE_SCOPE_KEY);
    if (v === "nearby" || v === "province" || v === "spain" || v === "worldwide")
      return v;
  } catch { /* ignore */ }
  return "nearby";
}

function saveScope(s: DiscoverScope) {
  try { localStorage.setItem(SWIPE_SCOPE_KEY, s); } catch { /* ignore */ }
}

type Decision = "like" | "pass" | "superlike";

interface SwipeCardHandle {
  fly: (dir: Decision) => void;
}

const SPRING = { type: "spring" as const, stiffness: 320, damping: 32 };

function ProfileMedia({
  profile,
  className,
}: {
  profile: PublicProfile;
  className?: string;
}) {
  if (profile.avatar_url) {
    return (
      <img
        src={profile.avatar_url}
        alt={profile.username ?? ""}
        draggable={false}
        className={`absolute inset-0 w-full h-full object-cover pointer-events-none ${className ?? ""}`}
      />
    );
  }
  return (
    <div
      className={`absolute inset-0 flex items-center justify-center bg-gradient-to-br ${gradFor(
        profile.id,
      )} ${className ?? ""}`}
    >
      <span className="font-display text-7xl text-white/90 drop-shadow-lg">
        {initialsFor(profile.username)}
      </span>
    </div>
  );
}

/** A static card rendered behind the active card to suggest a stack. */
function BackgroundCard({
  profile,
  depth,
}: {
  profile: PublicProfile;
  depth: number;
}) {
  const scale = depth === 1 ? 0.95 : 0.9;
  const translateY = depth === 1 ? 14 : 28;
  return (
    <div
      className="absolute inset-0 rounded-3xl overflow-hidden border border-white/5 pointer-events-none"
      style={{
        transform: `scale(${scale}) translateY(${translateY}px)`,
        opacity: depth === 1 ? 0.85 : 0.6,
        background: "rgba(13,11,26,0.9)",
        transition: "transform 0.3s ease, opacity 0.3s ease",
      }}
    >
      <ProfileMedia profile={profile} />
      <div
        className="absolute inset-x-0 bottom-0 h-2/5"
        style={{
          background: "linear-gradient(to top, rgba(0,0,0,0.85), transparent)",
        }}
      />
    </div>
  );
}

const SwipeCard = forwardRef<
  SwipeCardHandle,
  {
    profile: PublicProfile;
    onDecision: (dir: Decision) => void;
    onOpenDetail: () => void;
  }
>(({ profile, onDecision, onOpenDetail }, ref) => {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-240, 240], [-16, 16]);
  const likeOpacity = useTransform(x, [30, 150], [0, 1]);
  const passOpacity = useTransform(x, [-30, -150], [0, 1]);
  const superOpacity = useTransform(y, [-30, -150], [0, 1]);
  const decidedRef = useRef(false);
  const [decided, setDecided] = useState(false);

  const decide = (dir: Decision) => {
    if (decidedRef.current) return;
    decidedRef.current = true;
    setDecided(true);
    const tx = dir === "like" ? 720 : dir === "pass" ? -720 : 0;
    const ty = dir === "superlike" ? -920 : 60;
    animate(x, tx, { duration: 0.34, ease: "easeOut" });
    animate(y, ty, {
      duration: 0.34,
      ease: "easeOut",
      onComplete: () => onDecision(dir),
    });
  };

  useImperativeHandle(ref, () => ({ fly: decide }), []);

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const { offset, velocity } = info;
    if (offset.y < -130 && Math.abs(offset.x) < 110) {
      decide("superlike");
    } else if (offset.x > 120 || velocity.x > 750) {
      decide("like");
    } else if (offset.x < -120 || velocity.x < -750) {
      decide("pass");
    } else {
      animate(x, 0, SPRING);
      animate(y, 0, SPRING);
    }
  };

  const distance = formatDistance(profile.distance_km);

  return (
    <motion.div
      className="absolute inset-0 rounded-3xl overflow-hidden border border-white/10 touch-none select-none cursor-grab active:cursor-grabbing"
      style={{
        x,
        y,
        rotate,
        background: "rgba(13,11,26,0.9)",
        boxShadow: "0 24px 70px rgba(0,0,0,0.65)",
      }}
      drag={!decided}
      onDragEnd={handleDragEnd}
      data-testid="swipe-card"
    >
      <ProfileMedia profile={profile} />

      <div
        className="absolute inset-x-0 bottom-0 h-1/2 pointer-events-none"
        style={{
          background: "linear-gradient(to top, rgba(0,0,0,0.92), transparent)",
        }}
      />

      <div className="absolute top-3 left-3 flex items-center gap-1.5">
        {profile.is_online && (
          <span
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-sans font-medium text-white"
            style={{ background: "rgba(34,197,94,0.85)" }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-white" />
            En línea
          </span>
        )}
        {profile.is_verified && (
          <BadgeCheck
            className="w-5 h-5 text-sky-400"
            style={{ filter: "drop-shadow(0 0 4px rgba(56,189,248,0.6))" }}
          />
        )}
      </div>

      <button
        onPointerDownCapture={(e) => e.stopPropagation()}
        onClick={onOpenDetail}
        className="absolute top-3 right-3 w-10 h-10 rounded-full flex items-center justify-center border border-white/25 text-white backdrop-blur-sm transition-transform active:scale-90"
        style={{ background: "rgba(0,0,0,0.4)" }}
        aria-label="Ver perfil completo"
        data-testid="button-card-detail"
      >
        <Info className="w-5 h-5" />
      </button>

      <motion.div
        style={{ opacity: likeOpacity }}
        className="absolute top-10 left-6 px-3 py-1 rounded-lg border-4 border-green-400 text-green-400 font-display text-2xl tracking-widest -rotate-12 pointer-events-none"
      >
        ME GUSTA
      </motion.div>
      <motion.div
        style={{ opacity: passOpacity }}
        className="absolute top-10 right-6 px-3 py-1 rounded-lg border-4 border-red-400 text-red-400 font-display text-2xl tracking-widest rotate-12 pointer-events-none"
      >
        NO
      </motion.div>
      <motion.div
        style={{ opacity: superOpacity }}
        className="absolute left-1/2 top-1/3 -translate-x-1/2 px-4 py-1 rounded-lg border-4 border-sky-400 text-sky-400 font-display text-2xl tracking-widest pointer-events-none"
      >
        SUPER LIKE
      </motion.div>

      <div className="absolute inset-x-0 bottom-0 p-5 pointer-events-none">
        <h3 className="font-display text-3xl text-white leading-tight tracking-wide truncate">
          {profile.username}
          {profile.age ? (
            <span className="text-white/80">, {profile.age}</span>
          ) : null}
        </h3>
        <div className="flex items-center gap-3 mt-1.5 text-white/85 font-sans text-sm">
          {profile.city && <span className="truncate">{profile.city}</span>}
          {distance && (
            <span className="flex items-center gap-1 flex-shrink-0">
              <MapPin className="w-3.5 h-3.5" />
              {distance}
            </span>
          )}
        </div>
        {profile.bio && (
          <p className="mt-2 text-white/70 font-sans text-sm line-clamp-2">
            {profile.bio}
          </p>
        )}
      </div>
    </motion.div>
  );
});
SwipeCard.displayName = "SwipeCard";

function QuotaChip() {
  const { data: quota } = useGetLikeQuota();
  if (!quota) return null;
  const likeLabel = quota.likes.unlimited ? "∞" : String(quota.likes.remaining);
  const superLabel = quota.superlikes.unlimited
    ? "∞"
    : String(quota.superlikes.remaining);
  return (
    <div className="flex items-center justify-center gap-3 pt-2 text-[11px] font-sans text-muted-foreground">
      <span className="flex items-center gap-1">
        <Heart className="w-3 h-3 text-pink-400" fill="currentColor" />
        {likeLabel}
      </span>
      <span className="opacity-30">·</span>
      <span className="flex items-center gap-1">
        <Star className="w-3 h-3 text-sky-400" fill="currentColor" />
        {superLabel}
      </span>
    </div>
  );
}

function ActionButton({
  onClick,
  label,
  size,
  gradient,
  children,
  testid,
}: {
  onClick: () => void;
  label: string;
  size: "sm" | "lg";
  gradient: string;
  children: React.ReactNode;
  testid: string;
}) {
  const dim = size === "lg" ? "w-16 h-16" : "w-12 h-12";
  return (
    <button
      onClick={onClick}
      aria-label={label}
      data-testid={testid}
      className={`${dim} rounded-full flex items-center justify-center border border-white/15 transition-transform active:scale-90 hover:scale-105`}
      style={{ background: gradient, boxShadow: "0 8px 24px rgba(0,0,0,0.45)" }}
    >
      {children}
    </button>
  );
}

function ProfileDetailSheet({
  profile,
  onClose,
  onAction,
}: {
  profile: PublicProfile;
  onClose: () => void;
  onAction: (dir: Decision) => void;
}) {
  const { data: photos = [] } = useListProfilePhotos(profile.id, {
    query: {
      enabled: !!profile.id,
      queryKey: getListProfilePhotosQueryKey(profile.id),
    },
  });
  const gallery =
    photos.length > 0
      ? photos.map((p) => p.url)
      : profile.avatar_url
        ? [profile.avatar_url]
        : [];
  const distance = formatDistance(profile.distance_km);
  const [reportOpen, setReportOpen] = useState(false);

  return (
    <div
      className="fixed inset-0 z-[90] flex flex-col animate-in fade-in slide-in-from-bottom-6 duration-300"
      style={{ background: "rgba(8,7,18,0.98)", backdropFilter: "blur(14px)" }}
      data-testid="sheet-profile-detail"
    >
      <header className="flex items-center justify-between px-4 py-3 border-b border-border/30">
        <h2 className="font-display text-xl tracking-wide truncate">
          {profile.username}
          {profile.age ? `, ${profile.age}` : ""}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setReportOpen(true)}
            className="w-9 h-9 rounded-full flex items-center justify-center border border-border/40 text-muted-foreground hover:text-red-400 transition-colors"
            aria-label="Reportar"
            title="Reportar"
            data-testid="button-detail-report"
          >
            <Flag className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center border border-border/40 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Cerrar"
            data-testid="button-close-detail"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {gallery.length > 0 ? (
          gallery.map((url, i) => (
            <div
              key={i}
              className="relative w-full rounded-2xl overflow-hidden border border-border/30"
              style={{ aspectRatio: "4/5" }}
            >
              <img
                src={url}
                alt={`${profile.username ?? "perfil"} ${i + 1}`}
                className="absolute inset-0 w-full h-full object-cover"
              />
            </div>
          ))
        ) : (
          <div
            className={`relative w-full rounded-2xl overflow-hidden border border-border/30 flex items-center justify-center bg-gradient-to-br ${gradFor(
              profile.id,
            )}`}
            style={{ aspectRatio: "4/5" }}
          >
            <span className="font-display text-7xl text-white/90">
              {initialsFor(profile.username)}
            </span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {profile.is_online && (
            <span
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-sans text-white"
              style={{ background: "rgba(34,197,94,0.85)" }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-white" />
              En línea
            </span>
          )}
          {profile.is_verified && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-sans text-sky-400 border border-sky-400/40">
              <BadgeCheck className="w-3.5 h-3.5" />
              Verificado
            </span>
          )}
          {distance && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-sans text-muted-foreground border border-border/40">
              <MapPin className="w-3.5 h-3.5" />
              {distance}
            </span>
          )}
          {profile.gender && (
            <span className="px-2.5 py-1 rounded-full text-xs font-sans text-muted-foreground border border-border/40">
              {profile.gender}
            </span>
          )}
        </div>

        {profile.bio && (
          <div className="space-y-1.5">
            <h3 className="font-display text-sm tracking-widest text-muted-foreground uppercase">
              Sobre mí
            </h3>
            <p className="font-sans text-base text-foreground/90 leading-relaxed whitespace-pre-wrap">
              {profile.bio}
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-5 px-6 py-4 border-t border-border/30">
        <ActionButton
          onClick={() => onAction("pass")}
          label="No me interesa"
          size="lg"
          gradient="rgba(40,38,56,0.95)"
          testid="button-detail-pass"
        >
          <X className="w-7 h-7 text-rose-400" />
        </ActionButton>
        <ActionButton
          onClick={() => onAction("superlike")}
          label="SuperLike"
          size="sm"
          gradient="linear-gradient(135deg, hsl(199,89%,52%), hsl(273,85%,55%))"
          testid="button-detail-superlike"
        >
          <Star className="w-6 h-6 text-white" fill="white" />
        </ActionButton>
        <ActionButton
          onClick={() => onAction("like")}
          label="Me gusta"
          size="lg"
          gradient="linear-gradient(135deg, hsl(330,85%,55%), hsl(273,85%,55%))"
          testid="button-detail-like"
        >
          <Heart className="w-7 h-7 text-white" fill="white" />
        </ActionButton>
      </div>

      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        targetUserId={profile.id}
        username={profile.username}
        targetType="profile"
      />
    </div>
  );
}

/**
 * Tinder-style swipe discovery deck. Consumes the shared like engine
 * (`useLikeActions`) so quota limits, Spanish upsell toasts and the match
 * celebration all behave exactly like the rest of the app.
 */
export function SwipeView({
  mode,
  setMode,
}: {
  mode: DiscoverMode;
  setMode: (m: DiscoverMode) => void;
}) {
  const qc = useQueryClient();
  const { newLikes, newMatches } = useNotifications();
  const likesBadge = newLikes + newMatches;
  const likeActions = useLikeActions();
  const passMut = usePassProfile();

  // --- Scope & location ---------------------------------------------------
  const [scope, setScopeState] = useState<DiscoverScope>(readScope);
  const [index, setIndex] = useState(0);
  const [detail, setDetail] = useState<PublicProfile | null>(null);

  const { session } = useAuth();
  const geo = useGeolocation();

  const { data: ownProfile } = useGetMyProfile({
    query: { enabled: !!session, queryKey: getGetMyProfileQueryKey() },
  });
  const hasCoords = ownProfile?.latitude != null;

  const setScope = (s: DiscoverScope) => {
    setScopeState(s);
    saveScope(s);
    setIndex(0);
  };

  // Sort by distance whenever a geographic scope is active; fall back to
  // recent for worldwide so the deck stays fresh on low-density installs.
  const sort: "recent" | "distance" =
    scope === "worldwide" ? "recent" : "distance";
  const queryParams = { sort, scope };
  const queryKey = getListProfilesQueryKey(queryParams);

  // -------------------------------------------------------------------------
  const {
    data: profiles = [],
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useListProfiles(queryParams, {
    query: {
      queryKey,
      staleTime: Infinity,
      refetchOnWindowFocus: false,
    },
  });
  const cardRef = useRef<SwipeCardHandle>(null);

  const deck = profiles.slice(index, index + 3);
  const top = deck[0] ?? null;

  const invalidateQuota = () =>
    qc.invalidateQueries({ queryKey: getGetLikeQuotaQueryKey() });

  const handleDecision = (dir: Decision) => {
    const profile = profiles[index];
    if (profile) {
      if (dir === "like") {
        likeActions.like(profile, { onSettled: invalidateQuota });
      } else if (dir === "superlike") {
        likeActions.superLike(profile, { onSettled: invalidateQuota });
      } else {
        playSound("pass");
        passMut.mutate({ id: profile.id });
      }
      // Mark the candidate list stale so a later remount refetches (excluding
      // this now liked/superliked/passed profile) WITHOUT disrupting the
      // current in-session deck order (refetchType "none").
      qc.invalidateQueries({ queryKey, refetchType: "none" });
    }
    setIndex((i) => i + 1);
  };

  const act = (dir: Decision) => {
    if (!top) return;
    cardRef.current?.fly(dir);
  };

  const handleDetailAction = (dir: Decision) => {
    setDetail(null);
    cardRef.current?.fly(dir);
  };

  const restart = () => {
    setIndex(0);
    refetch();
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-72px)]">
      <header
        className="px-4 py-3 flex items-center justify-between border-b border-border/30"
        style={{ background: "rgba(8,7,18,0.92)", backdropFilter: "blur(20px)" }}
      >
        <KixxMeLogo size={22} withWordmark />
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

      <div className="pt-3 flex justify-center">
        <ModeToggle mode={mode} setMode={setMode} />
      </div>

      {/* Scope filter chips */}
      <div className="px-4 pt-2 flex items-center justify-center gap-1.5 flex-wrap">
        {(Object.keys(SCOPE_LABELS) as DiscoverScope[]).map((s) => {
          const active = scope === s;
          return (
            <button
              key={s}
              onClick={() => setScope(s)}
              className="flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-sans font-medium transition-all duration-150"
              style={
                active
                  ? {
                      background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
                      color: "white",
                      boxShadow: "0 0 12px rgba(168,85,247,0.35)",
                    }
                  : {
                      background: "rgba(255,255,255,0.05)",
                      color: "hsl(240,10%,60%)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }
              }
            >
              {s === "nearby" && <Navigation className="w-3 h-3" />}
              {s === "worldwide" && <Globe2 className="w-3 h-3" />}
              {s === "spain" && <span className="text-[10px] leading-none">🇪🇸</span>}
              {SCOPE_LABELS[s]}
            </button>
          );
        })}
      </div>

      {/* Location permission banner — only when scope requires coords and we don't have them */}
      {(scope === "nearby" || scope === "province") && !hasCoords && (
        <div
          className="mx-4 mt-2 px-3 py-2 rounded-xl flex items-center gap-2.5 text-xs font-sans"
          style={{
            background: "rgba(168,85,247,0.1)",
            border: "1px solid rgba(168,85,247,0.25)",
          }}
        >
          <MapPin className="w-3.5 h-3.5 text-primary flex-shrink-0" />
          <span className="flex-1 text-foreground/70 leading-tight">
            Activa tu ubicación para ver personas cerca de ti
          </span>
          <button
            onClick={() => geo.request(() => setIndex(0))}
            disabled={geo.isPending || geo.state === "locating"}
            className="flex-shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-medium text-white disabled:opacity-50 transition-opacity"
            style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))" }}
          >
            {geo.isPending || geo.state === "locating" ? "..." : "Activar"}
          </button>
        </div>
      )}
      {(scope === "nearby" || scope === "province") && geo.state === "denied" && (
        <p className="mx-4 mt-1 text-center text-[10px] font-sans text-muted-foreground/60">
          Permiso denegado · Selecciona "España" para ver perfiles nacionales
        </p>
      )}

      <QuotaChip />

      <div className="flex-1 min-h-0 px-4 py-3">
        <div className="relative w-full h-full max-w-sm mx-auto">
          {isLoading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="font-sans text-sm text-muted-foreground">
                Cargando perfiles...
              </p>
            </div>
          ) : isError ? (
            <DeckEmpty
              title="No se pudieron cargar los perfiles."
              subtitle="Revisa tu conexión e inténtalo de nuevo."
              onRestart={restart}
              isFetching={isFetching}
              onGrid={() => setMode("cuadricula")}
            />
          ) : !top ? (
            <DeckEmpty
              title={
                profiles.length === 0 &&
                (scope === "nearby" || scope === "province")
                  ? "Nadie cerca de ti ahora"
                  : "¡Has visto todos los perfiles!"
              }
              subtitle={
                profiles.length === 0 &&
                (scope === "nearby" || scope === "province")
                  ? "Amplía el alcance con los filtros de arriba para ver más perfiles."
                  : "Vuelve más tarde para descubrir caras nuevas o explora en cuadrícula."
              }
              onRestart={restart}
              isFetching={isFetching}
              onGrid={() => setMode("cuadricula")}
            />
          ) : (
            <>
              {deck[2] && <BackgroundCard profile={deck[2]} depth={2} />}
              {deck[1] && <BackgroundCard profile={deck[1]} depth={1} />}
              <SwipeCard
                key={top.id}
                ref={cardRef}
                profile={top}
                onDecision={handleDecision}
                onOpenDetail={() => setDetail(top)}
              />
            </>
          )}
        </div>
      </div>

      {!isLoading && !isError && top && (
        <div className="flex items-center justify-center gap-6 px-6 pt-1 pb-4">
          <ActionButton
            onClick={() => act("pass")}
            label="No me interesa"
            size="lg"
            gradient="rgba(40,38,56,0.95)"
            testid="button-pass"
          >
            <X className="w-7 h-7 text-rose-400" />
          </ActionButton>
          <ActionButton
            onClick={() => act("superlike")}
            label="SuperLike"
            size="sm"
            gradient="linear-gradient(135deg, hsl(199,89%,52%), hsl(273,85%,55%))"
            testid="button-superlike"
          >
            <Star className="w-6 h-6 text-white" fill="white" />
          </ActionButton>
          <ActionButton
            onClick={() => act("like")}
            label="Me gusta"
            size="lg"
            gradient="linear-gradient(135deg, hsl(330,85%,55%), hsl(273,85%,55%))"
            testid="button-like"
          >
            <Heart className="w-7 h-7 text-white" fill="white" />
          </ActionButton>
        </div>
      )}

      {detail && (
        <ProfileDetailSheet
          profile={detail}
          onClose={() => setDetail(null)}
          onAction={handleDetailAction}
        />
      )}
    </div>
  );
}

function DeckEmpty({
  title,
  subtitle,
  onRestart,
  isFetching,
  onGrid,
}: {
  title: string;
  subtitle: string;
  onRestart: () => void;
  isFetching: boolean;
  onGrid: () => void;
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 text-center px-6">
      <div
        className="w-24 h-24 rounded-2xl flex items-center justify-center border border-primary/20"
        style={{ background: "rgba(168,85,247,0.08)" }}
      >
        <Sparkles
          className="w-12 h-12 text-primary"
          style={{ filter: "drop-shadow(0 0 12px rgba(168,85,247,0.5))" }}
        />
      </div>
      <div className="space-y-2">
        <h3 className="font-display text-2xl tracking-wide text-foreground">
          {title}
        </h3>
        <p className="font-sans text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
          {subtitle}
        </p>
      </div>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          onClick={onRestart}
          disabled={isFetching}
          className="flex items-center justify-center gap-2 h-12 rounded-xl font-display text-lg tracking-widest text-white hover:opacity-90 transition-opacity border-0 disabled:opacity-60"
          style={{
            background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
          }}
          data-testid="button-deck-restart"
        >
          {isFetching ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <RefreshCw className="w-5 h-5" />
          )}
          Buscar de nuevo
        </button>
        <button
          onClick={onGrid}
          className="h-11 rounded-xl font-sans text-sm text-muted-foreground border border-border/40 hover:text-foreground transition-colors"
          data-testid="button-deck-grid"
        >
          Ver en cuadrícula
        </button>
      </div>
    </div>
  );
}
