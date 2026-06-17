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

// ---------------------------------------------------------------------------
// Country detection for the "Mi país" discover filter
// ---------------------------------------------------------------------------

/**
 * Approximate bounding boxes for major countries. Used by detectCountryBbox()
 * to locate the caller's country and restrict the candidate set. Bboxes are
 * deliberately generous — haversine / calidad-mínima do the precise cut.
 */
const COUNTRY_BBOXES: { code: string; box: BBox }[] = [
  { code: "ES", box: { latMin: 27.4, latMax: 44.0, lngMin: -18.3, lngMax:  4.6 } }, // Spain (incl. Canarias)
  { code: "PT", box: { latMin: 36.8, latMax: 42.2, lngMin:  -9.5, lngMax: -6.2 } }, // Portugal
  { code: "FR", box: { latMin: 41.3, latMax: 51.1, lngMin:  -5.2, lngMax:  9.6 } }, // France
  { code: "DE", box: { latMin: 47.3, latMax: 55.1, lngMin:   5.9, lngMax: 15.0 } }, // Germany
  { code: "IT", box: { latMin: 35.5, latMax: 47.1, lngMin:   6.6, lngMax: 18.5 } }, // Italy
  { code: "GB", box: { latMin: 49.7, latMax: 61.0, lngMin:  -8.2, lngMax:  2.0 } }, // UK
  { code: "NL", box: { latMin: 50.7, latMax: 53.6, lngMin:   3.3, lngMax:  7.3 } }, // Netherlands
  { code: "MX", box: { latMin: 14.5, latMax: 32.7, lngMin:-118.5, lngMax:-86.7 } }, // Mexico
  { code: "AR", box: { latMin:-55.1, latMax:-21.8, lngMin: -73.6, lngMax:-53.6 } }, // Argentina
  { code: "CO", box: { latMin: -4.2, latMax: 13.4, lngMin: -79.0, lngMax:-66.8 } }, // Colombia
  { code: "CL", box: { latMin:-55.9, latMax:-17.5, lngMin: -75.6, lngMax:-66.4 } }, // Chile
  { code: "PE", box: { latMin:-18.4, latMax:  0.1, lngMin: -81.4, lngMax:-68.7 } }, // Peru
  { code: "VE", box: { latMin:  0.6, latMax: 12.2, lngMin: -73.4, lngMax:-59.8 } }, // Venezuela
  { code: "EC", box: { latMin: -5.0, latMax:  1.5, lngMin: -81.1, lngMax:-75.2 } }, // Ecuador
  { code: "CU", box: { latMin: 19.8, latMax: 23.2, lngMin: -85.0, lngMax:-74.1 } }, // Cuba
  { code: "BR", box: { latMin:-33.8, latMax:  5.3, lngMin: -73.9, lngMax:-34.8 } }, // Brazil
  { code: "US", box: { latMin: 24.4, latMax: 49.4, lngMin:-124.8, lngMax:-66.9 } }, // USA (contiguous)
  { code: "CA", box: { latMin: 41.7, latMax: 70.0, lngMin:-141.0, lngMax:-52.6 } }, // Canada
];

/**
 * Returns the bounding box of the country whose bbox contains the given point,
 * or null when the point is unrecognised. Callers treat null as "worldwide"
 * (no country filter applied).
 */
export function detectCountryBbox(
  lat: number | null | undefined,
  lng: number | null | undefined,
): BBox | null {
  if (lat == null || lng == null) return null;
  for (const { box } of COUNTRY_BBOXES) {
    if (inBox(lat, lng, box)) return box;
  }
  return null;
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
