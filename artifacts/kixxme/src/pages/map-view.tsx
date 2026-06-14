import React, { useState, useEffect, useRef, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Zap,
  Loader2,
  Navigation,
  BadgeCheck,
  MapPin,
  Heart,
  Flag,
  Eye,
  EyeOff,
  Lock,
  Users,
  X,
  User,
  MessageCircle,
} from "lucide-react";
import {
  useListMapUsers,
  getListMapUsersQueryKey,
  useUpdateMapVisibility,
  useGetMyProfile,
  getGetMyProfileQueryKey,
  PublicProfile,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { useGeolocation } from "@/lib/use-geolocation";
import { useLikeActions } from "@/lib/like-actions";
import { useStartConversation } from "@/lib/use-start-conversation";
import { formatDistance, initialsFor } from "@/lib/profile-format";
import { ReportDialog } from "@/components/report-dialog";

const DEFAULT_CENTER: [number, number] = [40.4168, -3.7038];

// Only age filtering remains — scope and status filters removed.
interface MapFilters {
  ageMin: number;
  ageMax: number;
}

const DEFAULT_FILTERS: MapFilters = { ageMin: 18, ageMax: 99 };

function filtersActive(f: MapFilters): boolean {
  return f.ageMin > DEFAULT_FILTERS.ageMin || f.ageMax < DEFAULT_FILTERS.ageMax;
}

function hashId(id: string): number {
  let h = 0;
  for (const c of id) {
    h = (h << 5) - h + c.charCodeAt(0);
    h |= 0;
  }
  return Math.abs(h);
}

function offsetPosition(
  lat: number,
  lng: number,
  distanceKm: number,
  id: string
): [number, number] {
  const R = 6371;
  const bearing = (hashId(id) % 360) * (Math.PI / 180);
  const d = Math.max(distanceKm, 0.2) / R;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lng * Math.PI) / 180;
  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(d) + Math.cos(φ1) * Math.sin(d) * Math.cos(bearing)
  );
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(d) * Math.cos(φ1),
      Math.cos(d) - Math.sin(φ1) * Math.sin(φ2)
    );
  return [(φ2 * 180) / Math.PI, (λ2 * 180) / Math.PI];
}

// Dot marker: small colored circle. Blue = regular, amber = Gold.
// Online users get a larger dot + green outer ring.
function dotMarkerHtml(user: PublicProfile): string {
  const isGoldUser = user.plan === "gold";
  const online = user.is_online;
  const dotSize = online ? 14 : 10;
  const color = isGoldUser ? "hsl(45,90%,60%)" : "hsl(210,100%,68%)";
  const shadow = online
    ? `0 0 0 2.5px rgba(74,222,128,0.55),0 0 10px ${
        isGoldUser ? "rgba(251,191,36,0.8)" : "rgba(59,130,246,0.8)"
      }`
    : `0 0 6px ${
        isGoldUser ? "rgba(251,191,36,0.5)" : "rgba(59,130,246,0.45)"
      }`;
  return `<div style="width:26px;height:26px;display:flex;align-items:center;justify-content:center;"><div style="width:${dotSize}px;height:${dotSize}px;border-radius:9999px;background:${color};box-shadow:${shadow};"></div></div>`;
}

export default function MapView() {
  useAuth();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [filters, setFilters] = useState<MapFilters>(DEFAULT_FILTERS);

  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const locRefreshed = useRef(false);

  const { data: profile } = useGetMyProfile({
    query: { queryKey: getGetMyProfileQueryKey() },
  });

  // Always worldwide — no scope selector needed.
  const { data: mapData, isLoading } = useListMapUsers(
    { scope: "worldwide" },
    {
      query: {
        queryKey: getListMapUsersQueryKey({ scope: "worldwide" }),
        refetchInterval: 30000,
      },
    }
  );
  const { start: startConversation, isPending: convPending } =
    useStartConversation();
  const likeActions = useLikeActions();
  const geo = useGeolocation();
  const updateVisibility = useUpdateMapVisibility();

  const canAccess = mapData?.can_access ?? false;
  const showOnMap = mapData?.show_on_map ?? true;
  const users = useMemo<PublicProfile[]>(() => mapData?.users ?? [], [mapData]);

  // Both Like and Message from the map require the viewer to be Gold.
  const isGold = profile?.plan === "gold";

  const hasLocation = profile?.latitude != null && profile?.longitude != null;
  const center: [number, number] = hasLocation
    ? [profile!.latitude as number, profile!.longitude as number]
    : DEFAULT_CENTER;

  const invalidateMap = () =>
    qc.invalidateQueries({ queryKey: getListMapUsersQueryKey() });

  const filtered = useMemo(
    () =>
      users.filter((p) => {
        if (p.age != null && (p.age < filters.ageMin || p.age > filters.ageMax))
          return false;
        return true;
      }),
    [users, filters]
  );

  const placeable = useMemo(
    () => filtered.filter((p) => p.distance_km != null),
    [filtered]
  );
  const onMapCount = placeable.length + (hasLocation ? 1 : 0);
  const selected = filtered.find((p) => p.id === selectedId) || null;

  const goldCount = mapData?.gold_total ?? 0;
  const onlineCount = mapData?.online_total ?? 0;

  const toggleVisibility = () => {
    if (updateVisibility.isPending) return;
    updateVisibility.mutate(
      { data: { show_on_map: !showOnMap } },
      { onSuccess: () => invalidateMap() }
    );
  };

  // Silently refresh own location on first map open.
  useEffect(() => {
    if (!canAccess || locRefreshed.current) return;
    const nav = navigator as Navigator & {
      permissions?: {
        query: (d: { name: PermissionName }) => Promise<{ state: string }>;
      };
    };
    if (!nav.permissions?.query) {
      if (hasLocation) { locRefreshed.current = true; geo.request(); }
      return;
    }
    nav.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((p) => {
        if (p.state === "granted" && !locRefreshed.current) {
          locRefreshed.current = true;
          geo.request();
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccess, hasLocation]);

  // Initialize Leaflet map once data has arrived.
  useEffect(() => {
    if (!canAccess || !mapDivRef.current || mapRef.current) return;
    const map = L.map(mapDivRef.current, {
      center,
      zoom: hasLocation ? 12 : 5,
      zoomControl: false,
      attributionControl: false,
    });
    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      { maxZoom: 19 }
    ).addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 100);
    return () => { map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccess]);

  // Recenter when viewer's location becomes available.
  useEffect(() => {
    if (mapRef.current && hasLocation) mapRef.current.setView(center, 12);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLocation, center[0], center[1]]);

  // Render dot markers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // Self — bright pink dot.
    if (hasLocation) {
      const meIcon = L.divIcon({
        html: `<div style="width:26px;height:26px;display:flex;align-items:center;justify-content:center;"><div style="width:16px;height:16px;border-radius:9999px;background:hsl(330,85%,55%);box-shadow:0 0 0 3px rgba(255,255,255,0.2),0 0 14px rgba(236,72,153,0.9);"></div></div>`,
        className: "",
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });
      markersRef.current.push(
        L.marker(center, { icon: meIcon, zIndexOffset: 1000 }).addTo(map)
      );
    }

    // Other users — blue / amber dots.
    for (const user of placeable) {
      const pos = offsetPosition(
        center[0],
        center[1],
        user.distance_km as number,
        user.id
      );
      const icon = L.divIcon({
        html: dotMarkerHtml(user),
        className: "",
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });
      const m = L.marker(pos, {
        icon,
        zIndexOffset: user.is_online ? 600 : 200,
      }).addTo(map);
      m.on("click", () => { setSelectedId(user.id); setReportOpen(false); });
      markersRef.current.push(m);
    }
  }, [placeable, canAccess, hasLocation, center[0], center[1]]);

  // Tap on map background closes the selected card.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handler = () => setSelectedId(null);
    map.on("click", handler);
    return () => { map.off("click", handler); };
  }, [canAccess]);

  return (
    <div className="flex flex-col h-full" style={{ background: "hsl(238,30%,3%)" }}>
      {/* Map fills all available space */}
      <div className="relative flex-1 min-h-0">
        <div ref={mapDivRef} className="absolute inset-0" />

        {/* Top gradient overlay — floating header */}
        <div
          className="absolute top-0 left-0 right-0 z-[400] pointer-events-none"
          style={{
            background:
              "linear-gradient(to bottom, rgba(6,5,16,0.92) 0%, rgba(6,5,16,0.5) 60%, transparent 100%)",
          }}
        >
          {/* Header: title + counter + age filter + eye toggle */}
          <div className="flex items-center gap-3 px-4 pt-3 pb-3 pointer-events-auto">
            <h1 className="font-display text-xl tracking-wide text-white flex-shrink-0">
              Mapa
            </h1>
            {canAccess && (
              <span
                className="text-xs font-sans px-2 py-0.5 rounded-full text-white/60 flex-shrink-0"
                style={{ background: "rgba(255,255,255,0.08)" }}
              >
                {isLoading ? "…" : `${onMapCount} aquí`}
              </span>
            )}

            {/* Age range — always visible, compact */}
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-xs text-white/35 flex-shrink-0">Edad</span>
              <input
                type="number"
                min={18}
                max={99}
                value={filters.ageMin}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    ageMin: Math.min(
                      Math.max(18, Number(e.target.value) || 18),
                      f.ageMax
                    ),
                  }))
                }
                className="w-12 px-1.5 py-1 rounded-lg text-xs text-white text-center"
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              />
              <span className="text-white/25 text-xs">–</span>
              <input
                type="number"
                min={18}
                max={99}
                value={filters.ageMax}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    ageMax: Math.max(
                      Math.min(99, Number(e.target.value) || 99),
                      f.ageMin
                    ),
                  }))
                }
                className="w-12 px-1.5 py-1 rounded-lg text-xs text-white text-center"
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              />
              {filtersActive(filters) && (
                <button
                  onClick={() => setFilters(DEFAULT_FILTERS)}
                  className="text-xs text-white/35 underline flex-shrink-0"
                >
                  ×
                </button>
              )}
            </div>

            {/* Visibility toggle */}
            <button
              onClick={toggleVisibility}
              disabled={updateVisibility.isPending}
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-50 transition-all"
              style={{
                background: showOnMap
                  ? "rgba(168,85,247,0.2)"
                  : "rgba(255,255,255,0.06)",
                border: showOnMap
                  ? "1px solid hsl(273,85%,55%)"
                  : "1px solid rgba(255,255,255,0.1)",
              }}
              title={showOnMap ? "Estás visible en el mapa" : "Estás oculto del mapa"}
            >
              {showOnMap ? (
                <Eye className="w-4 h-4 text-purple-300" />
              ) : (
                <EyeOff className="w-4 h-4 text-white/40" />
              )}
            </button>
          </div>

          {/* Activate location banner — below header, always below age row */}
          {canAccess && !hasLocation && (
            <div className="px-4 pb-3 pointer-events-auto">
              <div
                className="px-4 py-3 rounded-2xl flex items-center gap-3"
                style={{
                  background: "rgba(8,7,18,0.97)",
                  backdropFilter: "blur(16px)",
                  border: "1px solid rgba(168,85,247,0.2)",
                }}
              >
                <Navigation className="w-5 h-5 text-purple-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-display text-sm tracking-wide text-purple-300">
                    Activa tu ubicación
                  </p>
                  <p className="font-sans text-[11px] text-white/40 leading-snug">
                    Comparte tu GPS para ver quién está cerca de ti.
                  </p>
                </div>
                <button
                  onClick={() => geo.request()}
                  disabled={geo.isPending || geo.state === "locating"}
                  className="flex-shrink-0 px-3 py-2 rounded-xl text-white text-xs font-sans font-medium disabled:opacity-60"
                  style={{
                    background:
                      "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
                  }}
                >
                  {geo.isPending || geo.state === "locating" ? "..." : "Activar"}
                </button>
              </div>
            </div>
          )}

          {/* Location denied / unsupported */}
          {canAccess && (geo.state === "denied" || geo.state === "unsupported") && (
            <div className="px-4 pb-3 pointer-events-auto">
              <p
                className="font-sans text-[11px] text-red-400 px-3 py-2 rounded-xl"
                style={{
                  background: "rgba(20,5,5,0.92)",
                  border: "1px solid rgba(239,68,68,0.2)",
                }}
              >
                {geo.state === "denied"
                  ? "Permiso de ubicación denegado. Actívalo en los ajustes del navegador."
                  : "Tu dispositivo no admite geolocalización."}
              </p>
            </div>
          )}
        </div>

        {/* Loading spinner */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[450]">
            <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
          </div>
        )}

        {/* ── Selected user card — bottom sheet ── */}
        {canAccess && selected && (
          <div
            className="absolute bottom-4 left-4 right-4 z-[500] rounded-2xl overflow-hidden"
            style={{
              background: "rgba(7,6,18,0.97)",
              backdropFilter: "blur(24px)",
              border: "1px solid rgba(255,255,255,0.07)",
              boxShadow:
                "0 -8px 40px rgba(0,0,0,0.7),0 0 0 1px rgba(168,85,247,0.07)",
            }}
          >
            {/* Close + report */}
            <div className="absolute top-3 right-3 flex items-center gap-1 z-10">
              <button
                onClick={() => setReportOpen(true)}
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.06)" }}
                title="Reportar"
              >
                <Flag className="w-3.5 h-3.5 text-white/25" />
              </button>
              <button
                onClick={() => setSelectedId(null)}
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.06)" }}
              >
                <X className="w-3.5 h-3.5 text-white/50" />
              </button>
            </div>

            {/* Photo + info */}
            <div className="flex items-start gap-4 px-4 pt-4 pb-3 pr-20">
              <div className="relative flex-shrink-0">
                {selected.avatar_url ? (
                  <img
                    src={selected.avatar_url}
                    alt=""
                    className="w-20 h-20 rounded-2xl object-cover"
                    style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                  />
                ) : (
                  <div
                    className="w-20 h-20 rounded-2xl flex items-center justify-center text-white font-display text-2xl"
                    style={{
                      background:
                        "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
                    }}
                  >
                    {initialsFor(selected.username)}
                  </div>
                )}
                {selected.is_online && (
                  <span
                    className="absolute bottom-1.5 right-1.5 w-3.5 h-3.5 rounded-full border-2"
                    style={{
                      background: "hsl(142,71%,45%)",
                      borderColor: "rgba(7,6,18,0.97)",
                    }}
                  />
                )}
                {selected.plan === "gold" && (
                  <span
                    className="absolute -top-2 -right-2 text-sm leading-none"
                    style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.8))" }}
                  >
                    👑
                  </span>
                )}
              </div>

              <div className="flex-1 min-w-0 pt-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-display text-lg text-white leading-tight">
                    {selected.username}
                  </span>
                  {selected.age != null && (
                    <span className="font-sans text-base text-white/50">
                      {selected.age}
                    </span>
                  )}
                  {selected.is_verified && (
                    <BadgeCheck className="w-4 h-4 text-sky-400 flex-shrink-0" />
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
                  {selected.is_online && (
                    <span className="flex items-center gap-1 text-xs text-green-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                      En línea
                    </span>
                  )}
                  {(selected.distance_km != null || selected.city) && (
                    <span className="flex items-center gap-0.5 text-xs text-white/40">
                      <MapPin className="w-3 h-3 flex-shrink-0" />
                      {formatDistance(selected.distance_km) ?? selected.city ?? "Cerca"}
                    </span>
                  )}
                </div>
                {selected.city && selected.distance_km != null && (
                  <p className="text-xs text-white/30 mt-0.5 truncate">
                    {selected.city}
                  </p>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 px-4 pb-4">
              {/* Ver perfil — always free */}
              <button
                onClick={() => setLocation(`/profile/${selected.id}`)}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-sans font-medium"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "rgba(255,255,255,0.7)",
                  minWidth: "88px",
                }}
              >
                <User className="w-4 h-4" />
                Perfil
              </button>

              {/* Like — Gold only */}
              {isGold ? (
                <button
                  onClick={() =>
                    !selected.liked_by_me &&
                    likeActions.like(selected, { onSettled: invalidateMap })
                  }
                  disabled={likeActions.isPending || selected.liked_by_me}
                  className="w-11 flex-shrink-0 rounded-xl flex items-center justify-center disabled:opacity-60"
                  style={{
                    background: selected.liked_by_me
                      ? "rgba(236,72,153,0.18)"
                      : "rgba(255,255,255,0.05)",
                    border: `1px solid ${
                      selected.liked_by_me
                        ? "rgba(236,72,153,0.35)"
                        : "rgba(255,255,255,0.08)"
                    }`,
                  }}
                >
                  <Heart
                    className={`w-5 h-5 ${
                      selected.liked_by_me
                        ? "fill-pink-500 text-pink-500"
                        : "text-pink-400"
                    }`}
                  />
                </button>
              ) : (
                <button
                  onClick={() => setLocation("/premium")}
                  className="w-11 flex-shrink-0 rounded-xl flex items-center justify-center relative"
                  style={{
                    background: "rgba(251,191,36,0.06)",
                    border: "1px solid rgba(251,191,36,0.18)",
                  }}
                  title="Necesitas Gold para dar Me gusta"
                >
                  <Heart className="w-4 h-4 text-amber-500/50" />
                  <Lock className="w-2.5 h-2.5 text-amber-400/80 absolute bottom-1 right-1" />
                </button>
              )}

              {/* Message — Gold only */}
              {isGold ? (
                <button
                  onClick={() => startConversation(selected.id)}
                  disabled={convPending}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-white text-sm font-sans font-medium disabled:opacity-60"
                  style={{
                    background:
                      "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
                  }}
                >
                  <MessageCircle className="w-4 h-4" />
                  Mensaje
                </button>
              ) : (
                <button
                  onClick={() => setLocation("/premium")}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-sans font-medium"
                  style={{
                    background: "rgba(251,191,36,0.07)",
                    border: "1px solid rgba(251,191,36,0.22)",
                    color: "hsl(45,85%,65%)",
                  }}
                >
                  <Lock className="w-3.5 h-3.5" />
                  Mensaje · Gold
                </button>
              )}
            </div>
          </div>
        )}

        {canAccess && selected && (
          <ReportDialog
            open={reportOpen}
            onOpenChange={setReportOpen}
            targetUserId={selected.id}
            username={selected.username}
            targetType="profile"
          />
        )}
      </div>

      {/* Stats bar below the map */}
      {canAccess && (
        <div
          className="flex-shrink-0 flex items-center justify-around px-6 py-3"
          style={{
            background: "rgba(6,5,16,0.97)",
            borderTop: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <div className="flex items-center gap-2.5">
            <Users className="w-4 h-4 text-purple-400" />
            <div>
              <span className="font-display text-lg text-white block leading-none">
                {isLoading ? "…" : goldCount}
              </span>
              <span className="font-sans text-[10px] text-white/35">
                En el mapa
              </span>
            </div>
          </div>
          <div
            className="w-px h-7"
            style={{ background: "rgba(255,255,255,0.06)" }}
          />
          <div className="flex items-center gap-2.5">
            <Zap className="w-4 h-4 text-purple-400" />
            <div>
              <span className="font-display text-lg text-white block leading-none">
                {isLoading ? "…" : onlineCount}
              </span>
              <span className="font-sans text-[10px] text-white/35">
                En línea ahora
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
