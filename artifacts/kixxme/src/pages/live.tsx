import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  useGetLiveState,
  getGetLiveStateQueryKey,
  useGetDiscoveryStats,
  useJoinLiveQueue,
  useLeaveLiveQueue,
  useAcceptLiveCall,
  useDeclineLiveCall,
  useCancelLiveCall,
  useSkipLiveCall,
  useEndLiveCall,
  useBlockProfile,
  useCreateReport,
  useGetMyProfile,
  getGetMyProfileQueryKey,
  useAckLivePrivacy,
  type LiveState,
  type LiveCall,
  type LiveQueueRequestScope,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/lib/confirm";
import { playSound } from "@/lib/sound";
import {
  useLiveKitCall,
  type LiveKitCall,
  type MediaErrorReason,
} from "@/lib/livekit-room";
import { roleLabel, lookingForLabel } from "@/lib/profile-format";
import { KixxMeLogo } from "@/components/brand/kixxme-logo";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneOff,
  SwitchCamera,
  Crown,
  Flag,
  Ban,
  Loader2,
  Phone,
  X,
  MapPin,
  AlertTriangle,
  Volume2,
  SkipForward,
} from "lucide-react";
import * as SliderPrimitive from "@radix-ui/react-slider";

const SCOPES: {
  value: LiveQueueRequestScope;
  label: string;
  emoji: string;
  desc: string;
}[] = [
  { value: "nearby",    label: "Cerca de mí",  emoji: "📍", desc: "Radio máx. 200 km a tu alrededor" },
  { value: "city",      label: "Mi ciudad",    emoji: "🏙️", desc: "Usuarios de tu ciudad o zona" },
  { value: "spain",     label: "Mi país",      emoji: "🗺️", desc: "Todos los usuarios de tu país" },
  { value: "worldwide", label: "Internacional", emoji: "🌍", desc: "Sin límite geográfico, todo el mundo" },
];

const AGE_MIN = 18;
const AGE_MAX = 70;

async function geocodeCountryName(
  lat: number,
  lon: number,
): Promise<string | null> {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&zoom=3&format=json&accept-language=es`,
      { headers: { "User-Agent": "KixxMe/1.0" } },
    );
    const j = await r.json();
    return (j?.address?.country as string | undefined) ?? null;
  } catch {
    return null;
  }
}

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
  const [ageMin, setAgeMin] = useState(AGE_MIN);
  const [ageMax, setAgeMax] = useState(AGE_MAX);
  const [detectedCountry, setDetectedCountry] = useState<string | null>(null);
  const [showLiveTutorial, setShowLiveTutorial] = useState(true);
  const countryFetchedRef = useRef(false);

  // Local camera/mic intent. Drives both the in-call controls and the LiveKit
  // publish state (see `useLiveKitCall`); defaults on so a connected call starts
  // with video + audio.
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);

  // Tracks which active call we've already played the pre-call countdown for, so
  // it only runs once per call (purely cosmetic, local-only).
  const [countdownDoneFor, setCountdownDoneFor] = useState<string | null>(null);

  const { data: myProfile } = useGetMyProfile({
    query: { queryKey: getGetMyProfileQueryKey() },
  });
  const ackLiveMutation = useAckLivePrivacy();
  const [livePrivacyAckedLocally, setLivePrivacyAckedLocally] = useState(false);
  const showLivePrivacyModal =
    myProfile !== undefined &&
    myProfile?.live_privacy_acked === false &&
    !livePrivacyAckedLocally;

  const handleLivePrivacyAck = () => {
    setLivePrivacyAckedLocally(true);
    ackLiveMutation.mutate(undefined);
    setShowLiveTutorial(true);
  };

  // Pre-configure age slider from the user's own age (centered range).
  useEffect(() => {
    const age = myProfile?.age;
    if (typeof age === "number" && age >= 18) {
      setAgeMin(Math.max(AGE_MIN, age - 5));
      setAgeMax(Math.min(AGE_MAX, age + 10));
    }
  }, [myProfile?.age]);

  // Detect the user's country name once from profile coordinates.
  useEffect(() => {
    if (countryFetchedRef.current) return;
    const lat = myProfile?.latitude;
    const lon = myProfile?.longitude;
    if (typeof lat !== "number" || typeof lon !== "number") return;
    countryFetchedRef.current = true;
    geocodeCountryName(lat, lon).then((name) => {
      if (name) setDetectedCountry(name);
    });
  }, [myProfile?.latitude, myProfile?.longitude]);

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
  const skipCall = useSkipLiveCall();
  const endCall = useEndLiveCall();
  const blockUser = useBlockProfile();
  const reportUser = useCreateReport();
  const confirm = useConfirm();

  // Media plane: connect to the active call's LiveKit room. Gated on the call
  // being active (a token only exists then); the hook latches creds per call.id
  // so the ~2s state-poll token churn never reconnects, and connects during the
  // pre-call Countdown (rendered while status is already "active"). No-op when
  // there's no active call or LiveKit isn't configured (token/url null).
  const activeCall =
    data?.call && data.call.status === "active" ? data.call : null;
  const live = useLiveKitCall({
    callId: activeCall?.id ?? null,
    token: activeCall?.mediaToken ?? null,
    url: activeCall?.mediaUrl ?? null,
    camOn,
    micOn,
  });

  // Reset cam/mic intent to ON whenever a NEW call starts. Without this, a user
  // who turned the camera off in a previous call carries that intent into the
  // next one and the connect-flow reconcile disables the camera again — a
  // self-view black screen with no obvious cause.
  useEffect(() => {
    if (activeCall?.id) {
      setCamOn(true);
      setMicOn(true);
    }
  }, [activeCall?.id]);

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

  function skip(call: LiveCall) {
    skipCall.mutate(
      { id: call.id },
      {
        onSettled: refresh,
        // 429 (skip limit) and other errors surface the server's Spanish message.
        onError: onError("No se pudo continuar"),
      },
    );
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
          targetUserId: call.partner.id,
          reportType: "video_behavior",
          targetType: "live_user",
          targetCallId: call.id,
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

  async function blockPartner(call: LiveCall) {
    const ok = await confirm({
      title: "¿Bloquear a esta persona?",
      description:
        "Se terminará la llamada y dejaréis de veros en la app. Podrás desbloquearla desde Ajustes › Usuarios bloqueados.",
      confirmLabel: "Bloquear",
      tone: "danger",
    });
    if (!ok) return;
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

  // --- Live privacy notice (first visit, only when no active/ringing call) --
  if (showLivePrivacyModal && !call) {
    return (
      <div className="min-h-full flex flex-col items-center justify-end pb-8 px-5 pt-12">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex flex-col items-center text-center gap-3">
            <div
              className="w-20 h-20 rounded-3xl flex items-center justify-center mb-1"
              style={{
                background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
                boxShadow: "0 0 50px rgba(168,85,247,0.4)",
              }}
            >
              <Video className="w-9 h-9 text-white" />
            </div>
            <h1 className="font-display text-3xl tracking-tight text-white">KIXXME LIVE</h1>
            <p className="font-sans text-sm text-white/55 leading-relaxed max-w-xs">
              Videollamadas en directo, cara a cara, con usuarios cercanos.
            </p>
          </div>

          <div
            className="rounded-2xl p-5 space-y-3"
            style={{
              background: "rgba(13,11,26,0.95)",
              border: "1px solid rgba(168,85,247,0.2)",
            }}
          >
            <p className="font-display text-sm tracking-widest text-primary/80 uppercase mb-3">Antes de continuar</p>
            {[
              { icon: "🎥", text: "Las videollamadas no se graban ni se almacenan por KixxMe." },
              { icon: "🔞", text: "Solo mayores de 18 años. Contenido inapropiado puede dar lugar a una sanción." },
              { icon: "🛡️", text: "Puedes reportar o bloquear a cualquier usuario en cualquier momento." },
              { icon: "📍", text: "Se usa tu ubicación aproximada para emparejar con usuarios cercanos." },
            ].map((item) => (
              <div key={item.icon} className="flex items-start gap-3">
                <span className="text-base leading-none pt-0.5 flex-shrink-0">{item.icon}</span>
                <p className="font-sans text-sm text-white/70 leading-snug">{item.text}</p>
              </div>
            ))}
          </div>

          <button
            onClick={handleLivePrivacyAck}
            disabled={ackLiveMutation.isPending}
            className="w-full h-14 rounded-2xl font-display text-xl tracking-widest text-white disabled:opacity-60"
            style={{
              background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
              boxShadow: "0 6px 30px rgba(168,85,247,0.4)",
            }}
          >
            {ackLiveMutation.isPending ? "…" : "Entendido, continuar"}
          </button>
          <p className="font-sans text-xs text-center text-white/30 pb-2">
            Al continuar aceptas los Términos de Uso de KixxMe.
          </p>
        </div>
      </div>
    );
  }

  // An in-progress call always renders first — even if the plan lapsed
  // mid-call (e.g. a webhook downgrade) the user must keep the End Call UI.

  // --- Active in-call (with a one-time pre-call countdown) -----------------
  if (call && call.status === "active") {
    if (countdownDoneFor !== call.id) {
      return (
        <Countdown call={call} onDone={() => setCountdownDoneFor(call.id)} />
      );
    }
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
        onSkip={() => skip(call)}
        skipping={skipCall.isPending}
        canSkip={call.type !== "private"}
        ending={endCall.isPending}
        live={live}
      />
    );
  }

  // --- Ringing -------------------------------------------------------------
  if (call && call.status === "ringing") {
    const myAccepted =
      call.role === "caller" ? call.callerAccepted : call.calleeAccepted;
    // Both random matches and private chat invites use the same Reveal flow
    // (partner photo/name/age·city + accept). Random shows "Siguiente" (skip to
    // another person); private shows "Rechazar" (decline this specific invite).
    return (
      <Reveal
        call={call}
        myAccepted={myAccepted}
        onAccept={() => accept(call)}
        onSkip={() => skip(call)}
        onDecline={() => decline(call)}
        onCancel={() => cancel(call)}
        onReport={() => reportPartner(call)}
        onBlock={() => blockPartner(call)}
        busy={
          acceptCall.isPending ||
          cancelCall.isPending ||
          declineCall.isPending
        }
        skipping={skipCall.isPending}
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
      profile={data.profile ?? null}
      onCompleteProfile={() => setLocation("/profile")}
      detectedCountry={detectedCountry}
      showTutorial={showLiveTutorial}
      onCloseTutorial={() => setShowLiveTutorial(false)}
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

function GoldBadge({ className = "" }: { className?: string }) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 ${className}`}
      style={{
        borderColor: "rgba(234,179,8,0.4)",
        background:
          "linear-gradient(135deg, rgba(234,179,8,0.16), rgba(245,158,11,0.07))",
      }}
      data-testid="badge-gold-exclusive"
    >
      <span className="text-sm">💎</span>
      <span className="font-sans text-xs font-semibold tracking-wide text-yellow-300">
        Acceso exclusivo para miembros Gold
      </span>
    </div>
  );
}

const GOLD_BENEFITS: { emoji: string; text: string }[] = [
  { emoji: "🎥", text: "Videollamadas en directo ilimitadas" },
  { emoji: "💬", text: "Llamadas privadas y conexiones más intensas" },
  { emoji: "👑", text: "Prioridad y mayor visibilidad en el mapa" },
  { emoji: "💖", text: "Likes y SuperLikes ilimitados" },
  { emoji: "🛡️", text: "Soporte prioritario" },
];

function Paywall({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <div className="min-h-full flex flex-col items-center px-6 pt-12 pb-10 text-center">
      <div
        className="w-20 h-20 rounded-3xl flex items-center justify-center mb-5"
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
      <GoldBadge className="mb-5" />
      <p className="font-sans text-sm text-muted-foreground leading-relaxed max-w-sm mb-7">
        Conecta cara a cara al instante con videollamadas en directo. Hazte Gold
        y desbloquea la experiencia más intensa de KixxMe.
      </p>
      <div
        className="w-full max-w-sm rounded-2xl border p-5 mb-7 text-left space-y-3.5"
        style={{
          borderColor: "rgba(234,179,8,0.25)",
          background:
            "linear-gradient(135deg, rgba(234,179,8,0.08), rgba(168,85,247,0.05))",
        }}
      >
        {GOLD_BENEFITS.map((b) => (
          <div key={b.text} className="flex items-center gap-3">
            <span className="text-lg shrink-0">{b.emoji}</span>
            <span className="font-sans text-sm text-foreground">{b.text}</span>
          </div>
        ))}
      </div>
      <button
        onClick={onUpgrade}
        className="w-full max-w-sm h-16 rounded-2xl font-display text-2xl tracking-widest text-white border-0 transition-transform hover:scale-[1.01] active:scale-[0.98] flex items-center justify-center gap-2"
        style={{
          background: "linear-gradient(135deg, hsl(38,95%,52%), hsl(25,100%,50%))",
          boxShadow: "0 8px 30px rgba(234,179,8,0.35)",
        }}
        data-testid="button-upgrade-gold"
      >
        👑 Hazte Gold
      </button>
      <p className="font-sans text-xs text-muted-foreground mt-4 max-w-sm">
        Mejora tu cuenta y empieza a conectar en directo hoy mismo.
      </p>
    </div>
  );
}

const TRUST_ITEMS: { emoji: string; label: string }[] = [
  { emoji: "🔒", label: "Videollamadas seguras" },
  { emoji: "🛡️", label: "Comunidad moderada" },
  { emoji: "✅", label: "Solo mayores de 18" },
];

function TrustZone() {
  return (
    <div className="grid grid-cols-3 gap-2" data-testid="live-trust-zone">
      {TRUST_ITEMS.map((t) => (
        <div
          key={t.label}
          className="flex flex-col items-center gap-1.5 text-center"
        >
          <span className="text-lg">{t.emoji}</span>
          <span className="font-sans text-[11px] leading-tight text-muted-foreground">
            {t.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function OnlineChip({ count }: { count: number }) {
  return (
    <div
      className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5"
      style={{
        borderColor: "rgba(34,197,94,0.35)",
        background: "rgba(34,197,94,0.08)",
      }}
      data-testid="chip-online-now"
    >
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75 animate-ping" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-400" />
      </span>
      <span className="font-sans text-sm font-medium text-green-300">
        {count} {count === 1 ? "persona conectada" : "personas conectadas"} ahora
      </span>
    </div>
  );
}

const LIVE_FEATURES: { emoji: string; title: string; desc: string }[] = [
  {
    emoji: "💬",
    title: "Conoce gente nueva",
    desc: "Descubre chicos cerca de ti y por todo el mundo.",
  },
  {
    emoji: "🎥",
    title: "Videollamadas en directo",
    desc: "Conecta cara a cara al instante, sin esperas.",
  },
  {
    emoji: "✅",
    title: "Perfiles verificados",
    desc: "Personas reales para conexiones reales.",
  },
  {
    emoji: "🔒",
    title: "Privacidad primero",
    desc: "Tú decides qué compartes y con quién.",
  },
  {
    emoji: "🛡️",
    title: "Comunidad segura",
    desc: "Bloquea o reporta en cualquier momento.",
  },
];

function LiveFeatureCarousel() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(
      () => setI((v) => (v + 1) % LIVE_FEATURES.length),
      3600,
    );
    return () => clearInterval(t);
  }, []);
  const f = LIVE_FEATURES[i];
  return (
    <div
      className="rounded-2xl border p-5 overflow-hidden"
      style={{
        borderColor: "hsl(273 85% 55% / 0.25)",
        background:
          "linear-gradient(135deg, rgba(168,85,247,0.10), rgba(236,72,153,0.06))",
      }}
      data-testid="live-feature-carousel"
    >
      <div key={i} className="flex items-center gap-4 animate-live-feature-in">
        <div
          className="shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
          style={{
            background: "rgba(255,255,255,0.06)",
            boxShadow: "0 0 24px rgba(168,85,247,0.25)",
          }}
        >
          {f.emoji}
        </div>
        <div className="min-w-0">
          <p className="font-display text-base tracking-wide text-foreground normal-case">
            {f.title}
          </p>
          <p className="font-sans text-xs text-muted-foreground leading-relaxed">
            {f.desc}
          </p>
        </div>
      </div>
      <div className="flex justify-center gap-1.5 mt-4">
        {LIVE_FEATURES.map((_, idx) => (
          <span
            key={idx}
            className="h-1.5 rounded-full transition-all duration-300"
            style={{
              width: idx === i ? 18 : 6,
              background:
                idx === i
                  ? "linear-gradient(90deg, hsl(273,85%,60%), hsl(330,85%,58%))"
                  : "rgba(255,255,255,0.18)",
            }}
          />
        ))}
      </div>
    </div>
  );
}

function AgeRangeSlider({
  min,
  max,
  onChange,
}: {
  min: number;
  max: number;
  onChange: (lo: number, hi: number) => void;
}) {
  return (
    <SliderPrimitive.Root
      className="relative flex w-full touch-none select-none items-center py-3"
      min={AGE_MIN}
      max={AGE_MAX}
      step={1}
      minStepsBetweenThumbs={1}
      value={[min, max]}
      onValueChange={(v) => onChange(v[0], v[1])}
      data-testid="slider-age-range"
    >
      <SliderPrimitive.Track
        className="relative h-2 w-full grow overflow-hidden rounded-full"
        style={{ background: "rgba(255,255,255,0.10)" }}
      >
        <SliderPrimitive.Range
          className="absolute h-full rounded-full"
          style={{
            background:
              "linear-gradient(90deg, hsl(273,85%,55%), hsl(330,85%,52%))",
          }}
        />
      </SliderPrimitive.Track>
      {[0, 1].map((idx) => (
        <SliderPrimitive.Thumb
          key={idx}
          className="block h-6 w-6 rounded-full bg-white transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 active:scale-110"
          style={{ boxShadow: "0 2px 10px rgba(168,85,247,0.55)" }}
          aria-label={idx === 0 ? "Edad mínima" : "Edad máxima"}
        />
      ))}
    </SliderPrimitive.Root>
  );
}

function LiveTutorialPanel({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="absolute inset-0 z-[800] flex flex-col items-center justify-end"
      style={{ background: "rgba(6,5,16,0.90)", backdropFilter: "blur(22px)" }}
    >
      <div
        className="w-full max-w-sm rounded-t-3xl px-6 pt-7 pb-8 flex flex-col gap-5"
        style={{
          background: "linear-gradient(180deg, rgba(20,14,40,0.98) 0%, rgba(10,8,22,0.99) 100%)",
          border: "1px solid rgba(168,85,247,0.2)",
          borderBottom: "none",
          boxShadow: "0 -12px 60px rgba(168,85,247,0.15)",
        }}
      >
        {/* Header */}
        <div className="text-center space-y-1.5">
          <div
            className="w-16 h-16 rounded-3xl mx-auto flex items-center justify-center mb-3"
            style={{
              background: "linear-gradient(135deg, hsl(273,85%,52%), hsl(330,85%,52%))",
              boxShadow: "0 0 32px rgba(168,85,247,0.5), 0 0 64px rgba(236,72,153,0.2)",
            }}
          >
            <span className="text-3xl">🎥</span>
          </div>
          <h2 className="font-display text-2xl tracking-wide text-white">Live en directo</h2>
          <p className="font-sans text-sm text-white/50 leading-snug">
            Videollamadas cara a cara con usuarios de tu zona
          </p>
        </div>

        {/* Feature list */}
        <div className="space-y-3.5">
          {[
            {
              icon: "🎲",
              title: "Emparejamiento al azar",
              desc: "Te conectamos con alguien buscando en el mismo momento. Ambos veis la foto del otro y decidís si aceptáis — si alguno pasa, buscamos otro.",
            },
            {
              icon: "🗺️",
              title: "Elige tu zona",
              desc: "Cerca de mí (máx. 200 km) · Mi ciudad · Mi país (detectado por GPS) · Internacional. La app detecta tu país automáticamente.",
            },
            {
              icon: "🎚️",
              title: "Filtra por edad",
              desc: "El deslizador se configura automáticamente con tu edad de perfil. Ajústalo para ver solo el rango que te interesa.",
            },
            {
              icon: "🛡️",
              title: "Comunidad y respeto",
              desc: "Solo mayores de 18 años. Puedes reportar o bloquear durante la llamada. El contenido inapropiado puede suponer una sanción.",
            },
          ].map((item) => (
            <div key={item.icon} className="flex items-start gap-3.5">
              <div
                className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(168,85,247,0.12)", border: "1px solid rgba(168,85,247,0.18)" }}
              >
                <span className="text-lg">{item.icon}</span>
              </div>
              <div className="pt-0.5">
                <p className="font-sans text-sm font-semibold text-white/90 leading-tight">{item.title}</p>
                <p className="font-sans text-xs text-white/50 leading-snug mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <button
          onClick={onClose}
          className="w-full rounded-2xl font-display text-base tracking-widest text-white transition-opacity active:opacity-80"
          style={{
            height: "52px",
            background: "linear-gradient(135deg, hsl(273,85%,52%), hsl(330,85%,52%))",
            boxShadow: "0 4px 24px rgba(168,85,247,0.4)",
          }}
        >
          ¡Explorar el Live! 🎥
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
  profile,
  onCompleteProfile,
  detectedCountry,
  showTutorial,
  onCloseTutorial,
}: {
  scope: LiveQueueRequestScope;
  setScope: (s: LiveQueueRequestScope) => void;
  ageMin: number;
  ageMax: number;
  setAgeMin: (n: number) => void;
  setAgeMax: (n: number) => void;
  onSearch: () => void;
  searching: boolean;
  profile: LiveState["profile"];
  onCompleteProfile: () => void;
  detectedCountry: string | null;
  showTutorial: boolean;
  onCloseTutorial: () => void;
}) {
  const missingAge = profile != null && !profile.hasAge;
  const missingLocation = profile != null && !profile.hasLocation;
  const { data: stats } = useGetDiscoveryStats({ scope: "worldwide" });
  const online = stats?.online ?? 0;
  return (
    <>
    {showTutorial && <LiveTutorialPanel onClose={onCloseTutorial} />}
    <div className="min-h-full pb-10">
      <Header />
      <div className="flex justify-center mt-2 mb-4">
        <GoldBadge />
      </div>
      <div className="px-6 text-center mb-7">
        <h2 className="font-display text-[22px] leading-tight tracking-tight text-foreground normal-case mb-3">
          💜 Personas reales esperando conectar
        </h2>
        {online > 0 ? (
          <OnlineChip count={online} />
        ) : (
          <p className="font-sans text-sm text-muted-foreground">
            Conecta cara a cara con chicos al instante.
          </p>
        )}
      </div>

      {(missingAge || missingLocation) && (
        <div className="px-4 mb-5 space-y-3">
          {missingAge && (
            <button
              onClick={onCompleteProfile}
              className="w-full flex items-start gap-3 rounded-2xl border p-4 text-left transition-colors hover:bg-amber-500/10"
              style={{
                borderColor: "rgba(245,158,11,0.4)",
                background: "rgba(245,158,11,0.08)",
              }}
              data-testid="warning-missing-age"
            >
              <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0 text-amber-400" />
              <span className="font-sans text-sm text-amber-100/90">
                <span className="font-semibold">Añade tu edad para emparejar.</span>{" "}
                Sin la edad en tu perfil no podemos cruzarte con nadie. Toca aquí
                para completarla.
              </span>
            </button>
          )}
          {missingLocation && (
            <div
              className="w-full flex items-start gap-3 rounded-2xl border p-4"
              style={{
                borderColor: "hsl(240 10% 20% / 0.5)",
                background: "rgba(255,255,255,0.03)",
              }}
              data-testid="warning-missing-location"
            >
              <MapPin className="w-5 h-5 mt-0.5 shrink-0 text-primary" />
              <span className="font-sans text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">
                  Sin ubicación activada.
                </span>{" "}
                Buscaremos en{" "}
                <span className="text-foreground">«Todo el mundo»</span> aunque
                elijas otro filtro de zona. Activa la ubicación en tu perfil para
                buscar por cercanía.
              </span>
            </div>
          )}
        </div>
      )}

      <div className="px-4 mb-6">
        <LiveFeatureCarousel />
      </div>

      <div className="px-4 space-y-5">
        <div
          className="rounded-2xl border border-border/30 p-5"
          style={{ background: "rgba(13,11,26,0.6)" }}
        >
          <p className="font-display text-lg tracking-wide mb-3">¿A quién buscas?</p>
          <div className="grid grid-cols-2 gap-2">
            {SCOPES.map((s) => {
              const active = scope === s.value;
              const label =
                s.value === "spain" && detectedCountry
                  ? detectedCountry
                  : s.label;
              const desc =
                s.value === "spain" && detectedCountry
                  ? `Usuarios de ${detectedCountry}`
                  : s.desc;
              return (
                <button
                  key={s.value}
                  onClick={() => setScope(s.value)}
                  className="flex flex-col gap-0.5 px-3 py-3 rounded-xl border text-left transition-all"
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
                  <div className="flex items-center gap-1.5">
                    <span className="text-base leading-none">{s.emoji}</span>
                    <span className="font-sans text-sm font-semibold leading-tight truncate">{label}</span>
                  </div>
                  <span
                    className="font-sans text-[10px] leading-snug mt-0.5"
                    style={{ color: active ? "rgba(255,255,255,0.72)" : "hsl(240,10%,52%)" }}
                  >
                    {desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div
          className="rounded-2xl border border-border/30 p-5"
          style={{ background: "rgba(13,11,26,0.6)" }}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="font-display text-lg tracking-wide">Rango de edad</p>
            <span className="font-display text-lg text-gradient-brand tabular-nums">
              {ageMin} – {ageMax >= AGE_MAX ? "70+" : ageMax}
            </span>
          </div>
          <AgeRangeSlider
            min={ageMin}
            max={ageMax}
            onChange={(lo, hi) => {
              setAgeMin(lo);
              setAgeMax(hi);
            }}
          />
        </div>

        <button
          onClick={onSearch}
          disabled={searching}
          className="w-full h-16 rounded-2xl font-display text-2xl tracking-widest text-white border-0 transition-transform hover:scale-[1.01] active:scale-[0.98] disabled:opacity-60 disabled:hover:scale-100 flex items-center justify-center gap-2 animate-glow-pulse"
          style={{
            background:
              "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
          }}
          data-testid="button-search-call"
        >
          {searching ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : (
            <>🎥 Conectar ahora</>
          )}
        </button>

        <div className="pt-1">
          <TrustZone />
        </div>
      </div>
    </div>
    </>
  );
}

const SEARCH_ICONS = ["🎲", "✨", "📹", "💫"];

function Searching({
  onCancel,
  canceling,
}: {
  onCancel: () => void;
  canceling: boolean;
}) {
  const [iconIndex, setIconIndex] = useState(0);
  useEffect(() => {
    const t = setInterval(
      () => setIconIndex((v) => (v + 1) % SEARCH_ICONS.length),
      650,
    );
    return () => clearInterval(t);
  }, []);

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
          <span className="text-4xl" key={iconIndex}>
            {SEARCH_ICONS[iconIndex]}
          </span>
        </div>
      </div>
      <h2 className="font-display text-2xl tracking-wide text-gradient-brand mb-2">
        Buscando una conexión Gold para ti…
      </h2>
      <p className="font-sans text-sm text-muted-foreground mb-10 max-w-xs">
        Estamos encontrando a alguien con quien romper el hielo.
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

const SAFETY_LINE =
  "Respeta siempre a la otra persona. Puedes cancelar, bloquear o reportar en cualquier momento.";

/**
 * Chatroulette × Tinder reveal shown before a call connects: the partner's main
 * photo, name, age and city. Used for BOTH random matches and private chat
 * invites. For random calls the secondary action is "Siguiente" (skip to a new
 * person); for private invites it is "Rechazar" (decline). "Aceptar" connects
 * (the call goes active once both accept). Once this user has accepted, it
 * switches to a waiting state.
 */
function Reveal({
  call,
  myAccepted,
  onAccept,
  onSkip,
  onDecline,
  onCancel,
  onReport,
  onBlock,
  busy,
  skipping,
}: {
  call: LiveCall;
  myAccepted: boolean;
  onAccept: () => void;
  onSkip: () => void;
  onDecline: () => void;
  onCancel: () => void;
  onReport: () => void;
  onBlock: () => void;
  busy: boolean;
  skipping: boolean;
}) {
  const isPrivate = call.type === "private";
  const name = partnerName(call);
  const meta = [
    call.partner.age ? `${call.partner.age} años` : null,
    call.partner.city,
  ]
    .filter(Boolean)
    .join(" · ");

  // I accepted; waiting for the other person to accept too. For a private call
  // the caller lands here immediately (they accept on creation) — "Llamando…".
  if (myAccepted) {
    const waitingCopy = isPrivate
      ? `Llamando a ${name}…`
      : `Esperando a que ${name} acepte…`;
    return (
      <div className="min-h-full flex flex-col items-center justify-center px-6 text-center">
        <div className="relative mb-6">
          <span
            className="absolute inset-0 rounded-full animate-ping"
            style={{ background: "rgba(34,197,94,0.25)" }}
          />
          <Avatar className="relative w-28 h-28 rounded-full border-2 border-green-500/50">
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
        </h2>
        <p className="font-sans text-sm text-muted-foreground mb-10 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          {waitingCopy}
        </p>
        <button
          onClick={onCancel}
          disabled={busy}
          className="px-8 h-12 rounded-xl font-sans font-medium text-foreground border border-border/40 hover:bg-white/5 transition-colors disabled:opacity-60 flex items-center gap-2"
          data-testid="button-cancel-call"
        >
          <X className="w-4 h-4" />
          Cancelar
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-full flex flex-col px-4 pt-5 pb-5">
      <p className="text-center font-display text-sm tracking-[0.3em] text-gradient-brand mb-3">
        {isPrivate ? "LLAMADA PRIVADA" : "¡NUEVA CONEXIÓN!"}
      </p>

      {/* Photo card */}
      <div
        className="relative flex-1 rounded-3xl overflow-hidden border border-primary/30 mb-3"
        style={{ minHeight: 0 }}
      >
        {call.partner.avatar_url ? (
          <img
            src={call.partner.avatar_url}
            alt={name}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{
              background:
                "linear-gradient(135deg, hsl(273,55%,22%), hsl(330,55%,24%))",
            }}
          >
            <span className="font-display text-6xl text-white/80">
              {initialsOf(name)}
            </span>
          </div>
        )}

        {/* Report / block */}
        <div className="absolute top-3 right-3 flex gap-2">
          <button
            onClick={onReport}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white"
            style={{ background: "rgba(0,0,0,0.45)" }}
            data-testid="button-report-call"
          >
            <Flag className="w-4 h-4" />
          </button>
          <button
            onClick={onBlock}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white"
            style={{ background: "rgba(0,0,0,0.45)" }}
            data-testid="button-block-call"
          >
            <Ban className="w-4 h-4" />
          </button>
        </div>

        {/* Name overlay */}
        <div
          className="absolute bottom-0 inset-x-0 px-5 pt-12 pb-5"
          style={{
            background:
              "linear-gradient(to top, rgba(8,7,18,0.92) 10%, rgba(8,7,18,0) 100%)",
          }}
        >
          <h2 className="font-display text-2xl tracking-wide text-foreground">
            {isPrivate ? `${name} te está llamando` : `Has conectado con ${name}`}
          </h2>
          {meta && (
            <p className="font-sans text-sm text-muted-foreground mt-0.5">
              {meta}
            </p>
          )}
        </div>
      </div>

      <p className="text-center font-sans text-[11px] leading-relaxed text-muted-foreground px-2 mb-3">
        {SAFETY_LINE}
      </p>

      {/* Primary actions */}
      <div className="flex items-center justify-center gap-10 mb-3">
        <div className="flex flex-col items-center gap-2">
          {isPrivate ? (
            <>
              <button
                onClick={onDecline}
                disabled={busy || skipping}
                className="w-16 h-16 rounded-full flex items-center justify-center text-white disabled:opacity-60"
                style={{ background: "hsl(0,75%,55%)" }}
                data-testid="button-decline-call"
              >
                {busy ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <PhoneOff className="w-6 h-6" />
                )}
              </button>
              <span className="font-sans text-xs text-muted-foreground">
                Rechazar
              </span>
            </>
          ) : (
            <>
              <button
                onClick={onSkip}
                disabled={skipping || busy}
                className="w-16 h-16 rounded-full flex items-center justify-center text-white disabled:opacity-60"
                style={{
                  background:
                    "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
                  boxShadow: "0 0 30px rgba(168,85,247,0.4)",
                }}
                data-testid="button-skip-call"
              >
                {skipping ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <span className="text-2xl leading-none">🔄</span>
                )}
              </button>
              <span className="font-sans text-xs text-muted-foreground">
                Siguiente
              </span>
            </>
          )}
        </div>
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={onAccept}
            disabled={busy || skipping}
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

      {!isPrivate && (
        <button
          onClick={onCancel}
          disabled={busy}
          className="self-center px-6 h-10 rounded-xl font-sans text-sm text-muted-foreground hover:bg-white/5 transition-colors disabled:opacity-60 flex items-center gap-2"
          data-testid="button-cancel-call"
        >
          <X className="w-4 h-4" />
          Cancelar búsqueda
        </button>
      )}
    </div>
  );
}

/**
 * Brief "La llamada empieza en 5…" pre-call countdown shown once when a call
 * goes active, before the in-call surface. Purely cosmetic and local-only.
 */
function Countdown({ call, onDone }: { call: LiveCall; onDone: () => void }) {
  const [n, setN] = useState(5);
  // Play the "call starting" cue once when the countdown mounts.
  useEffect(() => {
    playSound("live");
  }, []);
  useEffect(() => {
    if (n <= 0) return;
    const t = setTimeout(() => setN((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [n]);
  useEffect(() => {
    if (n === 0) onDone();
  }, [n, onDone]);

  const name = partnerName(call);
  return (
    <div className="min-h-full flex flex-col items-center justify-center px-6 text-center">
      <Avatar className="w-24 h-24 rounded-full border-2 border-primary/50 mb-6">
        {call.partner.avatar_url && (
          <AvatarImage src={call.partner.avatar_url} className="object-cover" />
        )}
        <AvatarFallback className="font-display text-2xl bg-card text-primary">
          {initialsOf(name)}
        </AvatarFallback>
      </Avatar>
      <p className="font-sans text-sm text-muted-foreground mb-2">
        La llamada empieza en
      </p>
      <div
        className="font-display text-7xl text-gradient-brand mb-2 tabular-nums"
        data-testid="text-countdown"
      >
        {n > 0 ? n : 1}
      </div>
      <p className="font-sans text-sm text-muted-foreground">
        Conectando con {name}…
      </p>
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
      className="w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-95 disabled:opacity-60 backdrop-blur-md border"
      style={
        danger
          ? {
              background: "hsl(0,75%,55%)",
              color: "white",
              borderColor: "transparent",
            }
          : active
            ? {
                background: "rgba(255,255,255,0.16)",
                color: "white",
                borderColor: "rgba(255,255,255,0.18)",
              }
            : {
                background: "rgba(255,255,255,0.05)",
                color: "hsl(240,10%,62%)",
                borderColor: "rgba(255,255,255,0.06)",
              }
      }
    >
      {children}
    </button>
  );
}

/**
 * Map a typed media-capture failure to an actionable Spanish message. Driven by
 * the real DOMException the diagnostics layer classified, so the user is told
 * exactly what to fix instead of a generic "check permissions".
 */
function mediaErrorMessage(reason: MediaErrorReason | null): {
  title: string;
  hint: string;
} {
  switch (reason) {
    case "denied":
      return {
        title: "Permiso de cámara o micrófono denegado",
        hint: "En iPhone: toca «aA» en la barra de Safari → Configuración del sitio web → Cámara → Permitir. Luego pulsa «Activar cámara».",
      };
    case "busy":
      return {
        title: "Tu cámara o micrófono está ocupado",
        hint: "Otra app lo está usando. Ciérrala e inténtalo de nuevo.",
      };
    case "notfound":
      return {
        title: "No se encontró cámara ni micrófono",
        hint: "Conecta o habilita un dispositivo y vuelve a intentarlo.",
      };
    case "insecure":
      return {
        title: "La cámara no está disponible aquí",
        hint: "Abre KixxMe desde el navegador (no como app instalada) y con conexión segura.",
      };
    case "overconstrained":
      return {
        title: "Tu cámara no admite esta configuración",
        hint: "Inténtalo de nuevo o cambia de cámara.",
      };
    default:
      return {
        title: "No se pudo acceder a tu cámara o micrófono",
        hint: "Revisa los permisos e inténtalo de nuevo.",
      };
  }
}

// Call-duration ticker isolated into its own component so the per-second state
// update only re-renders this tiny text node — NOT the whole InCall tree, which
// holds the LiveKit <video> views. Resets per call.id.
function CallTimer({ active, callId }: { active: boolean; callId: string }) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    startRef.current = null;
    setElapsed(0);
  }, [callId]);

  useEffect(() => {
    if (!active) return;
    if (startRef.current == null) startRef.current = Date.now();
    const t = setInterval(() => {
      if (startRef.current != null) {
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(t);
  }, [active, callId]);

  if (!active) return null;
  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(
    elapsed % 60,
  ).padStart(2, "0")}`;
  return (
    <span
      className="font-sans text-xs text-white/70 tabular-nums"
      style={{ textShadow: "0 1px 8px rgba(0,0,0,0.7)" }}
      data-testid="text-call-duration"
    >
      · {mmss}
    </span>
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
  onSkip,
  skipping,
  canSkip,
  ending,
  live,
}: {
  call: LiveCall;
  camOn: boolean;
  micOn: boolean;
  onToggleCam: () => void;
  onToggleMic: () => void;
  onEnd: () => void;
  onReport: () => void;
  onBlock: () => void;
  onSkip: () => void;
  skipping: boolean;
  canSkip: boolean;
  ending: boolean;
  live: LiveKitCall;
}) {
  const name = partnerName(call);
  const subtitle = [
    call.partner.age ? `${call.partner.age}` : null,
    call.partner.city || null,
  ]
    .filter(Boolean)
    .join(" · ");
  // Real Rol/Preferencia + "Qué busca" from the partner's profile (null when unset).
  const roleText = roleLabel(call.partner.role);
  const lookingText = lookingForLabel(call.partner.looking_for);
  const hasChips = Boolean(roleText || lookingText);

  // Connection indicator (dot colour + label).
  const conn =
    live.status === "error"
      ? { label: "Sin conexión", color: "hsl(0 75% 58%)", pulse: false }
      : live.status === "reconnecting"
        ? { label: "Reconectando…", color: "hsl(38 95% 55%)", pulse: true }
        : live.status === "connecting"
          ? { label: "Conectando…", color: "hsl(38 95% 55%)", pulse: true }
          : live.hasRemoteVideo
            ? { label: "Conectado", color: "hsl(145 70% 48%)", pulse: false }
            : { label: "Esperando vídeo…", color: "hsl(38 95% 55%)", pulse: true };

  // Tapping any control is a user gesture — opportunistically unlock audio that
  // iOS blocked from autoplaying.
  const withAudioUnlock = (fn: () => void) => () => {
    live.resumeAudio();
    fn();
  };

  return (
    <div className="h-full flex flex-col">
      {/* Video surface */}
      <div
        className="flex-1 relative flex flex-col items-center justify-center overflow-hidden"
        style={{
          background:
            "radial-gradient(ellipse 90% 60% at 50% 30%, hsl(273 40% 16%) 0%, hsl(238 30% 6%) 70%)",
        }}
        onClick={
          live.active
            ? () => {
                live.resumeAudio();
                live.resumeVideo();
              }
            : undefined
        }
      >
        {live.active ? (
          <>
            {/* Remote video fills the screen. Muted because remote AUDIO plays
                through a dedicated <audio> element (see useLiveKitCall); muting
                the video element guarantees iOS autoplays the picture. */}
            <video
              ref={live.attachRemoteVideo}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
              style={{
                opacity: live.hasRemoteVideo ? 1 : 0,
                transition: "opacity 300ms ease",
              }}
              data-testid="video-remote"
            />

            {/* Top scrim so the overlaid name/status stays legible over video. */}
            <div
              className="absolute inset-x-0 top-0 h-44 pointer-events-none"
              style={{
                background:
                  "linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)",
              }}
            />

            {/* Avatar fallback while the remote video isn't flowing yet. */}
            {!live.hasRemoteVideo && (
              <div className="relative flex flex-col items-center px-8 text-center">
                <Avatar className="w-28 h-28 rounded-full border-2 border-primary/40 mb-4 opacity-90">
                  {call.partner.avatar_url && (
                    <AvatarImage
                      src={call.partner.avatar_url}
                      className="object-cover"
                    />
                  )}
                  <AvatarFallback className="font-display text-2xl bg-card text-primary">
                    {initialsOf(name)}
                  </AvatarFallback>
                </Avatar>
                <h2 className="font-display text-2xl tracking-wide text-foreground">
                  {name}
                </h2>
                {subtitle && (
                  <p className="font-sans text-sm text-muted-foreground mt-1">
                    {subtitle}
                  </p>
                )}
                {hasChips && (
                  <div className="flex flex-wrap items-center justify-center gap-1.5 mt-3">
                    {roleText && (
                      <span
                        className="px-2.5 py-1 rounded-full font-sans text-xs text-primary"
                        style={{
                          background: "hsl(326 60% 22% / 0.5)",
                          border: "1px solid hsl(326 70% 50% / 0.35)",
                        }}
                        data-testid="chip-partner-role"
                      >
                        {roleText}
                      </span>
                    )}
                    {lookingText && (
                      <span
                        className="px-2.5 py-1 rounded-full font-sans text-xs"
                        style={{
                          color: "hsl(266 80% 80%)",
                          background: "hsl(266 50% 24% / 0.5)",
                          border: "1px solid hsl(266 70% 55% / 0.35)",
                        }}
                        data-testid="chip-partner-looking"
                      >
                        {lookingText}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Top-left: name + age · city + connection/duration, elegant. */}
            <div className="absolute top-5 left-4 right-36 pointer-events-none">
              <h2
                className="font-display text-2xl tracking-wide text-white truncate"
                style={{ textShadow: "0 1px 12px rgba(0,0,0,0.65)" }}
                data-testid="text-partner-name"
              >
                {name}
              </h2>
              {subtitle && (
                <p
                  className="font-sans text-sm text-white/85 mt-0.5 truncate"
                  style={{ textShadow: "0 1px 10px rgba(0,0,0,0.65)" }}
                >
                  {subtitle}
                </p>
              )}
              <div className="flex items-center gap-2 mt-2">
                <span
                  className={`w-2 h-2 rounded-full ${conn.pulse ? "animate-pulse" : ""}`}
                  style={{ background: conn.color }}
                />
                <span
                  className="font-sans text-xs text-white/90"
                  style={{ textShadow: "0 1px 8px rgba(0,0,0,0.7)" }}
                  data-testid="text-live-status"
                >
                  {conn.label}
                </span>
                <CallTimer
                  active={live.status === "connected"}
                  callId={call.id}
                />
              </div>
              {hasChips && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {roleText && (
                    <span
                      className="px-2 py-0.5 rounded-full font-sans text-[11px] text-white"
                      style={{
                        background: "rgba(236,72,153,0.32)",
                        border: "1px solid rgba(236,72,153,0.45)",
                        textShadow: "0 1px 6px rgba(0,0,0,0.6)",
                      }}
                    >
                      {roleText}
                    </span>
                  )}
                  {lookingText && (
                    <span
                      className="px-2 py-0.5 rounded-full font-sans text-[11px] text-white"
                      style={{
                        background: "rgba(139,92,246,0.30)",
                        border: "1px solid rgba(139,92,246,0.45)",
                        textShadow: "0 1px 6px rgba(0,0,0,0.6)",
                      }}
                    >
                      {lookingText}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Connection failure notice (token/credentials/network — the room
                never connected, so no remote media can ever arrive). Prominent
                so a media-plane misconfiguration is never a silent black screen. */}
            {live.status === "error" && (
              <div
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-5 py-4 rounded-2xl max-w-[88%] text-center"
                style={{ background: "rgba(127,29,29,0.92)" }}
                data-testid="text-connection-error"
              >
                <span className="font-display text-sm text-white block tracking-wide">
                  No se pudo conectar a la sala de vídeo
                </span>
                <span className="font-sans text-[11px] text-white/85 block mt-1">
                  Revisa tu conexión e inténtalo de nuevo. Si persiste, es un
                  problema de configuración del servicio de vídeo.
                </span>
              </div>
            )}

            {/* Permission / publish error notice — actionable, driven by the
                real DOMException the diagnostics layer classified. */}
            {live.mediaError && (
              <div
                className="absolute top-48 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-2xl max-w-[78%] text-center"
                style={{ background: "rgba(127,29,29,0.92)" }}
                data-testid="text-media-error"
              >
                <span className="font-display text-[12px] text-white block tracking-wide">
                  {mediaErrorMessage(live.mediaErrorReason).title}
                </span>
                <span className="font-sans text-[11px] text-white/85 block mt-0.5">
                  {mediaErrorMessage(live.mediaErrorReason).hint}
                </span>
                {live.mediaErrorReason === "denied" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      live.retryCamera();
                    }}
                    data-testid="button-retry-camera"
                    className="mt-2.5 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white font-display text-[11px] tracking-wide active:scale-95 transition-transform"
                    style={{ color: "hsl(0,72%,32%)" }}
                  >
                    <Video className="w-3.5 h-3.5" />
                    Activar cámara
                  </button>
                )}
              </div>
            )}

            {/* Audio autoplay unlock prompt (iOS blocks audio until a gesture). */}
            {live.needsAudioGesture && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  live.resumeAudio();
                }}
                data-testid="button-enable-audio"
                className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-5 py-3 rounded-full text-white font-display tracking-wide animate-pulse"
                style={{
                  background:
                    "linear-gradient(135deg, hsl(326 90% 52%), hsl(266 85% 58%))",
                  boxShadow: "0 8px 28px rgba(236,72,153,0.45)",
                }}
              >
                <Volume2 className="w-5 h-5" />
                Toca para activar el sonido
              </button>
            )}

            {/* Video autoplay unlock prompt — if the browser refused to play a
                <video> (paused/black despite frames decoding) we surface a clear
                tap target. Audio keeps working through its own element. */}
            {live.needsVideoGesture && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  live.resumeVideo();
                }}
                data-testid="button-enable-video"
                className="absolute bottom-24 left-1/2 -translate-x-1/2 flex items-center gap-2 px-5 py-3 rounded-full text-white font-display tracking-wide animate-pulse"
                style={{
                  background:
                    "linear-gradient(135deg, hsl(266 85% 58%), hsl(326 90% 52%))",
                  boxShadow: "0 8px 28px rgba(147,51,234,0.45)",
                }}
              >
                <Video className="w-5 h-5" />
                Toca para ver el vídeo
              </button>
            )}

            {/* Self preview — floating card, mirrored like a selfie. */}
            <div
              className="absolute top-5 right-4 w-28 h-40 rounded-2xl overflow-hidden flex items-center justify-center border"
              style={{
                background: "rgba(0,0,0,0.65)",
                borderColor: "rgba(236,72,153,0.35)",
                boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
              }}
            >
              <video
                ref={live.attachLocalVideo}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
                style={{ opacity: camOn ? 1 : 0, transform: "scaleX(-1)" }}
                data-testid="video-local"
              />
              {!camOn && (
                <VideoOff className="absolute w-6 h-6 text-muted-foreground" />
              )}
              <span className="absolute bottom-1 inset-x-0 text-center font-sans text-[10px] text-white/70">
                Tú
              </span>
            </div>
          </>
        ) : (
          // Graceful fallback: LiveKit not configured / no token yet. Keeps the
          // original placeholder so the call lifecycle still works end-to-end.
          <>
            <Avatar className="w-28 h-28 rounded-full border-2 border-primary/40 mb-4 opacity-90">
              {call.partner.avatar_url && (
                <AvatarImage
                  src={call.partner.avatar_url}
                  className="object-cover"
                />
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
          </>
        )}
      </div>

      {/* Controls */}
      <div
        className="flex-shrink-0 px-5 pt-4 pb-6 border-t border-white/5"
        style={{ background: "rgba(8,7,18,0.96)" }}
      >
        <p className="text-center font-sans text-[11px] text-muted-foreground mb-4">
          Sé respetuoso. Puedes reportar o bloquear si algo te incomoda.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <CtrlButton
            onClick={withAudioUnlock(onToggleMic)}
            active={micOn}
            testId="button-toggle-mic"
          >
            {micOn ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
          </CtrlButton>
          <CtrlButton
            onClick={withAudioUnlock(onToggleCam)}
            active={camOn}
            testId="button-toggle-cam"
          >
            {camOn ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
          </CtrlButton>
          {live.canSwitchCamera && camOn && (
            <CtrlButton onClick={live.switchCamera} testId="button-switch-camera">
              <SwitchCamera className="w-6 h-6" />
            </CtrlButton>
          )}
          <button
            onClick={onEnd}
            disabled={ending}
            data-testid="button-end-call"
            className="w-[68px] h-14 rounded-full flex items-center justify-center text-white disabled:opacity-60 active:scale-95 transition-all"
            style={{
              background: "hsl(0,75%,55%)",
              boxShadow: "0 8px 24px rgba(220,38,38,0.45)",
            }}
          >
            {ending ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <PhoneOff className="w-7 h-7" />
            )}
          </button>
          <CtrlButton onClick={onReport} testId="button-report-call">
            <Flag className="w-6 h-6" />
          </CtrlButton>
          <CtrlButton onClick={onBlock} testId="button-block-call">
            <Ban className="w-6 h-6" />
          </CtrlButton>
        </div>

        {/* Siguiente — skip to a new person. Random/roulette calls only; a
            private chat invite has no "next" so the button is hidden there. */}
        {canSkip && (
          <button
            onClick={withAudioUnlock(onSkip)}
            disabled={skipping}
            data-testid="button-skip-call"
            className="mt-4 w-full h-12 rounded-full flex items-center justify-center gap-2 font-display tracking-wide text-white disabled:opacity-60 active:scale-95 transition-all"
            style={{
              background:
                "linear-gradient(135deg, hsl(266 85% 58%), hsl(326 90% 52%))",
              boxShadow: "0 8px 24px rgba(168,85,247,0.4)",
            }}
          >
            {skipping ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <SkipForward className="w-5 h-5" />
            )}
            Siguiente
          </button>
        )}
      </div>
    </div>
  );
}
