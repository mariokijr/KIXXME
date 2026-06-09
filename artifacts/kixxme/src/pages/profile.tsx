import React, { useRef, useState, useEffect } from "react";
import {
  useGetMyProfile,
  getGetMyProfileQueryKey,
  useUpdateMyProfile,
  useUploadAvatar,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { Upload, Share2, Camera } from "lucide-react";

export default function Profile() {
  const { session } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: profile, isLoading, error } = useGetMyProfile({
    query: { enabled: !!session, queryKey: getGetMyProfileQueryKey() },
  });

  const updateProfile = useUpdateMyProfile();
  const uploadAvatar = useUploadAvatar();

  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [age, setAge] = useState<string>("");
  const [city, setCity] = useState("");
  const [gender, setGender] = useState("");
  const [location, setLocation2] = useState("");

  const initRef = useRef<string | null>(null);
  const wasOnboardingRef = useRef(false);

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
    }
  }, [profile]);

  const isDirty =
    profile &&
    (username !== (profile.username || "") ||
      bio !== (profile.bio || "") ||
      age !== (profile.age != null ? String(profile.age) : "") ||
      city !== (profile.city || "") ||
      gender !== (profile.gender || "") ||
      location !== (profile.location || ""));

  const isOnboarding = wasOnboardingRef.current;

  const handleSave = () => {
    updateProfile.mutate(
      {
        data: {
          username,
          bio,
          age: age !== "" ? Number(age) : undefined,
          city: city || undefined,
          gender: gender || undefined,
          location: location || undefined,
        },
      },
      {
        onSuccess: (data) => {
          queryClient.setQueryData(getGetMyProfileQueryKey(), data);
          if (isOnboarding) {
            setLocation("/discover");
          } else {
            toast({ title: "¡Perfil actualizado!" });
          }
        },
        onError: (err: any) => {
          const msg = err?.data?.error ?? err?.message ?? "Error desconocido";
          toast({ title: "No se pudo guardar", description: msg, variant: "destructive" });
        },
      }
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64String = event.target?.result as string;
      const base64 = base64String.split(",")[1];
      uploadAvatar.mutate(
        { data: { base64, mime_type: file.type, filename: file.name } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetMyProfileQueryKey() });
            toast({ title: "¡Foto actualizada!" });
          },
          onError: (err: any) => {
            const msg = err?.data?.error ?? err?.message ?? "Error desconocido";
            toast({ title: "No se pudo subir la foto", description: msg, variant: "destructive" });
          },
        }
      );
    };
    reader.readAsDataURL(file);
  };

  const copyLink = () => {
    if (!profile) return;
    navigator.clipboard.writeText(`${window.location.origin}/profile/${profile.id}`);
    toast({ title: "¡Enlace copiado!" });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <span className="text-xl font-display tracking-widest text-gradient-brand animate-pulse">
          Cargando...
        </span>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-5 p-8 text-center">
        <h2 className="text-3xl font-display text-primary tracking-widest">
          Preparando tu perfil...
        </h2>
        <p className="text-muted-foreground font-sans text-sm max-w-xs">
          {error
            ? `Error: ${(error as any)?.data?.error ?? (error as any)?.message ?? "Error desconocido"}`
            : "Tu espacio se está configurando. Recarga en un momento."}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-7 py-3 rounded-xl font-display text-lg tracking-widest text-white hover:opacity-90 transition-opacity"
          style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))" }}
        >
          Recargar
        </button>
      </div>
    );
  }

  return (
    <div>
      <header className="px-4 py-3 flex items-center justify-between border-b border-border/30"
        style={{ background: "rgba(8,7,18,0.6)", backdropFilter: "blur(12px)" }}>
        <h1 className="font-display text-2xl tracking-wide">
          {isOnboarding ? "Completa tu perfil" : "Mi perfil"}
        </h1>
        <button
          onClick={copyLink}
          className="w-9 h-9 flex items-center justify-center rounded-xl border border-border/40 text-muted-foreground hover:text-foreground transition-colors"
          style={{ background: "rgba(255,255,255,0.04)" }}
          data-testid="button-copy-link"
        >
          <Share2 className="w-4 h-4" />
        </button>
      </header>

      {isOnboarding && (
        <div
          className="mx-4 mt-4 px-4 py-3 rounded-xl border border-primary/20 flex items-center gap-3"
          style={{ background: "rgba(168,85,247,0.07)" }}
        >
          <span className="text-xl">🔥</span>
          <p className="font-sans text-sm text-foreground/80 leading-snug">
            Completa tu perfil para aparecer en el mapa y conectar con gente cerca de ti.
          </p>
        </div>
      )}

      <div className="px-4 pt-6 pb-4 flex flex-col items-center gap-4">
        <div className="relative group" data-testid="avatar-container">
          <Avatar
            className="w-28 h-28 border-2 border-primary/40 rounded-2xl"
            style={{ boxShadow: "0 0 30px rgba(168,85,247,0.25)" }}
          >
            {profile.avatar_url && <AvatarImage src={profile.avatar_url} className="object-cover" />}
            <AvatarFallback className="font-display text-4xl uppercase bg-card text-primary">
              {profile.username?.slice(0, 2) || "KX"}
            </AvatarFallback>
          </Avatar>
          <label
            className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer rounded-2xl"
          >
            <Camera className="w-8 h-8 text-white" />
            <input
              type="file"
              className="hidden"
              accept="image/*"
              onChange={handleFileChange}
              data-testid="input-avatar-upload"
            />
          </label>
          {uploadAvatar.isPending && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-2xl">
              <span className="font-display text-primary animate-pulse text-sm tracking-widest">Subiendo...</span>
            </div>
          )}
        </div>
        <p className="font-sans text-xs text-muted-foreground text-center">
          Fotos de gym, playa o perfil normal · Solo se bloquea contenido explícito
        </p>
      </div>

      <div
        className="mx-4 mb-4 border border-border/40 rounded-2xl p-5 space-y-5"
        style={{ background: "rgba(13,11,26,0.7)" }}
      >
        <Field label="Nombre de usuario" testId="input-edit-username">
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="h-11 rounded-xl border border-border/60 focus-visible:ring-primary focus-visible:border-primary font-sans bg-input/40 text-sm"
            data-testid="input-edit-username"
          />
        </Field>

        <Field label="Bio">
          <Textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="rounded-xl border border-border/60 focus-visible:ring-primary focus-visible:border-primary font-sans min-h-[90px] resize-none bg-input/40 text-sm"
            placeholder="Cuéntale al mundo tus metas, marcas personales y pasiones..."
            data-testid="input-edit-bio"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Edad">
            <Input
              type="number"
              min={1}
              max={120}
              value={age}
              onChange={(e) => setAge(e.target.value)}
              className="h-11 rounded-xl border border-border/60 focus-visible:ring-primary focus-visible:border-primary font-sans bg-input/40 text-sm"
              placeholder="25"
              data-testid="input-edit-age"
            />
          </Field>
          <Field label="Género">
            <Input
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className="h-11 rounded-xl border border-border/60 focus-visible:ring-primary focus-visible:border-primary font-sans bg-input/40 text-sm"
              placeholder="Hombre"
              data-testid="input-edit-gender"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Ciudad">
            <Input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="h-11 rounded-xl border border-border/60 focus-visible:ring-primary focus-visible:border-primary font-sans bg-input/40 text-sm"
              placeholder="Madrid"
              data-testid="input-edit-city"
            />
          </Field>
          <Field label="País">
            <Input
              value={location}
              onChange={(e) => setLocation2(e.target.value)}
              className="h-11 rounded-xl border border-border/60 focus-visible:ring-primary focus-visible:border-primary font-sans bg-input/40 text-sm"
              placeholder="España"
              data-testid="input-edit-location"
            />
          </Field>
        </div>

        <Button
          onClick={handleSave}
          disabled={updateProfile.isPending || !isDirty}
          className="w-full h-13 rounded-xl font-display text-xl tracking-widest border-0 text-white hover:opacity-90 transition-opacity disabled:opacity-40"
          style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))" }}
          data-testid="button-save-profile"
        >
          {updateProfile.isPending
            ? "Guardando..."
            : isOnboarding
            ? "Completar perfil →"
            : "Guardar cambios"}
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  testId,
}: {
  label: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="font-display text-base tracking-widest text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
