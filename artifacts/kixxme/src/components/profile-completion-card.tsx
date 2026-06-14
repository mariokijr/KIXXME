import {
  useGetMyProfile,
  getGetMyProfileQueryKey,
  useListMyPhotos,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { CheckCircle2, Circle, Sparkles } from "lucide-react";
import { computeProfileCompletion } from "@/lib/profile-completion";

/**
 * Shows a progress ring for how complete the user's profile is, plus a short
 * checklist of what's still missing. The score is computed client-side from the
 * (cached) profile + photo list — see `lib/profile-completion.ts`.
 */
export function ProfileCompletionCard() {
  const { session } = useAuth();
  const { data: profile } = useGetMyProfile({
    query: { enabled: !!session, queryKey: getGetMyProfileQueryKey() },
  });
  const { data: photos = [] } = useListMyPhotos();

  if (!profile) return null;

  const completion = computeProfileCompletion({
    username: profile.username,
    bio: profile.bio,
    age: profile.age,
    city: profile.city,
    gender: profile.gender,
    location: profile.location,
    avatar_url: profile.avatar_url,
    is_verified: profile.is_verified,
    role: profile.role,
    looking_for: profile.looking_for,
    orientation: profile.orientation,
    height_cm: profile.height_cm,
    zodiac_sign: profile.zodiac_sign,
    alcohol: profile.alcohol,
    exercise: profile.exercise,
    photoCount: photos.length,
  });

  const R = 26;
  const C = 2 * Math.PI * R;
  const dash = (completion.percent / 100) * C;

  return (
    <div
      className="mx-4 mb-4 border border-border/40 rounded-2xl p-5"
      style={{ background: "rgba(13,11,26,0.7)" }}
      data-testid="card-profile-completion"
    >
      <div className="flex items-center gap-4">
        <div className="relative flex-shrink-0" style={{ width: 64, height: 64 }}>
          <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
            <circle
              cx="32"
              cy="32"
              r={R}
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="6"
            />
            <circle
              cx="32"
              cy="32"
              r={R}
              fill="none"
              stroke="url(#completion-grad)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${C}`}
            />
            <defs>
              <linearGradient id="completion-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="hsl(273,85%,60%)" />
                <stop offset="100%" stopColor="hsl(330,85%,58%)" />
              </linearGradient>
            </defs>
          </svg>
          <span className="absolute inset-0 flex items-center justify-center font-display text-base tracking-wide text-foreground">
            {completion.percent}%
          </span>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
            <h3 className="font-display text-lg tracking-widest text-foreground">
              {completion.complete ? "Perfil completo" : "Completa tu perfil"}
            </h3>
          </div>
          <p className="font-sans text-sm text-muted-foreground mt-0.5">
            {completion.complete
              ? "¡Tu perfil está al 100%! Así recibes más visitas y likes."
              : `${completion.completed} de ${completion.total} pasos · un perfil completo recibe más likes.`}
          </p>
        </div>
      </div>

      {!completion.complete && (
        <ul className="mt-4 space-y-2" data-testid="list-completion-missing">
          {completion.missing.slice(0, 4).map((item) => (
            <li
              key={item}
              className="flex items-center gap-2 font-sans text-sm text-foreground/75"
            >
              <Circle className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0" />
              {item}
            </li>
          ))}
          {completion.missing.length > 4 && (
            <li className="flex items-center gap-2 font-sans text-xs text-muted-foreground pl-[22px]">
              y {completion.missing.length - 4} más…
            </li>
          )}
        </ul>
      )}

      {completion.complete && (
        <div className="mt-3 flex items-center gap-2 font-sans text-sm text-green-400">
          <CheckCircle2 className="w-4 h-4" />
          Todo listo. ¡Buen trabajo!
        </div>
      )}
    </div>
  );
}
