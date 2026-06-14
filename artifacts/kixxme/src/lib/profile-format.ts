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

export const INTEREST_CATEGORIES: { label: string; tags: { slug: string; label: string }[] }[] = [
  {
    label: "💪 Fitness",
    tags: [
      { slug: "gimnasio", label: "Gimnasio" },
      { slug: "running", label: "Running" },
      { slug: "yoga", label: "Yoga" },
      { slug: "natacion", label: "Natación" },
      { slug: "ciclismo", label: "Ciclismo" },
      { slug: "senderismo", label: "Senderismo" },
      { slug: "deporte", label: "Deporte" },
    ],
  },
  {
    label: "✈️ Viajes",
    tags: [
      { slug: "viajes", label: "Viajes" },
      { slug: "playa", label: "Playa" },
      { slug: "montana", label: "Montaña" },
      { slug: "mochilero", label: "Mochilero" },
      { slug: "road_trip", label: "Road trip" },
      { slug: "campamento", label: "Campamento" },
    ],
  },
  {
    label: "🎵 Música",
    tags: [
      { slug: "musica", label: "Música" },
      { slug: "conciertos", label: "Conciertos" },
      { slug: "dj", label: "DJ" },
      { slug: "karaoke", label: "Karaoke" },
      { slug: "festivales", label: "Festivales" },
      { slug: "guitarra", label: "Guitarra" },
    ],
  },
  {
    label: "🎬 Entretenimiento",
    tags: [
      { slug: "cine", label: "Cine" },
      { slug: "series", label: "Series" },
      { slug: "teatro", label: "Teatro" },
      { slug: "videojuegos", label: "Videojuegos" },
      { slug: "podcasts", label: "Podcasts" },
      { slug: "lectura", label: "Lectura" },
    ],
  },
  {
    label: "🍽️ Gastronomía",
    tags: [
      { slug: "gastronomia", label: "Gastronomía" },
      { slug: "cocina", label: "Cocina" },
      { slug: "cafes", label: "Cafés" },
      { slug: "bares", label: "Bares" },
      { slug: "vinos", label: "Vinos" },
      { slug: "sushi", label: "Sushi" },
    ],
  },
  {
    label: "🌿 Estilo de vida",
    tags: [
      { slug: "meditacion", label: "Meditación" },
      { slug: "vegano", label: "Vegano" },
      { slug: "voluntariado", label: "Voluntariado" },
      { slug: "fotografia", label: "Fotografía" },
      { slug: "moda", label: "Moda" },
      { slug: "arte", label: "Arte" },
      { slug: "naturaleza", label: "Naturaleza" },
      { slug: "clubbing", label: "Clubbing" },
      { slug: "pride", label: "Pride" },
      { slug: "tecnologia", label: "Tecnología" },
    ],
  },
];

export function interestLabel(slug: string): string {
  for (const cat of INTEREST_CATEGORIES) {
    const found = cat.tags.find((t) => t.slug === slug);
    if (found) return found.label;
  }
  return slug;
}
