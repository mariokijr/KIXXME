import React, { useState, useMemo } from "react";
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
  SlidersHorizontal,
  Search,
  ArrowLeft,
} from "lucide-react";
import {
  useListMyLikes,
  getListMyLikesQueryKey,
  useListProfiles,
  getListProfilesQueryKey,
  useSearchProfiles,
  getSearchProfilesQueryKey,
  useUnlikeProfile,
  useGetMyProfile,
  useGetStripeTrialStatus,
  getGetStripeTrialStatusQueryKey,
  PublicProfile,
  ListProfilesFeed,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useNotifications } from "@/lib/notifications";
import { useLikeActions } from "@/lib/like-actions";
import { useStartConversation } from "@/lib/use-start-conversation";
import { useAuth } from "@/lib/auth";
import { gradFor, initialsFor, formatDistance } from "@/lib/profile-format";
import { ModeToggle, type DiscoverMode } from "@/components/discover-mode-toggle";
import { SwipeView } from "@/components/swipe-deck";
import { ReportDialog } from "@/components/report-dialog";
import {
  FilterSheet,
  type DiscoverFilters,
  readFilters,
  saveFilters,
  countActiveFilters,
  filtersToParams,
  readOnlineFilters,
  saveOnlineFilters,
  countOnlineActiveFilters,
} from "@/components/filter-sheet";

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

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="flex-shrink-0 flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-sans font-medium border transition-all"
      style={{
        background: "linear-gradient(135deg, rgba(139,92,246,0.22), rgba(236,72,153,0.15))",
        borderColor: "rgba(168,85,247,0.50)",
        color: "#c4b5fd",
      }}
    >
      {label}
      <X className="w-2.5 h-2.5 opacity-70" />
    </button>
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
  const { data: ownProfile } = useGetMyProfile({});
  const plan = (ownProfile?.plan ?? "free") as "free" | "plus" | "gold";

  // ── Search ──
  const [searchMode, setSearchMode] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const { data: searchResults = [], isFetching: searchFetching } = useSearchProfiles(
    { q: searchQ },
    { query: { enabled: searchMode && searchQ.trim().length >= 2, queryKey: getSearchProfilesQueryKey({ q: searchQ }) } }
  );

  // Filters for the "En línea" online grid (separate key, 100 km default so
  // users see people nearby first; likes list is unfiltered regardless).
  const [filters, setFiltersState] = useState<DiscoverFilters>(readOnlineFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilterCount = countOnlineActiveFilters(filters);

  const setFilters = (f: DiscoverFilters) => {
    setFiltersState(f);
    saveOnlineFilters(f);
  };

  // "En línea" grid uses the main GET /profiles with feed=online + online_only=true.
  // feed=online triggers the DB-side last_active_at pre-filter (so the 200-row sample
  // is drawn from recently-active users). online_only=true is the JS backstop.
  // Both must come AFTER the filtersToParams spread so they are never overridden.
  const onlineParams = useMemo(
    () => ({ ...filtersToParams(filters), feed: ListProfilesFeed.online, online_only: true }),
    [filters],
  );
  const onlineQueryKey = getListProfilesQueryKey(onlineParams);

  const likesQuery = useListMyLikes({
    query: { queryKey: getListMyLikesQueryKey(), enabled: source === "likes" },
  });
  const onlineQuery = useListProfiles(onlineParams, {
    query: { queryKey: onlineQueryKey, enabled: source === "online" },
  });

  const {
    data: rawProfiles = [],
    isLoading,
    isError,
  } = source === "likes" ? likesQuery : onlineQuery;

  // Sort "En línea" profiles by distance (closest first, nulls last).
  const profiles = useMemo(() => {
    const sorted =
      source === "online"
        ? [...rawProfiles].sort((a, b) => {
            if (a.distance_km == null) return 1;
            if (b.distance_km == null) return -1;
            return a.distance_km - b.distance_km;
          })
        : rawProfiles;
    let ps = sorted;
    if (filters.heightMin != null)
      ps = ps.filter((p) => p.height_cm != null && p.height_cm >= filters.heightMin!);
    if (filters.heightMax != null)
      ps = ps.filter((p) => p.height_cm != null && p.height_cm <= filters.heightMax!);
    return ps;
  }, [rawProfiles, source, filters.heightMin, filters.heightMax]);

  const { start } = useStartConversation();
  const likeActions = useLikeActions();
  const unlikeMut = useUnlikeProfile();

  const invalidate = () =>
    qc.invalidateQueries({
      queryKey: source === "likes" ? getListMyLikesQueryKey() : onlineQueryKey,
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

  const isEmpty = !isLoading && (isError || profiles.length === 0);

  return (
    <div className="min-h-full relative overflow-hidden" style={{ background: "hsl(240,35%,3%)" }}>
      {/* ── Ambient background orbs ── */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div
          className="absolute -top-32 left-1/4 w-[36rem] h-[36rem] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(168,85,247,0.55) 0%, rgba(168,85,247,0.18) 48%, transparent 70%)", filter: "blur(52px)" }}
        />
        <div
          className="absolute top-1/3 -right-20 w-[26rem] h-[26rem] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(236,72,153,0.48) 0%, rgba(236,72,153,0.12) 52%, transparent 74%)", filter: "blur(56px)" }}
        />
        <div
          className="absolute bottom-1/4 -left-12 w-[22rem] h-[22rem] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(139,92,246,0.40) 0%, rgba(139,92,246,0.08) 58%, transparent 76%)", filter: "blur(48px)" }}
        />
        {/* Warm gold accent top-right */}
        <div
          className="absolute top-0 right-0 w-72 h-72 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(251,191,36,0.14) 0%, transparent 65%)", filter: "blur(44px)", transform: "translate(22%, -28%)" }}
        />
        {/* Deep centre bloom */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[30rem] h-[30rem] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(168,85,247,0.10) 0%, transparent 62%)", filter: "blur(64px)" }}
        />
        {/* Bottom glow so action bar floats on a lit surface */}
        <div
          className="absolute bottom-0 left-0 right-0 h-48 pointer-events-none"
          style={{ background: "linear-gradient(to top, rgba(139,92,246,0.08) 0%, transparent 100%)" }}
        />
      </div>
      {/* ── Header: same Badoo-style as swipe view ── */}
      <div
        className="sticky top-0 z-20 px-4 pt-3 pb-0 relative"
        style={{ background: "rgba(8,7,18,0.97)", backdropFilter: "blur(28px)" }}
      >
        {/* Row 1: title + icon buttons */}
        <div className="flex items-start justify-between mb-2">
          {searchMode ? (
            /* ── Search input row ── */
            <div className="flex-1 flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setSearchMode(false); setSearchQ(""); }}
                className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full text-muted-foreground hover:text-white"
                style={{ background: "rgba(255,255,255,0.07)" }}
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  ref={searchInputRef}
                  autoFocus
                  type="search"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="Buscar por usuario..."
                  className="w-full pl-8 pr-4 py-2 rounded-xl font-sans text-sm text-foreground placeholder:text-muted-foreground border border-border/50 focus:outline-none focus:border-primary/50 bg-input/40"
                />
              </div>
            </div>
          ) : (
            <>
              <div>
                <h1
                  className="font-display text-[26px] leading-tight tracking-wide"
                  style={{
                    background: "linear-gradient(110deg, hsl(273,90%,85%) 0%, hsl(290,85%,80%) 35%, hsl(330,90%,82%) 65%, #fff 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    filter: "drop-shadow(0 0 22px rgba(168,85,247,0.55))",
                  }}
                >
                  {source === "likes" ? "Tus Me gusta" : "En línea"}
                </h1>
                <p className="font-sans text-[12px] text-muted-foreground mt-0.5">
                  {activeFilterCount > 0
                    ? `${activeFilterCount} filtro${activeFilterCount !== 1 ? "s" : ""} activo${activeFilterCount !== 1 ? "s" : ""}`
                    : source === "likes" ? "Perfiles que te han gustado" : "Activos ahora mismo"}
                </p>
              </div>
              <div className="flex items-center gap-1.5 pt-0.5">
                {/* Search */}
                <button
                  type="button"
                  onClick={() => { setSearchMode(true); setTimeout(() => searchInputRef.current?.focus(), 80); }}
                  className="w-10 h-10 rounded-full flex items-center justify-center transition-colors"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
                  aria-label="Buscar"
                >
                  <Search className="w-4 h-4 text-muted-foreground" />
                </button>
                {/* Matches */}
                <Link href="/matches">
                  <button
                    className="relative w-10 h-10 rounded-full flex items-center justify-center transition-colors"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
                    aria-label="Emparejamientos"
                    data-testid="link-matches"
                  >
                    <Heart className="w-4 h-4" style={{ color: "hsl(330,85%,62%)" }} />
                    {likesBadge > 0 && (
                      <span
                        className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-0.5 flex items-center justify-center rounded-full text-[9px] font-bold text-white"
                        style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))" }}
                        data-testid="badge-likes"
                      >
                        {likesBadge > 99 ? "99+" : likesBadge}
                      </span>
                    )}
                  </button>
                </Link>
                {/* Filters */}
                <button
                  type="button"
                  onClick={() => setFiltersOpen(true)}
                  className="relative w-10 h-10 rounded-full flex items-center justify-center transition-all"
                  style={{
                    background: activeFilterCount > 0
                      ? "linear-gradient(135deg, hsl(273,85%,52%), hsl(330,85%,50%))"
                      : "rgba(255,255,255,0.06)",
                    border: `1px solid ${activeFilterCount > 0 ? "rgba(168,85,247,0.60)" : "rgba(255,255,255,0.10)"}`,
                    boxShadow: activeFilterCount > 0 ? "0 0 16px rgba(168,85,247,0.55)" : undefined,
                  }}
                  aria-label="Filtros"
                >
                  <SlidersHorizontal
                    className="w-4 h-4"
                    style={{ color: activeFilterCount > 0 ? "white" : "rgba(255,255,255,0.55)" }}
                  />
                  {activeFilterCount > 0 && (
                    <span
                      className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-0.5 flex items-center justify-center rounded-full text-[9px] font-bold text-white"
                      style={{ background: "hsl(330,85%,52%)" }}
                    >
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Row 2: mode toggle (hidden in search mode) */}
        <div className={`pb-2 ${searchMode ? "hidden" : ""}`}>
          <ModeToggle mode={mode} setMode={setMode} />
        </div>

        {/* Neon separator line */}
        <div
          className="absolute bottom-0 left-0 right-0 h-[1.5px]"
          style={{
            background: "linear-gradient(90deg, transparent 0%, rgba(139,92,246,0.8) 25%, rgba(236,72,153,0.7) 55%, rgba(139,92,246,0.7) 80%, transparent 100%)",
            boxShadow: "0 0 8px rgba(168,85,247,0.35)",
          }}
        />
      </div>

      {/* Filter sheet */}
      <FilterSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        onChange={setFilters}
        plan={plan}
        viewerHasLocation={ownProfile?.latitude != null}
      />

      {/* ── Search results ── */}
      {searchMode && (
        <div className="relative z-10 px-4 pb-6">
          {searchQ.trim().length < 2 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Search className="w-10 h-10 text-muted-foreground/30" />
              <p className="font-sans text-sm text-muted-foreground">Escribe al menos 2 caracteres</p>
            </div>
          ) : searchFetching ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : searchResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Users className="w-10 h-10 text-muted-foreground/30" />
              <p className="font-sans text-sm text-muted-foreground">Sin resultados para «{searchQ}»</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 pt-2">
              {searchResults.map((user, i) => (
                <UserCard
                  key={user.id}
                  user={user}
                  grad={gradFor(user.id)}
                  onMessage={() => start(user.id)}
                  onToggleLike={() => handleToggleLike(user)}
                  onSuperLike={() => handleSuperLike(user)}
                  superLikePending={likeActions.isPending}
                  featured={i === 0}
                />
              ))}
              <div className="col-span-2 h-20" />
            </div>
          )}
        </div>
      )}

      {!searchMode && (isLoading ? (
        <div className="relative z-10 flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="font-sans text-sm text-muted-foreground">
            Cargando perfiles...
          </p>
        </div>
      ) : isEmpty ? (
        <div className="relative z-10">
          <EmptyState
            source={source}
            onShare={handleShare}
            onExplore={() => setMode("tarjetas")}
          />
        </div>
      ) : (
        <div className="relative z-10 px-4 pb-6 grid grid-cols-2 gap-3">
          {profiles.map((user, i) => (
            <UserCard
              key={user.id}
              user={user}
              grad={gradFor(user.id)}
              onMessage={() => start(user.id)}
              onToggleLike={() => handleToggleLike(user)}
              onSuperLike={() => handleSuperLike(user)}
              superLikePending={likeActions.isPending}
              featured={i === 0}
            />
          ))}
          {/* Subtle bottom fade so content doesn't crash into nav */}
          <div className="col-span-2 h-20" />
        </div>
      ))}
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

function UserCardInner({
  user,
  grad,
  onMessage,
  onToggleLike,
  onSuperLike,
  superLikePending,
  featured,
}: {
  user: PublicProfile;
  grad: string;
  onMessage: () => void;
  onToggleLike: () => void;
  onSuperLike: () => void;
  superLikePending?: boolean;
  featured?: boolean;
}) {
  const distance = formatDistance(user.distance_km);
  const [reportOpen, setReportOpen] = useState(false);

  return (
    <div
      className={`relative rounded-2xl overflow-hidden border group${featured ? " col-span-2" : ""}`}
      style={{
        background: "rgba(13,11,26,0.85)",
        aspectRatio: featured ? "16/9" : "3/4",
        borderColor:
          user.plan === "gold"
            ? "rgba(251,191,36,0.75)"
            : user.plan === "plus"
            ? "rgba(168,85,247,0.65)"
            : featured
            ? "rgba(168,85,247,0.40)"
            : "rgba(255,255,255,0.10)",
        animation:
          user.plan === "gold"
            ? "kixx-gold-pulse 2.8s ease-in-out infinite"
            : user.plan === "plus"
            ? "kixx-plus-glow 3.2s ease-in-out infinite"
            : undefined,
      }}
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

      {/* Plan-colour ambient tint at the top of the card */}
      {user.plan === "gold" && (
        <div
          className="absolute top-0 left-0 right-0 h-24 pointer-events-none"
          style={{
            background:
              "linear-gradient(to bottom, rgba(251,191,36,0.42) 0%, rgba(251,191,36,0.14) 55%, transparent 100%)",
          }}
        />
      )}
      {user.plan === "plus" && (
        <div
          className="absolute top-0 left-0 right-0 h-20 pointer-events-none"
          style={{
            background:
              "linear-gradient(to bottom, rgba(168,85,247,0.40) 0%, rgba(168,85,247,0.10) 60%, transparent 100%)",
          }}
        />
      )}

      <div className="absolute top-2 left-2 flex items-center gap-1.5">
        {user.is_online && (
          <span
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-sans font-medium text-white"
            style={{ background: "rgba(22,163,74,0.92)", boxShadow: "0 0 10px rgba(34,197,94,0.65), 0 0 4px rgba(34,197,94,0.40)" }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
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

      {/* Gold crown or verified badge */}
      <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
        {user.plan === "gold" && (
          <span
            className="text-base leading-none"
            style={{ filter: "drop-shadow(0 0 6px rgba(251,191,36,0.8))" }}
            title="Gold"
          >
            👑
          </span>
        )}
        {user.is_verified && (
          <BadgeCheck
            className="w-5 h-5 text-sky-400"
            style={{ filter: "drop-shadow(0 0 5px rgba(56,189,248,0.65))" }}
          />
        )}
      </div>

      <button
        onClick={onSuperLike}
        disabled={superLikePending}
        className="absolute bottom-[6.5rem] right-2 w-9 h-9 rounded-full flex items-center justify-center border border-white/30 backdrop-blur-sm transition-transform active:scale-90 disabled:opacity-50"
        style={{
          background: "linear-gradient(135deg, hsl(199,89%,52%), hsl(273,85%,55%))",
          boxShadow: "0 0 16px rgba(56,189,248,0.60), 0 0 6px rgba(168,85,247,0.35)",
        }}
        aria-label="SuperLike"
        data-testid="button-superlike"
      >
        <Star className="w-5 h-5 text-white" fill="white" />
      </button>

      <button
        onClick={onToggleLike}
        className="absolute bottom-16 right-2 w-9 h-9 rounded-full flex items-center justify-center border backdrop-blur-sm transition-transform active:scale-90"
        style={{
          background: user.liked_by_me ? "rgba(236,72,153,0.30)" : "rgba(0,0,0,0.42)",
          borderColor: user.liked_by_me ? "rgba(236,72,153,0.55)" : "rgba(255,255,255,0.22)",
          boxShadow: user.liked_by_me ? "0 0 14px rgba(236,72,153,0.50)" : undefined,
        }}
        aria-label={user.liked_by_me ? "Quitar me gusta" : "Me gusta"}
      >
        <Heart
          className="w-5 h-5 transition-colors"
          style={{
            color: user.liked_by_me ? "hsl(330,85%,65%)" : "white",
            fill: user.liked_by_me ? "hsl(330,85%,65%)" : "transparent",
            filter: user.liked_by_me ? "drop-shadow(0 0 4px rgba(236,72,153,0.7))" : undefined,
          }}
        />
      </button>

      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2"
        style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)" }}
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
        style={{ background: user.plan === "gold"
          ? "linear-gradient(to top, rgba(14,4,30,0.99) 0%, rgba(24,8,48,0.90) 35%, rgba(36,12,58,0.55) 62%, transparent 100%)"
          : user.plan === "plus"
          ? "linear-gradient(to top, rgba(10,3,32,0.99) 0%, rgba(18,5,44,0.88) 38%, rgba(28,8,52,0.48) 64%, transparent 100%)"
          : "linear-gradient(to top, rgba(4,2,16,0.99) 0%, rgba(12,5,32,0.90) 38%, rgba(22,6,44,0.45) 65%, transparent 100%)" }}
      >
        <p className={`font-display text-white leading-tight tracking-wide truncate${featured ? " text-xl" : " text-base"}`}>
          {user.username}
        </p>
        <div className="flex items-center justify-between mt-0.5 gap-1">
          <span className="font-sans text-xs text-white/70 truncate">
            {[user.age ? `${user.age}a` : null, user.city].filter(Boolean).join(" · ") || "Nuevo usuario"}
          </span>
          <div className="flex items-center gap-1 flex-shrink-0">
            {(user as any).height_cm && (
              <span className="font-sans text-[10px]" style={{ color: "rgba(168,210,255,0.65)" }}>
                {(user as any).height_cm}cm
              </span>
            )}
            {distance && (
              <span className="flex items-center gap-0.5 font-sans text-[10px]" style={{ color: "rgba(200,170,255,0.70)" }}>
                <MapPin className="w-2.5 h-2.5" />
                {distance}
              </span>
            )}
          </div>
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

export const UserCard = React.memo(UserCardInner);
