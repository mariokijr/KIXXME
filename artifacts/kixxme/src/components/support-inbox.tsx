import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  Search,
  Loader2,
  BadgeCheck,
  Crown,
  Gem,
  ChevronLeft,
  ChevronRight,
  Users,
} from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  useListSupportInboxUsers,
  getListSupportInboxUsersQueryKey,
  SupportInboxUser,
} from "@workspace/api-client-react";

const PAGE_SIZE = 30;

function timeAgo(iso?: string | null) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

/**
 * Operator-only support console rendered inside the Mensajes tab for the system
 * support account. Lists every real user (Gold → Plus → free), searchable and
 * paged, each linking to the canonical support thread for that user.
 */
export default function SupportInbox() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(0);
  }, [debounced]);

  const params = {
    ...(debounced ? { q: debounced } : {}),
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  };

  const { data, isLoading, isFetching } = useListSupportInboxUsers(params, {
    query: {
      queryKey: getListSupportInboxUsersQueryKey(params),
      refetchInterval: 15000,
      placeholderData: (prev) => prev,
    },
  });

  const users = data?.users ?? [];
  const total = data?.total ?? 0;
  const canPrev = page > 0;
  const canNext = (page + 1) * PAGE_SIZE < total;

  return (
    <div className="flex flex-col h-full">
      <header
        className="sticky top-0 z-20 px-4 py-3 border-b border-border/30 space-y-3"
        style={{ background: "rgba(8,7,18,0.9)", backdropFilter: "blur(20px)" }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl tracking-wide">Soporte</h1>
            <p className="font-sans text-xs text-muted-foreground">
              {total} {total === 1 ? "usuario" : "usuarios"}
            </p>
          </div>
          <div className="w-9 h-9 flex items-center justify-center rounded-xl border border-border/40 text-muted-foreground" style={{ background: "rgba(255,255,255,0.04)" }}>
            <Users className="w-4 h-4" />
          </div>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o ciudad…"
            className="pl-9 h-10"
            data-testid="input-support-inbox-search"
          />
        </div>
      </header>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : users.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-3 py-16">
          <Users className="w-10 h-10 text-muted-foreground" />
          <p className="font-sans text-sm text-muted-foreground">
            {debounced
              ? "No hay usuarios que coincidan con tu búsqueda."
              : "Aún no hay usuarios."}
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {users.map((u) => (
            <UserRow key={u.id} user={u} />
          ))}

          {(canPrev || canNext) && (
            <div className="flex items-center justify-between px-4 py-4">
              <button
                type="button"
                onClick={() => canPrev && setPage((p) => p - 1)}
                disabled={!canPrev || isFetching}
                className="h-9 px-3 flex items-center gap-1.5 rounded-xl border border-border/40 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                style={{ background: "rgba(255,255,255,0.04)" }}
                data-testid="button-support-inbox-prev"
              >
                <ChevronLeft className="w-4 h-4" />
                Anterior
              </button>
              <span className="font-sans text-xs text-muted-foreground">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} de {total}
              </span>
              <button
                type="button"
                onClick={() => canNext && setPage((p) => p + 1)}
                disabled={!canNext || isFetching}
                className="h-9 px-3 flex items-center gap-1.5 rounded-xl border border-border/40 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                style={{ background: "rgba(255,255,255,0.04)" }}
                data-testid="button-support-inbox-next"
              >
                Siguiente
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PlanBadge({ plan }: { plan: SupportInboxUser["plan"] }) {
  if (plan === "gold") {
    return (
      <span className="flex-shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-display tracking-wide text-yellow-300 border border-yellow-500/30" style={{ background: "rgba(234,179,8,0.1)" }}>
        <Crown className="w-3 h-3" />
        Gold
      </span>
    );
  }
  if (plan === "plus") {
    return (
      <span className="flex-shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-display tracking-wide text-sky-300 border border-sky-500/30" style={{ background: "rgba(56,189,248,0.1)" }}>
        <Gem className="w-3 h-3" />
        Plus
      </span>
    );
  }
  return null;
}

function StateBadge({ state }: { state: SupportInboxUser["state"] }) {
  if (state === "active") return null;
  const label =
    state === "suspended"
      ? "Suspendido"
      : state === "banned"
        ? "Baneado"
        : "Eliminado";
  return (
    <span className="flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-sans text-red-300 border border-red-500/30" style={{ background: "rgba(239,68,68,0.1)" }}>
      {label}
    </span>
  );
}

function UserRow({ user }: { user: SupportInboxUser }) {
  const initials = (user.username || "?").slice(0, 2).toUpperCase();
  return (
    <Link href={`/support-inbox/${user.id}`}>
      <button
        className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-border/20 hover:bg-white/[0.02] transition-colors text-left"
        data-testid={`row-support-user-${user.id}`}
      >
        <div className="relative flex-shrink-0">
          <Avatar className="w-12 h-12 rounded-xl border border-border/30">
            {user.avatarUrl && <AvatarImage src={user.avatarUrl} className="object-cover" />}
            <AvatarFallback className="font-display text-lg bg-card text-primary">{initials}</AvatarFallback>
          </Avatar>
          {user.isOnline && (
            <span
              className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2"
              style={{ background: "hsl(142,71%,45%)", borderColor: "hsl(238,25%,6%)" }}
            />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-display text-base text-foreground tracking-wide truncate">
              {user.username || "Sin nombre"}
            </span>
            {user.isVerified && <BadgeCheck className="w-4 h-4 text-sky-400 flex-shrink-0" />}
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <PlanBadge plan={user.plan} />
            <StateBadge state={user.state} />
            {user.plan === "free" && user.state === "active" && (
              <span className="font-sans text-xs text-muted-foreground">
                {user.isOnline ? "En línea" : timeAgo(user.lastActiveAt) || "Usuario"}
              </span>
            )}
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      </button>
    </Link>
  );
}
