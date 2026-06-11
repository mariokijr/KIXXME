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

/** Rol/Preferencia code → human label (matches the profile edit form options). */
export const ROLE_LABELS: Record<string, string> = {
  activo: "Activo",
  pasivo: "Pasivo",
  versatil: "Versátil",
  heterocurioso: "Heterocurioso",
  flexible: "Flexible",
  no_decir: "Prefiero no decirlo",
};

/** "Qué busca" code → human label (matches the profile edit form options). */
export const LOOKING_FOR_LABELS: Record<string, string> = {
  amistad: "Amistad",
  chat: "Chat",
  citas: "Citas",
  relacion: "Relación seria",
  encuentros: "Encuentros",
  lo_que_surja: "Lo que surja",
};

/** Resolve a Rol/Preferencia code to its label, or null when unknown/unset. */
export function roleLabel(code: string | null | undefined): string | null {
  return code ? (ROLE_LABELS[code] ?? null) : null;
}

/** Resolve a "Qué busca" code to its label, or null when unknown/unset. */
export function lookingForLabel(code: string | null | undefined): string | null {
  return code ? (LOOKING_FOR_LABELS[code] ?? null) : null;
}
