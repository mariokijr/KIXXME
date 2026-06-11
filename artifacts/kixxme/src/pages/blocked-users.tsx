import React from "react";
import { useLocation } from "wouter";
import {
  useListBlockedProfiles,
  getListBlockedProfilesQueryKey,
  useUnblockProfile,
  type PublicProfile,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, Ban, ShieldOff, Loader2 } from "lucide-react";
import { gradFor, initialsFor } from "@/lib/profile-format";

export default function BlockedUsers() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();

  const queryKey = getListBlockedProfilesQueryKey();
  const { data: blocked = [], isLoading } = useListBlockedProfiles({
    query: { queryKey },
  });
  const unblock = useUnblockProfile();
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  const handleUnblock = (u: PublicProfile) => {
    setPendingId(u.id);
    // Optimistic: drop the row immediately.
    const prev = qc.getQueryData<PublicProfile[]>(queryKey);
    qc.setQueryData<PublicProfile[]>(
      queryKey,
      (cur) => (cur ?? []).filter((p) => p.id !== u.id),
    );
    unblock.mutate(
      { id: u.id },
      {
        onSuccess: () => {
          toast({ title: "Usuario desbloqueado" });
        },
        onError: () => {
          if (prev) qc.setQueryData(queryKey, prev);
          toast({ title: "No se pudo desbloquear", variant: "destructive" });
        },
        onSettled: () => {
          setPendingId(null);
          qc.invalidateQueries({ queryKey });
        },
      },
    );
  };

  return (
    <div className="min-h-full pb-10">
      <header
        className="px-4 py-3 flex items-center gap-3 border-b border-border/30 sticky top-0 z-10"
        style={{ background: "rgba(8,7,18,0.7)", backdropFilter: "blur(12px)" }}
      >
        <button
          type="button"
          onClick={() => setLocation("/settings")}
          className="w-9 h-9 flex items-center justify-center rounded-xl border border-border/40 text-muted-foreground hover:text-foreground transition-colors"
          style={{ background: "rgba(255,255,255,0.04)" }}
          data-testid="button-blocked-back"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <Ban className="w-5 h-5 text-primary" />
          <h1 className="font-display text-2xl tracking-wide">
            Usuarios bloqueados
          </h1>
        </div>
      </header>

      <div className="px-5 pt-6">
        <p className="font-sans text-sm text-muted-foreground mb-5">
          Las personas que bloqueas no pueden verte ni escribirte, y tú no las
          verás en ninguna parte. Puedes desbloquearlas cuando quieras.
        </p>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : blocked.length === 0 ? (
          <div
            className="border border-border/40 rounded-2xl p-8 flex flex-col items-center text-center gap-3"
            style={{ background: "rgba(13,11,26,0.7)" }}
            data-testid="empty-blocked"
          >
            <ShieldOff className="w-10 h-10 text-muted-foreground/60" />
            <h3 className="font-display text-lg tracking-wide text-foreground">
              No has bloqueado a nadie
            </h3>
            <p className="font-sans text-sm text-muted-foreground">
              Cuando bloquees a alguien, aparecerá aquí.
            </p>
          </div>
        ) : (
          <ul className="space-y-3" data-testid="list-blocked">
            {blocked.map((u) => (
              <li
                key={u.id}
                className="flex items-center gap-3 border border-border/40 rounded-2xl p-3"
                style={{ background: "rgba(13,11,26,0.7)" }}
                data-testid={`row-blocked-${u.id}`}
              >
                <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center">
                  {u.avatar_url ? (
                    <img
                      src={u.avatar_url}
                      alt={u.username ?? ""}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center font-display text-lg text-white"
                      style={{ background: gradFor(u.id) }}
                    >
                      {initialsFor(u.username)}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-display text-base tracking-wide text-foreground truncate">
                    {u.username ?? "Usuario"}
                  </p>
                  {(u.age || u.city) && (
                    <p className="font-sans text-xs text-muted-foreground truncate">
                      {[u.age, u.city].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleUnblock(u)}
                  disabled={pendingId === u.id}
                  className="flex-shrink-0 h-9 px-4 rounded-xl border border-primary/40 flex items-center justify-center gap-1.5 font-display text-sm tracking-wide text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                  style={{ background: "rgba(168,85,247,0.08)" }}
                  data-testid={`button-unblock-${u.id}`}
                >
                  {pendingId === u.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : null}
                  Desbloquear
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
