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
import { LogOut, Upload, Share2 } from "lucide-react";

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
        toast({ title: "Profile updated" });
        queryClient.setQueryData(getGetMyProfileQueryKey(), data);
      },
      onError: (err: any) => {
        const msg = err?.data?.error ?? err?.message ?? "Unknown error";
        toast({ title: "Failed to update profile", description: msg, variant: "destructive" });
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
          toast({ title: "Avatar updated" });
        },
        onError: (err: any) => {
          const msg = err?.data?.error ?? err?.message ?? "Unknown error";
          toast({ title: "Failed to upload avatar", description: msg, variant: "destructive" });
        }
      });
    };
    reader.readAsDataURL(file);
  };

  const copyLink = () => {
    if (!profile) return;
    const url = `${window.location.origin}/profile/${profile.id}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link copied!" });
  };

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <span className="text-2xl font-display uppercase animate-pulse">Loading...</span>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background gap-4 p-8 text-center">
        <h2 className="text-3xl font-display uppercase text-primary">Setting up your locker...</h2>
        <p className="text-muted-foreground font-sans">
          {error
            ? `Error: ${(error as any)?.data?.error ?? (error as any)?.message ?? "Unknown error"}`
            : "Your profile is being created. Try refreshing in a moment."}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-6 py-3 border-2 border-primary text-primary font-display text-xl uppercase hover:bg-primary hover:text-primary-foreground transition-colors"
        >
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background text-foreground pb-20">
      <header className="border-b-4 border-border p-4 flex justify-between items-center bg-card">
        <h1 className="text-3xl font-display uppercase m-0 leading-none">KIXXME</h1>
        <Button variant="ghost" size="icon" onClick={logout} data-testid="button-logout">
          <LogOut className="h-6 w-6" />
        </Button>
      </header>

      <main className="max-w-2xl mx-auto p-6 space-y-10 mt-8">

        <div className="flex flex-col items-center space-y-6">
          <div className="relative group cursor-pointer" data-testid="avatar-container">
            <Avatar className="w-40 h-40 border-4 border-primary rounded-none shadow-[8px_8px_0_0_hsl(var(--primary))] bg-muted">
              {profile.avatar_url && <AvatarImage src={profile.avatar_url} className="object-cover" />}
              <AvatarFallback className="font-display text-5xl uppercase bg-card">
                {profile.username?.slice(0, 2) || "KX"}
              </AvatarFallback>
            </Avatar>
            <label className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
              <Upload className="w-10 h-10 text-primary" />
              <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} data-testid="input-avatar-upload" />
            </label>
            {uploadAvatar.isPending && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                <span className="font-display text-primary animate-pulse text-xl uppercase">Uploading...</span>
              </div>
            )}
          </div>

          <Button onClick={copyLink} variant="outline" className="border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground font-display text-lg uppercase tracking-wide h-12 px-6 rounded-none" data-testid="button-copy-link">
            <Share2 className="w-5 h-5 mr-2" /> Share Profile
          </Button>
        </div>

        <div className="bg-card border-4 border-border p-8 space-y-8 shadow-[8px_8px_0_0_hsl(var(--border))]">

          <div className="space-y-3">
            <label className="font-display text-2xl uppercase tracking-wide text-primary">Username</label>
            <Input value={username} onChange={e => setUsername(e.target.value)}
              className="text-xl p-6 rounded-none border-2 focus-visible:ring-primary font-sans h-14"
              data-testid="input-edit-username" />
          </div>

          <div className="space-y-3">
            <label className="font-display text-2xl uppercase tracking-wide text-primary">Bio</label>
            <Textarea value={bio} onChange={e => setBio(e.target.value)}
              className="text-lg p-4 rounded-none border-2 focus-visible:ring-primary font-sans min-h-[120px] resize-none"
              placeholder="Tell the world about your stats, PRs, and goals..."
              data-testid="input-edit-bio" />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-3">
              <label className="font-display text-2xl uppercase tracking-wide text-primary">Age</label>
              <Input type="number" min={1} max={120} value={age} onChange={e => setAge(e.target.value)}
                className="text-xl p-6 rounded-none border-2 focus-visible:ring-primary font-sans h-14"
                placeholder="25" data-testid="input-edit-age" />
            </div>
            <div className="space-y-3">
              <label className="font-display text-2xl uppercase tracking-wide text-primary">Gender</label>
              <Input value={gender} onChange={e => setGender(e.target.value)}
                className="text-xl p-6 rounded-none border-2 focus-visible:ring-primary font-sans h-14"
                placeholder="e.g. Male" data-testid="input-edit-gender" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-3">
              <label className="font-display text-2xl uppercase tracking-wide text-primary">City</label>
              <Input value={city} onChange={e => setCity(e.target.value)}
                className="text-xl p-6 rounded-none border-2 focus-visible:ring-primary font-sans h-14"
                placeholder="New York" data-testid="input-edit-city" />
            </div>
            <div className="space-y-3">
              <label className="font-display text-2xl uppercase tracking-wide text-primary">Location</label>
              <Input value={location} onChange={e => setLocation(e.target.value)}
                className="text-xl p-6 rounded-none border-2 focus-visible:ring-primary font-sans h-14"
                placeholder="USA" data-testid="input-edit-location" />
            </div>
          </div>

          <Button
            onClick={handleSave}
            disabled={updateProfile.isPending || !isDirty}
            className="w-full h-16 rounded-none font-display text-2xl uppercase tracking-wider bg-primary text-primary-foreground hover:bg-primary/90"
            data-testid="button-save-profile"
          >
            {updateProfile.isPending ? "Saving..." : "Update Locker"}
          </Button>
        </div>
      </main>
    </div>
  );
}
