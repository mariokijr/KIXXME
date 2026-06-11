import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
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
import { Button } from "@/components/ui/button";
import { PhotoSlot } from "@/components/photo-slot";
import { Field, SelectField } from "@/components/profile-fields";
import {
  type RoleValue,
  type LookingForValue,
  ROLE_OPTIONS,
  LOOKING_FOR_OPTIONS,
  computeMandatoryProfile,
  MIN_BIO_LENGTH,
} from "@/lib/profile-form";
import { Navigation, Loader2, Check, ArrowRight } from "lucide-react";

const PHOTO_SLOTS = 4;

/**
 * The mandatory profile step shown by the onboarding gate. It cannot be skipped:
 * the gate keeps rendering it until the profile satisfies `computeMandatoryProfile`.
 * Reuses the same photo + profile hooks as "Mi perfil" and primes the query cache
 * on save so the gate immediately re-evaluates and lets the user into the app.
 */
export function MandatoryProfile() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: profile } = useGetMyProfile({
    query: { queryKey: getGetMyProfileQueryKey() },
  });
  const { data: photos = [], refetch: refetchPhotos } = useListMyPhotos({
    query: { queryKey: getListMyPhotosQueryKey() },
  });

  const updateProfile = useUpdateMyProfile();
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
  const [role, setRole] = useState<RoleValue | "">("");
  const [lookingFor, setLookingFor] = useState<LookingForValue | "">("");

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
    }
  }, [profile]);

  const refreshGate = () => {
    refetchPhotos();
    queryClient.invalidateQueries({ queryKey: getGetMyProfileQueryKey() });
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
          onSuccess: () => {
            refreshGate();
            toast({ title: "¡Foto añadida!" });
          },
          onError: (err: any) =>
            toast({
              title: "Error subiendo foto",
              description: err?.data?.error ?? err?.message,
              variant: "destructive",
            }),
        },
      );
    };
    reader.readAsDataURL(file);
  };

  const handleReplacePhoto = (
    photoId: string,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const b64 = (ev.target?.result as string).split(",")[1];
      replacePhoto.mutate(
        { photoId, data: { base64: b64, mime_type: file.type, filename: file.name } },
        {
          onSuccess: () => {
            refreshGate();
            toast({ title: "¡Foto actualizada!" });
          },
          onError: (err: any) =>
            toast({
              title: "Error cambiando foto",
              description: err?.data?.error ?? err?.message,
              variant: "destructive",
            }),
        },
      );
    };
    reader.readAsDataURL(file);
  };

  const handleDeletePhoto = (photoId: string) => {
    if (photos.length <= 1) {
      toast({
        title: "Debes mantener al menos una foto en tu perfil.",
        variant: "destructive",
      });
      return;
    }
    deletePhoto.mutate(
      { photoId },
      {
        onSuccess: () => refreshGate(),
        onError: (err: any) =>
          toast({
            title: "Error eliminando foto",
            description: err?.data?.error ?? err?.message,
            variant: "destructive",
          }),
      },
    );
  };

  const handleSetAvatar = (photoId: string) => {
    setAvatarPhoto.mutate(
      { photoId },
      {
        onSuccess: () => refreshGate(),
        onError: (err: any) =>
          toast({
            title: "Error",
            description: err?.data?.error ?? err?.message,
            variant: "destructive",
          }),
      },
    );
  };

  const status = computeMandatoryProfile({
    username,
    bio,
    age: age !== "" ? Number(age) : null,
    city,
    role: role || null,
    looking_for: lookingFor || null,
    avatar_url: profile?.avatar_url,
    photoCount: photos.length,
  });

  const handleSubmit = () => {
    if (!status.complete) {
      toast({
        title: "Completa tu perfil para continuar",
        description: `Falta: ${status.missing.join(", ")}.`,
        variant: "destructive",
      });
      return;
    }
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
        },
      },
      {
        onSuccess: (data) => {
          // Prime the cache so the gate re-evaluates immediately and lets the
          // user into the app without waiting for a refetch.
          queryClient.setQueryData(getGetMyProfileQueryKey(), data);
        },
        onError: (err: any) => {
          const msg = err?.data?.error ?? err?.message ?? "Error desconocido";
          toast({
            title: "No se pudo guardar",
            description: msg,
            variant: "destructive",
          });
        },
      },
    );
  };

  const slots: (ProfilePhoto | null)[] = Array.from(
    { length: PHOTO_SLOTS },
    (_, i) => photos[i] ?? null,
  );

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      style={{
        background:
          "radial-gradient(ellipse 90% 50% at 50% 0%, hsl(270 32% 9%) 0%, hsl(238 25% 4%) 65%)",
      }}
      data-testid="onboarding-profile"
    >
      <div className="mx-auto w-full max-w-md px-5 pt-[calc(env(safe-area-inset-top)+24px)] pb-40">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col items-center text-center"
        >
          <KixxMeLogo size={34} badge />
          <h1 className="mt-5 font-display text-3xl tracking-wide text-white">
            Completa tu perfil
          </h1>
          <p className="mt-2 max-w-xs font-sans text-sm leading-relaxed text-white/60">
            Necesitamos estos datos para que puedas aparecer en Descubrir y
            conocer gente. Es rápido.
          </p>
        </motion.div>

        {/* Photos */}
        <div className="mt-8">
          <h2 className="mb-1 font-display text-base tracking-widest text-muted-foreground">
            Tus fotos
          </h2>
          <p className="mb-3 font-sans text-xs text-white/45">
            La primera es tu foto principal (obligatoria).
          </p>
          <div className="grid grid-cols-2 gap-3">
            {slots.map((photo, i) => (
              <PhotoSlot
                key={photo?.id ?? `empty-${i}`}
                photo={photo}
                isMain={i === 0}
                uploading={uploadPhoto.isPending && !photo}
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
        </div>

        {/* Fields */}
        <div className="mt-7 space-y-4">
          <Field label="Nombre de usuario">
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="¿Cómo te llamas?"
              className="h-11 bg-input/40"
              data-testid="input-username"
            />
          </Field>

          <Field label="Bio">
            <Textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Cuéntale al mundo quién eres…"
              className="min-h-24 bg-input/40 resize-none"
              data-testid="input-bio"
            />
            <span className="font-sans text-[11px] text-white/40">
              {bio.trim().length}/{MIN_BIO_LENGTH} caracteres mínimo
            </span>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Edad">
              <Input
                type="number"
                inputMode="numeric"
                min={18}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="18+"
                className="h-11 bg-input/40"
                data-testid="input-age"
              />
            </Field>
            <Field label="Género">
              <Input
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                placeholder="Opcional"
                className="h-11 bg-input/40"
                data-testid="input-gender"
              />
            </Field>
          </div>

          <Field label="Ciudad">
            <div className="flex gap-2">
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="¿Dónde estás?"
                className="h-11 bg-input/40"
                data-testid="input-city"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => geo.request()}
                disabled={geo.isPending}
                className="h-11 shrink-0 px-3"
                title="Usar mi ubicación"
                data-testid="button-use-location"
              >
                {geo.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Navigation className="h-4 w-4" />
                )}
              </Button>
            </div>
          </Field>

          <SelectField
            label="Rol / Preferencia"
            value={role}
            onChange={(v) => setRole(v as RoleValue | "")}
            options={ROLE_OPTIONS}
            placeholder="Selecciona una opción"
            testId="select-role"
          />
          <SelectField
            label="¿Qué buscas?"
            value={lookingFor}
            onChange={(v) => setLookingFor(v as LookingForValue | "")}
            options={LOOKING_FOR_OPTIONS}
            placeholder="Selecciona una opción"
            testId="select-looking-for"
          />
        </div>

        {/* Live missing-fields hint */}
        {!status.complete && (
          <div
            className="mt-6 rounded-2xl border border-white/10 p-4"
            style={{ background: "rgba(255,255,255,0.04)" }}
          >
            <p className="mb-2 font-sans text-xs font-medium text-white/70">
              Para entrar te falta:
            </p>
            <ul className="space-y-1.5">
              {status.missing.map((m) => (
                <li
                  key={m}
                  className="flex items-center gap-2 font-sans text-xs text-white/55"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-primary/70" />
                  {m}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Sticky submit */}
      <div
        className="fixed inset-x-0 bottom-0 z-10 px-5 pb-[calc(env(safe-area-inset-bottom)+18px)] pt-4"
        style={{
          background: "linear-gradient(to top, hsl(238 25% 4%) 60%, transparent)",
        }}
      >
        <div className="mx-auto w-full max-w-md">
          <Button
            onClick={handleSubmit}
            disabled={updateProfile.isPending || !status.complete}
            className="h-14 w-full gap-2 rounded-2xl font-display text-lg tracking-widest text-white shadow-lg disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
            }}
            data-testid="button-finish-onboarding"
          >
            {updateProfile.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : status.complete ? (
              <>
                Entrar a KixxMe
                <ArrowRight className="h-5 w-5" />
              </>
            ) : (
              <>
                <Check className="h-5 w-5" />
                Completa los campos
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
