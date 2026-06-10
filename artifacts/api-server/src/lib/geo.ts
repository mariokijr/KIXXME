const ONLINE_WINDOW_MS = 5 * 60 * 1000;

/**
 * Great-circle distance between two lat/lng points in kilometers.
 */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Rounded distance in km, or null when either point lacks coordinates.
 */
export function distanceKm(
  lat1: number | null | undefined,
  lon1: number | null | undefined,
  lat2: number | null | undefined,
  lon2: number | null | undefined,
): number | null {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const km = haversineKm(lat1, lon1, lat2, lon2);
  return Math.round(km * 10) / 10;
}

/**
 * A user is "online" when their last activity is within the online window.
 */
export function isOnline(lastActiveAt: string | null | undefined): boolean {
  if (!lastActiveAt) return false;
  const ts = new Date(lastActiveAt).getTime();
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts <= ONLINE_WINDOW_MS;
}

// --- World-map scope filtering ---------------------------------------------

/** Geographic scope options for the world map discovery surface. */
export type MapScope = "nearby" | "province" | "spain" | "europe" | "worldwide";

/** Max distance (km) for the "nearby" map scope. */
export const NEARBY_KM = 50;
/**
 * Max distance (km) for the "province" map scope. There is no province column
 * in Supabase, so a province is approximated by a radius (documented limitation).
 */
export const PROVINCE_KM = 150;

export interface BBox {
  latMin: number;
  latMax: number;
  lngMin: number;
  lngMax: number;
}

// Rough bounding boxes. Supabase has no country column, so the spain/europe
// scopes are approximated by lat/lng extents (documented limitation). These
// mirror the copies in `lib/live.ts`, whose Live scaffold uses a different
// scope enum (city vs province) and a different "nearby" radius; keep both in
// sync if the geography ever changes.
export const SPAIN_BOX: BBox = {
  latMin: 27.4,
  latMax: 43.9,
  lngMin: -18.3,
  lngMax: 4.6,
};
export const EUROPE_BOX: BBox = {
  latMin: 34,
  latMax: 71.5,
  lngMin: -25,
  lngMax: 45,
};

export function inBox(
  lat: number | null | undefined,
  lng: number | null | undefined,
  box: BBox,
): boolean {
  if (lat == null || lng == null) return false;
  return (
    lat >= box.latMin &&
    lat <= box.latMax &&
    lng >= box.lngMin &&
    lng <= box.lngMax
  );
}

/** The radius (km) for a radius-based scope, or null for the others. */
export function scopeRadiusKm(scope: MapScope): number | null {
  if (scope === "nearby") return NEARBY_KM;
  if (scope === "province") return PROVINCE_KM;
  return null;
}

/** A lat/lng box that fully contains a `radiusKm` circle around a point. */
export function boxAround(lat: number, lng: number, radiusKm: number): BBox {
  const dLat = radiusKm / 111; // ~111 km per degree of latitude
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const dLng = radiusKm / (111 * Math.max(Math.abs(cosLat), 0.01));
  return {
    latMin: lat - dLat,
    latMax: lat + dLat,
    lngMin: lng - dLng,
    lngMax: lng + dLng,
  };
}

/**
 * Bounding box used to PRE-FILTER the DB query for a scope, so we don't merely
 * sample the most-recent N rows and then drop everything out of scope. Returns:
 *  - a BBox to apply as gte/lte filters,
 *  - `null` when no geographic pre-filter is needed (worldwide), or
 *  - `"empty"` when the scope is radius-based but the viewer has no coordinates
 *    (the caller should return no results).
 */
export function scopeBoxFor(
  scope: MapScope,
  viewer: { latitude: number | null; longitude: number | null } | null,
): BBox | null | "empty" {
  if (scope === "worldwide") return null;
  if (scope === "spain") return SPAIN_BOX;
  if (scope === "europe") return EUROPE_BOX;
  const radius = scopeRadiusKm(scope);
  if (radius == null) return null;
  if (viewer?.latitude == null || viewer?.longitude == null) return "empty";
  return boxAround(viewer.latitude, viewer.longitude, radius);
}

/**
 * Precise JS refinement applied after the bounding-box pre-filter. Radius scopes
 * use haversine against the viewer; spain/europe re-check the box; worldwide
 * always passes.
 */
export function withinMapScope(
  viewer: { latitude: number | null; longitude: number | null } | null,
  lat: number | null | undefined,
  lng: number | null | undefined,
  scope: MapScope,
): boolean {
  switch (scope) {
    case "worldwide":
      return true;
    case "spain":
      return inBox(lat, lng, SPAIN_BOX);
    case "europe":
      return inBox(lat, lng, EUROPE_BOX);
    case "nearby":
    case "province": {
      const radius = scopeRadiusKm(scope);
      if (radius == null) return true;
      if (viewer?.latitude == null || viewer?.longitude == null) return false;
      if (lat == null || lng == null) return false;
      return (
        haversineKm(viewer.latitude, viewer.longitude, lat, lng) <= radius
      );
    }
    default:
      return true;
  }
}
