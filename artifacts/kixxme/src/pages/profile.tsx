import React, { useRef, useState, useEffect } from "react";
import {
  useGetMyProfile,
  getGetMyProfileQueryKey,
  useUpdateMyProfile,
  useUploadAvatar,
  useListMyPhotos,
  getListMyPhotosQueryKey,
  useUploadPhoto,
  useDeletePhoto,
  useSetPhotoAsAvatar,
  useReorderPhotos,
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
  ChevronUp,
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
  const uploadAvatar = useUploadAvatar();
  const { data: photos = [], refetch: refetchPhotos } = useListMyPhotos();
  const uploadPhoto = useUploadPhoto();
  const deletePhoto = useDeletePhoto();
  const setAvatarPhoto = useSetPhotoAsAvatar();
  const reorderPhotos = useReorderPhotos();
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

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const b64 = (ev.target?.result as string).split(",")[1];
      uploadAvatar.mutate(
        { data: { base64: b64, mime_type: file.type, filename: file.name } },
        {
          onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetMyProfileQueryKey() }); toast({ title: "¡Foto actualizada!" }); },
          onError: (err: any) => { toast({ title: "Error subiendo foto", description: err?.data?.error ?? err?.message, variant: "destructive" }); },
        }
      );
    };
    reader.readAsDataURL(file);
  };

  const handleAddPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
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

  const handleDeletePhoto = (photoId: string) => {
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

  const handleReorder = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= photos.length) return;
    const next = [...photos];
    [next[index], next[target]] = [next[target], next[index]];
    queryClient.setQueryData(getListMyPhotosQueryKey(), next);
    reorderPhotos.mutate(
      { data: { photo_ids: next.map((p) => p.id) } },
      {
        onError: (err: any) => {
          refetchPhotos();
          toast({ title: "No se pudo reordenar", description: err?.data?.error ?? err?.message, variant: "destructive" });
        },
        onSuccess: () => refetchPhotos(),
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

  const canAddMore = photos.length < 6;

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
        <div className="relative group" data-testid="avatar-container">
          <Avatar className="w-28 h-28 border-2 border-primary/40 rounded-2xl"
            style={{ boxShadow: "0 0 30px rgba(168,85,247,0.25)" }}>
            {profile.avatar_url && <AvatarImage src={profile.avatar_url} className="object-cover" />}
            <AvatarFallback className="font-display text-4xl uppercase bg-card text-primary">
              {profile.username?.slice(0, 2) || "KX"}
            </AvatarFallback>
          </Avatar>
          <label className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer rounded-2xl">
            <Camera className="w-8 h-8 text-white" />
            <input type="file" className="hidden" accept="image/*" onChange={handleAvatarChange} data-testid="input-avatar-upload" />
          </label>
          {uploadAvatar.isPending && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-2xl">
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
            </div>
          )}
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
          <span className="font-sans text-xs text-muted-foreground">{photos.length}/6</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {photos.map((photo: ProfilePhoto, index: number) => (
            <PhotoSlot
              key={photo.id}
              photo={photo}
              index={index}
              total={photos.length}
              onDelete={() => handleDeletePhoto(photo.id)}
              onSetAvatar={() => handleSetAvatar(photo.id)}
              onMoveUp={() => handleReorder(index, -1)}
              onMoveDown={() => handleReorder(index, 1)}
              isDeleting={deletePhoto.isPending}
              isSettingAvatar={setAvatarPhoto.isPending}
            />
          ))}
          {canAddMore && (
            <label
              className="relative rounded-xl overflow-hidden border-2 border-dashed border-border/40 flex flex-col items-center justify-center cursor-pointer hover:border-primary/40 transition-colors"
              style={{ aspectRatio: "1", background: "rgba(13,11,26,0.6)" }}
            >
              {uploadPhoto.isPending ? (
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              ) : (
                <>
                  <Plus className="w-6 h-6 text-muted-foreground" />
                  <span className="font-sans text-[10px] text-muted-foreground mt-1">Añadir</span>
                </>
              )}
              <input type="file" className="hidden" accept="image/*" onChange={handleAddPhoto} disabled={uploadPhoto.isPending} />
            </label>
          )}
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
            <Input type="number" min={1} max={120} value={age} onChange={(e) => setAge(e.target.value)}
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
  index,
  total,
  onDelete,
  onSetAvatar,
  onMoveUp,
  onMoveDown,
  isDeleting,
  isSettingAvatar,
}: {
  photo: ProfilePhoto;
  index: number;
  total: number;
  onDelete: () => void;
  onSetAvatar: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isDeleting: boolean;
  isSettingAvatar: boolean;
}) {
  return (
    <div className="relative rounded-xl overflow-hidden group border border-border/30"
      style={{ aspectRatio: "1" }}>
      <img src={photo.url} alt="" className="w-full h-full object-cover" />
      {photo.is_avatar && (
        <div className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))" }}>
          <Star className="w-2.5 h-2.5 text-white" />
        </div>
      )}
      <div className="absolute top-1.5 right-1.5 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onMoveUp} disabled={index === 0}
          className="w-6 h-6 flex items-center justify-center rounded-md text-white disabled:opacity-30"
          style={{ background: "rgba(13,11,26,0.85)" }}
          title="Mover antes">
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <button onClick={onMoveDown} disabled={index === total - 1}
          className="w-6 h-6 flex items-center justify-center rounded-md text-white disabled:opacity-30"
          style={{ background: "rgba(13,11,26,0.85)" }}
          title="Mover después">
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="absolute inset-x-0 bottom-0 p-1.5 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
        {!photo.is_avatar && (
          <button onClick={onSetAvatar} disabled={isSettingAvatar}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-white"
            style={{ background: "rgba(168,85,247,0.8)" }}
            title="Usar como perfil">
            <Star className="w-3.5 h-3.5" />
          </button>
        )}
        <button onClick={onDelete} disabled={isDeleting}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-white"
          style={{ background: "rgba(239,68,68,0.8)" }}
          title="Eliminar">
          <Trash2 className="w-3.5 h-3.5" />
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
