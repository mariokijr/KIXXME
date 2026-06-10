import React, { useState, useEffect, useRef, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Globe,
  Zap,
  Loader2,
  Navigation,
  BadgeCheck,
  MapPin,
  Crown,
  SlidersHorizontal,
  Heart,
  Check,
} from "lucide-react";
import {
  useListProfiles,
  getListProfilesQueryKey,
  useGetDiscoveryStats,
  useGetMyProfile,
  getGetMyProfileQueryKey,
  PublicProfile,
  useCreateOrGetConversation,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { useGeolocation } from "@/lib/use-geolocation";
import { useLikeActions } from "@/lib/like-actions";
import { formatDistance, initialsFor } from "@/lib/profile-format";

const DEFAULT_CENTER: [number, number] = [40.4168, -3.7038]; // Madrid

type Scope = "nearby" | "province" | "spain" | "europe" | "worldwide";

const SCOPES: { value: Scope; label: string; needsLocation?: boolean }[] = [
  { value: "nearby", label: "Cerca", needsLocation: true },
  { value: "province", label: "Provincia", needsLocation: true },
  { value: "spain", label: "España" },
  { value: "europe", label: "Europa" },
  { value: "worldwide", label: "Mundo" },
];

interface MapFilters {
  onlineOnly: boolean;
  withPhoto: boolean;
  verifiedOnly: boolean;
  ageMin: number;
  ageMax: number;
}

const DEFAULT_FILTERS: MapFilters = {
  onlineOnly: false,
  withPhoto: false,
  verifiedOnly: false,
  ageMin: 18,
  ageMax: 99,
};

function filtersActive(f: MapFilters): boolean {
  return (
    f.onlineOnly ||
    f.withPhoto ||
    f.verifiedOnly ||
    f.ageMin > DEFAULT_FILTERS.ageMin ||
    f.ageMax < DEFAULT_FILTERS.ageMax
  );
}

function hashId(id: string): number {
  let h = 0;
  for (const c of id) {
    h = (h << 5) - h + c.charCodeAt(0);
    h |= 0;
  }
  return Math.abs(h);
}

// Place a user at a real distance with a stable, privacy-preserving bearing
// derived from their id (the API never exposes raw coordinates).
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

// Escape values before they go into raw marker HTML (Leaflet divIcon bypasses
// React escaping, so unsanitized profile fields would be a stored-XSS vector).
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function markerHtml(user: PublicProfile): string {
  const isGold = user.plan === "gold";
  const ring = user.is_online
    ? "box-shadow:0 0 0 2px hsl(142,71%,45%),0 0 12px rgba(168,85,247,0.7);"
    : "box-shadow:0 0 10px rgba(168,85,247,0.5);";
  const border = isGold
    ? "2px solid hsl(45,90%,55%)"
    : "2px solid rgba(168,85,247,0.7)";
  // Crown is a static glyph — no user input, so no escaping needed.
  const crown = isGold
    ? `<div style="position:absolute;top:-9px;right:-7px;font-size:14px;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.7));">👑</div>`
    : "";
  const inner = user.avatar_url
    ? `<img src="${escapeHtml(
        user.avatar_url
      )}" style="width:42px;height:42px;border-radius:9999px;object-fit:cover;border:${border};${ring}" />`
    : `<div style="width:42px;height:42px;border-radius:9999px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:13px;background:linear-gradient(135deg,hsl(273,85%,55%),hsl(330,85%,52%));border:${border};${ring}">${escapeHtml(
        initialsFor(user.username)
      )}</div>`;
  return `<div style="position:relative;width:42px;height:42px;">${inner}${crown}</div>`;
}

export default function MapView() {
  useAuth();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>("worldwide");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<MapFilters>(DEFAULT_FILTERS);

  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);

  const { data: profile } = useGetMyProfile({
    query: { queryKey: getGetMyProfileQueryKey() },
  });
  const { data: profiles = [], isLoading } = useListProfiles({ scope });
  const { data: stats } = useGetDiscoveryStats({ scope });
  const createConv = useCreateOrGetConversation();
  const likeActions = useLikeActions();
  const geo = useGeolocation();

  const isGold = profile?.plan === "gold";
  const hasLocation = profile?.latitude != null && profile?.longitude != null;
  const center: [number, number] = hasLocation
    ? [profile!.latitude as number, profile!.longitude as number]
    : DEFAULT_CENTER;

  const invalidateProfiles = () =>
    qc.invalidateQueries({ queryKey: getListProfilesQueryKey() });

  // Advanced filters only apply for Gold users; everyone else sees the full
  // (server-scoped) list.
  const activeFilters = isGold ? filters : DEFAULT_FILTERS;
  const filtered = useMemo(
    () =>
      profiles.filter((p) => {
        if (activeFilters.onlineOnly && !p.is_online) return false;
        if (activeFilters.withPhoto && !p.avatar_url) return false;
        if (activeFilters.verifiedOnly && !p.is_verified) return false;
        if (
          p.age != null &&
          (p.age < activeFilters.ageMin || p.age > activeFilters.ageMax)
        )
          return false;
        return true;
      }),
    [profiles, activeFilters]
  );

  const placeable = useMemo(
    () => filtered.filter((p) => p.distance_km != null),
    [filtered]
  );
  const selected = filtered.find((p) => p.id === selectedId) || null;

  const handleMessage = (userId: string) => {
    createConv.mutate(
      { data: { other_user_id: userId } },
      { onSuccess: (conv) => setLocation(`/chats/${conv.id}`) }
    );
  };

  const setScopeSafe = (next: Scope) => {
    const def = SCOPES.find((s) => s.value === next);
    if (def?.needsLocation && !hasLocation) return;
    setScope(next);
  };

  // Initialize the map once.
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;
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
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recenter when the user's own location becomes available.
  useEffect(() => {
    if (mapRef.current && hasLocation) {
      mapRef.current.setView(center, 12);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLocation, center[0], center[1]]);

  // Render markers whenever data changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // Own marker.
    const meIcon = L.divIcon({
      html: `<div style="width:20px;height:20px;border-radius:9999px;background:hsl(330,85%,55%);border:3px solid #fff;box-shadow:0 0 14px rgba(236,72,153,0.9);"></div>`,
      className: "",
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });
    const meMarker = L.marker(center, {
      icon: meIcon,
      zIndexOffset: 1000,
    }).addTo(map);
    markersRef.current.push(meMarker);

    // Other users — Gold markers float above the rest (priority visibility).
    for (const user of placeable) {
      const pos = offsetPosition(
        center[0],
        center[1],
        user.distance_km as number,
        user.id
      );
      const icon = L.divIcon({
        html: markerHtml(user),
        className: "",
        iconSize: [42, 42],
        iconAnchor: [21, 21],
      });
      const zIndexOffset =
        user.plan === "gold" ? 600 : user.is_online ? 200 : 0;
      const marker = L.marker(pos, { icon, zIndexOffset }).addTo(map);
      marker.on("click", () => setSelectedId(user.id));
      markersRef.current.push(marker);
    }
  }, [placeable, center[0], center[1]]);

  const registered = stats?.registered ?? null;
  const online = stats?.online ?? null;

  return (
    <div className="flex flex-col h-full">
      <header
        className="sticky top-0 z-20 px-4 py-3 flex items-center justify-between border-b border-border/30"
        style={{ background: "rgba(8,7,18,0.9)", backdropFilter: "blur(20px)" }}
      >
        <h1 className="font-display text-2xl tracking-wide">Mapa</h1>
        <span className="font-sans text-sm text-muted-foreground">
          {isLoading ? "..." : `${placeable.length} en el mapa`}
        </span>
      </header>

      {/* Scope chips */}
      <div className="px-4 pt-3 flex gap-2 overflow-x-auto no-scrollbar">
        {SCOPES.map((s) => {
          const disabled = s.needsLocation && !hasLocation;
          const active = scope === s.value;
          return (
            <button
              key={s.value}
              onClick={() => setScopeSafe(s.value)}
              disabled={disabled}
              className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-sans font-medium border transition-colors ${
                active
                  ? "text-white border-transparent"
                  : "text-muted-foreground border-border/40"
              } ${disabled ? "opacity-40" : ""}`}
              style={
                active
                  ? {
                      background:
                        "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
                    }
                  : { background: "rgba(13,11,26,0.7)" }
              }
              title={disabled ? "Activa tu ubicación para usar este filtro" : ""}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Advanced filters toggle (Gold) */}
      <div className="px-4 pt-2 flex items-center gap-2">
        <button
          onClick={() => setShowFilters((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-sans font-medium border border-amber-500/30 text-amber-300"
          style={{ background: "rgba(45,35,10,0.5)" }}
        >
          {isGold ? (
            <SlidersHorizontal className="w-3.5 h-3.5" />
          ) : (
            <Crown className="w-3.5 h-3.5" />
          )}
          Filtros avanzados
          {isGold && filtersActive(filters) && (
            <span className="ml-0.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
          )}
        </button>
      </div>

      {showFilters && isGold && (
        <div
          className="mx-4 mt-2 p-3 rounded-xl border border-amber-500/20 space-y-3"
          style={{ background: "rgba(20,16,30,0.9)" }}
        >
          <div className="flex flex-wrap gap-2">
            {[
              { key: "onlineOnly" as const, label: "En línea" },
              { key: "withPhoto" as const, label: "Con foto" },
              { key: "verifiedOnly" as const, label: "Verificados" },
            ].map(({ key, label }) => {
              const on = filters[key];
              return (
                <button
                  key={key}
                  onClick={() =>
                    setFilters((f) => ({ ...f, [key]: !f[key] }))
                  }
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-sans font-medium border ${
                    on
                      ? "text-white border-transparent"
                      : "text-muted-foreground border-border/40"
                  }`}
                  style={
                    on
                      ? { background: "hsl(45,85%,45%)" }
                      : { background: "rgba(13,11,26,0.7)" }
                  }
                >
                  {on && <Check className="w-3 h-3" />}
                  {label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <span className="font-sans text-xs text-muted-foreground">Edad</span>
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
              className="w-16 px-2 py-1 rounded-lg bg-background/60 border border-border/40 text-sm text-foreground"
            />
            <span className="text-muted-foreground">–</span>
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
              className="w-16 px-2 py-1 rounded-lg bg-background/60 border border-border/40 text-sm text-foreground"
            />
            {filtersActive(filters) && (
              <button
                onClick={() => setFilters(DEFAULT_FILTERS)}
                className="ml-auto font-sans text-xs text-muted-foreground underline"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>
      )}

      {showFilters && !isGold && (
        <div
          className="mx-4 mt-2 p-4 rounded-xl border border-amber-500/30 flex items-center gap-3"
          style={{ background: "rgba(30,22,8,0.85)" }}
        >
          <Crown className="w-6 h-6 text-amber-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-display text-sm tracking-wide text-amber-300">
              Filtros avanzados — Exclusivo Gold
            </p>
            <p className="font-sans text-[11px] text-muted-foreground leading-snug">
              Filtra por edad, conexión, foto y verificación. Y aparece arriba
              en el mapa.
            </p>
          </div>
          <button
            onClick={() => setLocation("/premium")}
            className="flex-shrink-0 px-3 py-2 rounded-lg text-black text-xs font-sans font-semibold"
            style={{
              background: "linear-gradient(135deg, hsl(45,95%,60%), hsl(38,92%,50%))",
            }}
          >
            Hazte Gold
          </button>
        </div>
      )}

      <div
        className="relative flex-1 mx-4 my-3 rounded-2xl overflow-hidden border border-border/30"
        style={{ minHeight: "340px" }}
      >
        <div
          ref={mapDivRef}
          className="absolute inset-0"
          style={{ background: "hsl(238 30% 4%)" }}
        />

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        )}

        {!hasLocation && (
          <div
            className="absolute top-3 left-3 right-3 z-[500] px-4 py-3 rounded-xl border border-primary/30 flex items-center gap-3"
            style={{
              background: "rgba(13,11,26,0.95)",
              backdropFilter: "blur(10px)",
            }}
          >
            <Navigation className="w-5 h-5 text-primary flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-display text-sm tracking-wide text-primary">
                Activa tu ubicación
              </p>
              <p className="font-sans text-[11px] text-muted-foreground leading-snug">
                Comparte tu GPS para ver quién está cerca de ti.
              </p>
            </div>
            <button
              onClick={() => geo.request()}
              disabled={geo.isPending || geo.state === "locating"}
              className="flex-shrink-0 px-3 py-2 rounded-lg text-white text-xs font-sans font-medium disabled:opacity-60"
              style={{
                background:
                  "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
              }}
            >
              {geo.isPending || geo.state === "locating" ? "..." : "Activar"}
            </button>
          </div>
        )}

        {(geo.state === "denied" || geo.state === "unsupported") && (
          <div
            className="absolute top-20 left-3 right-3 z-[500] px-4 py-2 rounded-xl border border-red-500/30"
            style={{ background: "rgba(13,11,26,0.95)" }}
          >
            <p className="font-sans text-[11px] text-red-400">
              {geo.state === "denied"
                ? "Permiso de ubicación denegado. Actívalo en los ajustes del navegador."
                : "Tu dispositivo no admite geolocalización."}
            </p>
          </div>
        )}

        {selected && (
          <div
            className="absolute bottom-3 left-3 right-3 z-[500] p-3 rounded-xl border border-primary/20 flex items-center gap-3"
            style={{
              background: "rgba(13,11,26,0.97)",
              backdropFilter: "blur(12px)",
            }}
          >
            <button
              onClick={() => setLocation(`/profile/${selected.id}`)}
              className="flex items-center gap-3 flex-1 min-w-0 text-left"
            >
              <div className="relative flex-shrink-0">
                {selected.avatar_url ? (
                  <img
                    src={selected.avatar_url}
                    alt=""
                    className="w-12 h-12 rounded-xl object-cover border border-border/40"
                  />
                ) : (
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-display"
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
                    className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
                    style={{
                      background: "hsl(142,71%,45%)",
                      borderColor: "hsl(238,25%,6%)",
                    }}
                  />
                )}
              </div>
              <div className="min-w-0">
                <p className="font-display text-base text-foreground tracking-wide truncate flex items-center gap-1">
                  {selected.username}
                  {selected.age != null && (
                    <span className="font-sans text-sm text-muted-foreground">
                      {selected.age}
                    </span>
                  )}
                  {selected.is_verified && (
                    <BadgeCheck className="w-4 h-4 text-sky-400 flex-shrink-0" />
                  )}
                  {selected.plan === "gold" && (
                    <Crown className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  )}
                </p>
                <p className="font-sans text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {formatDistance(selected.distance_km) ??
                    selected.city ??
                    "Cerca"}
                  {selected.is_online && (
                    <span className="text-green-400 ml-1">· En línea</span>
                  )}
                </p>
              </div>
            </button>
            <button
              onClick={() =>
                !selected.liked_by_me &&
                likeActions.like(selected, { onSettled: invalidateProfiles })
              }
              disabled={likeActions.isPending || selected.liked_by_me}
              aria-label="Me gusta"
              className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center border border-border/40 disabled:opacity-70"
              style={{ background: "rgba(255,255,255,0.04)" }}
            >
              <Heart
                className={`w-5 h-5 ${
                  selected.liked_by_me
                    ? "fill-pink-500 text-pink-500"
                    : "text-pink-400"
                }`}
              />
            </button>
            <button
              onClick={() => handleMessage(selected.id)}
              disabled={createConv.isPending}
              className="flex-shrink-0 px-4 py-2 rounded-lg text-white text-sm font-sans font-medium disabled:opacity-60"
              style={{
                background:
                  "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
              }}
            >
              Mensaje
            </button>
          </div>
        )}
      </div>

      <div className="px-4 pb-4 grid grid-cols-2 gap-2">
        {[
          { icon: Globe, label: "Usuarios registrados", value: registered },
          { icon: Zap, label: "En línea ahora", value: online },
        ].map(({ icon: Icon, label, value }) => (
          <div
            key={label}
            className="flex flex-col items-center py-3 rounded-xl border border-border/30"
            style={{ background: "rgba(13,11,26,0.7)" }}
          >
            <Icon className="w-4 h-4 text-primary mb-1" />
            <span className="font-display text-xl text-primary">
              {value == null ? "…" : value}
            </span>
            <span className="font-sans text-[10px] text-muted-foreground mt-0.5 text-center px-1">
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
