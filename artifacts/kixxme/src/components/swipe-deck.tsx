import React, {
  forwardRef,
  useImperativeHandle,
  useMemo,
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
  MessageCircle,
  Lock,
  SlidersHorizontal,
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
import {
  gradFor, initialsFor, formatLocation,
  ROLE_LABELS, LOOKING_FOR_LABELS, ORIENTATION_LABELS,
  ZODIAC_LABELS, ALCOHOL_LABELS, EXERCISE_LABELS, PETS_LABELS,
  formatHeightCm,
  interestLabel,
} from "@/lib/profile-format";
import { ModeToggle, type DiscoverMode } from "@/components/discover-mode-toggle";
import { ReportDialog } from "@/components/report-dialog";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { useStartConversation } from "@/lib/use-start-conversation";
import {
  FilterSheet,
  type DiscoverFilters,
  DEFAULT_FILTERS,
  countActiveFilters,
  filtersToParams,
} from "@/components/filter-sheet";

// ---------------------------------------------------------------------------
// Activity-based feed filter (persisted in localStorage)
// ---------------------------------------------------------------------------
const SWIPE_FEED_KEY = "kixxme:swipe-feed";
type DiscoverFeed = "recommended" | "online" | "new" | "popular" | "compatible";

const FEED_OPTIONS: { key: DiscoverFeed; emoji: string; label: string }[] = [
  { key: "recommended", emoji: "✨", label: "Para ti" },
  { key: "online",      emoji: "🟢", label: "En línea" },
  { key: "new",         emoji: "🆕", label: "Nuevos" },
  { key: "popular",     emoji: "🔥", label: "Populares" },
  { key: "compatible",  emoji: "❤️", label: "Compatibles" },
];

function readFeed(): DiscoverFeed {
  try {
    const v = localStorage.getItem(SWIPE_FEED_KEY);
    if (
      v === "recommended" || v === "online" || v === "new" ||
      v === "popular" || v === "compatible"
    ) return v;
  } catch { /* ignore */ }
  return "recommended";
}

function saveFeed(f: DiscoverFeed) {
  try { localStorage.setItem(SWIPE_FEED_KEY, f); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Discover filters (persisted in localStorage)
// ---------------------------------------------------------------------------
const DISCOVER_FILTERS_KEY = "kixxme:discover-filters";

function readFilters(): DiscoverFilters {
  try {
    const raw = localStorage.getItem(DISCOVER_FILTERS_KEY);
    if (raw) return { ...DEFAULT_FILTERS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_FILTERS };
}

function saveFilters(f: DiscoverFilters) {
  try { localStorage.setItem(DISCOVER_FILTERS_KEY, JSON.stringify(f)); } catch { /* ignore */ }
}

type Decision = "like" | "pass" | "superlike";

interface SwipeCardHandle {
  fly: (dir: Decision) => void;
}

const SPRING = { type: "spring" as const, stiffness: 320, damping: 32 };

function ProfileMedia({
  profile,
}: {
  profile: PublicProfile;
}) {
  if (profile.avatar_url) {
    return (
      <img
        src={profile.avatar_url}
        alt={profile.username ?? ""}
        draggable={false}
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
      />
    );
  }
  return (
    <div
      className={`absolute inset-0 flex items-center justify-center bg-gradient-to-br ${gradFor(profile.id)}`}
    >
      <span className="font-display text-8xl text-white/90 drop-shadow-lg">
        {initialsFor(profile.username)}
      </span>
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
  const rotate = useTransform(x, [-280, 280], [-18, 18]);
  const likeOpacity = useTransform(x, [40, 160], [0, 1]);
  const passOpacity = useTransform(x, [-40, -160], [0, 1]);
  const superOpacity = useTransform(y, [-40, -160], [0, 1]);
  const decidedRef = useRef(false);
  const [decided, setDecided] = useState(false);

  const decide = (dir: Decision) => {
    if (decidedRef.current) return;
    decidedRef.current = true;
    setDecided(true);
    const tx = dir === "like" ? 800 : dir === "pass" ? -800 : 0;
    const ty = dir === "superlike" ? -1000 : 60;
    animate(x, tx, { duration: 0.32, ease: "easeOut" });
    animate(y, ty, {
      duration: 0.32,
      ease: "easeOut",
      onComplete: () => onDecision(dir),
    });
  };

  useImperativeHandle(ref, () => ({ fly: decide }), []);

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const { offset, velocity } = info;
    if (offset.y < -120 && Math.abs(offset.x) < 100) {
      decide("superlike");
    } else if (offset.x > 110 || velocity.x > 700) {
      decide("like");
    } else if (offset.x < -110 || velocity.x < -700) {
      decide("pass");
    } else {
      animate(x, 0, SPRING);
      animate(y, 0, SPRING);
    }
  };

  const loc = formatLocation(profile.city, profile.distance_km);

  return (
    <motion.div
      className="absolute inset-0 rounded-3xl overflow-hidden touch-none select-none cursor-grab active:cursor-grabbing"
      style={{
        x,
        y,
        rotate,
        boxShadow: "0 28px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.08)",
      }}
      drag={!decided}
      onDragEnd={handleDragEnd}
      data-testid="swipe-card"
    >
      <ProfileMedia profile={profile} />

      {/* Bottom gradient */}
      <div
        className="absolute inset-x-0 bottom-0 h-2/3 pointer-events-none"
        style={{
          background: "linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.6) 45%, transparent 100%)",
        }}
      />

      {/* Online badge */}
      {profile.is_online && (
        <div className="absolute top-4 left-4">
          <span
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-sans font-semibold text-white"
            style={{ background: "rgba(22,163,74,0.9)", backdropFilter: "blur(8px)" }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            En línea
          </span>
        </div>
      )}

      {/* Info button */}
      <button
        onPointerDownCapture={(e) => e.stopPropagation()}
        onClick={onOpenDetail}
        className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center text-white transition-transform active:scale-90"
        style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.2)" }}
        aria-label="Ver perfil completo"
        data-testid="button-card-detail"
      >
        <Info className="w-5 h-5" />
      </button>

      {/* Swipe labels */}
      <motion.div
        style={{ opacity: likeOpacity, filter: "drop-shadow(0 0 12px rgba(74,222,128,0.5))" }}
        className="absolute top-12 left-5 px-4 py-1.5 rounded-xl border-[3px] border-green-400 text-green-400 font-display text-3xl font-bold tracking-widest -rotate-12 pointer-events-none"
      >
        ME GUSTA
      </motion.div>
      <motion.div
        style={{ opacity: passOpacity }}
        className="absolute top-12 right-5 px-4 py-1.5 rounded-xl border-[3px] border-rose-400 text-rose-400 font-display text-3xl font-bold tracking-widest rotate-12 pointer-events-none"
      >
        PASO
      </motion.div>
      <motion.div
        style={{ opacity: superOpacity }}
        className="absolute top-1/3 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-xl border-[3px] border-sky-400 text-sky-400 font-display text-2xl font-bold tracking-widest pointer-events-none"
      >
        SUPER LIKE
      </motion.div>

      {/* Profile info at bottom */}
      <div className="absolute inset-x-0 bottom-0 px-5 pb-5 pointer-events-none">
        <div className="flex items-end gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-display text-[28px] text-white leading-tight tracking-wide truncate">
                {profile.username}
                {profile.age ? (
                  <span className="text-white/80">, {profile.age}</span>
                ) : null}
              </h3>
              {profile.is_verified && (
                <BadgeCheck
                  className="w-6 h-6 text-sky-400 flex-shrink-0"
                  style={{ filter: "drop-shadow(0 0 6px rgba(56,189,248,0.8))" }}
                />
              )}
            </div>
            <div className="flex items-center gap-1 mt-1 text-white/75 font-sans text-[13px]">
              {loc && (
                <>
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{loc}</span>
                </>
              )}
            </div>
            {(profile.role || profile.looking_for) && (
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                {profile.role && (
                  <span
                    className="px-2 py-0.5 rounded-full text-[10px] font-sans font-medium text-white/90"
                    style={{ background: "rgba(168,85,247,0.5)", border: "1px solid rgba(168,85,247,0.6)" }}
                  >
                    {ROLE_LABELS[profile.role as keyof typeof ROLE_LABELS]}
                  </span>
                )}
                {profile.looking_for && (
                  <span
                    className="px-2 py-0.5 rounded-full text-[10px] font-sans font-medium text-white/90"
                    style={{ background: "rgba(236,72,153,0.45)", border: "1px solid rgba(236,72,153,0.55)" }}
                  >
                    {LOOKING_FOR_LABELS[profile.looking_for as keyof typeof LOOKING_FOR_LABELS]}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
});
SwipeCard.displayName = "SwipeCard";

function QuotaBar() {
  const { data: quota } = useGetLikeQuota();
  if (!quota) return null;
  const likeLabel = quota.likes.unlimited ? "∞" : String(quota.likes.remaining);
  const superLabel = quota.superlikes.unlimited
    ? "∞"
    : String(quota.superlikes.remaining);
  return (
    <div className="flex items-center gap-1 text-[10px] font-sans text-muted-foreground/70 flex-shrink-0">
      <Heart className="w-3 h-3 text-pink-400/80" fill="currentColor" />
      <span>{likeLabel}</span>
      <span className="opacity-40 mx-0.5">·</span>
      <Star className="w-3 h-3 text-sky-400/80" fill="currentColor" />
      <span>{superLabel}</span>
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
  const dim = size === "lg" ? "w-[68px] h-[68px]" : "w-12 h-12";
  return (
    <button
      onClick={onClick}
      aria-label={label}
      data-testid={testid}
      className={`${dim} rounded-full flex items-center justify-center transition-transform active:scale-90 hover:scale-105`}
      style={{ background: gradient, boxShadow: "0 8px 28px rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.12)" }}
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
  const loc = formatLocation(profile.city, profile.distance_km);
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
            className={`relative w-full rounded-2xl overflow-hidden border border-border/30 flex items-center justify-center bg-gradient-to-br ${gradFor(profile.id)}`}
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
          {loc && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-sans text-muted-foreground border border-border/40">
              <MapPin className="w-3.5 h-3.5" />
              {loc}
            </span>
          )}
          {profile.gender && (
            <span className="px-2.5 py-1 rounded-full text-xs font-sans text-muted-foreground border border-border/40">
              {profile.gender}
            </span>
          )}
          {profile.role && ROLE_LABELS[profile.role] && (
            <span className="px-2.5 py-1 rounded-full text-xs font-sans text-primary border border-primary/30"
              style={{ background: "rgba(168,85,247,0.08)" }}>
              {ROLE_LABELS[profile.role]}
            </span>
          )}
          {profile.looking_for && LOOKING_FOR_LABELS[profile.looking_for] && (
            <span className="px-2.5 py-1 rounded-full text-xs font-sans border border-accent/30"
              style={{ background: "rgba(236,72,153,0.08)", color: "hsl(330,85%,65%)" }}>
              {LOOKING_FOR_LABELS[profile.looking_for]}
            </span>
          )}
          {profile.orientation && ORIENTATION_LABELS[profile.orientation] && (
            <span className="px-2.5 py-1 rounded-full text-xs font-sans text-muted-foreground border border-border/40">
              {ORIENTATION_LABELS[profile.orientation]}
            </span>
          )}
          {profile.height_cm && (
            <span className="px-2.5 py-1 rounded-full text-xs font-sans text-muted-foreground border border-border/40">
              📏 {formatHeightCm(profile.height_cm)}
            </span>
          )}
          {profile.zodiac_sign && ZODIAC_LABELS[profile.zodiac_sign] && (
            <span className="px-2.5 py-1 rounded-full text-xs font-sans text-muted-foreground border border-border/40">
              {ZODIAC_LABELS[profile.zodiac_sign]}
            </span>
          )}
          {profile.alcohol && ALCOHOL_LABELS[profile.alcohol] && (
            <span className="px-2.5 py-1 rounded-full text-xs font-sans text-muted-foreground border border-border/40">
              🥂 {ALCOHOL_LABELS[profile.alcohol]}
            </span>
          )}
          {profile.exercise && EXERCISE_LABELS[profile.exercise] && (
            <span className="px-2.5 py-1 rounded-full text-xs font-sans text-muted-foreground border border-border/40">
              🏃 {EXERCISE_LABELS[profile.exercise]}
            </span>
          )}
          {profile.pets && PETS_LABELS[profile.pets] && (
            <span className="px-2.5 py-1 rounded-full text-xs font-sans text-muted-foreground border border-border/40">
              {PETS_LABELS[profile.pets]}
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

        {Array.isArray(profile.interests) && profile.interests.length > 0 && (
          <div className="space-y-2">
            <h3 className="font-display text-sm tracking-widest text-muted-foreground uppercase">
              Intereses
            </h3>
            <div className="flex flex-wrap gap-2">
              {profile.interests.map((slug) => (
                <span
                  key={slug}
                  className="px-2.5 py-1 rounded-full text-xs font-sans border border-primary/30 text-primary/90"
                  style={{ background: "rgba(168,85,247,0.1)" }}
                >
                  {interestLabel(slug)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-5 px-6 py-4 border-t border-border/30">
        <ActionButton
          onClick={() => onAction("pass")}
          label="No me interesa"
          size="lg"
          gradient="rgba(30,27,50,0.98)"
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
 * Tinder-style swipe discovery deck — one card at a time.
 * Swipe right = like, swipe left = pass, swipe up = superlike.
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

  const [feed, setFeedState] = useState<DiscoverFeed>(readFeed);
  const [filters, setFiltersState] = useState<DiscoverFilters>(readFilters);
  const [filterOpen, setFilterOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [detail, setDetail] = useState<PublicProfile | null>(null);

  const { session } = useAuth();
  const [, setLocation] = useLocation();
  const { start: startConversation } = useStartConversation();

  const { data: ownProfile } = useGetMyProfile({
    query: { enabled: !!session, queryKey: getGetMyProfileQueryKey() },
  });

  const isGold = ownProfile?.plan === "gold";
  const plan = (ownProfile?.plan ?? "free") as "free" | "plus" | "gold";
  const activeFilterCount = countActiveFilters(filters);

  const setFeed = (f: DiscoverFeed) => {
    setFeedState(f);
    saveFeed(f);
    setIndex(0);
  };

  const setFilters = (f: DiscoverFilters) => {
    setFiltersState(f);
    saveFilters(f);
    setIndex(0);
  };

  const queryParams = useMemo(
    () => ({ feed, ...filtersToParams(filters) }),
    [feed, filters],
  );
  const queryKey = getListProfilesQueryKey(queryParams);

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

  const top = profiles[index] ?? null;
  const hasNext = profiles[index + 1] != null;

  const handleSendMessage = () => {
    if (!top) return;
    if (!isGold) {
      setLocation("/premium");
      return;
    }
    startConversation(top.id);
  };

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

      {/* ── Header: logo + mode toggle + feed chips + quota + matches ── */}
      <header
        className="flex items-center gap-2 px-3 py-2.5 relative"
        style={{ background: "rgba(8,7,18,0.96)", backdropFilter: "blur(24px)" }}
      >
        {/* Glowing bottom border */}
        <div
          className="absolute bottom-0 left-0 right-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent 0%, rgba(168,85,247,0.6) 30%, rgba(236,72,153,0.5) 70%, transparent 100%)" }}
        />
        {/* Glow bloom beneath header */}
        <div
          className="absolute -bottom-6 left-0 right-0 h-10 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, rgba(168,85,247,0.12) 0%, rgba(236,72,153,0.04) 60%, transparent 100%)" }}
        />
        <KixxMeLogo size={20} withWordmark />

        <div className="flex-shrink-0">
          <ModeToggle mode={mode} setMode={setMode} />
        </div>

        <div
          className="flex items-center gap-1.5 flex-1 overflow-x-auto"
          style={{ scrollbarWidth: "none" } as React.CSSProperties}
        >
          {FEED_OPTIONS.map(({ key, emoji, label }) => {
            const active = feed === key;
            return (
              <button
                key={key}
                onClick={() => setFeed(key)}
                className="flex-shrink-0 flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-sans font-medium transition-all duration-150"
                style={
                  active
                    ? {
                        background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
                        color: "white",
                      }
                    : {
                        background: "rgba(255,255,255,0.05)",
                        color: "hsl(240,10%,55%)",
                        border: "1px solid rgba(255,255,255,0.07)",
                      }
                }
                data-testid={`chip-feed-${key}`}
              >
                <span className="text-[9px] leading-none">{emoji}</span>
                {label}
              </button>
            );
          })}
        </div>

        <QuotaBar />

        {/* Filter button */}
        <button
          onClick={() => setFilterOpen(true)}
          className="relative flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center border transition-colors"
          style={{
            background: activeFilterCount > 0 ? "rgba(139,92,246,0.2)" : "rgba(255,255,255,0.04)",
            borderColor: activeFilterCount > 0 ? "rgba(139,92,246,0.55)" : "rgba(255,255,255,0.15)",
          }}
          aria-label="Filtros"
          data-testid="button-filters"
        >
          <SlidersHorizontal className="w-4 h-4 text-primary" />
          {activeFilterCount > 0 && (
            <span
              className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-0.5 flex items-center justify-center rounded-full text-[9px] font-bold text-white border border-background"
              style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))" }}
            >
              {activeFilterCount}
            </span>
          )}
        </button>

        <Link href="/matches">
          <button
            className="relative flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center border border-border/40 transition-colors hover:border-primary/50"
            style={{ background: "rgba(255,255,255,0.04)" }}
            aria-label="Emparejamientos"
            data-testid="link-matches"
          >
            <Heart className="w-4 h-4 text-primary" />
            {likesBadge > 0 && (
              <span
                className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-0.5 flex items-center justify-center rounded-full text-[9px] font-bold text-white border border-background"
                style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))" }}
                data-testid="badge-likes"
              >
                {likesBadge > 99 ? "99+" : likesBadge}
              </span>
            )}
          </button>
        </Link>
      </header>

      {/* ── Card area ── */}
      <div className="flex-1 min-h-0">
        <div className="relative w-full h-full">
          {isLoading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="font-sans text-sm text-muted-foreground">Cargando perfiles...</p>
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
                profiles.length === 0 && feed === "online"
                  ? "Nadie en línea ahora mismo"
                  : "¡Has visto todos los perfiles!"
              }
              subtitle={
                profiles.length === 0 && feed === "online"
                  ? "Cambia de sección para ver más perfiles."
                  : "Vuelve más tarde para descubrir caras nuevas o explora en cuadrícula."
              }
              onRestart={restart}
              isFetching={isFetching}
              onGrid={() => setMode("cuadricula")}
            />
          ) : (
            <>
              {/* Ghost card behind — shows depth without revealing photo */}
              {hasNext && (
                <div
                  className="absolute inset-x-0 bottom-0 rounded-3xl"
                  style={{
                    top: "6px",
                    transform: "scale(0.96)",
                    background: "rgba(20,17,40,0.85)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    zIndex: 0,
                  }}
                />
              )}
              {/* Active card */}
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

      {/* ── Action bar (Badoo/Tinder-style) ── */}
      {!isLoading && !isError && top && (
        <div className="flex items-center gap-2.5 px-4 pt-2 pb-3">
          {/* Pass / X */}
          <button
            onClick={() => act("pass")}
            aria-label="No me interesa"
            data-testid="button-pass"
            className="w-[58px] h-[58px] rounded-full flex-shrink-0 flex items-center justify-center transition-transform active:scale-90"
            style={{
              background: "rgba(16,14,32,0.97)",
              border: "1px solid rgba(255,255,255,0.10)",
              boxShadow: "0 4px 18px rgba(0,0,0,0.55)",
            }}
          >
            <X className="w-6 h-6 text-rose-400" />
          </button>

          {/* Enviar mensaje — Gold-only wide pill */}
          <button
            onClick={handleSendMessage}
            aria-label="Enviar mensaje"
            data-testid="button-send-message"
            className="flex-1 h-[58px] rounded-full flex items-center justify-center gap-2 font-sans text-sm transition-all active:scale-[0.97] min-w-0"
            style={{
              background: "rgba(16,14,32,0.97)",
              border: `1px solid ${isGold ? "rgba(255,255,255,0.10)" : "rgba(251,191,36,0.35)"}`,
              boxShadow: "0 4px 18px rgba(0,0,0,0.55)",
            }}
          >
            {isGold ? (
              <>
                <MessageCircle className="w-[17px] h-[17px] text-white/55 flex-shrink-0" />
                <span className="text-white/60 truncate">Enviar mensaje...</span>
              </>
            ) : (
              <>
                <Lock className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <span className="text-amber-400 truncate">Enviar mensaje...</span>
              </>
            )}
          </button>

          {/* SuperLike */}
          <button
            onClick={() => act("superlike")}
            aria-label="SuperLike"
            data-testid="button-superlike"
            className="w-[48px] h-[48px] rounded-full flex-shrink-0 flex items-center justify-center transition-transform active:scale-90"
            style={{
              background: "linear-gradient(135deg, hsl(199,89%,52%), hsl(273,85%,55%))",
              boxShadow: "0 0 16px rgba(56,189,248,0.40)",
              border: "1px solid rgba(255,255,255,0.15)",
            }}
          >
            <Star className="w-5 h-5 text-white" fill="white" />
          </button>

          {/* Like / Heart */}
          <button
            onClick={() => act("like")}
            aria-label="Me gusta"
            data-testid="button-like"
            className="w-[58px] h-[58px] rounded-full flex-shrink-0 flex items-center justify-center transition-transform active:scale-90"
            style={{
              background: "linear-gradient(135deg, hsl(330,85%,55%), hsl(273,85%,55%))",
              boxShadow: "0 0 20px rgba(236,72,153,0.45)",
              border: "1px solid rgba(255,255,255,0.15)",
            }}
          >
            <Heart className="w-6 h-6 text-white" fill="white" />
          </button>
        </div>
      )}

      {detail && (
        <ProfileDetailSheet
          profile={detail}
          onClose={() => setDetail(null)}
          onAction={handleDetailAction}
        />
      )}

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        onChange={setFilters}
        plan={plan}
      />
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
    <div className="absolute inset-0 overflow-y-auto">
      <div className="min-h-full flex flex-col items-center justify-center gap-5 text-center px-5 py-8">
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center border border-primary/20"
          style={{ background: "rgba(168,85,247,0.1)" }}
        >
          <Sparkles
            className="w-10 h-10 text-primary"
            style={{ filter: "drop-shadow(0 0 12px rgba(168,85,247,0.55))" }}
          />
        </div>
        <div className="space-y-1.5">
          <h3 className="font-display text-2xl tracking-wide text-foreground">{title}</h3>
          <p className="font-sans text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
            {subtitle}
          </p>
        </div>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            onClick={onRestart}
            disabled={isFetching}
            className="flex items-center justify-center gap-2 h-12 rounded-2xl font-display text-base tracking-widest text-white hover:opacity-90 transition-opacity border-0 disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, hsl(330,85%,55%), hsl(273,85%,52%))" }}
            data-testid="button-deck-restart"
          >
            {isFetching ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
            Buscar de nuevo
          </button>
          <button
            onClick={onGrid}
            className="h-11 rounded-2xl font-sans text-sm text-muted-foreground border border-border/40 hover:text-foreground transition-colors"
            data-testid="button-deck-grid"
          >
            Ver en cuadrícula
          </button>
        </div>

      </div>
    </div>
  );
}
