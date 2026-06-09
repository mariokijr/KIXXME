import React, { useRef, useState, useEffect } from "react";
import {
  useGetMyProfile,
  getGetMyProfileQueryKey,
  useUpdateMyProfile,
  useUploadAvatar,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { LogOut, Upload, Share2, Flame } from "lucide-react";

export default function Profile() {
  const { session, logout } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: profile, isLoading, error } = useGetMyProfile({
    query: { enabled: !!session, queryKey: getGetMyProfileQueryKey() }
  });

  const updateProfile = useUpdateMyProfile();
  const uploadAvatar = useUploadAvatar();

  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [age, setAge] = useState<string>("");
  const [city, setCity] = useState("");
  const [gender, setGender] = useState("");
  const [location, setLocation] = useState("");
  const initRef = useRef<string | null>(null);

  useEffect(() => {
    if (profile && initRef.current !== profile.id) {
      initRef.current = profile.id;
      setUsername(profile.username || "");
      setBio(profile.bio || "");
      setAge(profile.age != null ? String(profile.age) : "");
      setCity(profile.city || "");
      setGender(profile.gender || "");
      setLocation(profile.location || "");
    }
  }, [profile]);

  const isDirty = profile && (
    username !== (profile.username || "") ||
    bio !== (profile.bio || "") ||
    age !== (profile.age != null ? String(profile.age) : "") ||
    city !== (profile.city || "") ||
    gender !== (profile.gender || "") ||
    location !== (profile.location || "")
  );

  const handleSave = () => {
    updateProfile.mutate({
      data: {
        username,
        bio,
        age: age !== "" ? Number(age) : undefined,
        city: city || undefined,
        gender: gender || undefined,
        location: location || undefined,
      }
    }, {
      onSuccess: (data) => {
        toast({ title: "¡Perfil actualizado!" });
        queryClient.setQueryData(getGetMyProfileQueryKey(), data);
      },
      onError: (err: any) => {
        const msg = err?.data?.error ?? err?.message ?? "Error desconocido";
        toast({ title: "No se pudo guardar", description: msg, variant: "destructive" });
      }
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64String = event.target?.result as string;
      const base64 = base64String.split(",")[1];
      uploadAvatar.mutate({ data: { base64, mime_type: file.type, filename: file.name } }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMyProfileQueryKey() });
          toast({ title: "¡Foto actualizada!" });
        },
        onError: (err: any) => {
          const msg = err?.data?.error ?? err?.message ?? "Error desconocido";
          toast({ title: "No se pudo subir la foto", description: msg, variant: "destructive" });
        }
      });
    };
    reader.readAsDataURL(file);
  };

  const copyLink = () => {
    if (!profile) return;
    const url = `${window.location.origin}/profile/${profile.id}`;
    navigator.clipboard.writeText(url);
    toast({ title: "¡Enlace copiado!" });
  };

  if (isLoading) {
    return (
      <div
        className="min-h-[100dvh] flex items-center justify-center"
        style={{ background: "radial-gradient(ellipse 80% 60% at 50% 0%, hsl(270 40% 12%) 0%, hsl(238 25% 5%) 65%)" }}
      >
        <span className="text-2xl font-display tracking-widest text-gradient-brand animate-pulse">
          Cargando...
        </span>
      </div>
    );
  }

  if (!profile) {
    return (
      <div
        className="min-h-[100dvh] flex flex-col items-center justify-center gap-5 p-8 text-center"
        style={{ background: "radial-gradient(ellipse 80% 60% at 50% 0%, hsl(270 40% 12%) 0%, hsl(238 25% 5%) 65%)" }}
      >
        <Flame className="w-12 h-12 text-orange-400" style={{ filter: "drop-shadow(0 0 12px rgba(249,115,22,0.8))" }} />
        <h2 className="text-4xl font-display text-primary tracking-widest">
          Preparando tu perfil...
        </h2>
        <p className="text-muted-foreground font-sans text-sm max-w-xs">
          {error
            ? `Error: ${(error as any)?.data?.error ?? (error as any)?.message ?? "Error desconocido"}`
            : "Tu espacio se está configurando. Recarga en un momento."}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 px-7 py-3 rounded-xl font-display text-lg tracking-widest text-white hover:opacity-90 transition-opacity"
          style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))" }}
        >
          Recargar
        </button>
      </div>
    );
  }

  return (
    <div
      className="min-h-[100dvh] text-foreground pb-20"
      style={{ background: "radial-gradient(ellipse 90% 50% at 50% 0%, hsl(270 35% 10%) 0%, hsl(238 25% 5%) 60%)" }}
    >
      <header className="border-b border-border/40 px-5 py-4 flex justify-between items-center"
        style={{ background: "rgba(13,11,26,0.7)", backdropFilter: "blur(12px)" }}>
        <div className="flex items-center gap-2">
          <Flame
            className="w-6 h-6 text-orange-400"
            style={{ filter: "drop-shadow(0 0 6px rgba(249,115,22,0.8))" }}
          />
          <h1 className="text-3xl font-display tracking-tight text-gradient-brand m-0 leading-none">
            KIXXME
          </h1>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={logout}
          className="text-muted-foreground hover:text-foreground"
          data-testid="button-logout"
        >
          <LogOut className="h-5 w-5" />
        </Button>
      </header>

      <main className="max-w-2xl mx-auto p-6 space-y-8 mt-6">

        <div className="flex flex-col items-center space-y-5">
          <div className="relative group cursor-pointer" data-testid="avatar-container">
            <Avatar
              className="w-36 h-36 border-2 border-primary/50 rounded-2xl glow-purple"
              style={{ boxShadow: "0 0 35px rgba(168,85,247,0.3)" }}
            >
              {profile.avatar_url && <AvatarImage src={profile.avatar_url} className="object-cover" />}
              <AvatarFallback className="font-display text-4xl uppercase bg-card text-primary">
                {profile.username?.slice(0, 2) || "KX"}
              </AvatarFallback>
            </Avatar>
            <label className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer rounded-2xl">
              <Upload className="w-9 h-9 text-white" />
              <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} data-testid="input-avatar-upload" />
            </label>
            {uploadAvatar.isPending && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-2xl">
                <span className="font-display text-primary animate-pulse text-lg tracking-widest">Subiendo...</span>
              </div>
            )}
          </div>

          <Button
            onClick={copyLink}
            variant="outline"
            className="border border-primary/40 text-primary hover:bg-primary/10 font-display text-lg tracking-widest h-11 px-6 rounded-xl"
            data-testid="button-copy-link"
          >
            <Share2 className="w-4 h-4 mr-2" /> Compartir perfil
          </Button>
        </div>

        <div
          className="border border-border/50 rounded-2xl p-7 space-y-7"
          style={{ background: "rgba(13,11,26,0.75)", boxShadow: "0 0 40px rgba(168,85,247,0.12)" }}
        >

          <div className="space-y-2">
            <label className="font-display text-xl tracking-widest text-muted-foreground">
              Nombre de usuario
            </label>
            <Input
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="text-lg px-4 py-3 h-12 rounded-xl border border-border/60 focus-visible:ring-primary focus-visible:border-primary font-sans bg-input/40"
              data-testid="input-edit-username"
            />
          </div>

          <div className="space-y-2">
            <label className="font-display text-xl tracking-widest text-muted-foreground">Bio</label>
            <Textarea
              value={bio}
              onChange={e => setBio(e.target.value)}
              className="text-base px-4 py-3 rounded-xl border border-border/60 focus-visible:ring-primary focus-visible:border-primary font-sans min-h-[110px] resize-none bg-input/40"
              placeholder="Cuéntale al mundo tus metas, marcas personales y pasiones..."
              data-testid="input-edit-bio"
            />
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="font-display text-xl tracking-widest text-muted-foreground">Edad</label>
              <Input
                type="number"
                min={1}
                max={120}
                value={age}
                onChange={e => setAge(e.target.value)}
                className="text-lg px-4 py-3 h-12 rounded-xl border border-border/60 focus-visible:ring-primary focus-visible:border-primary font-sans bg-input/40"
                placeholder="25"
                data-testid="input-edit-age"
              />
            </div>
            <div className="space-y-2">
              <label className="font-display text-xl tracking-widest text-muted-foreground">Género</label>
              <Input
                value={gender}
                onChange={e => setGender(e.target.value)}
                className="text-lg px-4 py-3 h-12 rounded-xl border border-border/60 focus-visible:ring-primary focus-visible:border-primary font-sans bg-input/40"
                placeholder="Hombre"
                data-testid="input-edit-gender"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="font-display text-xl tracking-widest text-muted-foreground">Ciudad</label>
              <Input
                value={city}
                onChange={e => setCity(e.target.value)}
                className="text-lg px-4 py-3 h-12 rounded-xl border border-border/60 focus-visible:ring-primary focus-visible:border-primary font-sans bg-input/40"
                placeholder="Madrid"
                data-testid="input-edit-city"
              />
            </div>
            <div className="space-y-2">
              <label className="font-display text-xl tracking-widest text-muted-foreground">Ubicación</label>
              <Input
                value={location}
                onChange={e => setLocation(e.target.value)}
                className="text-lg px-4 py-3 h-12 rounded-xl border border-border/60 focus-visible:ring-primary focus-visible:border-primary font-sans bg-input/40"
                placeholder="España"
                data-testid="input-edit-location"
              />
            </div>
          </div>

          <Button
            onClick={handleSave}
            disabled={updateProfile.isPending || !isDirty}
            className="w-full h-14 rounded-xl font-display text-2xl tracking-widest border-0 text-white hover:opacity-90 transition-opacity disabled:opacity-40"
            style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))" }}
            data-testid="button-save-profile"
          >
            {updateProfile.isPending ? "Guardando..." : "Guardar cambios"}
          </Button>
        </div>
      </main>
    </div>
  );
}
