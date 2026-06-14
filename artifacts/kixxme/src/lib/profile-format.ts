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

export const ROLE_LABELS: Record<string, string> = {
  activo: "Activo",
  pasivo: "Pasivo",
  versatil: "Versátil",
  versatil_activo: "Versátil activo",
  versatil_pasivo: "Versátil pasivo",
  sin_preferencias: "Sin preferencias",
  heterocurioso: "Heterocurioso",
  flexible: "Flexible",
  no_decir: "Prefiero no decirlo",
};

export const LOOKING_FOR_LABELS: Record<string, string> = {
  amistad: "Amistad",
  chat: "Conocer gente",
  citas: "Citas",
  relacion: "Relación seria",
  encuentros: "Algo casual",
  lo_que_surja: "Ya veremos",
};

export const ORIENTATION_LABELS: Record<string, string> = {
  gay: "Gay",
  bisexual: "Bisexual",
  curioso: "Curioso",
  heteroflexible: "Heteroflexible",
  pansexual: "Pansexual",
  demisexual: "Demisexual",
  asexual: "Asexual",
  en_exploracion: "En exploración",
  no_decir: "Prefiero no decirlo",
};

export const ZODIAC_LABELS: Record<string, string> = {
  aries: "♈ Aries",
  tauro: "♉ Tauro",
  geminis: "♊ Géminis",
  cancer: "♋ Cáncer",
  leo: "♌ Leo",
  virgo: "♍ Virgo",
  libra: "♎ Libra",
  escorpio: "♏ Escorpio",
  sagitario: "♐ Sagitario",
  capricornio: "♑ Capricornio",
  acuario: "♒ Acuario",
  piscis: "♓ Piscis",
};

export const ALCOHOL_LABELS: Record<string, string> = {
  no_bebo: "No bebo",
  ocasionalmente: "Bebo ocasionalmente",
  fines_semana: "Fines de semana",
  frecuentemente: "Bebo frecuentemente",
};

export const TOBACCO_LABELS: Record<string, string> = {
  no_fumo: "No fumo",
  fumo_ocasionalmente: "Fumo ocasionalmente",
  fumo: "Fumador",
  intentando_dejarlo: "Intentando dejarlo",
};

export const EXERCISE_LABELS: Record<string, string> = {
  todos_dias: "Ejercicio diario",
  frecuentemente: "Ejercicio frecuente",
  a_veces: "A veces hago ejercicio",
  nunca: "No hago ejercicio",
};

export const PETS_LABELS: Record<string, string> = {
  tengo_perro: "🐕 Tengo perro",
  tengo_gato: "🐈 Tengo gato",
  tengo_mascotas: "🐾 Tengo mascotas",
  no_mascotas: "Sin mascotas",
  me_encantan: "❤️ Me encantan los animales",
};

export function roleLabel(code: string | null | undefined): string | null {
  return code ? (ROLE_LABELS[code] ?? null) : null;
}

export function lookingForLabel(code: string | null | undefined): string | null {
  return code ? (LOOKING_FOR_LABELS[code] ?? null) : null;
}

export function orientationLabel(code: string | null | undefined): string | null {
  return code ? (ORIENTATION_LABELS[code] ?? null) : null;
}

export function zodiacLabel(code: string | null | undefined): string | null {
  return code ? (ZODIAC_LABELS[code] ?? null) : null;
}

export function alcoholLabel(code: string | null | undefined): string | null {
  return code ? (ALCOHOL_LABELS[code] ?? null) : null;
}

export function tobaccoLabel(code: string | null | undefined): string | null {
  return code ? (TOBACCO_LABELS[code] ?? null) : null;
}

export function exerciseLabel(code: string | null | undefined): string | null {
  return code ? (EXERCISE_LABELS[code] ?? null) : null;
}

export function petsLabel(code: string | null | undefined): string | null {
  return code ? (PETS_LABELS[code] ?? null) : null;
}

export function formatHeightCm(cm: number | null | undefined): string | null {
  if (cm == null) return null;
  return `${cm} cm`;
}
