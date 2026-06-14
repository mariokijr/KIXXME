import React, { useRef } from "react";
import { useLocation } from "wouter";
import { ChevronRight, Wifi, MapPin, BadgeCheck, Clock, Flame } from "lucide-react";
import {
  useListProfiles,
  getListProfilesQueryKey,
  useListOnlineProfiles,
  getListOnlineProfilesQueryKey,
  PublicProfile,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { gradFor, initialsFor, formatDistance, formatLastSeen } from "@/lib/profile-format";

// ---------------------------------------------------------------------------
// Mini profile card for carousels
// ---------------------------------------------------------------------------
function ExploreCard({ profile }: { profile: PublicProfile }) {
  const [, setLocation] = useLocation();
  const grad = gradFor(profile.id);

  return (
    <button
      type="button"
      onClick={() => setLocation(`/profile/${profile.id}`)}
      className="relative flex-shrink-0 w-[140px] rounded-2xl overflow-hidden aspect-[3/4] text-left focus:outline-none active:scale-[0.97] transition-transform"
      aria-label={profile.username ?? "Perfil"}
    >
      {/* Photo or gradient fallback */}
      {profile.avatar_url ? (
        <img
          src={profile.avatar_url}
          alt={profile.username ?? ""}
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <div
          className="absolute inset-0 flex items-center justify-center text-2xl font-bold text-white/70"
          style={{ background: grad }}
        >
          {initialsFor(profile.username)}
        </div>
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.85) 35%, transparent 65%)" }} />

      {/* Online dot */}
      {profile.is_online && (
        <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-green-400 border-2 border-background shadow" />
      )}

      {/* Verified badge */}
      {profile.is_verified && (
        <span className="absolute top-2 left-2 w-5 h-5 rounded-full bg-sky-500/90 flex items-center justify-center">
          <BadgeCheck className="w-3 h-3 text-white" />
        </span>
      )}

      {/* Info */}
      <div className="absolute bottom-0 inset-x-0 p-2.5">
        <p className="text-white text-xs font-semibold leading-tight truncate">
          {profile.username}
          {profile.age ? <span className="font-normal opacity-80">, {profile.age}</span> : null}
        </p>
        {profile.city && (
          <p className="text-white/60 text-[10px] truncate mt-0.5">{profile.city}</p>
        )}
        {profile.distance_km != null && (
          <p className="text-white/50 text-[10px] mt-0.5">{formatDistance(profile.distance_km)}</p>
        )}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Section with horizontal scroll carousel
// ---------------------------------------------------------------------------
function ExploreSection({
  title,
  icon: Icon,
  profiles,
  isLoading,
  seeAllHref,
  accentColor,
}: {
  title: string;
  icon: React.ElementType;
  profiles: PublicProfile[];
  isLoading: boolean;
  seeAllHref?: string;
  accentColor?: string;
}) {
  const [, setLocation] = useLocation();
  const rowRef = useRef<HTMLDivElement>(null);

  if (!isLoading && profiles.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <Icon
            className="w-4 h-4"
            style={{ color: accentColor ?? "hsl(273,85%,70%)" }}
          />
          <h2 className="text-sm font-semibold text-white">{title}</h2>
        </div>
        {seeAllHref && profiles.length > 0 && (
          <button
            type="button"
            onClick={() => setLocation(seeAllHref)}
            className="flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-white transition-colors"
          >
            Ver todos
            <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>

      <div
        ref={rowRef}
        className="flex gap-3 overflow-x-auto px-4 pb-1 scrollbar-none"
        style={{ scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" }}
      >
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex-shrink-0 w-[140px] aspect-[3/4] rounded-2xl animate-pulse"
                style={{ background: "rgba(255,255,255,0.06)" }}
              />
            ))
          : profiles.slice(0, 12).map((p) => (
              <div key={p.id} style={{ scrollSnapAlign: "start" }}>
                <ExploreCard profile={p} />
              </div>
            ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function Explore() {
  const { session } = useAuth();
  const enabled = !!session;

  // Section 1: En línea ahora
  const { data: onlineProfiles = [], isLoading: loadingOnline } = useListOnlineProfiles({
    query: { enabled, queryKey: getListOnlineProfilesQueryKey(), staleTime: 60_000 },
  });

  // Section 2: Nuevos (recent joiners / recently active)
  const { data: recentProfiles = [], isLoading: loadingRecent } = useListProfiles(
    { sort: "recent" },
    { query: { enabled, queryKey: getListProfilesQueryKey({ sort: "recent" }), staleTime: 300_000 } },
  );

  // Section 3: Cerca de ti (distance sorted)
  const { data: nearbyProfiles = [], isLoading: loadingNearby } = useListProfiles(
    { sort: "distance", scope: "nearby" },
    { query: { enabled, queryKey: getListProfilesQueryKey({ sort: "distance", scope: "nearby" }), staleTime: 120_000 } },
  );

  // Section 4: Verificados (client-side filter from recent set)
  const verifiedProfiles = recentProfiles.filter((p) => p.is_verified);

  // Section 5: Populares — verified + photo-rich (proxy for popularity without a likes counter)
  const popularProfiles = [...recentProfiles]
    .filter((p) => p.is_verified || (p.bio?.length ?? 0) > 80)
    .slice(0, 12);

  const isAnyLoading = loadingOnline || loadingRecent;

  return (
    <div
      className="flex flex-col min-h-[calc(100dvh-72px)] pb-6"
      style={{ background: "hsl(240,13%,5%)" }}
    >
      {/* Header */}
      <header
        className="sticky top-0 z-10 px-4 py-3 border-b border-white/[0.06]"
        style={{ background: "rgba(8,7,18,0.95)", backdropFilter: "blur(20px)" }}
      >
        <h1 className="text-lg font-display font-bold text-white">Explorar</h1>
        <p className="text-[11px] text-muted-foreground mt-0.5">Descubre gente nueva cerca de ti</p>
      </header>

      {/* Sections */}
      <div className="flex flex-col gap-6 pt-6">
        <ExploreSection
          title="En línea ahora"
          icon={Wifi}
          profiles={onlineProfiles}
          isLoading={loadingOnline}
          seeAllHref="/discover"
          accentColor="hsl(142,72%,55%)"
        />

        <ExploreSection
          title="Cerca de ti"
          icon={MapPin}
          profiles={nearbyProfiles}
          isLoading={loadingNearby}
          seeAllHref="/discover"
          accentColor="hsl(200,89%,55%)"
        />

        <ExploreSection
          title="Nuevos en KixxMe"
          icon={Clock}
          profiles={recentProfiles.slice(0, 12)}
          isLoading={loadingRecent}
          seeAllHref="/discover"
          accentColor="hsl(273,85%,70%)"
        />

        <ExploreSection
          title="Verificados"
          icon={BadgeCheck}
          profiles={verifiedProfiles}
          isLoading={isAnyLoading}
          accentColor="hsl(200,89%,55%)"
        />

        <ExploreSection
          title="Perfiles destacados"
          icon={Flame}
          profiles={popularProfiles}
          isLoading={isAnyLoading}
          accentColor="hsl(25,100%,60%)"
        />
      </div>

      {/* Empty state */}
      {!isAnyLoading &&
        onlineProfiles.length === 0 &&
        recentProfiles.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8 py-16">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center border border-primary/20"
              style={{ background: "rgba(168,85,247,0.08)" }}
            >
              <Flame className="w-8 h-8 text-primary opacity-60" />
            </div>
            <p className="text-sm font-medium text-white/70">Nadie cerca por ahora</p>
            <p className="text-xs text-muted-foreground">
              Amplía tu radio en Descubrir para ver más perfiles
            </p>
          </div>
        )}
    </div>
  );
}
