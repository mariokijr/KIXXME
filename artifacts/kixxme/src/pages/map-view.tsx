import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
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
  useAckMapPrivacy,
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

interface MapFilters {
  ageMin: number;
  ageMax: number;
}
const AGE_SLIDER_MIN = 18;
const AGE_SLIDER_MAX = 70;
const DEFAULT_FILTERS: MapFilters = { ageMin: AGE_SLIDER_MIN, ageMax: AGE_SLIDER_MAX };

/**
 * Client-side great-circle distance (km) between two lat/lng points.
 * Used to recompute `distance_km` from the viewer's FRESH profile coordinates
 * instead of the server-side snapshot which may be stale.
 */
function localDistKm(
  vLat: number | null | undefined,
  vLng: number | null | undefined,
  tLat: number | null | undefined,
  tLng: number | null | undefined,
): number | null {
  if (vLat == null || vLng == null || tLat == null || tLng == null) return null;
  const R = 6371;
  const dLat = ((tLat - vLat) * Math.PI) / 180;
  const dLon = ((tLng - vLng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((vLat * Math.PI) / 180) *
      Math.cos((tLat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const km = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(km * 10) / 10;
}

function filtersActive(f: MapFilters): boolean {
  return f.ageMin > AGE_SLIDER_MIN || f.ageMax < AGE_SLIDER_MAX;
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  boundingbox: [string, string, string, string];
}

interface SearchCenter {
  lat: number;
  lng: number;
  radiusKm: number;
  label: string;
}

/** Approximate km radius that contains a Nominatim bounding box. */
function bboxToRadius(bb: [string, string, string, string]): number {
  const latMin = parseFloat(bb[0]);
  const latMax = parseFloat(bb[1]);
  const lngMin = parseFloat(bb[2]);
  const lngMax = parseFloat(bb[3]);
  const latMid = (latMin + latMax) / 2;
  const cosLat = Math.max(Math.abs(Math.cos((latMid * Math.PI) / 180)), 0.01);
  const halfH = ((latMax - latMin) / 2) * 111;
  const halfW = ((lngMax - lngMin) / 2) * 111 * cosLat;
  return Math.max(10, Math.min(1000, Math.max(halfH, halfW) * 1.4));
}

function radiusToZoom(r: number): number {
  if (r < 8) return 14;
  if (r < 25) return 12;
  if (r < 80) return 10;
  if (r < 250) return 8;
  if (r < 700) return 6;
  return 5;
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

function planDotColor(plan: string | undefined): { dot: string; glow: string } {
  if (plan === "gold") return { dot: "hsl(45,90%,60%)",  glow: "rgba(251,191,36," };
  if (plan === "plus") return { dot: "hsl(158,72%,50%)", glow: "rgba(52,211,153," };
  return                        { dot: "hsl(210,90%,62%)", glow: "rgba(59,130,246,"  };
}

function dotMarkerHtml(user: PublicProfile): string {
  const { dot, glow } = planDotColor(user.plan ?? undefined);
  const online = user.is_online;
  const dotSize = online ? 15 : 10;
  const shadow = online
    ? `0 0 0 2.5px rgba(74,222,128,0.60),0 0 14px ${glow}0.9)`
    : `0 0 6px ${glow}0.55)`;
  const anim = online ? "animation:kixx-dot-pulse 2s ease-in-out infinite;" : "";
  return `<div style="width:30px;height:30px;display:flex;align-items:center;justify-content:center;"><div style="width:${dotSize}px;height:${dotSize}px;border-radius:9999px;background:${dot};box-shadow:${shadow};${anim}"></div></div>`;
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

  // Auto-detected country filter (from viewer's GPS via reverse geocode).
  const [autoCountryFilter, setAutoCountryFilter] = useState<SearchCenter | null>(null);
  const countryFetchedForRef = useRef<string | null>(null);

  // Country filter: auto-detected from viewer's GPS via reverse geocode.
  const mapQueryParams = autoCountryFilter
    ? {
        scope: "worldwide" as const,
        search_lat: autoCountryFilter.lat,
        search_lng: autoCountryFilter.lng,
        search_radius_km: autoCountryFilter.radiusKm,
      }
    : { scope: "worldwide" as const };

  const { data: mapData, isLoading } = useListMapUsers(mapQueryParams, {
    query: {
      queryKey: getListMapUsersQueryKey(mapQueryParams),
      refetchInterval: 30_000,
    },
  });
  const { start: startConversation, isPending: convPending } =
    useStartConversation();
  const likeActions = useLikeActions();
  const geo = useGeolocation();
  const updateVisibility = useUpdateMapVisibility();
  const ackMapMutation = useAckMapPrivacy();
  const [privacyAckedLocally, setPrivacyAckedLocally] = useState(false);
  const [showGoldModal, setShowGoldModal] = useState(false);
  const [showVisibilityConfirm, setShowVisibilityConfirm] = useState(false);
  // Tutorial shown every time the map mounts (resets on each navigation to map tab).
  const [showMapTutorial, setShowMapTutorial] = useState(true);

  const showPrivacyModal =
    profile !== undefined &&
    profile?.map_privacy_acked === false &&
    !privacyAckedLocally;

  const handleMapPrivacyAck = () => {
    setPrivacyAckedLocally(true);
    ackMapMutation.mutate(undefined);
  };

  const canAccess = mapData?.can_access ?? false;
  const showOnMap = mapData?.show_on_map ?? true;
  const users = useMemo<PublicProfile[]>(() => mapData?.users ?? [], [mapData]);

  const isGold = profile?.plan === "gold";

  const hasLocation = profile?.latitude != null && profile?.longitude != null;
  const center: [number, number] = hasLocation
    ? [profile!.latitude as number, profile!.longitude as number]
    : DEFAULT_CENTER;

  // Dot-placement origin: viewer's own GPS location (or default center).
  const mapOrigin: [number, number] = center;

  const invalidateMap = () =>
    qc.invalidateQueries({ queryKey: getListMapUsersQueryKey() });

  const filtered = useMemo(
    () =>
      users.filter((p) => {
        if (p.age != null) {
          if (p.age < filters.ageMin) return false;
          // When slider is at max (70) treat as "70+" — no upper bound.
          if (filters.ageMax < AGE_SLIDER_MAX && p.age > filters.ageMax) return false;
        }
        return true;
      }),
    [users, filters]
  );

  // Include ALL filtered users — even those without distance_km (viewer has no GPS).
  // When distance_km is null we use a pseudo-random spread based on the user id hash.
  const placeable = useMemo(() => filtered, [filtered]);

  // In search mode, the viewer isn't necessarily in the search area.
  const onMapCount = placeable.length + (hasLocation ? 1 : 0);

  const selected = filtered.find((p) => p.id === selectedId) || null;

  const goldCount = mapData?.gold_total ?? 0;
  const onlineCount = mapData?.online_total ?? 0;

  const toggleVisibility = () => {
    if (updateVisibility.isPending) return;
    if (!showOnMap) {
      // Enabling → always show the country-visibility notice first.
      setShowVisibilityConfirm(true);
    } else {
      // Disabling → no confirmation needed.
      updateVisibility.mutate(
        { data: { show_on_map: false } },
        { onSuccess: () => invalidateMap() }
      );
    }
  };

  const confirmEnableVisibility = () => {
    setShowVisibilityConfirm(false);
    updateVisibility.mutate(
      { data: { show_on_map: true } },
      { onSuccess: () => invalidateMap() }
    );
  };

  // ── Geocoding helpers ────────────────────────────────────────────────────

  // Reverse-geocode a lat/lng to the enclosing country and return a SearchCenter.
  const geocodeCountry = async (lat: number, lng: number): Promise<SearchCenter | null> => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&zoom=3&format=json`,
        { headers: { "User-Agent": "KixxMe/1.0 (kixxme.app)" } }
      );
      const data: NominatimResult = await res.json();
      const bb = data.boundingbox;
      const cLat = (parseFloat(bb[0]) + parseFloat(bb[1])) / 2;
      const cLng = (parseFloat(bb[2]) + parseFloat(bb[3])) / 2;
      const radiusKm = bboxToRadius(bb);
      const label = data.display_name.split(",")[0].trim();
      return { lat: cLat, lng: cLng, radiusKm, label };
    } catch {
      return null;
    }
  };


  // Auto-detect the viewer's country from their stored GPS position and apply it as the
  // default filter so they only see users from their own country.
  useEffect(() => {
    if (!hasLocation || !profile?.latitude || !profile?.longitude) return;
    const key = `${profile.latitude},${profile.longitude}`;
    if (countryFetchedForRef.current === key) return;
    countryFetchedForRef.current = key;
    geocodeCountry(profile.latitude as number, profile.longitude as number).then((country) => {
      if (country) setAutoCountryFilter(country);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLocation, profile?.latitude, profile?.longitude]);

  // Inject pulse CSS for online markers once per mount.
  useEffect(() => {
    const STYLE_ID = "kixx-map-marker-anim";
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `@keyframes kixx-dot-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.45);opacity:0.72}}`;
    document.head.appendChild(style);
    return () => { document.getElementById(STYLE_ID)?.remove(); };
  }, []);

  // ── Map lifecycle ────────────────────────────────────────────────────────

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
    if (mapRef.current && hasLocation) {
      mapRef.current.setView(center, 12);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLocation, center[0], center[1]]);

  // Render dot markers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // Self — emoji marker so the viewer always knows which dot is them.
    // Other users still see this person as their plan-colored dot.
    if (hasLocation) {
      const meIcon = L.divIcon({
        html: `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;">` +
          `<div style="width:36px;height:36px;border-radius:9999px;background:rgba(255,255,255,0.10);border:2px solid rgba(255,255,255,0.40);display:flex;align-items:center;justify-content:center;font-size:20px;line-height:1;box-shadow:0 0 0 3px rgba(168,85,247,0.40),0 0 20px rgba(168,85,247,0.75);">😎</div>` +
          `<span style="font-size:9px;font-weight:700;color:#fff;letter-spacing:0.8px;text-shadow:0 1px 5px rgba(0,0,0,0.95);">TÚ</span>` +
          `</div>`,
        className: "",
        iconSize: [36, 50],
        iconAnchor: [18, 25],
      });
      markersRef.current.push(
        L.marker(center, { icon: meIcon, zIndexOffset: 1000 }).addTo(map)
      );
    }

    // Other users — use server-provided approximate coordinates (rounded to
    // ~1 km) so markers appear in the correct area. Fall back to the legacy
    // distance+bearing projection only when lat_approx is absent (old cached
    // responses or future edge-cases).
    for (const user of placeable) {
      const pos: [number, number] =
        user.lat_approx != null && user.lng_approx != null
          ? [user.lat_approx, user.lng_approx]
          : (() => {
              const distKm = user.distance_km ?? (hashId(user.id) % 350 + 50);
              return offsetPosition(mapOrigin[0], mapOrigin[1], distKm, user.id);
            })();
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeable, canAccess, hasLocation, center[0], center[1], mapOrigin[0], mapOrigin[1]]);

  // Tap on map background closes the selected card and the search dropdown.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handler = () => { setSelectedId(null); };
    map.on("click", handler);
    return () => { map.off("click", handler); };
  }, [canAccess]);

  return (
    <div className="flex flex-col h-full" style={{ background: "hsl(238,30%,3%)" }}>
      <div className="relative flex-1 min-h-0">
        <div ref={mapDivRef} className="absolute inset-0" />

        {/* ── Privacy notice (first visit only) ── */}
        {showPrivacyModal && (
          <div
            className="absolute inset-0 z-[600] flex flex-col items-center justify-end p-4 pb-6"
            style={{ background: "rgba(6,5,16,0.94)", backdropFilter: "blur(20px)" }}
          >
            <div
              className="w-full max-w-sm rounded-3xl p-6 space-y-4"
              style={{
                background: "rgba(13,11,26,0.98)",
                border: "1px solid rgba(168,85,247,0.25)",
                boxShadow: "0 -8px 60px rgba(168,85,247,0.15), 0 0 0 1px rgba(168,85,247,0.08)",
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))", boxShadow: "0 0 20px rgba(168,85,247,0.4)" }}
                >
                  <Navigation className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="font-display text-xl tracking-wide text-white">Mapa · Privacidad</h2>
                  <p className="font-sans text-xs text-white/45">Antes de continuar</p>
                </div>
              </div>
              <div className="space-y-2.5">
                {[
                  { icon: "📍", text: "Tu ubicación aparece aproximada (±2 km) — nunca con exactitud." },
                  { icon: "👁️", text: "Puedes ocultarte del mapa en cualquier momento con el botón del ojo." },
                  { icon: "🔒", text: "Solo usuarios registrados y verificados pueden verte." },
                ].map((item) => (
                  <div key={item.icon} className="flex items-start gap-3">
                    <span className="text-base leading-none pt-0.5 flex-shrink-0">{item.icon}</span>
                    <p className="font-sans text-sm text-white/70 leading-snug">{item.text}</p>
                  </div>
                ))}
              </div>
              <button
                onClick={handleMapPrivacyAck}
                disabled={ackMapMutation.isPending}
                className="w-full h-12 rounded-2xl font-display text-lg tracking-widest text-white disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))", boxShadow: "0 4px 20px rgba(168,85,247,0.35)" }}
              >
                Entendido
              </button>
            </div>
          </div>
        )}

        {/* ── show_on_map=false gate: symmetric privacy (can't see others either) ── */}
        {!showPrivacyModal && !showOnMap && (
          <div
            className="absolute inset-0 z-[500] flex flex-col items-center justify-center p-6 text-center"
            style={{ background: "rgba(6,5,16,0.97)", backdropFilter: "blur(16px)" }}
          >
            <div
              className="w-16 h-16 rounded-3xl flex items-center justify-center mb-5"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <EyeOff className="w-7 h-7 text-white/30" />
            </div>
            <h2 className="font-display text-2xl tracking-wide text-white mb-3">Estás oculto</h2>
            <p className="font-sans text-sm text-white/50 leading-relaxed max-w-xs mb-8">
              Mientras tu visibilidad esté desactivada, tampoco podrás ver a otros usuarios en el mapa.
              Actívala para explorar quién está cerca.
            </p>
            <button
              onClick={toggleVisibility}
              disabled={updateVisibility.isPending}
              className="h-12 px-8 rounded-2xl font-display text-base tracking-widest text-white disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))", boxShadow: "0 4px 20px rgba(168,85,247,0.35)" }}
            >
              {updateVisibility.isPending ? "…" : "Mostrarme en el mapa"}
            </button>
          </div>
        )}

        {/* Top gradient overlay — floating header */}
        <div
          className="absolute top-0 left-0 right-0 z-[400] pointer-events-none"
          style={{
            background:
              "linear-gradient(to bottom, rgba(6,5,16,0.92) 0%, rgba(6,5,16,0.5) 65%, transparent 100%)",
          }}
        >
          {/* Row 1: title + counter + age filter + eye toggle */}
          <div className="flex items-center gap-3 px-4 pt-3 pb-2 pointer-events-auto">
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
            {autoCountryFilter && (
              <span
                className="text-xs font-sans px-2 py-0.5 rounded-full truncate max-w-[120px]"
                style={{
                  background: "rgba(59,130,246,0.12)",
                  border: "1px solid rgba(59,130,246,0.28)",
                  color: "hsl(210,90%,72%)",
                }}
              >
                📍 {autoCountryFilter.label}
              </span>
            )}


            {/* Visibility toggle — pill button */}
            <button
              onClick={toggleVisibility}
              disabled={updateVisibility.isPending}
              className="flex items-center gap-1.5 px-3 h-8 rounded-full font-sans text-xs font-medium flex-shrink-0 disabled:opacity-50 transition-all"
              style={{
                background: showOnMap
                  ? "rgba(168,85,247,0.18)"
                  : "rgba(255,255,255,0.06)",
                border: showOnMap
                  ? "1px solid hsl(273,85%,55%)"
                  : "1px solid rgba(255,255,255,0.15)",
                color: showOnMap ? "hsl(273,85%,72%)" : "rgba(255,255,255,0.38)",
              }}
            >
              {showOnMap ? (
                <Eye className="w-3.5 h-3.5" />
              ) : (
                <EyeOff className="w-3.5 h-3.5" />
              )}
              {showOnMap ? "Visible" : "Oculto"}
            </button>
          </div>

          {/* Age range slider row */}
          {canAccess && (
            <div className="flex items-center gap-3 px-4 pb-2 pointer-events-auto">
              <span className="text-xs text-white/40 flex-shrink-0">Edad</span>
              <SliderPrimitive.Root
                className="relative flex flex-1 touch-none select-none items-center"
                min={AGE_SLIDER_MIN}
                max={AGE_SLIDER_MAX}
                step={1}
                value={[filters.ageMin, filters.ageMax]}
                onValueChange={([min, max]: [number, number]) =>
                  setFilters({ ageMin: min, ageMax: max })
                }
              >
                <SliderPrimitive.Track
                  className="relative h-[3px] w-full grow overflow-hidden rounded-full"
                  style={{ background: "rgba(255,255,255,0.1)" }}
                >
                  <SliderPrimitive.Range
                    className="absolute h-full"
                    style={{ background: "hsl(273,85%,60%)" }}
                  />
                </SliderPrimitive.Track>
                <SliderPrimitive.Thumb
                  className="block w-[18px] h-[18px] rounded-full focus:outline-none cursor-grab active:cursor-grabbing"
                  style={{
                    background: "hsl(273,85%,68%)",
                    boxShadow: "0 0 0 3px rgba(168,85,247,0.25), 0 0 10px rgba(168,85,247,0.5)",
                  }}
                />
                <SliderPrimitive.Thumb
                  className="block w-[18px] h-[18px] rounded-full focus:outline-none cursor-grab active:cursor-grabbing"
                  style={{
                    background: "hsl(273,85%,68%)",
                    boxShadow: "0 0 0 3px rgba(168,85,247,0.25), 0 0 10px rgba(168,85,247,0.5)",
                  }}
                />
              </SliderPrimitive.Root>
              <span
                className="text-xs font-sans text-white/70 flex-shrink-0 text-right"
                style={{ minWidth: "52px" }}
              >
                {filters.ageMin} – {filters.ageMax >= AGE_SLIDER_MAX ? "70+" : filters.ageMax}
              </span>
              {filtersActive(filters) && (
                <button
                  onClick={() => setFilters(DEFAULT_FILTERS)}
                  className="text-xs text-white/35 hover:text-white/60 transition-colors flex-shrink-0"
                >
                  ×
                </button>
              )}
            </div>
          )}


          {/* Activate location banner */}
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
                  onClick={() =>
                    geo.request(
                      () => {/* success: banner hides automatically */},
                      (s) => {
                        // onError fires when location is unavailable / denied.
                        // The error message block below will render automatically
                        // based on geo.state — no extra handling needed here.
                        void s;
                      }
                    )
                  }
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

          {/* Location error / denied / unsupported */}
          {canAccess &&
            (geo.state === "denied" ||
              geo.state === "unsupported" ||
              geo.state === "error") && (
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
                  : geo.state === "unsupported"
                  ? "Tu dispositivo no admite geolocalización."
                  : "No se pudo obtener la ubicación. Comprueba que el GPS esté activo e inténtalo de nuevo."}
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
                  {(() => {
                    // Recompute distance client-side from the viewer's FRESH GPS
                    // coordinates (profile.latitude/longitude) + the approximate
                    // coordinates of the other user. This avoids the stale
                    // server-side snapshot that caused wrong distances (e.g. 579 km
                    // for Móstoles→Getafe which should be ~13 km).
                    const distKm = localDistKm(
                      profile?.latitude,
                      profile?.longitude,
                      selected.lat_approx,
                      selected.lng_approx,
                    );
                    const distLabel = formatDistance(distKm) ?? selected.city ?? "Cerca";
                    return (
                      <>
                        <span className="flex items-center gap-0.5 text-xs text-white/40">
                          <MapPin className="w-3 h-3 flex-shrink-0" />
                          {distLabel}
                        </span>
                        {selected.city && distKm != null && (
                          <p className="text-xs text-white/30 mt-0.5 truncate">
                            {selected.city}
                          </p>
                        )}
                      </>
                    );
                  })()}
                </div>
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
                  onClick={() => setShowGoldModal(true)}
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
                  onClick={() => setShowGoldModal(true)}
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

        {/* ── Visibility confirmation modal (shown every time user enables show_on_map) ── */}
        {/* ── Map tutorial (shown every time the map tab is opened) ── */}
        {showMapTutorial && (
          <div
            className="absolute inset-0 z-[800] flex flex-col items-center justify-end"
            style={{ background: "rgba(6,5,16,0.90)", backdropFilter: "blur(22px)", paddingTop: "env(safe-area-inset-top)" }}
          >
            <div
              className="w-full max-w-sm rounded-t-3xl px-6 pt-7 flex flex-col gap-5 overflow-y-auto"
              style={{
                paddingBottom: "max(2rem, env(safe-area-inset-bottom))",
                maxHeight: "calc(100dvh - env(safe-area-inset-top) - 1rem)",
                background: "linear-gradient(180deg, rgba(20,14,40,0.98) 0%, rgba(10,8,22,0.99) 100%)",
                border: "1px solid rgba(168,85,247,0.2)",
                borderBottom: "none",
                boxShadow: "0 -12px 60px rgba(168,85,247,0.15)",
              }}
            >
              {/* Header */}
              <div className="text-center space-y-1.5">
                <div
                  className="w-16 h-16 rounded-3xl mx-auto flex items-center justify-center mb-3"
                  style={{
                    background: "linear-gradient(135deg, hsl(273,85%,50%), hsl(210,90%,52%))",
                    boxShadow: "0 0 32px rgba(168,85,247,0.5), 0 0 64px rgba(168,85,247,0.2)",
                  }}
                >
                  <span className="text-3xl">🗺️</span>
                </div>
                <h2 className="font-display text-2xl tracking-wide text-white">Mapa en vivo</h2>
                <p className="font-sans text-sm text-white/50 leading-snug">
                  Descubre quién está en tu país ahora mismo
                </p>
              </div>

              {/* Feature list */}
              <div className="space-y-3.5">
                {[
                  {
                    icon: "📍",
                    title: "Tu país, tu mapa",
                    desc: "La app usa tu ubicación para detectar tu país y filtra el mapa automáticamente. Si estás en Madrid, verás usuarios de toda España — no solo de Madrid. Si estás en Londres, verás usuarios del Reino Unido. Cada persona ve su propio país.",
                  },
                  {
                    icon: "🟡",
                    title: "Puntos de colores",
                    desc: "🔵 Azul = plan gratuito · 🟢 Verde = Plus · 🟡 Dorado = Gold. Toca cualquier punto — sin importar su plan — para ver el perfil, foto y descripción.",
                  },
                  {
                    icon: "🎚️",
                    title: "Filtra por edad",
                    desc: "Usa la barra de 18–70+ para ver solo el rango que te interesa. Los marcadores se actualizan al instante.",
                  },
                  {
                    icon: "👁️",
                    title: "Visible / Oculto",
                    desc: 'Si estás "Oculto", ni te ven a ti ni tú ves a nadie. Actívate para explorar — tu posición exacta nunca se revela.',
                  },
                ].map((item) => (
                  <div key={item.icon} className="flex items-start gap-3.5">
                    <div
                      className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                      style={{ background: "rgba(168,85,247,0.12)", border: "1px solid rgba(168,85,247,0.18)" }}
                    >
                      <span className="text-lg">{item.icon}</span>
                    </div>
                    <div className="pt-0.5">
                      <p className="font-sans text-sm font-semibold text-white/90 leading-tight">{item.title}</p>
                      <p className="font-sans text-xs text-white/50 leading-snug mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <button
                onClick={() => setShowMapTutorial(false)}
                className="w-full h-13 rounded-2xl font-display text-base tracking-widest text-white transition-opacity active:opacity-80"
                style={{
                  height: "52px",
                  background: "linear-gradient(135deg, hsl(273,85%,52%), hsl(210,90%,52%))",
                  boxShadow: "0 4px 24px rgba(168,85,247,0.4)",
                }}
              >
                ¡Explorar el mapa! 🗺️
              </button>
            </div>
          </div>
        )}

        {showVisibilityConfirm && (
          <div
            className="absolute inset-0 z-[700] flex flex-col items-center justify-end p-4 pb-6"
            style={{ background: "rgba(6,5,16,0.88)", backdropFilter: "blur(20px)" }}
            onClick={(e) => { if (e.target === e.currentTarget) setShowVisibilityConfirm(false); }}
          >
            <div
              className="w-full max-w-sm rounded-3xl p-6 space-y-5"
              style={{
                background: "rgba(13,11,26,0.98)",
                border: "1px solid rgba(168,85,247,0.25)",
                boxShadow: "0 -8px 60px rgba(168,85,247,0.12)",
              }}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                    style={{
                      background: "linear-gradient(135deg, hsl(273,85%,52%), hsl(210,90%,55%))",
                      boxShadow: "0 0 20px rgba(168,85,247,0.4)",
                    }}
                  >
                    <Eye className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="font-display text-xl tracking-wide text-white leading-tight">
                      Vas a aparecer en el mapa
                    </h2>
                    <p className="font-sans text-xs text-white/45 mt-0.5">
                      Lee esto antes de activarte
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowVisibilityConfirm(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  <X className="w-4 h-4 text-white/40" />
                </button>
              </div>

              {/* Info items */}
              <div className="space-y-3">
                {[
                  {
                    icon: "📍",
                    text: `Solo los usuarios de ${autoCountryFilter?.label ?? "tu país"} podrán verte — no de todo el mundo.`,
                  },
                  {
                    icon: "🔒",
                    text: "Tu posición exacta nunca se comparte. Solo apareces con una ubicación aproximada (±2 km).",
                  },
                  {
                    icon: "👁️",
                    text: 'Puedes ocultarte en cualquier momento pulsando el botón "Oculto" del mapa.',
                  },
                ].map((item) => (
                  <div key={item.icon} className="flex items-start gap-3">
                    <span className="text-lg leading-none pt-0.5 flex-shrink-0">{item.icon}</span>
                    <p className="font-sans text-sm text-white/70 leading-snug">{item.text}</p>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <button
                onClick={confirmEnableVisibility}
                disabled={updateVisibility.isPending}
                className="w-full h-12 rounded-2xl font-display text-base tracking-widest text-white disabled:opacity-60 transition-opacity"
                style={{
                  background: "linear-gradient(135deg, hsl(273,85%,52%), hsl(210,90%,55%))",
                  boxShadow: "0 4px 20px rgba(168,85,247,0.35)",
                }}
              >
                {updateVisibility.isPending ? "…" : "Entendido, mostrarme 👁️"}
              </button>
              <button
                onClick={() => setShowVisibilityConfirm(false)}
                className="w-full h-10 font-sans text-sm text-white/35 hover:text-white/55 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* ── Gold upsell modal (tap locked Like / Mensaje) ── */}
        {showGoldModal && (
          <div
            className="absolute inset-0 z-[700] flex flex-col items-center justify-end p-4 pb-6"
            style={{ background: "rgba(6,5,16,0.88)", backdropFilter: "blur(20px)" }}
            onClick={(e) => { if (e.target === e.currentTarget) setShowGoldModal(false); }}
          >
            <div
              className="w-full max-w-sm rounded-3xl p-6 space-y-4"
              style={{
                background: "rgba(13,11,26,0.98)",
                border: "1px solid rgba(251,191,36,0.28)",
                boxShadow: "0 -8px 60px rgba(251,191,36,0.14), 0 0 0 1px rgba(251,191,36,0.06)",
              }}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 text-2xl"
                    style={{ background: "linear-gradient(135deg, hsl(45,90%,55%), hsl(35,95%,45%))", boxShadow: "0 0 20px rgba(251,191,36,0.5)" }}
                  >
                    👑
                  </div>
                  <div>
                    <h2 className="font-display text-xl tracking-wide text-white">Se requiere Gold</h2>
                    <p className="font-sans text-xs text-white/45">Para contactar desde el mapa</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowGoldModal(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-white/70 flex-shrink-0"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-2.5">
                {[
                  { icon: "💬", text: "Envía mensajes a cualquier usuario directamente desde el mapa." },
                  { icon: "❤️", text: "Da me gusta e inicia conexiones con quien te guste." },
                  { icon: "📹", text: "Videollamadas Gold en tiempo real." },
                  { icon: "⭐", text: "5 días de prueba gratuita disponibles si aún no los has canjeado." },
                ].map((item) => (
                  <div key={item.icon} className="flex items-start gap-3">
                    <span className="text-base leading-none pt-0.5 flex-shrink-0">{item.icon}</span>
                    <p className="font-sans text-sm text-white/70 leading-snug">{item.text}</p>
                  </div>
                ))}
              </div>
              <button
                onClick={() => { setShowGoldModal(false); setLocation("/premium"); }}
                className="w-full h-12 rounded-2xl font-display text-lg tracking-widest text-white"
                style={{ background: "linear-gradient(135deg, hsl(45,90%,55%), hsl(35,95%,50%))", boxShadow: "0 4px 20px rgba(251,191,36,0.45)" }}
              >
                Probar 5 días gratis 👑
              </button>
              <button
                onClick={() => { setShowGoldModal(false); setLocation("/premium"); }}
                className="w-full h-10 rounded-2xl font-sans text-sm text-white/45 hover:text-white/60 transition-colors"
              >
                Ver todos los planes →
              </button>
            </div>
          </div>
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
