import React, { useState } from "react";
import {
  useGetProfile,
  getGetProfileQueryKey,
  useListProfilePhotos,
  getListProfilePhotosQueryKey,
  useLikeProfile,
  useUnlikeProfile,
  useCreateOrGetConversation,
  useBlockProfile,
  useUnblockProfile,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowLeft,
  MapPin,
  User,
  Calendar,
  Heart,
  MessageCircle,
  BadgeCheck,
  Ban,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistance } from "./discover";

export default function PublicProfile() {
  const params = useParams();
  const id = params.id as string;
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [activePhoto, setActivePhoto] = useState(0);

  const { data: profile, isLoading, error } = useGetProfile(id, {
    query: { enabled: !!id, queryKey: getGetProfileQueryKey(id) },
  });
  const { data: photos = [] } = useListProfilePhotos(id, {
    query: { enabled: !!id, queryKey: getListProfilePhotosQueryKey(id) },
  });

  const likeProfile = useLikeProfile();
  const unlikeProfile = useUnlikeProfile();
  const createConv = useCreateOrGetConversation();
  const blockProfile = useBlockProfile();
  const unblockProfile = useUnblockProfile();

  const handleToggleLike = () => {
    if (!profile) return;
    const mutation = profile.liked_by_me ? unlikeProfile : likeProfile;
    qc.setQueryData(getGetProfileQueryKey(id), {
      ...profile,
      liked_by_me: !profile.liked_by_me,
    });
    mutation.mutate(
      { id },
      {
        onSettled: () =>
          qc.invalidateQueries({ queryKey: getGetProfileQueryKey(id) }),
      }
    );
  };

  const handleMessage = () => {
    if (!profile) return;
    createConv.mutate(
      { data: { other_user_id: profile.id } },
      {
        onSuccess: (conv) => setLocation(`/chats/${conv.id}`),
        onError: () =>
          toast({
            title: "No se pudo abrir el chat",
            variant: "destructive",
          }),
      }
    );
  };

  const handleToggleBlock = () => {
    if (!profile) return;
    const blocking = !profile.blocked_by_me;
    const mutation = blocking ? blockProfile : unblockProfile;
    qc.setQueryData(getGetProfileQueryKey(id), {
      ...profile,
      blocked_by_me: blocking,
    });
    mutation.mutate(
      { id },
      {
        onSuccess: () =>
          toast({
            title: blocking ? "Usuario bloqueado" : "Usuario desbloqueado",
          }),
        onError: () => {
          qc.setQueryData(getGetProfileQueryKey(id), {
            ...profile,
            blocked_by_me: !blocking,
          });
          toast({
            title: blocking
              ? "No se pudo bloquear"
              : "No se pudo desbloquear",
            variant: "destructive",
          });
        },
        onSettled: () => {
          qc.invalidateQueries({ queryKey: getGetProfileQueryKey(id) });
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div
        className="min-h-[100dvh] flex items-center justify-center"
        style={{ background: "radial-gradient(ellipse 80% 60% at 50% 0%, hsl(270 40% 12%) 0%, hsl(238 25% 5%) 65%)" }}
      >
        <span className="text-2xl font-display tracking-widest text-gradient-brand animate-pulse">
          Cargando perfil...
        </span>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div
        className="min-h-[100dvh] flex flex-col items-center justify-center gap-6"
        style={{ background: "radial-gradient(ellipse 80% 60% at 50% 0%, hsl(270 40% 12%) 0%, hsl(238 25% 5%) 65%)" }}
      >
        <h1 className="text-5xl font-display text-destructive tracking-widest" data-testid="text-error">
          Perfil no encontrado
        </h1>
        <p className="text-muted-foreground font-sans text-sm">
          Este perfil no existe o fue eliminado.
        </p>
        <button
          onClick={() => setLocation("/discover")}
          className="text-primary font-sans text-sm hover:underline"
          data-testid="link-home"
        >
          Volver a Descubrir
        </button>
      </div>
    );
  }

  const memberSince = profile.created_at
    ? format(new Date(profile.created_at), "MMMM yyyy", { locale: es })
    : null;
  const distance = formatDistance(profile.distance_km);
  const gallery = photos.length > 0 ? photos.map((p) => p.url) : profile.avatar_url ? [profile.avatar_url] : [];
  const heroImage = gallery[activePhoto] ?? profile.avatar_url ?? null;

  return (
    <div
      className="min-h-[100dvh] text-foreground flex flex-col"
      style={{ background: "radial-gradient(ellipse 90% 55% at 50% 0%, hsl(270 35% 10%) 0%, hsl(238 25% 5%) 60%)" }}
    >
      <header className="sticky top-0 z-20 px-4 py-3 flex items-center gap-3 border-b border-border/30"
        style={{ background: "rgba(8,7,18,0.85)", backdropFilter: "blur(20px)" }}>
        <button
          onClick={() => window.history.length > 1 ? window.history.back() : setLocation("/discover")}
          className="w-9 h-9 flex items-center justify-center rounded-xl border border-border/40 text-muted-foreground hover:text-foreground transition-colors"
          style={{ background: "rgba(255,255,255,0.04)" }}
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="font-display text-xl tracking-wide truncate flex items-center gap-1.5">
          {profile.username}
          {profile.is_verified && <BadgeCheck className="w-5 h-5 text-sky-400" />}
        </h1>
      </header>

      <div className="flex-1 max-w-lg w-full mx-auto px-5 pt-6 pb-32 flex flex-col items-center text-center space-y-6">
        <div className="relative w-full">
          <div
            className="w-full rounded-2xl overflow-hidden border-2 border-primary/40 bg-card"
            style={{ aspectRatio: "1", boxShadow: "0 0 50px rgba(168,85,247,0.3)" }}
          >
            {heroImage ? (
              <img src={heroImage} alt={profile.username} className="w-full h-full object-cover" data-testid="img-hero" />
            ) : (
              <Avatar className="w-full h-full rounded-2xl">
                <AvatarFallback className="font-display text-6xl uppercase bg-card text-primary rounded-2xl">
                  {profile.username?.slice(0, 2) || "KX"}
                </AvatarFallback>
              </Avatar>
            )}
          </div>
          {profile.is_online && (
            <span className="absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-sans font-medium text-white flex items-center gap-1.5"
              style={{ background: "rgba(13,11,26,0.85)", backdropFilter: "blur(8px)" }}>
              <span className="w-2 h-2 rounded-full" style={{ background: "hsl(142,71%,45%)" }} />
              En línea
            </span>
          )}
        </div>

        {gallery.length > 1 && (
          <div className="flex gap-2 w-full overflow-x-auto pb-1">
            {gallery.map((url, i) => (
              <button
                key={url}
                onClick={() => setActivePhoto(i)}
                className="flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition-all"
                style={{ borderColor: i === activePhoto ? "hsl(273,85%,60%)" : "rgba(255,255,255,0.1)" }}
              >
                <img src={url} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <h1 className="text-4xl font-display tracking-tight text-gradient-brand flex items-center justify-center gap-2" data-testid="text-username">
            @{profile.username}
            {profile.is_verified && <BadgeCheck className="w-7 h-7 text-sky-400" />}
          </h1>
          {memberSince && (
            <p className="text-muted-foreground font-sans text-xs tracking-widest uppercase flex items-center justify-center gap-1" data-testid="text-member-since">
              <Calendar className="w-3 h-3" />
              Activo desde {memberSince}
            </p>
          )}
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          {distance && (
            <span className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-sans border border-accent/30"
              style={{ background: "rgba(236,72,153,0.08)", color: "hsl(330,85%,65%)" }} data-testid="badge-distance">
              <MapPin className="w-3.5 h-3.5" />
              A {distance}
            </span>
          )}
          {profile.age != null && (
            <span className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-sans border border-primary/30 text-primary"
              style={{ background: "rgba(168,85,247,0.08)" }}>
              <User className="w-3.5 h-3.5" />
              {profile.age} años
            </span>
          )}
          {profile.gender && (
            <span className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-sans border border-primary/30 text-primary"
              style={{ background: "rgba(168,85,247,0.08)" }}>
              {profile.gender}
            </span>
          )}
          {profile.city && (
            <span className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-sans border border-accent/30"
              style={{ background: "rgba(236,72,153,0.08)", color: "hsl(330,85%,65%)" }}>
              <MapPin className="w-3.5 h-3.5" />
              {profile.city}{profile.location && `, ${profile.location}`}
            </span>
          )}
        </div>

        {profile.bio && (
          <div className="border border-border/50 rounded-2xl p-7 w-full text-left relative"
            style={{ background: "rgba(13,11,26,0.75)", boxShadow: "0 0 30px rgba(168,85,247,0.1)" }}>
            <div className="absolute -top-3.5 left-6 px-4 py-1 rounded-full text-xs font-display tracking-widest text-white"
              style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))" }}>
              Sobre mí
            </div>
            <p className="font-sans text-base leading-relaxed whitespace-pre-wrap text-foreground/90" data-testid="text-bio">
              {profile.bio}
            </p>
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-30 px-5 py-4 border-t border-border/30 flex items-center gap-3 max-w-lg mx-auto"
        style={{ background: "rgba(8,7,18,0.92)", backdropFilter: "blur(20px)" }}>
        <button
          onClick={handleToggleLike}
          disabled={profile.blocked_by_me}
          className="w-14 h-14 flex-shrink-0 flex items-center justify-center rounded-2xl border transition-all disabled:opacity-40"
          style={
            profile.liked_by_me
              ? { background: "rgba(236,72,153,0.15)", borderColor: "hsl(330,85%,55%)" }
              : { background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.15)" }
          }
          data-testid="button-like"
        >
          <Heart
            className="w-6 h-6 transition-all"
            style={{
              color: profile.liked_by_me ? "hsl(330,85%,60%)" : "hsl(240,10%,60%)",
              fill: profile.liked_by_me ? "hsl(330,85%,60%)" : "transparent",
            }}
          />
        </button>
        {profile.blocked_by_me ? (
          <button
            onClick={handleToggleBlock}
            disabled={blockProfile.isPending || unblockProfile.isPending}
            className="flex-1 h-14 rounded-2xl font-display text-lg tracking-widest border border-border/40 text-foreground hover:bg-white/5 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ background: "rgba(255,255,255,0.04)" }}
            data-testid="button-unblock"
          >
            <Ban className="w-5 h-5" />
            Desbloquear
          </button>
        ) : (
          <>
            <button
              onClick={handleMessage}
              disabled={createConv.isPending}
              className="flex-1 h-14 rounded-2xl font-display text-lg tracking-widest border-0 text-white hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))" }}
              data-testid="button-message"
            >
              {createConv.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <MessageCircle className="w-5 h-5" />
                  Enviar mensaje
                </>
              )}
            </button>
            <button
              onClick={handleToggleBlock}
              disabled={blockProfile.isPending}
              className="w-14 h-14 flex-shrink-0 flex items-center justify-center rounded-2xl border border-border/40 text-muted-foreground hover:text-red-400 transition-colors disabled:opacity-40"
              style={{ background: "rgba(255,255,255,0.04)" }}
              data-testid="button-block"
            >
              <Ban className="w-6 h-6" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
