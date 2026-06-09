import React from "react";
import { useGetProfile } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { format } from "date-fns";

export default function PublicProfile() {
  const params = useParams();
  const id = params.id as string;
  const { data: profile, isLoading, error } = useGetProfile(id, { query: { enabled: !!id } });

  if (isLoading) {
    return <div className="min-h-[100dvh] flex items-center justify-center bg-background"><span className="text-2xl font-display uppercase animate-pulse">Loading Athlete...</span></div>;
  }

  if (error || !profile) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background space-y-6">
        <h1 className="text-4xl font-display uppercase text-destructive" data-testid="text-error">Athlete Not Found</h1>
        <Link href="/" className="text-primary font-sans hover:underline" data-testid="link-home">Return to Locker Room</Link>
      </div>
    );
  }

  const memberSince = profile.created_at ? format(new Date(profile.created_at), "MMMM yyyy") : "Unknown";

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      <div className="flex-1 max-w-lg w-full mx-auto p-6 pt-20 flex flex-col items-center text-center space-y-10">
        
        <Avatar className="w-48 h-48 border-4 border-primary rounded-none shadow-[12px_12px_0_0_hsl(var(--primary))]" data-testid="avatar-public">
          {profile.avatar_url && <AvatarImage src={profile.avatar_url} className="object-cover" />}
          <AvatarFallback className="font-display text-6xl uppercase bg-card">{profile.username?.slice(0,2) || "KX"}</AvatarFallback>
        </Avatar>

        <div className="space-y-2">
          <h1 className="text-5xl font-display uppercase tracking-tight" data-testid="text-username">@{profile.username}</h1>
          <p className="text-muted-foreground font-sans text-sm tracking-widest uppercase" data-testid="text-member-since">Active since {memberSince}</p>
        </div>

        {profile.bio && (
          <div className="bg-card border-4 border-border p-8 w-full shadow-[8px_8px_0_0_hsl(var(--border))] text-left relative">
            <div className="absolute -top-4 -left-4 bg-primary text-primary-foreground font-display text-xl px-4 py-1 uppercase tracking-wider">The Stats</div>
            <p className="font-sans text-lg leading-relaxed whitespace-pre-wrap mt-4" data-testid="text-bio">{profile.bio}</p>
          </div>
        )}
        
      </div>
      
      <footer className="py-8 text-center mt-auto">
        <Link href="/" className="font-display text-xl uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors" data-testid="link-footer-home">
          POWERED BY KIXXME
        </Link>
      </footer>
    </div>
  );
}
