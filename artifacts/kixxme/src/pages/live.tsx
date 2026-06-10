import React, { useState } from "react";
import { useLocation } from "wouter";
import {
  useGetLiveState,
  getGetLiveStateQueryKey,
  useJoinLiveQueue,
  useLeaveLiveQueue,
  useAcceptLiveCall,
  useDeclineLiveCall,
  useCancelLiveCall,
  useEndLiveCall,
  useBlockProfile,
  useCreateSupportReport,
  type LiveState,
  type LiveCall,
  type LiveQueueRequestScope,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { KixxMeLogo } from "@/components/brand/kixxme-logo";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneOff,
  Crown,
  Flag,
  Ban,
  Loader2,
  Phone,
  X,
  Search,
  Minus,
  Plus,
} from "lucide-react";

const SCOPES: { value: LiveQueueRequestScope; label: string; emoji: string }[] =
  [
    { value: "nearby", label: "Cerca de mí", emoji: "📍" },
    { value: "city", label: "Mi ciudad", emoji: "🏙️" },
    { value: "spain", label: "España", emoji: "🇪🇸" },
    { value: "europe", label: "Europa", emoji: "🌍" },
    { value: "worldwide", label: "Todo el mundo", emoji: "🌐" },
  ];

const AGE_MIN = 18;
const AGE_MAX = 99;

function partnerName(call: LiveCall): string {
  return call.partner.username || "Alguien";
}

function initialsOf(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

export default function Live() {
  const [, setLocation] = useLocation();
  const { session } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [scope, setScope] = useState<LiveQueueRequestScope>("nearby");
  const [ageMin, setAgeMin] = useState(18);
  const [ageMax, setAgeMax] = useState(45);

  // Local-only media UI state. There is no media plane in this scaffold, so
  // these toggles are purely cosmetic placeholders for the future WebRTC wiring.
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);

  const { data, isLoading } = useGetLiveState({
    query: {
      queryKey: getGetLiveStateQueryKey(),
      enabled: !!session,
      // Poll faster while a call is live or while searching; slower when idle
      // (still polling so incoming private invites surface promptly).
      refetchInterval: (query) => {
        const s = query.state.data as LiveState | undefined;
        if (!s) return 4000;
        if (s.call) return 2000;
        if (s.queueStatus === "searching") return 2500;
        return 6000;
      },
    },
  });

  const refresh = () =>
    qc.invalidateQueries({ queryKey: getGetLiveStateQueryKey() });

  const joinQueue = useJoinLiveQueue();
  const leaveQueue = useLeaveLiveQueue();
  const acceptCall = useAcceptLiveCall();
  const declineCall = useDeclineLiveCall();
  const cancelCall = useCancelLiveCall();
  const endCall = useEndLiveCall();
  const blockUser = useBlockProfile();
  const reportUser = useCreateSupportReport();

  const onError = (msg: string) => (err: any) =>
    toast({
      title: msg,
      description: err?.data?.error ?? undefined,
      variant: "destructive",
    });

  function startSearch() {
    if (ageMin > ageMax) {
      toast({ title: "Rango de edad no válido", variant: "destructive" });
      return;
    }
    joinQueue.mutate(
      { data: { scope, ageMin, ageMax } },
      { onSettled: refresh, onError: onError("No se pudo iniciar la búsqueda") },
    );
  }

  function stopSearch() {
    leaveQueue.mutate(undefined, { onSettled: refresh });
  }

  function accept(call: LiveCall) {
    acceptCall.mutate(
      { id: call.id },
      { onSettled: refresh, onError: onError("No se pudo aceptar") },
    );
  }

  function decline(call: LiveCall) {
    declineCall.mutate({ id: call.id }, { onSettled: refresh });
  }

  function cancel(call: LiveCall) {
    cancelCall.mutate({ id: call.id }, { onSettled: refresh });
  }

  function hangUp(call: LiveCall) {
    endCall.mutate(
      { id: call.id, data: { reason: "hangup" } },
      { onSettled: refresh },
    );
  }

  function reportPartner(call: LiveCall) {
    reportUser.mutate(
      {
        data: {
          category: "profile",
          targetUserId: call.partner.id,
          subject: "Reporte desde KixxMe Live",
          message: `Reporte de ${partnerName(call)} durante una videollamada.`,
        },
      },
      {
        onSuccess: () =>
          toast({
            title: "Usuario reportado",
            description: "Gracias, lo revisaremos.",
          }),
        onError: onError("No se pudo reportar"),
      },
    );
  }

  function blockPartner(call: LiveCall) {
    blockUser.mutate(
      { id: call.partner.id },
      {
        onSuccess: () => {
          toast({ title: "Usuario bloqueado" });
          endCall.mutate(
            { id: call.id, data: { reason: "blocked" } },
            { onSettled: refresh },
          );
        },
        onError: onError("No se pudo bloquear"),
      },
    );
  }

  // --- Loading -------------------------------------------------------------
  if (isLoading || !data) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <Loader2 className="w-7 h-7 text-primary animate-spin" />
      </div>
    );
  }

  const call = data.call ?? null;

  // An in-progress call always renders first — even if the plan lapsed
  // mid-call (e.g. a webhook downgrade) the user must keep the End Call UI.

  // --- Active in-call ------------------------------------------------------
  if (call && call.status === "active") {
    return (
      <InCall
        call={call}
        camOn={camOn}
        micOn={micOn}
        onToggleCam={() => setCamOn((v) => !v)}
        onToggleMic={() => setMicOn((v) => !v)}
        onEnd={() => hangUp(call)}
        onReport={() => reportPartner(call)}
        onBlock={() => blockPartner(call)}
        ending={endCall.isPending}
      />
    );
  }

  // --- Ringing -------------------------------------------------------------
  if (call && call.status === "ringing") {
    const myAccepted =
      call.role === "caller" ? call.callerAccepted : call.calleeAccepted;
    return (
      <Ringing
        call={call}
        myAccepted={myAccepted}
        onAccept={() => accept(call)}
        onDecline={() => decline(call)}
        onCancel={() => cancel(call)}
        busy={
          acceptCall.isPending || declineCall.isPending || cancelCall.isPending
        }
      />
    );
  }

  // --- Paywall (non-Gold, and no call to keep alive) -----------------------
  if (!data.canAccess) {
    return <Paywall onUpgrade={() => setLocation("/premium")} />;
  }

  // --- Searching -----------------------------------------------------------
  if (data.queueStatus === "searching") {
    return <Searching onCancel={stopSearch} canceling={leaveQueue.isPending} />;
  }

  // --- Idle + filters ------------------------------------------------------
  return (
    <Idle
      scope={scope}
      setScope={setScope}
      ageMin={ageMin}
      ageMax={ageMax}
      setAgeMin={setAgeMin}
      setAgeMax={setAgeMax}
      onSearch={startSearch}
      searching={joinQueue.isPending}
    />
  );
}

// ===========================================================================
// Sub-views
// ===========================================================================

function Header() {
  return (
    <div className="flex items-center justify-center gap-2.5 pt-9 pb-1">
      <KixxMeLogo size={30} />
      <h1 className="font-display text-3xl tracking-tight text-gradient-brand">
        KIXXME LIVE
      </h1>
    </div>
  );
}

function Paywall({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <div className="min-h-full flex flex-col items-center justify-center px-6 text-center">
      <div
        className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6"
        style={{
          background: "linear-gradient(135deg, hsl(38,95%,52%), hsl(25,100%,50%))",
          boxShadow: "0 0 50px rgba(234,179,8,0.4)",
        }}
      >
        <Video className="w-9 h-9 text-white" />
      </div>
      <div className="flex items-center gap-2 mb-3">
        <Crown className="w-5 h-5 text-yellow-400" />
        <h1 className="font-display text-3xl tracking-tight text-yellow-400">
          KIXXME LIVE
        </h1>
      </div>
      <p className="font-sans text-sm text-muted-foreground leading-relaxed max-w-sm mb-8">
        KixxMe Live es exclusivo para miembros Gold. Desbloquea videollamadas
        aleatorias, llamadas privadas y conexiones más intensas dentro de
        KixxMe.
      </p>
      <button
        onClick={onUpgrade}
        className="w-full max-w-sm py-4 rounded-xl font-display text-xl tracking-widest text-white hover:opacity-90 transition-opacity border-0"
        style={{
          background: "linear-gradient(135deg, hsl(38,95%,52%), hsl(25,100%,50%))",
          boxShadow: "0 8px 30px rgba(234,179,8,0.3)",
        }}
        data-testid="button-upgrade-gold"
      >
        👑 Hazte Gold
      </button>
    </div>
  );
}

function Stepper({
  label,
  value,
  onDec,
  onInc,
}: {
  label: string;
  value: number;
  onDec: () => void;
  onInc: () => void;
}) {
  return (
    <div className="flex-1">
      <p className="font-sans text-xs text-muted-foreground mb-2">{label}</p>
      <div
        className="flex items-center justify-between rounded-xl border border-border/30 px-2 py-1.5"
        style={{ background: "rgba(13,11,26,0.8)" }}
      >
        <button
          onClick={onDec}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-primary hover:bg-white/5 transition-colors"
        >
          <Minus className="w-4 h-4" />
        </button>
        <span className="font-display text-xl text-foreground tabular-nums">
          {value}
        </span>
        <button
          onClick={onInc}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-primary hover:bg-white/5 transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function Idle({
  scope,
  setScope,
  ageMin,
  ageMax,
  setAgeMin,
  setAgeMax,
  onSearch,
  searching,
}: {
  scope: LiveQueueRequestScope;
  setScope: (s: LiveQueueRequestScope) => void;
  ageMin: number;
  ageMax: number;
  setAgeMin: (n: number) => void;
  setAgeMax: (n: number) => void;
  onSearch: () => void;
  searching: boolean;
}) {
  return (
    <div className="min-h-full pb-6">
      <Header />
      <p className="text-center font-sans text-sm text-muted-foreground px-6 mb-6">
        Conecta cara a cara con chicos al instante.
      </p>

      <div className="px-4 space-y-5">
        <div
          className="rounded-2xl border border-border/30 p-5"
          style={{ background: "rgba(13,11,26,0.6)" }}
        >
          <p className="font-display text-lg tracking-wide mb-3">¿A quién buscas?</p>
          <div className="grid grid-cols-2 gap-2">
            {SCOPES.map((s) => {
              const active = scope === s.value;
              return (
                <button
                  key={s.value}
                  onClick={() => setScope(s.value)}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-all"
                  style={
                    active
                      ? {
                          borderColor: "transparent",
                          background:
                            "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
                          color: "white",
                        }
                      : {
                          borderColor: "hsl(240 10% 20% / 0.5)",
                          background: "rgba(255,255,255,0.02)",
                          color: "hsl(240,10%,70%)",
                        }
                  }
                  data-testid={`scope-${s.value}`}
                >
                  <span className="text-base">{s.emoji}</span>
                  <span className="font-sans text-sm font-medium">{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div
          className="rounded-2xl border border-border/30 p-5"
          style={{ background: "rgba(13,11,26,0.6)" }}
        >
          <p className="font-display text-lg tracking-wide mb-3">Rango de edad</p>
          <div className="flex items-end gap-4">
            <Stepper
              label="Mínima"
              value={ageMin}
              onDec={() => setAgeMin(Math.max(AGE_MIN, ageMin - 1))}
              onInc={() => setAgeMin(Math.min(ageMax, ageMin + 1))}
            />
            <span className="text-muted-foreground pb-3">—</span>
            <Stepper
              label="Máxima"
              value={ageMax}
              onDec={() => setAgeMax(Math.max(ageMin, ageMax - 1))}
              onInc={() => setAgeMax(Math.min(AGE_MAX, ageMax + 1))}
            />
          </div>
        </div>

        <button
          onClick={onSearch}
          disabled={searching}
          className="w-full h-14 rounded-xl font-display text-xl tracking-widest text-white hover:opacity-90 transition-opacity border-0 disabled:opacity-60 flex items-center justify-center gap-2"
          style={{
            background:
              "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
            boxShadow: "0 8px 30px rgba(168,85,247,0.3)",
          }}
          data-testid="button-search-call"
        >
          {searching ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>🔥 Buscar videollamada</>
          )}
        </button>
      </div>
    </div>
  );
}

function Searching({
  onCancel,
  canceling,
}: {
  onCancel: () => void;
  canceling: boolean;
}) {
  return (
    <div className="min-h-full flex flex-col items-center justify-center px-6 text-center">
      <div className="relative mb-8">
        <span
          className="absolute inset-0 rounded-full animate-ping"
          style={{ background: "rgba(168,85,247,0.25)" }}
        />
        <div
          className="relative w-24 h-24 rounded-full flex items-center justify-center"
          style={{
            background:
              "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
            boxShadow: "0 0 50px rgba(168,85,247,0.5)",
          }}
        >
          <Search className="w-10 h-10 text-white" />
        </div>
      </div>
      <h2 className="font-display text-2xl tracking-wide text-gradient-brand mb-2">
        Buscando conexión…
      </h2>
      <p className="font-sans text-sm text-muted-foreground mb-10 max-w-xs">
        Te emparejaremos con alguien compatible en cuanto esté disponible.
      </p>
      <button
        onClick={onCancel}
        disabled={canceling}
        className="px-8 h-12 rounded-xl font-sans font-medium text-foreground border border-border/40 hover:bg-white/5 transition-colors disabled:opacity-60 flex items-center gap-2"
        data-testid="button-cancel-search"
      >
        {canceling ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
        Cancelar
      </button>
    </div>
  );
}

function Ringing({
  call,
  myAccepted,
  onAccept,
  onDecline,
  onCancel,
  busy,
}: {
  call: LiveCall;
  myAccepted: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const name = partnerName(call);
  const waiting = myAccepted; // I accepted, awaiting the other side.

  let heading: string;
  if (waiting) heading = `Esperando a ${name}…`;
  else if (call.type === "private") heading = `${name} te está llamando`;
  else heading = "Videollamada encontrada";

  return (
    <div className="min-h-full flex flex-col items-center justify-center px-6 text-center">
      <div className="relative mb-6">
        <span
          className="absolute inset-0 rounded-full animate-ping"
          style={{ background: "rgba(236,72,153,0.25)" }}
        />
        <Avatar className="relative w-28 h-28 rounded-full border-2 border-primary/50">
          {call.partner.avatar_url && (
            <AvatarImage src={call.partner.avatar_url} className="object-cover" />
          )}
          <AvatarFallback className="font-display text-2xl bg-card text-primary">
            {initialsOf(name)}
          </AvatarFallback>
        </Avatar>
      </div>

      <h2 className="font-display text-2xl tracking-wide text-foreground mb-1">
        {name}
        {call.partner.age ? `, ${call.partner.age}` : ""}
      </h2>
      <p className="font-sans text-sm text-muted-foreground mb-10">{heading}</p>

      {waiting ? (
        <button
          onClick={onCancel}
          disabled={busy}
          className="w-16 h-16 rounded-full flex items-center justify-center text-white disabled:opacity-60"
          style={{ background: "hsl(0,75%,55%)" }}
          data-testid="button-cancel-call"
        >
          <PhoneOff className="w-6 h-6" />
        </button>
      ) : (
        <div className="flex items-center gap-10">
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={onDecline}
              disabled={busy}
              className="w-16 h-16 rounded-full flex items-center justify-center text-white disabled:opacity-60"
              style={{ background: "hsl(0,75%,55%)" }}
              data-testid="button-decline-call"
            >
              <PhoneOff className="w-6 h-6" />
            </button>
            <span className="font-sans text-xs text-muted-foreground">Rechazar</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={onAccept}
              disabled={busy}
              className="w-16 h-16 rounded-full flex items-center justify-center text-white disabled:opacity-60"
              style={{
                background: "hsl(142,71%,42%)",
                boxShadow: "0 0 30px rgba(34,197,94,0.4)",
              }}
              data-testid="button-accept-call"
            >
              {busy ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <Phone className="w-6 h-6" />
              )}
            </button>
            <span className="font-sans text-xs text-muted-foreground">Aceptar</span>
          </div>
        </div>
      )}
    </div>
  );
}

function CtrlButton({
  onClick,
  active,
  danger,
  disabled,
  children,
  testId,
}: {
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className="w-12 h-12 rounded-full flex items-center justify-center transition-colors disabled:opacity-60"
      style={
        danger
          ? { background: "hsl(0,75%,55%)", color: "white" }
          : active
            ? { background: "rgba(255,255,255,0.12)", color: "white" }
            : { background: "rgba(255,255,255,0.04)", color: "hsl(240,10%,60%)" }
      }
    >
      {children}
    </button>
  );
}

function InCall({
  call,
  camOn,
  micOn,
  onToggleCam,
  onToggleMic,
  onEnd,
  onReport,
  onBlock,
  ending,
}: {
  call: LiveCall;
  camOn: boolean;
  micOn: boolean;
  onToggleCam: () => void;
  onToggleMic: () => void;
  onEnd: () => void;
  onReport: () => void;
  onBlock: () => void;
  ending: boolean;
}) {
  const name = partnerName(call);
  return (
    <div className="min-h-full flex flex-col">
      {/* Video surface placeholder — no media plane in this scaffold. */}
      <div
        className="flex-1 relative flex flex-col items-center justify-center overflow-hidden"
        style={{
          background:
            "radial-gradient(ellipse 90% 60% at 50% 30%, hsl(273 40% 16%) 0%, hsl(238 30% 6%) 70%)",
        }}
      >
        <Avatar className="w-28 h-28 rounded-full border-2 border-primary/40 mb-4 opacity-90">
          {call.partner.avatar_url && (
            <AvatarImage src={call.partner.avatar_url} className="object-cover" />
          )}
          <AvatarFallback className="font-display text-2xl bg-card text-primary">
            {initialsOf(name)}
          </AvatarFallback>
        </Avatar>
        <h2 className="font-display text-2xl tracking-wide text-foreground">
          {name}
        </h2>
        <div className="flex items-center gap-1.5 mt-2">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="font-sans text-xs text-green-400">En llamada</span>
        </div>

        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full"
          style={{ background: "rgba(0,0,0,0.4)" }}
        >
          <span className="font-sans text-[11px] text-muted-foreground">
            Vídeo no disponible en esta versión · próximamente
          </span>
        </div>

        {/* Self preview placeholder */}
        <div
          className="absolute top-4 right-4 w-20 h-28 rounded-xl border border-white/10 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.5)" }}
        >
          {camOn ? (
            <Video className="w-5 h-5 text-muted-foreground" />
          ) : (
            <VideoOff className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Controls */}
      <div
        className="flex-shrink-0 px-6 py-6 border-t border-border/20"
        style={{ background: "rgba(8,7,18,0.95)" }}
      >
        <div className="flex items-center justify-center gap-3">
          <CtrlButton onClick={onToggleMic} active={micOn} testId="button-toggle-mic">
            {micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </CtrlButton>
          <CtrlButton onClick={onToggleCam} active={camOn} testId="button-toggle-cam">
            {camOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </CtrlButton>
          <button
            onClick={onEnd}
            disabled={ending}
            data-testid="button-end-call"
            className="w-16 h-12 rounded-full flex items-center justify-center text-white disabled:opacity-60"
            style={{ background: "hsl(0,75%,55%)" }}
          >
            {ending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <PhoneOff className="w-6 h-6" />
            )}
          </button>
          <CtrlButton onClick={onReport} testId="button-report-call">
            <Flag className="w-5 h-5" />
          </CtrlButton>
          <CtrlButton onClick={onBlock} testId="button-block-call">
            <Ban className="w-5 h-5" />
          </CtrlButton>
        </div>
      </div>
    </div>
  );
}
