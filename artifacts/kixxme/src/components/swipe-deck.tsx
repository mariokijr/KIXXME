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
  MessageCircle,
  SlidersHorizontal,
  Lock,
  LayoutGrid,
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
  gradFor, initialsFor, formatDistance, formatLastSeen,
  ROLE_LABELS, LOOKING_FOR_LABELS, ORIENTATION_LABELS,
  ZODIAC_LABELS, ALCOHOL_LABELS, EXERCISE_LABELS, PETS_LABELS,
  formatHeightCm,
  interestLabel,
} from "@/lib/profile-format";
import { useStartConversation } from "@/lib/use-start-conversation";
import {
  FilterSheet,
  type DiscoverFilters,
  DEFAULT_FILTERS,
  countActiveFilters,
  filtersToParams,
} from "@/components/filter-sheet";
import { ModeToggle, type DiscoverMode } from "@/components/discover-mode-toggle";
import { ReportDialog } from "@/components/report-dialog";
import { useGeolocation } from "@/lib/use-geolocation";
import { useAuth } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Scope filter (persisted in localStorage)
// ---------------------------------------------------------------------------
const SWIPE_SCOPE_KEY = "kixxme:swipe-scope";
type DiscoverScope = "nearby" | "province" | "spain" | "europe" | "worldwide";

const SCOPE_LABELS: Record<DiscoverScope, string> = {
  nearby: "Cerca",
  province: "Provincia",
  spain: "España",
  europe: "Europa",
  worldwide: "Mundo",
};

function readScope(): DiscoverScope {
  try {
    const v = localStorage.getItem(SWIPE_SCOPE_KEY);
    if (
      v === "nearby" ||
      v === "province" ||
      v === "spain" ||
      v === "europe" ||
      v === "worldwide"
    )
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
  const [photoIndex, setPhotoIndex] = useState(0);

  // Load all profile photos for the carousel (cached by React Query).
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
  const currentPhoto = gallery[Math.min(photoIndex, Math.max(0, gallery.length - 1))];

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
        boxShadow: "0 28px 80px rgba(0,0,0,0.7)",
      }}
      drag={!decided}
      onDragEnd={handleDragEnd}
      data-testid="swipe-card"
    >
      {/* Photo */}
      {currentPhoto ? (
        <img
          src={currentPhoto}
          alt={profile.username ?? ""}
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        />
      ) : (
        <div
          className={`absolute inset-0 flex items-center justify-center bg-gradient-to-br ${gradFor(profile.id)}`}
        >
          <span className="font-display text-7xl text-white/90 drop-shadow-lg">
            {initialsFor(profile.username)}
          </span>
        </div>
      )}

      {/* Photo progress bars (Tinder-style) — only when multiple photos */}
      {gallery.length > 1 && (
        <div className="absolute top-2 inset-x-2 flex gap-1 z-20 pointer-events-none">
          {gallery.map((_, i) => (
            <div
              key={i}
              className="flex-1 rounded-full transition-all duration-200"
              style={{
                height: "3px",
                background: i === photoIndex
                  ? "rgba(255,255,255,0.95)"
                  : "rgba(255,255,255,0.32)",
              }}
            />
          ))}
        </div>
      )}

      {/* Left tap zone — previous photo (capture pointer so swipe isn't triggered) */}
      <div
        className="absolute inset-y-0 left-0 w-2/5 z-10"
        onPointerDownCapture={(e) => e.stopPropagation()}
        onClick={() => setPhotoIndex((i) => Math.max(0, i - 1))}
      />
      {/* Right tap zone — next photo */}
      <div
        className="absolute inset-y-0 right-0 w-2/5 z-10"
        onPointerDownCapture={(e) => e.stopPropagation()}
        onClick={() =>
          setPhotoIndex((i) => Math.min(gallery.length - 1, i + 1))
        }
      />

      {/* Bottom gradient — taller for more info space */}
      <div
        className="absolute inset-x-0 bottom-0 pointer-events-none z-10"
        style={{
          height: "65%",
          background:
            "linear-gradient(to top, rgba(0,0,0,0.96) 0%, rgba(0,0,0,0.55) 55%, transparent 100%)",
        }}
      />

      {/* Top badges */}
      <div className="absolute top-7 left-3 flex items-center gap-1.5 z-20 pointer-events-none">
        {profile.is_online && (
          <span
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-sans font-medium text-white"
            style={{ background: "rgba(34,197,94,0.85)", backdropFilter: "blur(6px)" }}
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

      {/* Info button — top-right, above tap zone */}
      <button
        onPointerDownCapture={(e) => e.stopPropagation()}
        onClick={onOpenDetail}
        className="absolute top-7 right-3 w-9 h-9 rounded-full flex items-center justify-center border border-white/25 text-white backdrop-blur-sm transition-transform active:scale-90 z-20"
        style={{ background: "rgba(0,0,0,0.4)" }}
        aria-label="Ver perfil completo"
        data-testid="button-card-detail"
      >
        <Info className="w-4.5 h-4.5" />
      </button>

      {/* Swipe overlays */}
      <motion.div
        style={{ opacity: likeOpacity }}
        className="absolute top-12 left-6 px-3 py-1 rounded-lg border-4 border-green-400 text-green-400 font-display text-2xl tracking-widest -rotate-12 pointer-events-none z-30"
      >
        ME GUSTA
      </motion.div>
      <motion.div
        style={{ opacity: passOpacity }}
        className="absolute top-12 right-6 px-3 py-1 rounded-lg border-4 border-red-400 text-red-400 font-display text-2xl tracking-widest rotate-12 pointer-events-none z-30"
      >
        NO
      </motion.div>
      <motion.div
        style={{ opacity: superOpacity }}
        className="absolute left-1/2 top-1/3 -translate-x-1/2 px-4 py-1 rounded-lg border-4 border-sky-400 text-sky-400 font-display text-2xl tracking-widest pointer-events-none z-30"
      >
        SUPER LIKE
      </motion.div>

      {/* Info overlay at bottom */}
      <div className="absolute inset-x-0 bottom-0 px-5 pt-4 pb-5 z-20 pointer-events-none">
        {/* Name + age */}
        <h3 className="font-display text-3xl text-white leading-tight tracking-wide">
          {profile.username}
          {profile.age ? (
            <span className="text-white/80">, {profile.age}</span>
          ) : null}
        </h3>

        {/* City + distance + looking_for */}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {profile.city && (
            <span className="flex items-center gap-1 text-white/85 font-sans text-sm">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
              {profile.city}
            </span>
          )}
          {distance && (
            <span
              className="flex-shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium text-white/90"
              style={{ background: "rgba(0,0,0,0.5)" }}
            >
              {distance}
            </span>
          )}
          {profile.looking_for && LOOKING_FOR_LABELS[profile.looking_for] && (
            <span
              className="flex-shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium text-white"
              style={{ background: "rgba(236,72,153,0.6)" }}
            >
              {LOOKING_FOR_LABELS[profile.looking_for]}
            </span>
          )}
          {profile.role && ROLE_LABELS[profile.role] && (
            <span
              className="flex-shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium text-white"
              style={{ background: "rgba(168,85,247,0.55)" }}
            >
              {ROLE_LABELS[profile.role]}
            </span>
          )}
        </div>

        {/* Interests */}
        {Array.isArray(profile.interests) && profile.interests.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {profile.interests.slice(0, 4).map((slug) => (
              <span
                key={slug}
                className="px-2 py-0.5 rounded-full text-[10px] font-sans"
                style={{ background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.9)" }}
              >
                {interestLabel(slug)}
              </span>
            ))}
          </div>
        )}

        {/* Bio */}
        {profile.bio && (
          <p className="mt-2 text-white/72 font-sans text-sm line-clamp-2 leading-relaxed">
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
    <div
      className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full text-[11px] font-sans backdrop-blur-sm"
      style={{ background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.1)" }}
    >
      <span className="flex items-center gap-1 text-pink-400">
        <Heart className="w-3 h-3" fill="currentColor" />
        {likeLabel}
      </span>
      <span className="text-white/20">·</span>
      <span className="flex items-center gap-1 text-sky-400">
        <Star className="w-3 h-3" fill="currentColor" />
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
  plan,
}: {
  profile: PublicProfile;
  onClose: () => void;
  onAction: (dir: Decision) => void;
  plan: "free" | "plus" | "gold";
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
  const lastSeen = !profile.is_online ? formatLastSeen(profile.last_active_at) : null;
  const [reportOpen, setReportOpen] = useState(false);
  const { start: startConversation, isPending: startingChat } = useStartConversation();
  // Free users can only message matches; Plus/Gold can message anyone.
  const canMessage = plan !== "free" || !!profile.matched;

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
          {profile.is_online ? (
            <span
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-sans text-white"
              style={{ background: "rgba(34,197,94,0.85)" }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-white" />
              En línea
            </span>
          ) : lastSeen && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-sans text-muted-foreground border border-border/40">
              🕐 {lastSeen}
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

      <div className="flex items-center justify-center gap-3 px-4 py-3 border-t border-border/30">
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
        <div className="relative">
          <ActionButton
            onClick={() => startConversation(profile.id)}
            label={canMessage ? "Mensaje" : "Mensaje (requiere Plus)"}
            size="sm"
            gradient="rgba(40,38,56,0.95)"
            testid="button-detail-message"
          >
            {startingChat
              ? <Loader2 className="w-5 h-5 text-primary animate-spin" />
              : <MessageCircle className="w-5 h-5 text-primary" />}
          </ActionButton>
          {!canMessage && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center border border-border/50"
              style={{ background: "rgba(13,11,26,0.9)" }}>
              <Lock className="w-2.5 h-2.5 text-muted-foreground" />
            </span>
          )}
        </div>
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
  const { start: startConv, isPending: startingConv } = useStartConversation();

  // --- Scope & location ---------------------------------------------------
  const [scope, setScopeState] = useState<DiscoverScope>(readScope);
  const [index, setIndex] = useState(0);
  const [detail, setDetail] = useState<PublicProfile | null>(null);
  const [filters, setFilters] = useState<DiscoverFilters>(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);

  const { session } = useAuth();
  const geo = useGeolocation();

  const { data: ownProfile } = useGetMyProfile({
    query: { enabled: !!session, queryKey: getGetMyProfileQueryKey() },
  });
  const hasCoords = ownProfile?.latitude != null;
  const plan = (ownProfile?.plan ?? "free") as "free" | "plus" | "gold";

  const setScope = (s: DiscoverScope) => {
    setScopeState(s);
    saveScope(s);
    setIndex(0);
  };

  const applyFilters = (f: DiscoverFilters) => {
    setFilters(f);
    setIndex(0);
    qc.removeQueries({ queryKey: getListProfilesQueryKey({ sort, scope }) });
  };

  // Sort by distance whenever a geographic scope is active; fall back to
  // recent for worldwide so the deck stays fresh on low-density installs.
  const sort: "recent" | "distance" =
    scope === "worldwide" ? "recent" : "distance";
  const queryParams = { sort, scope, ...filtersToParams(filters) };
  const queryKey = getListProfilesQueryKey(queryParams);
  const activeFilterCount = countActiveFilters(filters);

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
    <div className="flex flex-col h-[calc(100dvh-72px)] max-w-sm w-full mx-auto">

      {/* ── CARD AREA — fills almost the whole screen ───────────────── */}
      <div className="relative flex-1 min-h-0">

        {/* Gradient header overlay — transparent, floats on top of photo */}
        <div
          className="absolute top-0 inset-x-0 z-30 px-4 pt-3 pb-10 flex items-center justify-between pointer-events-none"
          style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.65) 0%, transparent 100%)" }}
        >
          <KixxMeLogo size={20} withWordmark />
          <div className="flex items-center gap-1.5 pointer-events-auto">
            <button
              onClick={() => setMode("cuadricula")}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
              style={{ background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.85)" }}
              aria-label="Vista cuadrícula"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setFilterOpen(true)}
              className="relative w-8 h-8 rounded-full flex items-center justify-center transition-colors"
              style={{
                background: activeFilterCount > 0 ? "rgba(139,92,246,0.4)" : "rgba(255,255,255,0.15)",
                color: activeFilterCount > 0 ? "#c4b5fd" : "rgba(255,255,255,0.85)",
              }}
              aria-label="Filtros"
              data-testid="button-filters"
            >
              <SlidersHorizontal className="w-4 h-4" />
              {activeFilterCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 flex items-center justify-center rounded-full text-[8px] font-bold text-white"
                  style={{ background: "linear-gradient(135deg,#8b5cf6,#ec4899)" }}
                >
                  {activeFilterCount}
                </span>
              )}
            </button>
            <Link href="/matches">
              <button
                className="relative w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                style={{ background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.85)" }}
                aria-label="Emparejamientos"
                data-testid="link-matches"
              >
                <Heart className="w-4 h-4" />
                {likesBadge > 0 && (
                  <span
                    className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 flex items-center justify-center rounded-full text-[8px] font-bold text-white"
                    style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))" }}
                    data-testid="badge-likes"
                  >
                    {likesBadge > 99 ? "99+" : likesBadge}
                  </span>
                )}
              </button>
            </Link>
          </div>
        </div>

        {/* Location permission banner — overlaid just below header */}
        {(scope === "nearby" || scope === "province") && !hasCoords && (
          <div
            className="absolute top-14 inset-x-3 z-30 px-3 py-2 rounded-xl flex items-center gap-2.5 text-xs font-sans backdrop-blur-sm"
            style={{ background: "rgba(168,85,247,0.2)", border: "1px solid rgba(168,85,247,0.4)" }}
          >
            <MapPin className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            <span className="flex-1 text-white/80 leading-tight">
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
          <div className="absolute top-14 inset-x-3 z-30 text-center text-[10px] font-sans text-white/50 py-1">
            Permiso denegado · Selecciona "España" para ver perfiles nacionales
          </div>
        )}

        {/* Quota badge — bottom-left corner of card */}
        {!isLoading && !isError && top && (
          <div className="absolute bottom-3 left-3 z-30 pointer-events-none">
            <QuotaChip />
          </div>
        )}

        {/* Card stack — fills the full container */}
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
              profiles.length === 0 && (scope === "nearby" || scope === "province")
                ? "Nadie cerca de ti ahora"
                : "¡Has visto todos los perfiles!"
            }
            subtitle={
              profiles.length === 0 && (scope === "nearby" || scope === "province")
                ? "Amplía el alcance con los filtros de abajo para ver más perfiles."
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

      {/* ── BOTTOM BAR — scope chips + action buttons ────────────────── */}
      <div
        className="flex-shrink-0 px-3 pt-2 pb-3 space-y-2"
        style={{ background: "rgba(8,7,18,0.97)", borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        {/* Scope chips — compact horizontal strip */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
          {(Object.keys(SCOPE_LABELS) as DiscoverScope[]).map((s) => {
            const active = scope === s;
            return (
              <button
                key={s}
                onClick={() => setScope(s)}
                className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-sans font-medium transition-all duration-150"
                style={
                  active
                    ? {
                        background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
                        color: "white",
                      }
                    : {
                        background: "rgba(255,255,255,0.05)",
                        color: "hsl(240,10%,55%)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }
                }
              >
                {s === "nearby" && <Navigation className="w-2.5 h-2.5" />}
                {s === "worldwide" && <Globe2 className="w-2.5 h-2.5" />}
                {s === "europe" && <Globe2 className="w-2.5 h-2.5" />}
                {s === "spain" && <span className="text-[9px] leading-none">🇪🇸</span>}
                {SCOPE_LABELS[s]}
              </button>
            );
          })}
        </div>

        {/* Action buttons */}
        {!isLoading && !isError && top && (
          <div className="flex items-center justify-center gap-4">
            <ActionButton onClick={() => act("pass")} label="No me interesa" size="lg" gradient="rgba(40,38,56,0.95)" testid="button-pass">
              <X className="w-7 h-7 text-rose-400" />
            </ActionButton>
            <ActionButton onClick={() => act("superlike")} label="SuperLike" size="sm" gradient="linear-gradient(135deg, hsl(199,89%,52%), hsl(273,85%,55%))" testid="button-superlike">
              <Star className="w-6 h-6 text-white" fill="white" />
            </ActionButton>
            <ActionButton onClick={() => act("like")} label="Me gusta" size="lg" gradient="linear-gradient(135deg, hsl(330,85%,55%), hsl(273,85%,55%))" testid="button-like">
              <Heart className="w-7 h-7 text-white" fill="white" />
            </ActionButton>
            <div className="relative">
              <ActionButton onClick={() => startConv(top.id)} label="Mensaje" size="sm" gradient="rgba(40,38,56,0.95)" testid="button-message">
                {startingConv
                  ? <Loader2 className="w-5 h-5 text-primary animate-spin" />
                  : <MessageCircle className="w-5 h-5 text-primary" />}
              </ActionButton>
              {!top.matched && plan === "free" && (
                <span
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center border border-border/50"
                  style={{ background: "rgba(13,11,26,0.9)" }}
                >
                  <Lock className="w-2.5 h-2.5 text-muted-foreground" />
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {detail && (
        <ProfileDetailSheet profile={detail} onClose={() => setDetail(null)} onAction={handleDetailAction} plan={plan} />
      )}
      <FilterSheet open={filterOpen} onClose={() => setFilterOpen(false)} filters={filters} onChange={applyFilters} plan={plan} />
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
