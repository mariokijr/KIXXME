const GRAD_PALETTE = [
  "from-violet-700 to-purple-900",
  "from-pink-600 to-rose-900",
  "from-orange-600 to-red-900",
  "from-cyan-600 to-blue-900",
  "from-emerald-600 to-teal-900",
  "from-fuchsia-600 to-purple-900",
  "from-blue-600 to-indigo-900",
  "from-rose-600 to-pink-900",
];

export function gradFor(id: string) {
  let h = 0;
  for (const c of id) {
    h = (h << 5) - h + c.charCodeAt(0);
    h |= 0;
  }
  return GRAD_PALETTE[Math.abs(h) % GRAD_PALETTE.length];
}

export function initialsFor(username: string | null | undefined) {
  return (username || "?").slice(0, 2).toUpperCase();
}

export function formatDistance(km: number | null | undefined): string | null {
  if (km == null) return null;
  if (km < 1) return "< 1 km";
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}
