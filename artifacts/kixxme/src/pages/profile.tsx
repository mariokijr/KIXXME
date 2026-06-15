import React, { useRef, useState, useEffect } from "react";
import {
  useGetMyProfile,
  getGetMyProfileQueryKey,
  useUpdateMyProfile,
  useGetMyInterests,
  getGetMyInterestsQueryKey,
  useUpdateMyInterests,
  useListMyPhotos,
  useUploadPhoto,
  useReplacePhoto,
  useDeletePhoto,
  useSetPhotoAsAvatar,
  useGetMyModeration,
  getGetMyModerationQueryKey,
  ProfilePhoto,
} from "@workspace/api-client-react";
import { TagPicker } from "@/components/tag-picker";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useGeolocation } from "@/lib/use-geolocation";
import { KixxMeLogo } from "@/components/brand/kixxme-logo";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import {
  Share2,
  Loader2,
  BadgeCheck,
  Navigation,
  ShieldAlert,
} from "lucide-react";
import { PhotoSlot } from "@/components/photo-slot";
import { Field, SelectField } from "@/components/profile-fields";
import {
  type RoleValue,
  type LookingForValue,
  type OrientationValue,
  type ZodiacSignValue,
  type AlcoholValue,
  type TobaccoValue,
  type ExerciseValue,
  type PetsValue,
  ROLE_OPTIONS,
  LOOKING_FOR_OPTIONS,
  ORIENTATION_OPTIONS,
  ZODIAC_OPTIONS,
  ALCOHOL_OPTIONS,
  TOBACCO_OPTIONS,
  EXERCISE_OPTIONS,
  PETS_OPTIONS,
  computeMandatoryProfile,
} from "@/lib/profile-form";
import { VerificationCard } from "@/components/verification-card";
import { VisitorsCard } from "@/components/visitors-card";
import { RewardsCard } from "@/components/rewards-card";
import { BoostCard } from "@/components/boost-card";
import { LesGustasCard } from "@/components/les-gustas-card";
import { ProfileCompletionCard } from "@/components/profile-completion-card";

export default function Profile() {
  const { session } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: profile, isLoading, error } = useGetMyProfile({
    query: { enabled: !!session, queryKey: getGetMyProfileQueryKey() },
  });

  const { data: moderation } = useGetMyModeration({
    query: { enabled: !!session, queryKey: getGetMyModerationQueryKey() },
  });
  const isAdmin = !!moderation?.isAdmin;

  const updateProfile = useUpdateMyProfile();
  const { data: photos = [], refetch: refetchPhotos } = useListMyPhotos();
  const uploadPhoto = useUploadPhoto();
  const replacePhoto = useReplacePhoto();
  const deletePhoto = useDeletePhoto();
  const setAvatarPhoto = useSetPhotoAsAvatar();
  const geo = useGeolocation();

  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [age, setAge] = useState<string>("");
  const [city, setCity] = useState("");
  const [gender, setGender] = useState("");
  const [location, setLocation2] = useState("");
  const [role, setRole] = useState<RoleValue | "">("");
  const [lookingFor, setLookingFor] = useState<LookingForValue | "">("");
  const [orientation, setOrientation] = useState<OrientationValue | "">("");
  const [heightCm, setHeightCm] = useState<string>("");
  const [zodiacSign, setZodiacSign] = useState<ZodiacSignValue | "">("");
  const [alcohol, setAlcohol] = useState<AlcoholValue | "">("");
  const [tobacco, setTobacco] = useState<TobaccoValue | "">("");
  const [exercise, setExercise] = useState<ExerciseValue | "">("");
  const [pets, setPets] = useState<PetsValue | "">("");
  const [interests, setInterests] = useState<string[]>([]);

  const initRef = useRef<string | null>(null);
  const interestsInitRef = useRef(false);
  const wasOnboardingRef = useRef(false);

  const { data: interestsData } = useGetMyInterests({
    query: { enabled: !!session, queryKey: getGetMyInterestsQueryKey() },
  });
  const updateInterests = useUpdateMyInterests();

  useEffect(() => {
    if (interestsData && !interestsInitRef.current) {
      interestsInitRef.current = true;
      setInterests(interestsData.interests ?? []);
    }
  }, [interestsData]);

  useEffect(() => {
    if (profile && initRef.current !== profile.id) {
      initRef.current = profile.id;
      wasOnboardingRef.current = !profile.username;
      setUsername(profile.username || "");
      setBio(profile.bio || "");
      setAge(profile.age != null ? String(profile.age) : "");
      setCity(profile.city || "");
      setGender(profile.gender || "");
      setLocation2(profile.location || "");
      setRole((profile.role ?? "") as RoleValue | "");
      setLookingFor((profile.looking_for ?? "") as LookingForValue | "");
      setOrientation((profile.orientation ?? "") as OrientationValue | "");
      setHeightCm(profile.height_cm != null ? String(profile.height_cm) : "");
      setZodiacSign((profile.zodiac_sign ?? "") as ZodiacSignValue | "");
      setAlcohol((profile.alcohol ?? "") as AlcoholValue | "");
      setTobacco((profile.tobacco ?? "") as TobaccoValue | "");
      setExercise((profile.exercise ?? "") as ExerciseValue | "");
      setPets((profile.pets ?? "") as PetsValue | "");
    }
  }, [profile]);

  const isDirty =
    profile &&
    (username !== (profile.username || "") ||
      bio !== (profile.bio || "") ||
      age !== (profile.age != null ? String(profile.age) : "") ||
      city !== (profile.city || "") ||
      gender !== (profile.gender || "") ||
      location !== (profile.location || "") ||
      role !== ((profile.role ?? "") as string) ||
      lookingFor !== ((profile.looking_for ?? "") as string) ||
      orientation !== ((profile.orientation ?? "") as string) ||
      heightCm !== (profile.height_cm != null ? String(profile.height_cm) : "") ||
      zodiacSign !== ((profile.zodiac_sign ?? "") as string) ||
      alcohol !== ((profile.alcohol ?? "") as string) ||
      tobacco !== ((profile.tobacco ?? "") as string) ||
      exercise !== ((profile.exercise ?? "") as string) ||
      pets !== ((profile.pets ?? "") as string));

  const interestsDirty =
    interestsInitRef.current &&
    JSON.stringify([...(interestsData?.interests ?? [])].sort()) !==
      JSON.stringify([...interests].sort());

  const isOnboarding = wasOnboardingRef.current;

  const handleSave = () => {
    // Calidad mínima: onboarding can't finish until the profile has a main photo
    // and the fields required to appear in Descubrir.
    if (isOnboarding) {
      const { complete, missing } = computeMandatoryProfile({
        username,
        bio,
        age: age !== "" ? Number(age) : null,
        city,
        role: role || null,
        looking_for: lookingFor || null,
        avatar_url: profile?.avatar_url,
        photoCount: photos.length,
      });
      if (!complete) {
        toast({
          title: "Completa tu perfil para continuar",
          description: `Falta: ${missing.join(", ")}.`,
          variant: "destructive",
        });
        return;
      }
    }
    if (age !== "" && Number(age) < 18) {
      toast({
        title: "Debes ser mayor de edad",
        description: "Tienes que tener al menos 18 años para usar KixxMe.",
        variant: "destructive",
      });
      return;
    }
    const profilePromise = isDirty
      ? new Promise<void>((resolve, reject) =>
          updateProfile.mutate(
            { data: {
              username,
              bio,
              age: age !== "" ? Number(age) : undefined,
              city: city || undefined,
              gender: gender || undefined,
              location: location || undefined,
              role: role || undefined,
              looking_for: lookingFor || undefined,
              orientation: orientation || undefined,
              height_cm: heightCm !== "" ? Number(heightCm) : undefined,
              zodiac_sign: zodiacSign || undefined,
              alcohol: alcohol || undefined,
              tobacco: tobacco || undefined,
              exercise: exercise || undefined,
              pets: pets || undefined,
            } },
            {
              onSuccess: (data) => {
                queryClient.setQueryData(getGetMyProfileQueryKey(), data);
                resolve();
              },
              onError: (err: any) => reject(err),
            },
          ),
        )
      : Promise.resolve();

    const interestsPromise = interestsDirty
      ? new Promise<void>((resolve, reject) =>
          updateInterests.mutate(
            { data: { interests } },
            {
              onSuccess: () => {
                queryClient.setQueryData(getGetMyInterestsQueryKey(), { interests });
                resolve();
              },
              onError: (err: any) => reject(err),
            },
          ),
        )
      : Promise.resolve();

    Promise.all([profilePromise, interestsPromise])
      .then(() => {
        if (isOnboarding) {
          setLocation("/discover");
        } else {
          toast({ title: "¡Perfil actualizado!" });
        }
      })
      .catch((err: any) => {
        const msg = err?.data?.error ?? err?.message ?? "Error desconocido";
        toast({ title: "No se pudo guardar", description: msg, variant: "destructive" });
      });
  };

  const handleAddPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const b64 = (ev.target?.result as string).split(",")[1];
      uploadPhoto.mutate(
        { data: { base64: b64, mime_type: file.type, filename: file.name } },
        {
          onSuccess: () => { refetchPhotos(); toast({ title: "¡Foto añadida!" }); },
          onError: (err: any) => { toast({ title: "Error subiendo foto", description: err?.data?.error ?? err?.message, variant: "destructive" }); },
        }
      );
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
          onSuccess: () => { refetchPhotos(); queryClient.invalidateQueries({ queryKey: getGetMyProfileQueryKey() }); toast({ title: "¡Foto actualizada!" }); },
          onError: (err: any) => { toast({ title: "Error cambiando foto", description: err?.data?.error ?? err?.message, variant: "destructive" }); },
        }
      );
    };
    reader.readAsDataURL(file);
  };

  const handleDeletePhoto = (photoId: string) => {
    if (photos.length <= 1) {
      toast({ title: "Debes mantener al menos una foto en tu perfil.", variant: "destructive" });
      return;
    }
    deletePhoto.mutate(
      { photoId },
      {
        onSuccess: () => { refetchPhotos(); queryClient.invalidateQueries({ queryKey: getGetMyProfileQueryKey() }); },
        onError: (err: any) => { toast({ title: "Error borrando foto", description: err?.data?.error ?? err?.message, variant: "destructive" }); },
      }
    );
  };

  const handleSetAvatar = (photoId: string) => {
    setAvatarPhoto.mutate(
      { photoId },
      {
        onSuccess: () => { refetchPhotos(); queryClient.invalidateQueries({ queryKey: getGetMyProfileQueryKey() }); toast({ title: "¡Foto de perfil actualizada!" }); },
        onError: (err: any) => { toast({ title: "Error", description: err?.data?.error ?? err?.message, variant: "destructive" }); },
      }
    );
  };

  const handleUseLocation = () => {
    geo.request(() => toast({ title: "¡Ubicación actualizada!" }));
  };

  const copyLink = () => {
    if (!profile) return;
    navigator.clipboard.writeText(`${window.location.origin}/profile/${profile.id}`);
    toast({ title: "¡Enlace copiado!" });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <span className="text-xl font-display tracking-widest text-gradient-brand animate-pulse">Cargando...</span>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-5 p-8 text-center">
        <h2 className="text-3xl font-display text-primary tracking-widest">Preparando tu perfil...</h2>
        <p className="text-muted-foreground font-sans text-sm max-w-xs">
          {error ? `Error: ${(error as any)?.data?.error ?? (error as any)?.message}` : "Recarga en un momento."}
        </p>
        <button onClick={() => window.location.reload()}
          className="px-7 py-3 rounded-xl font-display text-lg tracking-widest text-white hover:opacity-90 transition-opacity"
          style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))" }}>
          Recargar
        </button>
      </div>
    );
  }

  const ordered = [...photos].sort((a, b) => {
    if (a.is_avatar && !b.is_avatar) return -1;
    if (!a.is_avatar && b.is_avatar) return 1;
    return (a.position ?? 0) - (b.position ?? 0);
  });
  const slots: (ProfilePhoto | null)[] = Array.from(
    { length: 4 },
    (_, i) => ordered[i] ?? null,
  );

  return (
    <div className="pb-10">

      {/* ── Header ── */}
      <header className="px-4 py-3 flex items-center justify-between border-b border-border/20"
        style={{ background: "rgba(8,7,18,0.6)", backdropFilter: "blur(12px)" }}>
        <h1 className="font-display text-2xl tracking-wide">
          {isOnboarding ? "Completa tu perfil" : "Mi perfil"}
        </h1>
        <div className="flex items-center gap-2">
          <button onClick={copyLink}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground transition-colors"
            style={{ background: "rgba(255,255,255,0.04)" }}>
            <Share2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ── Onboarding hint ── */}
      {isOnboarding && (
        <div className="mx-4 mt-4 px-4 py-3 rounded-xl border border-primary/20 flex items-center gap-3"
          style={{ background: "rgba(168,85,247,0.07)" }}>
          <KixxMeLogo size={20} glow={false} />
          <p className="font-sans text-sm text-foreground/80 leading-snug">
            Completa tu perfil para aparecer en el mapa y conectar con gente cerca de ti.
          </p>
        </div>
      )}

      {/* ── Admin panel shortcut ── */}
      {isAdmin && (
        <div className="mx-4 mt-4">
          <button
            type="button"
            onClick={() => setLocation("/admin")}
            className="w-full h-11 rounded-xl border border-amber-500/30 flex items-center justify-center gap-2 font-sans text-sm font-medium text-amber-300 hover:bg-amber-500/10 transition-colors"
            style={{ background: "rgba(245,158,11,0.07)" }}
            data-testid="button-open-admin"
          >
            <ShieldAlert className="w-4 h-4" />
            Panel de moderación
          </button>
        </div>
      )}

      {/* ── Avatar ── */}
      <div className="flex items-center gap-4 px-4 pt-5 pb-4">
        <div data-testid="avatar-container" className="flex-shrink-0">
          <Avatar className="w-20 h-20 border-2 border-primary/40 rounded-2xl"
            style={{ boxShadow: "0 0 24px rgba(168,85,247,0.2)" }}>
            {profile.avatar_url && <AvatarImage src={profile.avatar_url} className="object-cover" />}
            <AvatarFallback className="font-display text-3xl uppercase bg-card text-primary">
              {profile.username?.slice(0, 2) || "KX"}
            </AvatarFallback>
          </Avatar>
        </div>
        <div className="min-w-0">
          <p className="font-display text-lg leading-tight truncate text-foreground">
            {profile.username || "Sin nombre aún"}
          </p>
          {profile.is_verified ? (
            <span className="inline-flex items-center gap-1 text-xs font-sans text-sky-400 mt-0.5">
              <BadgeCheck className="w-3.5 h-3.5" />
              Verificado
            </span>
          ) : (
            <p className="font-sans text-xs text-muted-foreground mt-0.5">
              {profile.city ? `${profile.city} · ` : ""}
              {profile.age ? `${profile.age} años` : "Edita tu perfil abajo"}
            </p>
          )}
        </div>
      </div>

      {/* ── Fotos ── */}
      <div className="px-4 pb-5">
        <div className="flex items-center justify-between mb-3">
          <p className="font-sans text-xs font-medium uppercase tracking-widest" style={{ color: "hsl(273,80%,74%)", textShadow: "0 0 10px rgba(168,85,247,0.45)" }}>Fotos</p>
          <span className="font-sans text-xs text-muted-foreground">{photos.length}/4</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {slots.map((photo, index) => (
            <PhotoSlot
              key={photo?.id ?? `empty-${index}`}
              photo={photo}
              isMain={index === 0}
              uploading={uploadPhoto.isPending}
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
        <p className="font-sans text-[11px] text-muted-foreground/50 mt-2">
          Solo fotos tuyas · cara visible en la principal · sin contenido explícito ni datos de contacto.
        </p>
      </div>

      {/* ── Sección: Básico ── */}
      <div className="px-4 pt-5 pb-5 space-y-4" style={{ borderTop: "1px solid rgba(168,85,247,0.22)" }}>
        <p className="font-sans text-xs font-medium uppercase tracking-widest -mb-1" style={{ color: "hsl(273,80%,74%)", textShadow: "0 0 10px rgba(168,85,247,0.45)" }}>Básico</p>
        <Field label="Nombre de usuario">
          <Input value={username} onChange={(e) => setUsername(e.target.value)}
            className="h-11 rounded-xl border border-border/50 focus-visible:ring-primary focus-visible:border-primary font-sans bg-input/30 text-sm"
            data-testid="input-edit-username" />
        </Field>
        <Field label="Bio">
          <Textarea value={bio} onChange={(e) => setBio(e.target.value)}
            className="rounded-xl border border-border/50 focus-visible:ring-primary focus-visible:border-primary font-sans min-h-[80px] resize-none bg-input/30 text-sm"
            placeholder="Cuéntale al mundo tus metas, marcas personales y pasiones..."
            data-testid="input-edit-bio" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Edad">
            <Input type="number" min={18} max={120} value={age} onChange={(e) => setAge(e.target.value)}
              className="h-11 rounded-xl border border-border/50 focus-visible:ring-primary focus-visible:border-primary font-sans bg-input/30 text-sm"
              placeholder="25" data-testid="input-edit-age" />
          </Field>
          <Field label="Género">
            <Input value={gender} onChange={(e) => setGender(e.target.value)}
              className="h-11 rounded-xl border border-border/50 focus-visible:ring-primary focus-visible:border-primary font-sans bg-input/30 text-sm"
              placeholder="Hombre" data-testid="input-edit-gender" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ciudad">
            <Input value={city} onChange={(e) => setCity(e.target.value)}
              className="h-11 rounded-xl border border-border/50 focus-visible:ring-primary focus-visible:border-primary font-sans bg-input/30 text-sm"
              placeholder="Madrid" data-testid="input-edit-city" />
          </Field>
          <Field label="País">
            <Input value={location} onChange={(e) => setLocation2(e.target.value)}
              className="h-11 rounded-xl border border-border/50 focus-visible:ring-primary focus-visible:border-primary font-sans bg-input/30 text-sm"
              placeholder="España" data-testid="input-edit-location" />
          </Field>
        </div>
      </div>

      {/* ── Sección: Preferencias ── */}
      <div className="px-4 pt-5 pb-5 space-y-4" style={{ borderTop: "1px solid rgba(168,85,247,0.22)" }}>
        <p className="font-sans text-xs font-medium uppercase tracking-widest -mb-1" style={{ color: "hsl(273,80%,74%)", textShadow: "0 0 10px rgba(168,85,247,0.45)" }}>Preferencias</p>
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label="Rol"
            value={role}
            onChange={(v) => setRole(v as RoleValue | "")}
            options={ROLE_OPTIONS}
            placeholder="Selecciona"
            testId="select-edit-role"
          />
          <SelectField
            label="Qué buscas"
            value={lookingFor}
            onChange={(v) => setLookingFor(v as LookingForValue | "")}
            options={LOOKING_FOR_OPTIONS}
            placeholder="Selecciona"
            testId="select-edit-looking-for"
          />
        </div>
        <SelectField
          label="Orientación"
          value={orientation}
          onChange={(v) => setOrientation(v as OrientationValue | "")}
          options={ORIENTATION_OPTIONS}
          placeholder="Selecciona tu orientación"
          testId="select-edit-orientation"
        />
      </div>

      {/* ── Sección: Sobre mí ── */}
      <div className="px-4 pt-5 pb-5 space-y-4" style={{ borderTop: "1px solid rgba(168,85,247,0.22)" }}>
        <p className="font-sans text-xs font-medium uppercase tracking-widest -mb-1" style={{ color: "hsl(273,80%,74%)", textShadow: "0 0 10px rgba(168,85,247,0.45)" }}>Sobre mí</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Altura (cm)">
            <input
              type="number"
              min={100}
              max={250}
              value={heightCm}
              onChange={(e) => setHeightCm(e.target.value)}
              className="flex h-11 w-full rounded-xl border border-border/50 bg-input/30 px-3 py-2 text-sm font-sans focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary"
              placeholder="175"
              data-testid="input-edit-height"
            />
          </Field>
          <SelectField
            label="Signo zodiacal"
            value={zodiacSign}
            onChange={(v) => setZodiacSign(v as ZodiacSignValue | "")}
            options={ZODIAC_OPTIONS.map(o => ({ value: o.value, label: `${o.emoji} ${o.label}` }))}
            placeholder="Selecciona"
            testId="select-edit-zodiac"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label="Alcohol"
            value={alcohol}
            onChange={(v) => setAlcohol(v as AlcoholValue | "")}
            options={ALCOHOL_OPTIONS.map(o => ({ value: o.value, label: `${o.emoji} ${o.label}` }))}
            placeholder="Selecciona"
            testId="select-edit-alcohol"
          />
          <SelectField
            label="Tabaco"
            value={tobacco}
            onChange={(v) => setTobacco(v as TobaccoValue | "")}
            options={TOBACCO_OPTIONS.map(o => ({ value: o.value, label: `${o.emoji} ${o.label}` }))}
            placeholder="Selecciona"
            testId="select-edit-tobacco"
          />
          <SelectField
            label="Ejercicio"
            value={exercise}
            onChange={(v) => setExercise(v as ExerciseValue | "")}
            options={EXERCISE_OPTIONS.map(o => ({ value: o.value, label: `${o.emoji} ${o.label}` }))}
            placeholder="Selecciona"
            testId="select-edit-exercise"
          />
          <SelectField
            label="Mascotas"
            value={pets}
            onChange={(v) => setPets(v as PetsValue | "")}
            options={PETS_OPTIONS.map(o => ({ value: o.value, label: `${o.emoji} ${o.label}` }))}
            placeholder="Selecciona"
            testId="select-edit-pets"
          />
        </div>
      </div>

      {/* ── Sección: Intereses ── */}
      <div className="px-4 pt-5 pb-5 space-y-3" style={{ borderTop: "1px solid rgba(168,85,247,0.22)" }}>
        <p className="font-sans text-xs font-medium uppercase tracking-widest" style={{ color: "hsl(273,80%,74%)", textShadow: "0 0 10px rgba(168,85,247,0.45)" }}>
          Intereses · hasta 20
        </p>
        <TagPicker selected={interests} onChange={setInterests} max={20} />
      </div>

      {/* ── Ubicación + Guardar ── */}
      <div className="px-4 pt-5 pb-6 space-y-3" style={{ borderTop: "1px solid rgba(168,85,247,0.22)" }}>
        <button
          type="button"
          onClick={handleUseLocation}
          disabled={geo.isPending || geo.state === "locating"}
          className="w-full h-11 rounded-xl border border-primary/25 flex items-center justify-center gap-2 font-sans text-sm text-primary transition-colors hover:bg-primary/5 disabled:opacity-60"
          style={{ background: "rgba(168,85,247,0.05)" }}
          data-testid="button-use-location"
        >
          {geo.isPending || geo.state === "locating" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Navigation className="w-4 h-4" />
          )}
          {profile.latitude != null ? "Actualizar mi ubicación" : "Usar mi ubicación actual"}
        </button>
        {profile.latitude != null && geo.state !== "denied" && (
          <p className="font-sans text-[11px] text-green-400 text-center">
            Ubicación activa · apareces en el mapa
          </p>
        )}
        {geo.state === "denied" && (
          <p className="font-sans text-[11px] text-red-400 text-center">
            Permiso denegado. Actívalo en los ajustes del navegador.
          </p>
        )}
        {geo.state === "error" && (
          <p className="font-sans text-[11px] text-amber-400 text-center">
            No se pudo obtener la ubicación. Comprueba que el GPS esté activo e inténtalo de nuevo.
          </p>
        )}
        {geo.state === "unsupported" && (
          <p className="font-sans text-[11px] text-amber-400 text-center">
            Tu dispositivo no admite geolocalización.
          </p>
        )}
        <Button onClick={handleSave}
          disabled={(updateProfile.isPending || updateInterests.isPending) || (!isDirty && !interestsDirty)}
          className="w-full h-13 rounded-xl font-display text-xl tracking-widest border-0 text-white hover:opacity-90 transition-opacity disabled:opacity-40"
          style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))" }}
          data-testid="button-save-profile">
          {updateProfile.isPending ? "Guardando..." : isOnboarding ? "Completar perfil →" : "Guardar cambios"}
        </Button>
      </div>

      {/* ── Cards (solo fuera del onboarding) ── */}
      {!isOnboarding && (
        <>
          <ProfileCompletionCard />
          <RewardsCard />
          <BoostCard />
          <VerificationCard />
          <VisitorsCard />
          <LesGustasCard />
        </>
      )}

    </div>
  );
}
