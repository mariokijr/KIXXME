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
  Search,
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

function dotMarkerHtml(user: PublicProfile): string {
  const isGoldUser = user.plan === "gold";
  const online = user.is_online;
  const dotSize = online ? 15 : 10;
  const color = isGoldUser ? "hsl(45,90%,60%)" : "hsl(210,90%,62%)";
  const shadow = online
    ? `0 0 0 2.5px rgba(74,222,128,0.60),0 0 14px ${
        isGoldUser ? "rgba(251,191,36,0.9)" : "rgba(59,130,246,0.85)"
      }`
    : `0 0 6px ${
        isGoldUser ? "rgba(251,191,36,0.5)" : "rgba(59,130,246,0.50)"
      }`;
  const anim = online ? "animation:kixx-dot-pulse 2s ease-in-out infinite;" : "";
  return `<div style="width:30px;height:30px;display:flex;align-items:center;justify-content:center;"><div style="width:${dotSize}px;height:${dotSize}px;border-radius:9999px;background:${color};box-shadow:${shadow};${anim}"></div></div>`;
}

export default function MapView() {
  useAuth();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [filters, setFilters] = useState<MapFilters>(DEFAULT_FILTERS);

  // ── Geocoding search ──────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [searchCenter, setSearchCenter] = useState<SearchCenter | null>(null);
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Active country/area filter: manual search takes precedence over auto GPS country.
  const activeFilter = searchCenter ?? autoCountryFilter;
  const mapQueryParams = activeFilter
    ? {
        scope: "worldwide" as const,
        search_lat: activeFilter.lat,
        search_lng: activeFilter.lng,
        search_radius_km: activeFilter.radiusKm,
      }
    : { scope: "worldwide" as const };

  const { data: mapData, isLoading } = useListMapUsers(mapQueryParams, {
    query: {
      queryKey: getListMapUsersQueryKey(mapQueryParams),
      refetchInterval: 15000,
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

  // When searching, use the search point as the dot-placement origin.
  // When not searching, use the viewer's own location (or default).
  const mapOrigin: [number, number] = searchCenter
    ? [searchCenter.lat, searchCenter.lng]
    : center;

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
  const onMapCount = searchCenter
    ? placeable.length
    : placeable.length + (hasLocation ? 1 : 0);

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

  const geocode = useCallback(async (q: string) => {
    setIsSearching(true);
    try {
      const url =
        `https://nominatim.openstreetmap.org/search` +
        `?q=${encodeURIComponent(q)}&format=json&limit=5&accept-language=es`;
      const res = await fetch(url, {
        headers: { "User-Agent": "KixxMe/1.0 (kixxme.app)" },
      });
      const data: NominatimResult[] = await res.json();
      setSuggestions(data);
      setShowSuggestions(data.length > 0);
    } catch {
      setSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const onSearchInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (q.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    searchDebounceRef.current = setTimeout(() => geocode(q.trim()), 400);
  };

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

  const selectSuggestion = async (r: NominatimResult) => {
    const lat = parseFloat(r.lat);
    const lng = parseFloat(r.lon);
    // Fly to the searched city immediately for responsiveness.
    const cityZoom = radiusToZoom(bboxToRadius(r.boundingbox));
    mapRef.current?.flyTo([lat, lng], cityZoom, { duration: 1.2 });
    setSuggestions([]);
    setShowSuggestions(false);
    setSearchQuery(r.display_name.split(",").slice(0, 2).join(", "));
    // Then resolve to country level so the API filter covers the whole country.
    const country = await geocodeCountry(lat, lng);
    if (country) {
      setSearchCenter(country);
      setSearchQuery(country.label);
      mapRef.current?.flyTo([lat, lng], Math.min(cityZoom, radiusToZoom(country.radiusKm) + 1), { duration: 0.8 });
    } else {
      // Fallback: use city-level bbox
      setSearchCenter({ lat, lng, radiusKm: bboxToRadius(r.boundingbox), label: r.display_name.split(",")[0].trim() });
    }
  };

  const clearSearch = () => {
    setSearchCenter(null);
    setSearchQuery("");
    setSuggestions([]);
    setShowSuggestions(false);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (mapRef.current) {
      mapRef.current.flyTo(center, hasLocation ? 12 : 5, { duration: 1.2 });
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

  // Recenter when viewer's location becomes available (only when not in search mode).
  useEffect(() => {
    if (mapRef.current && hasLocation && !searchCenter) {
      mapRef.current.setView(center, 12);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLocation, center[0], center[1], searchCenter]);

  // Render dot markers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // Self — bright pink dot. Always at the viewer's real GPS position.
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

    // Other users — offset from the mapOrigin (search center or viewer GPS).
    // When distance_km is null (viewer has no GPS), assign a consistent spread via hash.
    for (const user of placeable) {
      const distKm = user.distance_km ?? (hashId(user.id) % 350 + 50);
      const pos = offsetPosition(
        mapOrigin[0],
        mapOrigin[1],
        distKm,
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeable, canAccess, hasLocation, center[0], center[1], mapOrigin[0], mapOrigin[1]]);

  // Tap on map background closes the selected card and the search dropdown.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handler = () => { setSelectedId(null); setShowSuggestions(false); };
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
            {searchCenter && (
              <span
                className="text-xs font-sans px-2 py-0.5 rounded-full truncate max-w-[120px]"
                style={{
                  background: "rgba(168,85,247,0.15)",
                  border: "1px solid rgba(168,85,247,0.3)",
                  color: "hsl(273,85%,75%)",
                }}
              >
                {searchCenter.label}
              </span>
            )}
            {!searchCenter && autoCountryFilter && (
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

          {/* Row 2: geocoding search bar */}
          {canAccess && (
            <div className="px-4 pb-2 pointer-events-auto relative">
              <div className="relative">
                {isSearching ? (
                  <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 animate-spin pointer-events-none" />
                ) : (
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
                )}
                <input
                  type="text"
                  placeholder="Buscar ciudad, país…"
                  value={searchQuery}
                  onChange={onSearchInput}
                  onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 160)}
                  className="w-full pl-9 pr-9 py-2.5 rounded-xl text-sm text-white font-sans transition-all"
                  style={{
                    background: searchCenter
                      ? "rgba(168,85,247,0.12)"
                      : "rgba(255,255,255,0.07)",
                    border: searchCenter
                      ? "1px solid rgba(168,85,247,0.35)"
                      : "1px solid rgba(255,255,255,0.09)",
                    outline: "none",
                    caretColor: "hsl(273,85%,75%)",
                  }}
                />
                {searchQuery.length > 0 && (
                  <button
                    onMouseDown={(e) => { e.preventDefault(); clearSearch(); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full transition-colors"
                    style={{ background: "rgba(255,255,255,0.06)" }}
                  >
                    <X className="w-3 h-3 text-white/50" />
                  </button>
                )}
              </div>

              {/* Suggestions dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <div
                  className="absolute left-4 right-4 mt-1 z-[410] rounded-xl overflow-hidden"
                  style={{
                    background: "rgba(8,7,20,0.98)",
                    backdropFilter: "blur(24px)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    boxShadow: "0 12px 40px rgba(0,0,0,0.7)",
                  }}
                >
                  {suggestions.map((r, i) => (
                    <button
                      key={r.place_id}
                      onMouseDown={(e) => { e.preventDefault(); selectSuggestion(r); }}
                      className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.04]"
                      style={{
                        borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : undefined,
                      }}
                    >
                      <MapPin className="w-3.5 h-3.5 text-purple-400 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-white/80 leading-snug font-sans">
                        {r.display_name}
                      </span>
                    </button>
                  ))}
                </div>
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
