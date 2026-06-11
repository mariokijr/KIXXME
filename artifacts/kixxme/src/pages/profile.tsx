import React, { useRef, useState, useEffect } from "react";
import {
  useGetMyProfile,
  getGetMyProfileQueryKey,
  useUpdateMyProfile,
  useListMyPhotos,
  useUploadPhoto,
  useReplacePhoto,
  useDeletePhoto,
  useSetPhotoAsAvatar,
  useGetMyModeration,
  getGetMyModerationQueryKey,
  ProfilePhoto,
} from "@workspace/api-client-react";
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
  Camera,
  Plus,
  Trash2,
  Star,
  Loader2,
  BadgeCheck,
  Navigation,
  ChevronDown,
  LifeBuoy,
  MessageCircle,
  MessageSquareWarning,
  Settings as SettingsIcon,
  ShieldAlert,
} from "lucide-react";
import { SupportDialog } from "@/components/support-dialog";
import { VerificationCard } from "@/components/verification-card";
import { VisitorsCard } from "@/components/visitors-card";
import { RewardsCard } from "@/components/rewards-card";
import { ProfileCompletionCard } from "@/components/profile-completion-card";

export default function Profile() {
  const { session } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [contactOpen, setContactOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

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
      setRole((profile.role ?? "") as RoleValue | "");
      setLookingFor((profile.looking_for ?? "") as LookingForValue | "");
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
      lookingFor !== ((profile.looking_for ?? "") as string));

  const isOnboarding = wasOnboardingRef.current;

  const handleSave = () => {
    // Calidad mínima: onboarding can't finish until the profile has a main photo
    // and the fields required to appear in Descubrir.
    if (isOnboarding) {
      const hasMainPhoto = !!profile?.avatar_url || photos.length > 0;
      const missing: string[] = [];
      if (!hasMainPhoto) missing.push("una foto principal");
      if (!username.trim()) missing.push("nombre de usuario");
      if (bio.trim().length < 10) missing.push("una biografía (mín. 10 caracteres)");
      if (age === "") missing.push("tu edad");
      if (!city.trim()) missing.push("tu ciudad");
      if (!role) missing.push("rol/preferencia");
      if (!lookingFor) missing.push("qué buscas");
      if (missing.length > 0) {
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
    updateProfile.mutate(
      { data: { username, bio, age: age !== "" ? Number(age) : undefined, city: city || undefined, gender: gender || undefined, location: location || undefined, role: role || undefined, looking_for: lookingFor || undefined } },
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
    <div>
      <header className="px-4 py-3 flex items-center justify-between border-b border-border/30"
        style={{ background: "rgba(8,7,18,0.6)", backdropFilter: "blur(12px)" }}>
        <h1 className="font-display text-2xl tracking-wide">
          {isOnboarding ? "Completa tu perfil" : "Mi perfil"}
        </h1>
        <div className="flex items-center gap-2">
          <button onClick={copyLink}
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-border/40 text-muted-foreground hover:text-foreground transition-colors"
            style={{ background: "rgba(255,255,255,0.04)" }}>
            <Share2 className="w-4 h-4" />
          </button>
          <button onClick={() => setLocation("/settings")}
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-border/40 text-muted-foreground hover:text-foreground transition-colors"
            style={{ background: "rgba(255,255,255,0.04)" }}
            data-testid="button-open-settings"
            aria-label="Ajustes">
            <SettingsIcon className="w-4 h-4" />
          </button>
        </div>
      </header>

      {isOnboarding && (
        <div className="mx-4 mt-4 px-4 py-3 rounded-xl border border-primary/20 flex items-center gap-3"
          style={{ background: "rgba(168,85,247,0.07)" }}>
          <KixxMeLogo size={22} glow={false} />
          <p className="font-sans text-sm text-foreground/80 leading-snug">
            Completa tu perfil para aparecer en el mapa y conectar con gente cerca de ti.
          </p>
        </div>
      )}

      <div className="px-4 pt-6 pb-4 flex flex-col items-center gap-3">
        <div className="relative" data-testid="avatar-container">
          <Avatar className="w-28 h-28 border-2 border-primary/40 rounded-2xl"
            style={{ boxShadow: "0 0 30px rgba(168,85,247,0.25)" }}>
            {profile.avatar_url && <AvatarImage src={profile.avatar_url} className="object-cover" />}
            <AvatarFallback className="font-display text-4xl uppercase bg-card text-primary">
              {profile.username?.slice(0, 2) || "KX"}
            </AvatarFallback>
          </Avatar>
        </div>
        {profile.is_verified ? (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-sans font-medium text-sky-400 border border-sky-500/30"
            style={{ background: "rgba(14,165,233,0.1)" }}>
            <BadgeCheck className="w-3.5 h-3.5" />
            Verificado
          </span>
        ) : (
          <p className="font-sans text-xs text-muted-foreground text-center">
            Foto de perfil principal · Gym, playa o casual
          </p>
        )}
      </div>

      {isAdmin && (
        <div className="mx-4 mb-4 border border-amber-500/40 rounded-2xl p-5 space-y-3"
          style={{ background: "rgba(245,158,11,0.07)", boxShadow: "0 0 24px rgba(245,158,11,0.12)" }}>
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            <h3 className="font-display text-lg tracking-widest text-foreground">Moderación</h3>
          </div>
          <p className="font-sans text-xs text-muted-foreground">
            Tienes acceso de administrador. Revisa reportes, alertas automáticas y aplica sanciones.
          </p>
          <button
            type="button"
            onClick={() => setLocation("/admin")}
            className="w-full h-11 rounded-xl border border-amber-500/40 flex items-center justify-center gap-2 font-sans text-sm font-medium text-amber-300 hover:bg-amber-500/10 transition-colors"
            style={{ background: "rgba(245,158,11,0.08)" }}
            data-testid="button-open-admin"
          >
            <ShieldAlert className="w-4 h-4" />
            Panel de moderación
          </button>
        </div>
      )}

      <div className="px-4 pb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg tracking-wide text-foreground/80">Mis fotos</h2>
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
        <p className="font-sans text-[11px] text-muted-foreground/80 mt-3 leading-relaxed">
          Sube solo fotos tuyas y mantén la cara visible en la principal. No se
          permiten desnudos explícitos, contenido sexual, menores de edad,
          violencia ni datos de contacto. Las fotos que incumplan las normas se
          eliminarán y pueden conllevar la suspensión de la cuenta.
        </p>
      </div>

      <div className="mx-4 mb-4 border border-border/40 rounded-2xl p-5 space-y-5"
        style={{ background: "rgba(13,11,26,0.7)" }}>
        <Field label="Nombre de usuario">
          <Input value={username} onChange={(e) => setUsername(e.target.value)}
            className="h-11 rounded-xl border border-border/60 focus-visible:ring-primary focus-visible:border-primary font-sans bg-input/40 text-sm"
            data-testid="input-edit-username" />
        </Field>
        <Field label="Bio">
          <Textarea value={bio} onChange={(e) => setBio(e.target.value)}
            className="rounded-xl border border-border/60 focus-visible:ring-primary focus-visible:border-primary font-sans min-h-[90px] resize-none bg-input/40 text-sm"
            placeholder="Cuéntale al mundo tus metas, marcas personales y pasiones..."
            data-testid="input-edit-bio" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Edad">
            <Input type="number" min={18} max={120} value={age} onChange={(e) => setAge(e.target.value)}
              className="h-11 rounded-xl border border-border/60 focus-visible:ring-primary focus-visible:border-primary font-sans bg-input/40 text-sm"
              placeholder="25" data-testid="input-edit-age" />
          </Field>
          <Field label="Género">
            <Input value={gender} onChange={(e) => setGender(e.target.value)}
              className="h-11 rounded-xl border border-border/60 focus-visible:ring-primary focus-visible:border-primary font-sans bg-input/40 text-sm"
              placeholder="Hombre" data-testid="input-edit-gender" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Ciudad">
            <Input value={city} onChange={(e) => setCity(e.target.value)}
              className="h-11 rounded-xl border border-border/60 focus-visible:ring-primary focus-visible:border-primary font-sans bg-input/40 text-sm"
              placeholder="Madrid" data-testid="input-edit-city" />
          </Field>
          <Field label="País">
            <Input value={location} onChange={(e) => setLocation2(e.target.value)}
              className="h-11 rounded-xl border border-border/60 focus-visible:ring-primary focus-visible:border-primary font-sans bg-input/40 text-sm"
              placeholder="España" data-testid="input-edit-location" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <SelectField
            label="Rol/Preferencia"
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
        <div className="pt-1">
          <button
            type="button"
            onClick={handleUseLocation}
            disabled={geo.isPending || geo.state === "locating"}
            className="w-full h-11 rounded-xl border border-primary/30 flex items-center justify-center gap-2 font-sans text-sm text-primary transition-colors hover:bg-primary/5 disabled:opacity-60"
            style={{ background: "rgba(168,85,247,0.06)" }}
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
            <p className="font-sans text-[11px] text-green-400 mt-1.5 text-center">
              Ubicación activa · apareces en el mapa
            </p>
          )}
          {geo.state === "denied" && (
            <p className="font-sans text-[11px] text-red-400 mt-1.5 text-center">
              Permiso denegado. Actívalo en los ajustes del navegador.
            </p>
          )}
        </div>
        <Button onClick={handleSave} disabled={updateProfile.isPending || !isDirty}
          className="w-full h-13 rounded-xl font-display text-xl tracking-widest border-0 text-white hover:opacity-90 transition-opacity disabled:opacity-40"
          style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))" }}
          data-testid="button-save-profile">
          {updateProfile.isPending ? "Guardando..." : isOnboarding ? "Completar perfil →" : "Guardar cambios"}
        </Button>
      </div>

      {!isOnboarding && (
        <>
          <ProfileCompletionCard />
          <RewardsCard />
          <VerificationCard />
          <VisitorsCard />
        </>
      )}

      <div className="mx-4 mb-6 border border-border/40 rounded-2xl p-5 space-y-3"
        style={{ background: "rgba(255,255,255,0.02)" }}>
        <div className="flex items-center gap-2 mb-1">
          <LifeBuoy className="w-4 h-4 text-primary" />
          <h3 className="font-display text-lg tracking-widest text-foreground">Soporte y ayuda</h3>
        </div>
        <button
          type="button"
          onClick={() => setContactOpen(true)}
          className="w-full h-11 rounded-xl border border-primary/30 flex items-center justify-center gap-2 font-sans text-sm text-primary hover:bg-primary/5 transition-colors"
          style={{ background: "rgba(168,85,247,0.06)" }}
          data-testid="button-contact-support"
        >
          <MessageCircle className="w-4 h-4" />
          Contactar soporte
        </button>
        <button
          type="button"
          onClick={() => setReportOpen(true)}
          className="w-full h-11 rounded-xl border border-border/50 flex items-center justify-center gap-2 font-sans text-sm text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
          data-testid="button-report-problem"
        >
          <MessageSquareWarning className="w-4 h-4" />
          Reportar un problema
        </button>
        <button
          type="button"
          onClick={() => setLocation("/support")}
          className="w-full text-center font-sans text-xs text-primary/80 hover:text-primary pt-1"
          data-testid="link-support-center"
        >
          Centro de ayuda
        </button>
        <a
          href="mailto:supportkixxme@gmail.com"
          className="block text-center font-sans text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          data-testid="link-support-email"
        >
          ¿Necesitas ayuda? supportkixxme@gmail.com
        </a>
      </div>


      <SupportDialog
        open={contactOpen}
        onOpenChange={setContactOpen}
        category="contact"
        title="Contactar soporte"
        description="Cuéntanos en qué podemos ayudarte y te responderemos por email."
        submitLabel="Enviar mensaje"
        successTitle="Mensaje enviado"
        successDescription="Gracias por escribirnos. Te responderemos muy pronto."
      />
      <SupportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        category="general"
        title="Reportar un problema"
        description="Describe el error o el problema con el mayor detalle posible."
        messageLabel="Describe el problema"
        messagePlaceholder="¿Qué ha pasado? ¿En qué pantalla? ¿Qué esperabas que ocurriera?"
        submitLabel="Enviar reporte"
        successTitle="Reporte enviado"
        successDescription="Gracias. Lo revisaremos lo antes posible."
      />
    </div>
  );
}

function PhotoSlot({
  photo,
  isMain,
  uploading,
  replacing,
  isDeleting,
  isSettingAvatar,
  onAdd,
  onReplace,
  onDelete,
  onSetAvatar,
}: {
  photo: ProfilePhoto | null;
  isMain: boolean;
  uploading: boolean;
  replacing: boolean;
  isDeleting: boolean;
  isSettingAvatar: boolean;
  onAdd: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onReplace: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDelete: () => void;
  onSetAvatar: () => void;
}) {
  // Empty slot — invite the user to add a photo here.
  if (!photo) {
    return (
      <label
        className="relative rounded-xl overflow-hidden border-2 border-dashed border-border/40 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-colors"
        style={{ aspectRatio: "1", background: "rgba(13,11,26,0.6)" }}
        data-testid={isMain ? "slot-add-main" : "slot-add-photo"}
      >
        {uploading ? (
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        ) : (
          <>
            <div className="w-10 h-10 rounded-full flex items-center justify-center mb-1.5"
              style={{ background: "rgba(168,85,247,0.12)" }}>
              <Plus className="w-5 h-5 text-primary" />
            </div>
            <span className="font-sans text-[11px] text-muted-foreground text-center px-2">
              {isMain ? "Añadir foto principal" : "Añadir foto"}
            </span>
          </>
        )}
        <input type="file" className="hidden" accept="image/*" onChange={onAdd} disabled={uploading} />
      </label>
    );
  }

  // Filled slot — show the photo plus per-photo actions.
  const busy = replacing || isDeleting || isSettingAvatar;
  return (
    <div
      className="relative rounded-xl overflow-hidden border border-border/30"
      style={{ aspectRatio: "1" }}
      data-testid={isMain ? "photo-slot-main" : "photo-slot-extra"}
    >
      <img src={photo.url} alt="" className="w-full h-full object-cover" />

      {photo.is_avatar && (
        <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-sans font-medium text-white"
          style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))" }}>
          <Star className="w-2.5 h-2.5" fill="white" />
          Principal
        </div>
      )}

      {busy && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/70">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 p-2 flex items-center justify-center gap-2"
        style={{ background: "linear-gradient(to top, rgba(8,7,18,0.92), transparent)" }}>
        {!photo.is_avatar && (
          <button onClick={onSetAvatar} disabled={isSettingAvatar}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-white disabled:opacity-50"
            style={{ background: "rgba(168,85,247,0.85)" }}
            title="Elegir como principal" data-testid="button-set-main">
            <Star className="w-4 h-4" />
          </button>
        )}
        <label
          className="w-8 h-8 flex items-center justify-center rounded-lg text-white cursor-pointer"
          style={{ background: "rgba(255,255,255,0.16)" }}
          title="Cambiar foto" data-testid="button-replace-photo">
          <Camera className="w-4 h-4" />
          <input type="file" className="hidden" accept="image/*" onChange={onReplace} disabled={replacing} />
        </label>
        <button onClick={onDelete} disabled={isDeleting}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-white disabled:opacity-50"
          style={{ background: "rgba(239,68,68,0.85)" }}
          title="Eliminar foto" data-testid="button-delete-photo">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

type RoleValue =
  | "activo"
  | "pasivo"
  | "versatil"
  | "heterocurioso"
  | "flexible"
  | "no_decir";
type LookingForValue =
  | "amistad"
  | "chat"
  | "citas"
  | "relacion"
  | "encuentros"
  | "lo_que_surja";

const ROLE_OPTIONS: { value: RoleValue; label: string }[] = [
  { value: "activo", label: "Activo" },
  { value: "pasivo", label: "Pasivo" },
  { value: "versatil", label: "Versátil" },
  { value: "heterocurioso", label: "Heterocurioso" },
  { value: "flexible", label: "Flexible" },
  { value: "no_decir", label: "Prefiero no decirlo" },
];

const LOOKING_FOR_OPTIONS: { value: LookingForValue; label: string }[] = [
  { value: "amistad", label: "Amistad" },
  { value: "chat", label: "Chat" },
  { value: "citas", label: "Citas" },
  { value: "relacion", label: "Relación seria" },
  { value: "encuentros", label: "Encuentros" },
  { value: "lo_que_surja", label: "Lo que surja" },
];

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  testId,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  testId?: string;
}) {
  return (
    <Field label={label}>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-full rounded-xl border border-border/60 focus-visible:ring-primary focus-visible:border-primary focus-visible:outline-none font-sans bg-input/40 text-sm px-3 pr-9 appearance-none text-foreground"
          data-testid={testId}
        >
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
      </div>
    </Field>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="font-display text-base tracking-widest text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
