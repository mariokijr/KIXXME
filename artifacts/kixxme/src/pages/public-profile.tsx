import React from "react";
import { useGetProfile, getGetProfileQueryKey } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Flame, MapPin, User, Calendar } from "lucide-react";

export default function PublicProfile() {
  const params = useParams();
  const id = params.id as string;
  const { data: profile, isLoading, error } = useGetProfile(id, {
    query: { enabled: !!id, queryKey: getGetProfileQueryKey(id) }
  });

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
        <Link
          href="/"
          className="text-primary font-sans text-sm hover:underline"
          data-testid="link-home"
        >
          Volver al inicio
        </Link>
      </div>
    );
  }

  const memberSince = profile.created_at
    ? format(new Date(profile.created_at), "MMMM yyyy", { locale: es })
    : null;

  return (
    <div
      className="min-h-[100dvh] text-foreground flex flex-col"
      style={{ background: "radial-gradient(ellipse 90% 55% at 50% 0%, hsl(270 35% 10%) 0%, hsl(238 25% 5%) 60%)" }}
    >
      <div className="flex-1 max-w-lg w-full mx-auto px-6 pt-16 pb-10 flex flex-col items-center text-center space-y-8">

        <Avatar
          className="w-44 h-44 border-2 border-primary/50 rounded-2xl"
          style={{ boxShadow: "0 0 50px rgba(168,85,247,0.35), 0 0 100px rgba(168,85,247,0.1)" }}
          data-testid="avatar-public"
        >
          {profile.avatar_url && <AvatarImage src={profile.avatar_url} className="object-cover" />}
          <AvatarFallback className="font-display text-5xl uppercase bg-card text-primary">
            {profile.username?.slice(0, 2) || "KX"}
          </AvatarFallback>
        </Avatar>

        <div className="space-y-2">
          <h1
            className="text-5xl font-display tracking-tight text-gradient-brand"
            data-testid="text-username"
          >
            @{profile.username}
          </h1>
          {memberSince && (
            <p
              className="text-muted-foreground font-sans text-xs tracking-widest uppercase flex items-center justify-center gap-1"
              data-testid="text-member-since"
            >
              <Calendar className="w-3 h-3" />
              Activo desde {memberSince}
            </p>
          )}
        </div>

        {(profile.age || profile.city || profile.gender || profile.location) && (
          <div className="flex flex-wrap justify-center gap-2">
            {profile.age && (
              <span
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-sans border border-primary/30 text-primary"
                style={{ background: "rgba(168,85,247,0.08)" }}
              >
                <User className="w-3.5 h-3.5" />
                {profile.age} años
              </span>
            )}
            {profile.gender && (
              <span
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-sans border border-primary/30 text-primary"
                style={{ background: "rgba(168,85,247,0.08)" }}
              >
                {profile.gender}
              </span>
            )}
            {profile.city && (
              <span
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-sans border border-accent/30"
                style={{ background: "rgba(236,72,153,0.08)", color: "hsl(330,85%,65%)" }}
              >
                <MapPin className="w-3.5 h-3.5" />
                {profile.city}
                {profile.location && `, ${profile.location}`}
              </span>
            )}
            {!profile.city && profile.location && (
              <span
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-sans border border-accent/30"
                style={{ background: "rgba(236,72,153,0.08)", color: "hsl(330,85%,65%)" }}
              >
                <MapPin className="w-3.5 h-3.5" />
                {profile.location}
              </span>
            )}
          </div>
        )}

        {profile.bio && (
          <div
            className="border border-border/50 rounded-2xl p-7 w-full text-left relative"
            style={{ background: "rgba(13,11,26,0.75)", boxShadow: "0 0 30px rgba(168,85,247,0.1)" }}
          >
            <div
              className="absolute -top-3.5 left-6 px-4 py-1 rounded-full text-xs font-display tracking-widest text-white"
              style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))" }}
            >
              Sobre mí
            </div>
            <p
              className="font-sans text-base leading-relaxed whitespace-pre-wrap text-foreground/90"
              data-testid="text-bio"
            >
              {profile.bio}
            </p>
          </div>
        )}

      </div>

      <footer className="py-8 text-center mt-auto">
        <Link
          href="/"
          className="inline-flex items-center gap-2 font-display text-lg tracking-widest text-muted-foreground hover:text-primary transition-colors"
          data-testid="link-footer-home"
        >
          <Flame className="w-4 h-4 text-orange-400" />
          DESCUBRE KIXXME
          <Flame className="w-4 h-4 text-orange-400" />
        </Link>
      </footer>
    </div>
  );
}
