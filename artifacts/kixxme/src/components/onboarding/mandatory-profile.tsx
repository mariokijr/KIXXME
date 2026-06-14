import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  useGetMyProfile,
  getGetMyProfileQueryKey,
  useUpdateMyProfile,
  useListMyPhotos,
  getListMyPhotosQueryKey,
  useUploadPhoto,
  useReplacePhoto,
  useDeletePhoto,
  useSetPhotoAsAvatar,
  type ProfilePhoto,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useGeolocation } from "@/lib/use-geolocation";
import { useToast } from "@/hooks/use-toast";
import { KixxMeLogo } from "@/components/brand/kixxme-logo";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PhotoSlot } from "@/components/photo-slot";
import {
  type RoleValue,
  type LookingForValue,
  type AlcoholValue,
  type TobaccoValue,
  type ExerciseValue,
  type PetsValue,
  ALCOHOL_OPTIONS,
  TOBACCO_OPTIONS,
  EXERCISE_OPTIONS,
  PETS_OPTIONS,
  computeMandatoryProfile,
  MIN_BIO_LENGTH,
} from "@/lib/profile-form";
import { ArrowLeft, ArrowRight, Navigation, Loader2, CheckCircle2 } from "lucide-react";

// ─── Face detection (Chrome/Edge only; fails open on unsupported browsers) ───
async function detectFaceInFile(
  file: File,
): Promise<{ hasFace: boolean; supported: boolean }> {
  const FD = (window as any).FaceDetector;
  if (!FD) return { hasFace: true, supported: false };
  try {
    const detector = new FD({ fastMode: true, maxDetectedFaces: 1 });
    const bmp = await createImageBitmap(file);
    const faces: unknown[] = await detector.detect(bmp);
    bmp.close();
    return { hasFace: faces.length > 0, supported: true };
  } catch {
    return { hasFace: true, supported: false };
  }
}

// ─── Step meta ───────────────────────────────────────────────────────────────
const STEP_COUNT = 7;

const STEPS = [
  { eyebrow: "📸  TU FOTO",       from: "hsl(273,85%,55%)", to: "hsl(330,85%,52%)" },
  { eyebrow: "✏️  NOMBRE",        from: "hsl(213,90%,58%)", to: "hsl(273,85%,55%)" },
  { eyebrow: "💬  BIO",           from: "hsl(258,85%,58%)", to: "hsl(291,85%,55%)" },
  { eyebrow: "📍  SOBRE TI",      from: "hsl(173,80%,45%)", to: "hsl(213,90%,55%)" },
  { eyebrow: "🔥  ROL",           from: "hsl(0,85%,60%)",   to: "hsl(330,85%,52%)" },
  { eyebrow: "💫  QUÉ BUSCAS",    from: "hsl(330,85%,52%)", to: "hsl(43,96%,56%)"  },
  { eyebrow: "🌿  HÁBITOS",       from: "hsl(152,70%,45%)", to: "hsl(173,80%,45%)" },
] as const;

// ─── Role / Looking-for card data ─────────────────────────────────────────────
const ROLE_CARDS: { value: RoleValue; label: string; emoji: string; desc: string }[] = [
  { value: "activo",            label: "Activo",           emoji: "⬆️", desc: "Posición activa"    },
  { value: "pasivo",            label: "Pasivo",           emoji: "⬇️", desc: "Posición pasiva"    },
  { value: "versatil",          label: "Versátil",         emoji: "↕️", desc: "Los dos roles"      },
  { value: "versatil_activo",   label: "Vers. activo",     emoji: "↗️", desc: "Ligera preferencia" },
  { value: "versatil_pasivo",   label: "Vers. pasivo",     emoji: "↙️", desc: "Ligera preferencia" },
  { value: "sin_preferencias",  label: "Sin preferencia",  emoji: "🤷", desc: "Me da igual"        },
  { value: "no_decir",          label: "Prefiero no decir",emoji: "🔒", desc: "Privado"            },
];

const LOOKING_CARDS: { value: LookingForValue; label: string; emoji: string; desc: string }[] = [
  { value: "relacion",      label: "Relación seria", emoji: "❤️", desc: "Algo duradero"  },
  { value: "citas",         label: "Citas",          emoji: "🌹", desc: "Poco a poco"    },
  { value: "amistad",       label: "Amistad",        emoji: "🤝", desc: "Buenos amigos"  },
  { value: "encuentros",    label: "Casual",         emoji: "⚡", desc: "Sin compromisos"},
  { value: "chat",          label: "Chatear",        emoji: "💬", desc: "Conocer gente"  },
  { value: "lo_que_surja",  label: "Lo que surja",   emoji: "🎲", desc: "Ya veremos"     },
];

// ─── Slide animation variants ─────────────────────────────────────────────────
const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? "100%" : "-100%", opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit:   (dir: number) => ({ x: dir > 0 ? "-100%" : "100%", opacity: 0 }),
};

// ─── Habit chip row ───────────────────────────────────────────────────────────
function HabitRow<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T | "";
  onChange: (v: T | "") => void;
  options: { value: T; label: string; emoji: string }[];
}) {
  return (
    <div>
      <p className="font-sans text-xs font-medium text-white/50 mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(active ? "" : (o.value as T))}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-sans text-sm transition-all active:scale-95"
              style={{
                background: active
                  ? "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))"
                  : "rgba(255,255,255,0.07)",
                border: `1px solid ${active ? "transparent" : "rgba(255,255,255,0.1)"}`,
                color: active ? "#fff" : "rgba(255,255,255,0.65)",
              }}
            >
              <span>{o.emoji}</span>
              <span>{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Selection card (role / looking-for) ─────────────────────────────────────
function SelectCard({
  emoji, label, desc, selected, onSelect,
}: {
  emoji: string; label: string; desc: string; selected: boolean; onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex flex-col items-center justify-center gap-1 py-4 px-2 rounded-2xl transition-all active:scale-95 text-center"
      style={{
        background: selected
          ? "linear-gradient(135deg, rgba(168,85,247,0.25), rgba(236,72,153,0.20))"
          : "rgba(255,255,255,0.05)",
        border: `1.5px solid ${selected ? "hsl(273,85%,60%)" : "rgba(255,255,255,0.10)"}`,
        boxShadow: selected ? "0 0 16px rgba(168,85,247,0.3)" : "none",
      }}
    >
      <span className="text-2xl leading-none">{emoji}</span>
      <span className="font-display text-sm tracking-wide text-white leading-tight">{label}</span>
      <span className="font-sans text-[10px] text-white/40 leading-tight">{desc}</span>
    </button>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
const PHOTO_SLOTS = 4;

export function MandatoryProfile() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const geo = useGeolocation();

  const { data: profile } = useGetMyProfile({
    query: { queryKey: getGetMyProfileQueryKey() },
  });
  const { data: photos = [], refetch: refetchPhotos } = useListMyPhotos({
    query: { queryKey: getListMyPhotosQueryKey() },
  });

  const updateProfile = useUpdateMyProfile();
  const uploadPhoto   = useUploadPhoto();
  const replacePhoto  = useReplacePhoto();
  const deletePhoto   = useDeletePhoto();
  const setAvatarPhoto = useSetPhotoAsAvatar();

  // ── Wizard navigation ──
  const [[step, dir], setPage] = useState<[number, number]>([0, 1]);

  // ── Field state ──
  const [username,   setUsername]   = useState("");
  const [bio,        setBio]        = useState("");
  const [age,        setAge]        = useState("");
  const [city,       setCity]       = useState("");
  const [gender,     setGender]     = useState("");
  const [role,       setRole]       = useState<RoleValue | "">("");
  const [lookingFor, setLookingFor] = useState<LookingForValue | "">("");
  const [alcohol,    setAlcohol]    = useState<AlcoholValue | "">("");
  const [tobacco,    setTobacco]    = useState<TobaccoValue | "">("");
  const [exercise,   setExercise]   = useState<ExerciseValue | "">("");
  const [pets,       setPets]       = useState<PetsValue | "">("");
  const [faceChecking, setFaceChecking] = useState(false);

  // ── Pre-fill from existing profile ──
  const initRef = useRef<string | null>(null);
  useEffect(() => {
    if (profile && initRef.current !== profile.id) {
      initRef.current = profile.id;
      setUsername(profile.username || "");
      setBio(profile.bio || "");
      setAge(profile.age != null ? String(profile.age) : "");
      setCity(profile.city || "");
      setGender(profile.gender || "");
      setRole((profile.role ?? "") as RoleValue | "");
      setLookingFor((profile.looking_for ?? "") as LookingForValue | "");
      setAlcohol((profile.alcohol ?? "") as AlcoholValue | "");
      setTobacco((profile.tobacco ?? "") as TobaccoValue | "");
      setExercise((profile.exercise ?? "") as ExerciseValue | "");
      setPets((profile.pets ?? "") as PetsValue | "");
    }
  }, [profile]);

  // ── Cache helpers ──
  const refreshGate = () => {
    refetchPhotos();
    queryClient.invalidateQueries({ queryKey: getGetMyProfileQueryKey() });
  };

  // ── Photo handlers ──
  const handleAddPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const isMainSlot = photos.length === 0;

    const doUpload = (b64: string) => {
      uploadPhoto.mutate(
        { data: { base64: b64, mime_type: file.type, filename: file.name } },
        {
          onSuccess: () => {
            refreshGate();
            toast({ title: "¡Foto añadida!" });
          },
          onError: (err: any) =>
            toast({ title: "Error subiendo foto", description: err?.data?.error ?? err?.message, variant: "destructive" }),
        },
      );
    };

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const b64 = (ev.target?.result as string).split(",")[1];

      if (isMainSlot) {
        setFaceChecking(true);
        const { hasFace, supported } = await detectFaceInFile(file);
        setFaceChecking(false);

        if (supported && !hasFace) {
          toast({
            title: "No detectamos una cara",
            description: "Tu foto principal debe mostrar tu cara claramente. Usa una foto de perfil, gym o casual donde se te vea bien.",
            variant: "destructive",
          });
          return;
        }
        if (!supported) {
          toast({
            title: "Asegúrate de que se vea tu cara",
            description: "La foto principal debe mostrar tu cara con claridad.",
          });
        }
      }

      doUpload(b64);
    };
    reader.readAsDataURL(file);
  };

  const handleReplacePhoto = (photoId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const b64 = (ev.target?.result as string).split(",")[1];
      replacePhoto.mutate(
        { photoId, data: { base64: b64, mime_type: file.type, filename: file.name } },
        {
          onSuccess: () => { refreshGate(); toast({ title: "¡Foto actualizada!" }); },
          onError: (err: any) =>
            toast({ title: "Error cambiando foto", description: err?.data?.error ?? err?.message, variant: "destructive" }),
        },
      );
    };
    reader.readAsDataURL(file);
  };

  const handleDeletePhoto = (photoId: string) => {
    if (photos.length <= 1) {
      toast({ title: "Debes mantener al menos una foto.", variant: "destructive" });
      return;
    }
    deletePhoto.mutate(
      { photoId },
      {
        onSuccess: () => refreshGate(),
        onError: (err: any) =>
          toast({ title: "Error eliminando foto", description: err?.data?.error ?? err?.message, variant: "destructive" }),
      },
    );
  };

  const handleSetAvatar = (photoId: string) => {
    setAvatarPhoto.mutate(
      { photoId },
      {
        onSuccess: () => refreshGate(),
        onError: (err: any) =>
          toast({ title: "Error", description: err?.data?.error ?? err?.message, variant: "destructive" }),
      },
    );
  };

  // ── Step validation ──
  const canAdvance = (): boolean => {
    switch (step) {
      case 0: return photos.length > 0;
      case 1: return username.trim().length > 0;
      case 2: return bio.trim().length >= MIN_BIO_LENGTH;
      case 3: return age !== "" && Number(age) >= 18 && city.trim().length > 0;
      case 4: return role !== "";
      case 5: return lookingFor !== "";
      case 6: return true;
      default: return true;
    }
  };

  // ── Save ──
  const handleSubmit = () => {
    updateProfile.mutate(
      {
        data: {
          username,
          bio,
          age: age !== "" ? Number(age) : undefined,
          city: city || undefined,
          gender: gender || undefined,
          role: role || undefined,
          looking_for: lookingFor || undefined,
          alcohol: alcohol || undefined,
          tobacco: tobacco || undefined,
          exercise: exercise || undefined,
          pets: pets || undefined,
        },
      },
      {
        onSuccess: (data) => {
          queryClient.setQueryData(getGetMyProfileQueryKey(), data);
        },
        onError: (err: any) => {
          toast({
            title: "No se pudo guardar",
            description: err?.data?.error ?? err?.message ?? "Error desconocido",
            variant: "destructive",
          });
        },
      },
    );
  };

  // ── Navigation ──
  const navigate = (newDir: number) => {
    const next = step + newDir;
    if (next < 0 || next >= STEP_COUNT) return;
    setPage([next, newDir]);
  };

  const handleContinue = () => {
    if (!canAdvance()) {
      const msgs: Record<number, string> = {
        0: "Sube al menos una foto para continuar.",
        1: "Escribe cómo quieres que te llamen.",
        2: `Tu bio debe tener al menos ${MIN_BIO_LENGTH} caracteres.`,
        3: "Completa tu edad (mínimo 18) y ciudad.",
        4: "Elige cómo te defines.",
        5: "Indica qué tipo de conexión buscas.",
      };
      toast({ title: msgs[step] ?? "Completa el campo para continuar.", variant: "destructive" });
      return;
    }
    if (step === STEP_COUNT - 1) {
      handleSubmit();
    } else {
      navigate(1);
    }
  };

  // ── Photo slots ──
  const ordered = [...photos].sort((a, b) => {
    if (a.is_avatar && !b.is_avatar) return -1;
    if (!a.is_avatar && b.is_avatar) return 1;
    return (a.position ?? 0) - (b.position ?? 0);
  });
  const slots: (ProfilePhoto | null)[] = Array.from({ length: PHOTO_SLOTS }, (_, i) => ordered[i] ?? null);

  const cur = STEPS[step];
  const isLastStep = step === STEP_COUNT - 1;

  // ── Render ──
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden"
      style={{
        background: "radial-gradient(ellipse 90% 55% at 50% 0%, hsl(270 35% 10%) 0%, hsl(238 25% 4%) 65%)",
      }}
      data-testid="onboarding-profile"
    >
      {/* Ambient glow – shifts color per step */}
      <motion.div
        key={`glow-${step}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.4 }}
        className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[480px] -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: `radial-gradient(circle, ${cur.from}, transparent 70%)` }}
      />

      {/* Header */}
      <div className="relative flex items-center justify-between px-5 pt-[calc(env(safe-area-inset-top)+16px)] pb-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          disabled={step === 0}
          className="w-10 h-10 flex items-center justify-center rounded-xl text-white/60 hover:text-white transition disabled:opacity-0 disabled:pointer-events-none"
          style={{ background: "rgba(255,255,255,0.07)" }}
          aria-label="Atrás"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <KixxMeLogo size={28} badge />

        {/* Skip (habits step only) */}
        {step === 6 ? (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={updateProfile.isPending}
            className="font-sans text-sm text-white/40 hover:text-white/70 transition px-2"
          >
            Saltar
          </button>
        ) : (
          <div className="w-10" />
        )}
      </div>

      {/* Progress bar */}
      <div className="relative mx-5 mb-1 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
        <motion.div
          className="h-1 rounded-full"
          animate={{ width: `${((step + 1) / STEP_COUNT) * 100}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          style={{ background: `linear-gradient(90deg, ${cur.from}, ${cur.to})` }}
        />
      </div>

      {/* Eyebrow */}
      <div className="relative flex justify-center mt-4 mb-1">
        <AnimatePresence mode="wait">
          <motion.span
            key={`eyebrow-${step}`}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.25 }}
            className="rounded-full px-3 py-1 font-display text-[11px] tracking-[0.25em] uppercase text-white/80"
            style={{ background: "rgba(255,255,255,0.07)" }}
          >
            {cur.eyebrow}
          </motion.span>
        </AnimatePresence>
      </div>

      {/* Step content */}
      <div className="relative flex-1 overflow-hidden">
        <AnimatePresence custom={dir} mode="wait">
          <motion.div
            key={step}
            custom={dir}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 overflow-y-auto"
          >
            <div className="mx-auto w-full max-w-md px-5 pt-4 pb-36">
              {/* ── Step 0: Photos ── */}
              {step === 0 && (
                <div>
                  <h2 className="font-display text-3xl tracking-wide text-white mb-1">
                    Tu foto principal
                  </h2>
                  <p className="font-sans text-sm text-white/55 mb-6 leading-relaxed">
                    La primera foto es <span className="text-white/80 font-medium">obligatoria</span> y debe mostrar claramente tu cara.{" "}
                    Puedes añadir hasta 4 fotos en total.
                  </p>
                  {faceChecking && (
                    <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl"
                      style={{ background: "rgba(168,85,247,0.12)" }}>
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      <span className="font-sans text-xs text-white/70">Verificando que se vea tu cara…</span>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    {slots.map((photo, i) => (
                      <PhotoSlot
                        key={photo?.id ?? `empty-${i}`}
                        photo={photo}
                        isMain={i === 0}
                        uploading={(uploadPhoto.isPending || faceChecking) && !photo && i === 0}
                        replacing={replacePhoto.isPending}
                        isDeleting={deletePhoto.isPending}
                        isSettingAvatar={setAvatarPhoto.isPending}
                        onAdd={handleAddPhoto}
                        onReplace={(e) => photo && handleReplacePhoto(photo.id, e)}
                        onDelete={() => photo && handleDeletePhoto(photo.id)}
                        onSetAvatar={() => photo && handleSetAvatar(photo.id)}
                      />
                    ))}
                  </div>
                  {photos.length > 0 && (
                    <div className="mt-4 flex items-center gap-2 px-3 py-2 rounded-xl"
                      style={{ background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.20)" }}>
                      <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                      <span className="font-sans text-xs text-green-300">
                        {photos.length === 1 ? "Foto añadida · puedes añadir hasta 3 más" : `${photos.length} fotos añadidas`}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* ── Step 1: Username ── */}
              {step === 1 && (
                <div>
                  <h2 className="font-display text-3xl tracking-wide text-white mb-1">
                    ¿Cómo te llamas?
                  </h2>
                  <p className="font-sans text-sm text-white/55 mb-6">
                    Elige el nombre con el que te conocerán en KixxMe.
                  </p>
                  <Input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Ej: Carlos, Álvaro, Dani…"
                    className="h-14 text-lg font-sans bg-white/8 border-white/15 text-white placeholder:text-white/30 rounded-2xl focus-visible:border-primary/60"
                    autoFocus
                    data-testid="input-username"
                  />
                  <p className="font-sans text-xs text-white/35 mt-2">
                    Solo lo verán otras personas — no tu email ni datos reales.
                  </p>
                </div>
              )}

              {/* ── Step 2: Bio ── */}
              {step === 2 && (
                <div>
                  <h2 className="font-display text-3xl tracking-wide text-white mb-1">
                    Cuéntate
                  </h2>
                  <p className="font-sans text-sm text-white/55 mb-6">
                    ¿Qué te hace único? Tus metas, hobbies, lo que buscas… lo que quieras compartir.
                  </p>
                  <Textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Soy aficionado al gym, al surf y a los perros. Busco algo real con alguien que también valore el tiempo de calidad…"
                    className="min-h-[160px] text-sm font-sans bg-white/8 border-white/15 text-white placeholder:text-white/30 rounded-2xl resize-none focus-visible:border-primary/60"
                    autoFocus
                    data-testid="input-bio"
                  />
                  <div className="flex items-center justify-between mt-2">
                    <span
                      className="font-sans text-xs"
                      style={{ color: bio.trim().length >= MIN_BIO_LENGTH ? "rgba(34,197,94,0.8)" : "rgba(255,255,255,0.3)" }}
                    >
                      {bio.trim().length >= MIN_BIO_LENGTH ? "✓ Listo" : `${bio.trim().length}/${MIN_BIO_LENGTH} mínimo`}
                    </span>
                    <span className="font-sans text-xs text-white/25">{bio.length} caracteres</span>
                  </div>
                </div>
              )}

              {/* ── Step 3: Age + City ── */}
              {step === 3 && (
                <div>
                  <h2 className="font-display text-3xl tracking-wide text-white mb-1">
                    Sobre ti
                  </h2>
                  <p className="font-sans text-sm text-white/55 mb-6">
                    Para conectarte con personas cercanas.
                  </p>
                  <div className="space-y-4">
                    <div>
                      <label className="font-sans text-xs font-medium text-white/45 uppercase tracking-widest mb-2 block">
                        Edad
                      </label>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={18}
                        max={100}
                        value={age}
                        onChange={(e) => setAge(e.target.value)}
                        placeholder="¿Cuántos años tienes? (mín. 18)"
                        className="h-14 text-lg font-sans bg-white/8 border-white/15 text-white placeholder:text-white/30 rounded-2xl focus-visible:border-primary/60"
                        autoFocus
                        data-testid="input-age"
                      />
                    </div>
                    <div>
                      <label className="font-sans text-xs font-medium text-white/45 uppercase tracking-widest mb-2 block">
                        Ciudad
                      </label>
                      <div className="flex gap-2">
                        <Input
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          placeholder="¿Dónde estás?"
                          className="h-14 text-lg font-sans bg-white/8 border-white/15 text-white placeholder:text-white/30 rounded-2xl focus-visible:border-primary/60"
                          data-testid="input-city"
                        />
                        <button
                          type="button"
                          onClick={() => geo.request()}
                          disabled={geo.isPending || geo.state === "locating"}
                          className="h-14 w-14 flex-shrink-0 flex items-center justify-center rounded-2xl border transition"
                          style={{
                            background:
                              geo.state === "error" || geo.state === "denied"
                                ? "rgba(239,68,68,0.12)"
                                : geo.state === "done"
                                ? "rgba(74,222,128,0.12)"
                                : "rgba(255,255,255,0.07)",
                            borderColor:
                              geo.state === "error" || geo.state === "denied"
                                ? "rgba(239,68,68,0.35)"
                                : geo.state === "done"
                                ? "rgba(74,222,128,0.35)"
                                : "rgba(255,255,255,0.12)",
                          }}
                          title="Usar mi ubicación"
                          data-testid="button-use-location"
                        >
                          {geo.isPending || geo.state === "locating" ? (
                            <Loader2 className="w-5 h-5 animate-spin text-white/60" />
                          ) : geo.state === "done" ? (
                            <Navigation className="w-5 h-5 text-green-400" />
                          ) : (
                            <Navigation className="w-5 h-5 text-white/60" />
                          )}
                        </button>
                      </div>
                      {(geo.state === "error" || geo.state === "denied" || geo.state === "unsupported") && (
                        <p className="font-sans text-[11px] text-red-400 mt-1.5">
                          {geo.state === "denied"
                            ? "Permiso denegado. Actívalo en los ajustes del navegador."
                            : geo.state === "unsupported"
                            ? "Tu dispositivo no admite geolocalización."
                            : "No se pudo obtener la ubicación. Escribe tu ciudad manualmente."}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="font-sans text-xs font-medium text-white/45 uppercase tracking-widest mb-2 block">
                        Género <span className="normal-case text-white/25">(opcional)</span>
                      </label>
                      <Input
                        value={gender}
                        onChange={(e) => setGender(e.target.value)}
                        placeholder="Hombre, no binario, trans…"
                        className="h-12 text-sm font-sans bg-white/8 border-white/15 text-white placeholder:text-white/30 rounded-2xl focus-visible:border-primary/60"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ── Step 4: Role ── */}
              {step === 4 && (
                <div>
                  <h2 className="font-display text-3xl tracking-wide text-white mb-1">
                    ¿Cómo te defines?
                  </h2>
                  <p className="font-sans text-sm text-white/55 mb-6">
                    Tu preferencia sexual. Solo la ven quienes visiten tu perfil.
                  </p>
                  <div
                    className="grid grid-cols-2 gap-3"
                    data-testid="select-role"
                  >
                    {ROLE_CARDS.map((c) => (
                      <SelectCard
                        key={c.value}
                        emoji={c.emoji}
                        label={c.label}
                        desc={c.desc}
                        selected={role === c.value}
                        onSelect={() => setRole(role === c.value ? "" : c.value)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* ── Step 5: Looking for ── */}
              {step === 5 && (
                <div>
                  <h2 className="font-display text-3xl tracking-wide text-white mb-1">
                    ¿Qué buscas?
                  </h2>
                  <p className="font-sans text-sm text-white/55 mb-6">
                    Sé directo — es mejor para todos. Lo puedes cambiar después.
                  </p>
                  <div
                    className="grid grid-cols-2 gap-3"
                    data-testid="select-looking-for"
                  >
                    {LOOKING_CARDS.map((c) => (
                      <SelectCard
                        key={c.value}
                        emoji={c.emoji}
                        label={c.label}
                        desc={c.desc}
                        selected={lookingFor === c.value}
                        onSelect={() => setLookingFor(lookingFor === c.value ? "" : (c.value as LookingForValue))}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* ── Step 6: Habits ── */}
              {step === 6 && (
                <div>
                  <h2 className="font-display text-3xl tracking-wide text-white mb-1">
                    Tus hábitos
                  </h2>
                  <p className="font-sans text-sm text-white/55 mb-6">
                    4 preguntas opcionales. Puedes cambiarlo cuando quieras.
                  </p>
                  <div className="space-y-6">
                    <HabitRow
                      label="¿Bebes alcohol?"
                      value={alcohol}
                      onChange={(v) => setAlcohol(v as AlcoholValue | "")}
                      options={ALCOHOL_OPTIONS as { value: AlcoholValue; label: string; emoji: string }[]}
                    />
                    <HabitRow
                      label="¿Fumas?"
                      value={tobacco}
                      onChange={(v) => setTobacco(v as TobaccoValue | "")}
                      options={TOBACCO_OPTIONS as { value: TobaccoValue; label: string; emoji: string }[]}
                    />
                    <HabitRow
                      label="¿Haces ejercicio?"
                      value={exercise}
                      onChange={(v) => setExercise(v as ExerciseValue | "")}
                      options={EXERCISE_OPTIONS as { value: ExerciseValue; label: string; emoji: string }[]}
                    />
                    <HabitRow
                      label="¿Mascotas?"
                      value={pets}
                      onChange={(v) => setPets(v as PetsValue | "")}
                      options={PETS_OPTIONS as { value: PetsValue; label: string; emoji: string }[]}
                    />
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom CTA */}
      <div
        className="relative px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-4"
        style={{ background: "linear-gradient(to top, hsl(238 25% 4%) 60%, transparent)" }}
      >
        <div className="mx-auto w-full max-w-md">
          <button
            type="button"
            onClick={handleContinue}
            disabled={updateProfile.isPending}
            className="w-full h-14 rounded-2xl flex items-center justify-center gap-2 font-display text-xl tracking-widest text-white shadow-lg transition active:scale-[0.98] disabled:opacity-60"
            style={{ background: `linear-gradient(135deg, ${cur.from}, ${cur.to})` }}
            data-testid={isLastStep ? "button-finish-onboarding" : "button-onboarding-next"}
          >
            {updateProfile.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : isLastStep ? (
              <>
                Entrar a KixxMe
                <ArrowRight className="h-5 w-5" />
              </>
            ) : (
              <>
                Continuar
                <ArrowRight className="h-5 w-5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
