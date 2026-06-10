import {
  useGetMyVisitors,
  getGetMyVisitorsQueryKey,
  type VisitorProfile,
} from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Eye, Lock, BadgeCheck, Crown } from "lucide-react";

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days} d`;
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
  });
}

/**
 * "Quién visitó tu perfil". Everyone sees the count; only Plus/Gold
 * (`can_see_visitors`) see the actual visitor identities — free users get a
 * blurred teaser + Premium upsell.
 */
export function VisitorsCard() {
  const { session } = useAuth();
  const [, setLocation] = useLocation();

  const { data, isLoading } = useGetMyVisitors({
    query: { enabled: !!session, queryKey: getGetMyVisitorsQueryKey() },
  });

  if (isLoading || !data) return null;
  const { count, can_see_visitors, visitors } = data;

  return (
    <div
      className="mx-4 mb-4 border border-border/40 rounded-2xl p-5 space-y-4"
      style={{ background: "rgba(13,11,26,0.7)" }}
      data-testid="card-visitors"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Eye className="w-5 h-5 text-primary" />
          <h3 className="font-display text-lg tracking-widest text-foreground">
            Quién visitó tu perfil
          </h3>
        </div>
        <span
          className="px-2.5 py-0.5 rounded-full font-display text-sm tracking-wide text-primary border border-primary/30"
          style={{ background: "rgba(168,85,247,0.1)" }}
          data-testid="text-visitor-count"
        >
          {count}
        </span>
      </div>

      {count === 0 ? (
        <p className="font-sans text-sm text-muted-foreground">
          Todavía nadie ha visitado tu perfil. Sé activo y aparecerás ante más
          gente.
        </p>
      ) : can_see_visitors ? (
        <div className="space-y-2">
          {visitors.map((v) => (
            <VisitorRow
              key={v.id}
              visitor={v}
              onClick={() => setLocation(`/profile/${v.id}`)}
            />
          ))}
        </div>
      ) : (
        <div className="relative">
          {/* Blurred teaser row to hint there are real people behind the lock. */}
          <div
            className="flex items-center gap-3 rounded-xl border border-border/30 p-3 select-none"
            style={{ filter: "blur(6px)", opacity: 0.6 }}
            aria-hidden
          >
            <div className="w-11 h-11 rounded-full bg-primary/20" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-24 rounded bg-foreground/20" />
              <div className="h-2.5 w-16 rounded bg-foreground/10" />
            </div>
          </div>
          <div className="mt-3 flex flex-col items-center text-center gap-2">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center border border-primary/30"
              style={{ background: "rgba(168,85,247,0.1)" }}
            >
              <Lock className="w-4 h-4 text-primary" />
            </div>
            <p className="font-sans text-sm text-foreground/90">
              {count === 1
                ? "1 persona ha visitado tu perfil"
                : `${count} personas han visitado tu perfil`}
            </p>
            <p className="font-sans text-xs text-muted-foreground max-w-xs">
              Desbloquea KixxMe Plus o Gold para ver quién visitó tu perfil.
            </p>
            <button
              type="button"
              onClick={() => setLocation("/premium")}
              className="mt-1 w-full h-11 rounded-xl font-display text-base tracking-widest text-white hover:opacity-90 transition-opacity border-0"
              style={{
                background:
                  "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
              }}
              data-testid="button-unlock-visitors"
            >
              Desbloquear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function VisitorRow({
  visitor,
  onClick,
}: {
  visitor: VisitorProfile;
  onClick: () => void;
}) {
  const meta = [
    visitor.age != null ? `${visitor.age}` : null,
    visitor.city ?? null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 rounded-xl border border-border/30 p-2.5 text-left hover:border-primary/40 transition-colors"
      style={{ background: "rgba(255,255,255,0.02)" }}
      data-testid={`visitor-row-${visitor.id}`}
    >
      <Avatar className="w-11 h-11 border border-border/40">
        {visitor.avatar_url && (
          <AvatarImage src={visitor.avatar_url} className="object-cover" />
        )}
        <AvatarFallback className="font-display text-sm uppercase bg-card text-primary">
          {visitor.username?.slice(0, 2) || "KX"}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-sans text-sm text-foreground truncate">
            {visitor.username ?? "Usuario"}
          </span>
          {visitor.is_verified && (
            <BadgeCheck className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
          )}
          {visitor.plan === "gold" && (
            <Crown className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
          )}
        </div>
        {meta && (
          <p className="font-sans text-xs text-muted-foreground truncate">
            {meta}
          </p>
        )}
      </div>
      <span className="font-sans text-[11px] text-muted-foreground flex-shrink-0">
        {timeAgo(visitor.visited_at)}
      </span>
    </button>
  );
}
