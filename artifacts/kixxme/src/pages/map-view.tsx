import React, { useState, useEffect, useRef, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Users, Zap, Loader2, Navigation, BadgeCheck, MapPin } from "lucide-react";
import {
  useListProfiles,
  useGetMyProfile,
  getGetMyProfileQueryKey,
  PublicProfile,
  useCreateOrGetConversation,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { useGeolocation } from "@/lib/use-geolocation";
import { formatDistance } from "./discover";

const DEFAULT_CENTER: [number, number] = [40.4168, -3.7038]; // Madrid

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

function initialsFor(u: string) {
  return (u || "?").slice(0, 2).toUpperCase();
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
  const ring = user.is_online
    ? "box-shadow:0 0 0 2px hsl(142,71%,45%),0 0 12px rgba(168,85,247,0.7);"
    : "box-shadow:0 0 10px rgba(168,85,247,0.5);";
  if (user.avatar_url) {
    const src = escapeHtml(user.avatar_url);
    return `<img src="${src}" style="width:42px;height:42px;border-radius:9999px;object-fit:cover;border:2px solid rgba(168,85,247,0.7);${ring}" />`;
  }
  const initials = escapeHtml(initialsFor(user.username));
  return `<div style="width:42px;height:42px;border-radius:9999px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:13px;background:linear-gradient(135deg,hsl(273,85%,55%),hsl(330,85%,52%));border:2px solid rgba(255,255,255,0.2);${ring}">${initials}</div>`;
}

export default function MapView() {
  useAuth();
  const [, setLocation] = useLocation();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);

  const { data: profile } = useGetMyProfile({
    query: { queryKey: getGetMyProfileQueryKey() },
  });
  const { data: profiles = [], isLoading } = useListProfiles();
  const createConv = useCreateOrGetConversation();
  const geo = useGeolocation();

  const hasLocation = profile?.latitude != null && profile?.longitude != null;
  const center: [number, number] = hasLocation
    ? [profile!.latitude as number, profile!.longitude as number]
    : DEFAULT_CENTER;

  const placeable = useMemo(
    () => profiles.filter((p) => p.distance_km != null),
    [profiles]
  );
  const selected = profiles.find((p) => p.id === selectedId) || null;

  const handleMessage = (userId: string) => {
    createConv.mutate(
      { data: { other_user_id: userId } },
      { onSuccess: (conv) => setLocation(`/chats/${conv.id}`) }
    );
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
    const meMarker = L.marker(center, { icon: meIcon, zIndexOffset: 1000 }).addTo(map);
    markersRef.current.push(meMarker);

    // Other users.
    for (const user of placeable) {
      const pos = offsetPosition(center[0], center[1], user.distance_km as number, user.id);
      const icon = L.divIcon({
        html: markerHtml(user),
        className: "",
        iconSize: [42, 42],
        iconAnchor: [21, 21],
      });
      const marker = L.marker(pos, { icon }).addTo(map);
      marker.on("click", () => setSelectedId(user.id));
      markersRef.current.push(marker);
    }
  }, [placeable, center[0], center[1]]);

  const withPhoto = profiles.filter((p) => p.avatar_url).length;
  const onlineCount = profiles.filter((p) => p.is_online).length;

  return (
    <div className="flex flex-col h-full">
      <header
        className="sticky top-0 z-20 px-4 py-3 flex items-center justify-between border-b border-border/30"
        style={{ background: "rgba(8,7,18,0.9)", backdropFilter: "blur(20px)" }}
      >
        <h1 className="font-display text-2xl tracking-wide">Mapa</h1>
        <span className="font-sans text-sm text-muted-foreground">
          {isLoading ? "..." : `${placeable.length} cerca`}
        </span>
      </header>

      <div
        className="relative flex-1 mx-4 my-3 rounded-2xl overflow-hidden border border-border/30"
        style={{ minHeight: "380px" }}
      >
        <div ref={mapDivRef} className="absolute inset-0" style={{ background: "hsl(238 30% 4%)" }} />

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        )}

        {!hasLocation && (
          <div className="absolute top-3 left-3 right-3 z-[500] px-4 py-3 rounded-xl border border-primary/30 flex items-center gap-3"
            style={{ background: "rgba(13,11,26,0.95)", backdropFilter: "blur(10px)" }}>
            <Navigation className="w-5 h-5 text-primary flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-display text-sm tracking-wide text-primary">Activa tu ubicación</p>
              <p className="font-sans text-[11px] text-muted-foreground leading-snug">
                Comparte tu GPS para ver quién está cerca de ti.
              </p>
            </div>
            <button
              onClick={() => geo.request()}
              disabled={geo.isPending || geo.state === "locating"}
              className="flex-shrink-0 px-3 py-2 rounded-lg text-white text-xs font-sans font-medium disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))" }}
            >
              {geo.isPending || geo.state === "locating" ? "..." : "Activar"}
            </button>
          </div>
        )}

        {(geo.state === "denied" || geo.state === "unsupported") && (
          <div className="absolute top-20 left-3 right-3 z-[500] px-4 py-2 rounded-xl border border-red-500/30"
            style={{ background: "rgba(13,11,26,0.95)" }}>
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
            style={{ background: "rgba(13,11,26,0.97)", backdropFilter: "blur(12px)" }}
          >
            <button
              onClick={() => setLocation(`/profile/${selected.id}`)}
              className="flex items-center gap-3 flex-1 min-w-0 text-left"
            >
              <div className="relative flex-shrink-0">
                {selected.avatar_url ? (
                  <img src={selected.avatar_url} alt="" className="w-12 h-12 rounded-xl object-cover border border-border/40" />
                ) : (
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-display"
                    style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))" }}>
                    {initialsFor(selected.username)}
                  </div>
                )}
                {selected.is_online && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
                    style={{ background: "hsl(142,71%,45%)", borderColor: "hsl(238,25%,6%)" }} />
                )}
              </div>
              <div className="min-w-0">
                <p className="font-display text-base text-foreground tracking-wide truncate flex items-center gap-1">
                  {selected.username}
                  {selected.is_verified && <BadgeCheck className="w-4 h-4 text-sky-400 flex-shrink-0" />}
                </p>
                <p className="font-sans text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {formatDistance(selected.distance_km) ?? selected.city ?? "Cerca"}
                  {selected.is_online && <span className="text-green-400 ml-1">· En línea</span>}
                </p>
              </div>
            </button>
            <button
              onClick={() => handleMessage(selected.id)}
              disabled={createConv.isPending}
              className="flex-shrink-0 px-4 py-2 rounded-lg text-white text-sm font-sans font-medium disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))" }}
            >
              Mensaje
            </button>
          </div>
        )}
      </div>

      <div className="px-4 pb-4 grid grid-cols-3 gap-2">
        {[
          { icon: Users, label: "Cerca", value: String(placeable.length) },
          { icon: Zap, label: "En línea", value: String(onlineCount) },
          { icon: MapPin, label: "Con foto", value: String(withPhoto) },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex flex-col items-center py-3 rounded-xl border border-border/30" style={{ background: "rgba(13,11,26,0.7)" }}>
            <Icon className="w-4 h-4 text-primary mb-1" />
            <span className="font-display text-xl text-primary">{value}</span>
            <span className="font-sans text-[10px] text-muted-foreground mt-0.5">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
