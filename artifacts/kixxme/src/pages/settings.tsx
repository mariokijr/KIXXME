import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  useRequestAccountActionCode,
  useConfirmAccountAction,
  useGetSubscription,
  useGetMyProfile,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ChevronRight,
  Settings as SettingsIcon,
  PauseCircle,
  Trash2,
  ShieldCheck,
  Loader2,
  Mail,
  AlertTriangle,
  Ban,
  LogOut,
  KeyRound,
  CreditCard,
  MessageSquare,
  HeadphonesIcon,
  Check,
  Zap,
  FileText,
  User,
} from "lucide-react";

type DeactivationType = "1m" | "3m" | "6m" | "indefinite";
type AccountAction = "deactivate" | "delete";

const DURATIONS: { value: DeactivationType; label: string; hint: string }[] = [
  { value: "1m", label: "1 mes", hint: "Vuelves automáticamente en 1 mes" },
  { value: "3m", label: "3 meses", hint: "Vuelves automáticamente en 3 meses" },
  { value: "6m", label: "6 meses", hint: "Vuelves automáticamente en 6 meses" },
  {
    value: "indefinite",
    label: "Indefinido",
    hint: "Tu cuenta permanece oculta hasta que vuelvas a iniciar sesión",
  },
];

const RESEND_COOLDOWN_SECONDS = 60;

function maskEmail(email?: string | null): string {
  if (!email) return "tu correo";
  const [user, domain] = email.split("@");
  if (!domain) return email;
  const shown = user.slice(0, 2);
  return `${shown}${"•".repeat(Math.max(user.length - 2, 1))}@${domain}`;
}

const GOLD_FEATURES = [
  "KixxMe Live · videollamadas en directo",
  "SuperLikes ilimitados",
  "Ver quién visitó tu perfil",
  "Mensajes ilimitados sin espera",
  "Soporte prioritario 24h",
  "Perfil Gold destacado en búsquedas",
];

const PLUS_FEATURES = [
  "Ver quién visitó tu perfil",
  "Más Me Gusta diarios (+5 extras)",
  "Potencia tu perfil con boost",
  "Historial de Me Gusta recibidos",
];

export default function Settings() {
  const [, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const { data: myProfile } = useGetMyProfile({});

  const [duration, setDuration] = useState<DeactivationType>("1m");
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyAction, setVerifyAction] = useState<AccountAction>("deactivate");
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);

  const requestCode = useRequestAccountActionCode();
  const confirmAction = useConfirmAccountAction();
  const { data: subscription } = useGetSubscription();

  const showCancelSubscription =
    !!subscription?.has_active_subscription &&
    !subscription?.cancel_at_period_end;

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const startFlow = (action: AccountAction) => {
    requestCode.mutate(
      {
        data: {
          action,
          ...(action === "deactivate" ? { deactivationType: duration } : {}),
        },
      },
      {
        onSuccess: (res) => {
          if (res.sent) {
            setVerifyAction(action);
            setCode("");
            setVerifyOpen(true);
            setCooldown(RESEND_COOLDOWN_SECONDS);
          } else {
            toast({
              title: "No pudimos enviar el código",
              description:
                res.message ??
                "El envío de correos no está disponible ahora mismo. Inténtalo más tarde.",
              variant: "destructive",
            });
          }
        },
        onError: (err: any) => {
          toast({
            title: "No se pudo enviar el código",
            description: err?.data?.error ?? err?.message ?? "Error desconocido",
            variant: "destructive",
          });
        },
      },
    );
  };

  const resendCode = () => {
    if (cooldown > 0) return;
    requestCode.mutate(
      {
        data: {
          action: verifyAction,
          ...(verifyAction === "deactivate"
            ? { deactivationType: duration }
            : {}),
        },
      },
      {
        onSuccess: (res) => {
          if (res.sent) {
            setCooldown(RESEND_COOLDOWN_SECONDS);
            toast({ title: "Código reenviado", description: "Revisa tu correo." });
          } else {
            toast({
              title: "No pudimos reenviar el código",
              description: res.message ?? "Inténtalo más tarde.",
              variant: "destructive",
            });
          }
        },
        onError: (err: any) => {
          toast({
            title: "No se pudo reenviar el código",
            description: err?.data?.error ?? err?.message ?? "Error desconocido",
            variant: "destructive",
          });
        },
      },
    );
  };

  const submitCode = () => {
    if (code.length !== 6) return;
    confirmAction.mutate(
      { data: { action: verifyAction, code } },
      {
        onSuccess: () => {
          setVerifyOpen(false);
          toast({
            title:
              verifyAction === "delete"
                ? "Cuenta eliminada"
                : "Cuenta desactivada",
            description:
              verifyAction === "delete"
                ? "Tu cuenta y tus datos se han eliminado. Esperamos verte de nuevo algún día."
                : "Tu cuenta está oculta. Vuelve a iniciar sesión cuando quieras reactivarla.",
          });
          logout();
        },
        onError: (err: any) => {
          toast({
            title: "Código incorrecto",
            description:
              err?.data?.error ??
              err?.message ??
              "Revisa el código e inténtalo de nuevo.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const planLabel =
    myProfile?.plan === "gold" ? "Gold" :
    myProfile?.plan === "plus" ? "Plus" : null;
  const planColor =
    myProfile?.plan === "gold" ? "hsl(45,90%,60%)" :
    myProfile?.plan === "plus" ? "hsl(273,75%,72%)" : null;

  return (
    <div className="min-h-full pb-24 relative overflow-hidden" style={{ background: "hsl(238,32%,4%)" }}>
      {/* Aurora ambient background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute -top-24 left-1/4 w-[28rem] h-[28rem] rounded-full" style={{ background: "radial-gradient(circle, rgba(168,85,247,0.30) 0%, rgba(168,85,247,0.08) 55%, transparent 72%)", filter: "blur(56px)" }} />
        <div className="absolute bottom-1/3 -right-16 w-72 h-72 rounded-full" style={{ background: "radial-gradient(circle, rgba(236,72,153,0.22) 0%, transparent 68%)", filter: "blur(48px)" }} />
      </div>

      <header
        className="sticky top-0 z-20 px-5 py-4 flex items-center gap-3 relative"
        style={{ background: "rgba(8,7,18,0.97)", backdropFilter: "blur(28px)" }}
      >
        <div
          className="absolute bottom-0 left-0 right-0 h-[2px]"
          style={{ background: "linear-gradient(90deg, transparent 0%, rgba(139,92,246,0.95) 20%, rgba(168,85,247,1.0) 38%, rgba(236,72,153,0.90) 55%, rgba(168,85,247,0.95) 72%, rgba(139,92,246,0.85) 85%, transparent 100%)", boxShadow: "0 0 14px 1px rgba(168,85,247,0.45), 0 0 5px rgba(236,72,153,0.30)" }}
        />
        <SettingsIcon className="w-5 h-5 text-primary flex-shrink-0" />
        <h1 className="font-display text-2xl tracking-wide flex-1">Ajustes</h1>
      </header>

      {/* Account info card */}
      <div className="relative z-10 px-5 pt-5 pb-1">
        <button
          type="button"
          onClick={() => setLocation("/profile")}
          className="w-full flex items-center gap-3 p-4 rounded-2xl border transition-colors"
          style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(168,85,247,0.22)" }}
        >
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "linear-gradient(135deg,rgba(139,92,246,0.4),rgba(236,72,153,0.3))", border: "1px solid rgba(168,85,247,0.35)" }}>
            {myProfile?.avatar_url ? (
              <img src={myProfile.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <User className="w-5 h-5 text-primary" />
            )}
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className="font-display text-base tracking-wide text-white truncate">
              {myProfile?.username ?? user?.email?.split("@")[0] ?? "Mi perfil"}
            </p>
            <p className="font-sans text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {planLabel && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-display tracking-wider font-bold" style={{ color: planColor ?? undefined, background: myProfile?.plan === "gold" ? "rgba(251,191,36,0.12)" : "rgba(168,85,247,0.12)", border: `1px solid ${planColor}33` }}>
                {planLabel}
              </span>
            )}
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </div>
        </button>
      </div>

      <div className="relative z-10 px-5 pt-5">

        {/* ══ PREMIUM ══ */}
        {subscription?.has_active_subscription ? (
          /* ── Usuario con plan activo ── */
          <div className="mb-8">
            <p
              className="font-sans text-xs font-medium uppercase tracking-widest mb-1"
              style={{ color: "hsl(45,90%,60%)" }}
            >
              {subscription.is_trial ? "PRUEBA GRATUITA" : "TU PLAN"}
            </p>
            <h2
              className="font-display text-2xl tracking-widest mb-5"
              style={{
                background: "linear-gradient(90deg, hsl(45,90%,60%), hsl(38,95%,55%))",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              {subscription.is_trial ? "PRUEBA GOLD" : "PREMIUM"}
            </h2>
            <div
              className="rounded-2xl border p-4 mb-4"
              style={{
                background: "linear-gradient(135deg, rgba(251,191,36,0.08), rgba(168,85,247,0.06))",
                borderColor: "rgba(251,191,36,0.25)",
              }}
            >
              {subscription.is_trial && !subscription.cancel_at_period_end && (
                <p className="font-sans text-sm text-yellow-300 mb-2">
                  🔥 Disfrutando la prueba Gold gratuita
                </p>
              )}
              {subscription.is_trial && subscription.cancel_at_period_end && (
                <p className="font-sans text-sm text-yellow-400/80 mb-2">
                  ⏳ Tu prueba finaliza pronto
                </p>
              )}
              <p className="font-sans text-sm text-white/60">
                {subscription.cancel_at_period_end
                  ? "Suscripción activa · se cancela al final del período"
                  : "Suscripción activa y al día"}
              </p>
            </div>
            {showCancelSubscription && (
              <button
                type="button"
                onClick={() => setLocation("/settings/cancel-subscription")}
                className="w-full flex items-center gap-3 p-4 rounded-2xl border border-border/40 hover:border-border transition-colors"
                style={{ background: "rgba(13,11,26,0.7)" }}
                data-testid="button-cancel-subscription"
              >
                <CreditCard className="w-5 h-5 text-primary flex-shrink-0" />
                <span className="flex-1 text-left font-display text-base tracking-wide text-foreground">
                  {subscription.is_trial ? "Cancelar prueba gratuita" : "Cancelar suscripción"}
                </span>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>
            )}
          </div>
        ) : (
          /* ── Usuario sin plan: pantalla de ventas ── */
          <div className="mb-8">
            <p
              className="font-sans text-xs font-medium uppercase tracking-widest mb-1"
              style={{ color: "hsl(273,60%,70%)" }}
            >
              Membresía
            </p>
            <h2 className="font-display text-3xl tracking-widest text-white mb-6">
              Elige tu plan
            </h2>

            {/* ── GOLD ── */}
            <div
              className="rounded-2xl p-5 mb-4 relative overflow-hidden"
              style={{
                background: "linear-gradient(135deg, rgba(251,191,36,0.13), rgba(168,85,247,0.09))",
                border: "1.5px solid rgba(251,191,36,0.38)",
              }}
            >
              {/* RECOMENDADO badge */}
              <div className="absolute top-3.5 right-3.5">
                <span
                  className="px-2.5 py-1 rounded-full text-[10px] font-display tracking-widest font-bold"
                  style={{
                    background: "linear-gradient(135deg, hsl(45,90%,60%), hsl(38,95%,55%))",
                    color: "hsl(38,60%,15%)",
                  }}
                >
                  RECOMENDADO
                </span>
              </div>

              <div className="flex items-center gap-2.5 mb-1">
                <span className="text-2xl">👑</span>
                <span
                  className="font-display text-2xl tracking-wide"
                  style={{ color: "hsl(45,90%,62%)" }}
                >
                  KixxMe Gold
                </span>
              </div>
              <p className="font-sans text-sm text-white/60 mb-5">
                La experiencia completa de KixxMe
              </p>

              <ul className="space-y-2.5 mb-6">
                {GOLD_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                    <span className="font-sans text-sm text-white/80">{f}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => setLocation("/trial")}
                className="w-full h-12 rounded-xl font-display text-base tracking-widest text-white mb-2.5 flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                style={{ background: "linear-gradient(135deg, hsl(38,95%,52%), hsl(25,95%,50%))" }}
                data-testid="button-trial"
              >
                <Zap className="w-4 h-4" />
                🔥 Probar Gold GRATIS · 5 días
              </button>
              <button
                type="button"
                onClick={() => setLocation("/premium")}
                className="w-full h-10 rounded-xl border font-sans text-sm transition-colors hover:opacity-80"
                style={{
                  background: "rgba(251,191,36,0.05)",
                  borderColor: "rgba(251,191,36,0.22)",
                  color: "hsl(45,90%,62%)",
                }}
                data-testid="button-go-premium-gold"
              >
                Ver precios Gold →
              </button>
            </div>

            {/* ── PLUS ── */}
            <div
              className="rounded-2xl p-5 mb-2"
              style={{
                background: "linear-gradient(135deg, rgba(168,85,247,0.11), rgba(217,70,239,0.06))",
                border: "1.5px solid rgba(168,85,247,0.32)",
              }}
            >
              <div className="flex items-center gap-2.5 mb-1">
                <span className="text-2xl">💎</span>
                <span
                  className="font-display text-2xl tracking-wide"
                  style={{ color: "hsl(273,75%,72%)" }}
                >
                  KixxMe Plus
                </span>
              </div>
              <p className="font-sans text-sm text-white/60 mb-4">
                Más conexiones, más matches
              </p>

              <ul className="space-y-2.5 mb-5">
                {PLUS_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                    <span className="font-sans text-sm text-white/80">{f}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => setLocation("/premium")}
                className="w-full h-10 rounded-xl border font-sans text-sm transition-colors hover:opacity-80"
                style={{
                  background: "rgba(168,85,247,0.07)",
                  borderColor: "rgba(168,85,247,0.27)",
                  color: "hsl(273,75%,72%)",
                }}
                data-testid="button-go-premium-plus"
              >
                Ver plan Plus →
              </button>
            </div>
          </div>
        )}

        {/* ══ SEGURIDAD ══ */}
        <div className="flex items-center gap-3 mb-4" style={{ borderTop: "1px solid rgba(168,85,247,0.30)", paddingTop: "1.5rem" }}>
          <div className="h-px flex-1" style={{ background: "linear-gradient(90deg, rgba(168,85,247,0.55) 0%, transparent 100%)" }} />
          <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/70">Seguridad</span>
          <div className="h-px flex-1" style={{ background: "linear-gradient(90deg, transparent 0%, rgba(168,85,247,0.25) 100%)" }} />
        </div>
        <div className="space-y-3 mb-8">
          <button
            type="button"
            onClick={() => setLocation("/settings/password")}
            className="w-full flex items-center gap-3 p-4 rounded-2xl border border-border/40 hover:border-border transition-colors"
            style={{ background: "rgba(13,11,26,0.7)" }}
            data-testid="button-change-password"
          >
            <KeyRound className="w-5 h-5 text-primary flex-shrink-0" />
            <span className="flex-1 text-left font-display text-base tracking-wide text-foreground">
              Cambiar contraseña
            </span>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* ══ SOPORTE ══ */}
        <div className="flex items-center gap-3 mb-4" style={{ borderTop: "1px solid rgba(236,72,153,0.22)", paddingTop: "1.5rem" }}>
          <div className="h-px flex-1" style={{ background: "linear-gradient(90deg, rgba(236,72,153,0.45) 0%, transparent 100%)" }} />
          <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: "rgba(244,114,182,0.7)" }}>Soporte</span>
          <div className="h-px flex-1" style={{ background: "linear-gradient(90deg, transparent 0%, rgba(236,72,153,0.20) 100%)" }} />
        </div>
        <div className="space-y-3 mb-8">
          <button
            type="button"
            onClick={() => setLocation("/support")}
            className="w-full flex items-center gap-3 p-4 rounded-2xl border border-border/40 hover:border-border transition-colors"
            style={{ background: "rgba(13,11,26,0.7)" }}
            data-testid="button-contact-support"
          >
            <HeadphonesIcon className="w-5 h-5 text-primary flex-shrink-0" />
            <span className="flex-1 text-left font-display text-base tracking-wide text-foreground">
              Contactar soporte
            </span>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </button>

          <button
            type="button"
            onClick={() => setLocation("/support")}
            className="w-full flex items-center gap-3 p-4 rounded-2xl border border-border/40 hover:border-border transition-colors"
            style={{ background: "rgba(13,11,26,0.7)" }}
            data-testid="button-report-problem"
          >
            <MessageSquare className="w-5 h-5 text-primary flex-shrink-0" />
            <span className="flex-1 text-left font-display text-base tracking-wide text-foreground">
              Reportar un problema
            </span>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </button>

          <button
            type="button"
            onClick={() => setLocation("/legal")}
            className="w-full flex items-center gap-3 p-4 rounded-2xl border border-border/40 hover:border-border transition-colors"
            style={{ background: "rgba(13,11,26,0.7)" }}
            data-testid="button-legal"
          >
            <FileText className="w-5 h-5 text-primary flex-shrink-0" />
            <span className="flex-1 text-left font-display text-base tracking-wide text-foreground">
              Términos y privacidad
            </span>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* ══ CUENTA ══ */}
        <div className="flex items-center gap-3 mb-4" style={{ borderTop: "1px solid rgba(139,92,246,0.22)", paddingTop: "1.5rem" }}>
          <div className="h-px flex-1" style={{ background: "linear-gradient(90deg, rgba(139,92,246,0.45) 0%, transparent 100%)" }} />
          <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: "rgba(167,139,250,0.7)" }}>Cuenta</span>
          <div className="h-px flex-1" style={{ background: "linear-gradient(90deg, transparent 0%, rgba(139,92,246,0.20) 100%)" }} />
        </div>
        <div className="space-y-3 mb-8">
          <button
            type="button"
            onClick={() => setLocation("/settings/blocked")}
            className="w-full flex items-center gap-3 p-4 rounded-2xl border border-border/40 hover:border-border transition-colors"
            style={{ background: "rgba(13,11,26,0.7)" }}
            data-testid="button-blocked-users"
          >
            <Ban className="w-5 h-5 text-primary flex-shrink-0" />
            <span className="flex-1 text-left font-display text-base tracking-wide text-foreground">
              Usuarios bloqueados
            </span>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </button>

          <button
            type="button"
            onClick={() => logout()}
            className="w-full flex items-center gap-3 p-4 rounded-2xl border border-border/40 hover:border-border transition-colors"
            style={{ background: "rgba(13,11,26,0.7)" }}
            data-testid="button-logout"
          >
            <LogOut className="w-5 h-5 text-muted-foreground flex-shrink-0" />
            <span className="flex-1 text-left font-display text-base tracking-wide text-foreground">
              Cerrar sesión
            </span>
          </button>
        </div>

        {/* ══ GESTIÓN DE CUENTA ══ */}
        <div className="flex items-center gap-3 mb-4" style={{ borderTop: "1px solid rgba(239,68,68,0.18)", paddingTop: "1.5rem" }}>
          <div className="h-px flex-1" style={{ background: "linear-gradient(90deg, rgba(239,68,68,0.35) 0%, transparent 100%)" }} />
          <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: "rgba(252,165,165,0.65)" }}>Gestión de cuenta</span>
          <div className="h-px flex-1" style={{ background: "linear-gradient(90deg, transparent 0%, rgba(239,68,68,0.15) 100%)" }} />
        </div>
        <p className="font-sans text-sm text-muted-foreground mb-5">
          Tómate un descanso o elimina tu cuenta. Te pediremos un código de
          verificación enviado a tu correo.
        </p>

        {/* Deactivate / take a break */}
        <div
          className="border border-border/40 rounded-2xl p-5 space-y-4 mb-5"
          style={{ background: "rgba(13,11,26,0.7)" }}
        >
          <div className="flex items-center gap-2">
            <PauseCircle className="w-5 h-5 text-primary" />
            <h3 className="font-display text-lg tracking-wide text-foreground">
              Tomar un descanso
            </h3>
          </div>
          <p className="font-sans text-sm text-muted-foreground">
            Desactiva tu cuenta temporalmente. Dejarás de aparecer para otras
            personas y nadie podrá escribirte. Tus datos se conservan y vuelves
            cuando quieras.
          </p>

          <div className="space-y-2">
            {DURATIONS.map((d) => {
              const active = duration === d.value;
              return (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setDuration(d.value)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
                    active
                      ? "border-primary/60"
                      : "border-border/40 hover:border-border"
                  }`}
                  style={{
                    background: active
                      ? "rgba(168,85,247,0.1)"
                      : "rgba(255,255,255,0.02)",
                  }}
                  data-testid={`option-duration-${d.value}`}
                >
                  <span
                    className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                      active ? "border-primary" : "border-muted-foreground/50"
                    }`}
                    style={{
                      background: active ? "hsl(273,85%,55%)" : "transparent",
                      boxShadow: active ? "0 0 8px rgba(168,85,247,0.6)" : "none",
                    }}
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block font-sans text-sm font-medium text-foreground">
                      {d.label}
                    </span>
                    <span className="block font-sans text-xs text-muted-foreground">
                      {d.hint}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => startFlow("deactivate")}
            disabled={requestCode.isPending}
            className="w-full h-12 rounded-xl border border-primary/40 flex items-center justify-center gap-2 font-display text-lg tracking-widest text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
            style={{ background: "rgba(168,85,247,0.08)" }}
            data-testid="button-deactivate-account"
          >
            {requestCode.isPending &&
            requestCode.variables?.data.action === "deactivate" ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <PauseCircle className="w-5 h-5" />
            )}
            Desactivar mi cuenta
          </button>
        </div>

        {/* Danger zone — delete */}
        <div
          className="border border-red-500/30 rounded-2xl p-5 space-y-4"
          style={{ background: "rgba(239,68,68,0.05)" }}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <h3 className="font-display text-lg tracking-wide text-red-300">
              Zona de peligro
            </h3>
          </div>
          <p className="font-sans text-sm text-muted-foreground">
            Eliminar tu cuenta es{" "}
            <span className="text-red-300 font-medium">permanente</span>.
            Se borrarán tu perfil, tus fotos, tus chats y tus me gusta. Esta acción
            no se puede deshacer.
          </p>
          <button
            type="button"
            onClick={() => startFlow("delete")}
            disabled={requestCode.isPending}
            className="w-full h-12 rounded-xl border border-red-500/50 flex items-center justify-center gap-2 font-display text-lg tracking-widest text-red-300 hover:bg-red-500/10 transition-colors disabled:opacity-50"
            style={{ background: "rgba(239,68,68,0.08)" }}
            data-testid="button-delete-account"
          >
            {requestCode.isPending &&
            requestCode.variables?.data.action === "delete" ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Trash2 className="w-5 h-5" />
            )}
            Eliminar cuenta permanentemente
          </button>
        </div>
      </div>

      <Dialog open={verifyOpen} onOpenChange={(o) => !confirmAction.isPending && setVerifyOpen(o)}>
        <DialogContent className="max-w-sm border-border/50" data-testid="dialog-verify-code">
          <DialogHeader>
            <div className="flex items-center gap-2">
              {verifyAction === "delete" ? (
                <AlertTriangle className="w-5 h-5 text-red-400" />
              ) : (
                <ShieldCheck className="w-5 h-5 text-primary" />
              )}
              <DialogTitle className="font-display text-xl tracking-wide">
                {verifyAction === "delete"
                  ? "Confirmar eliminación"
                  : "Confirmar desactivación"}
              </DialogTitle>
            </div>
            <DialogDescription className="font-sans text-sm text-muted-foreground pt-1">
              <span className="flex items-center gap-1.5">
                <Mail className="w-4 h-4 flex-shrink-0" />
                Enviamos un código de 6 dígitos a{" "}
                <span className="text-foreground">{maskEmail(user?.email)}</span>
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-center py-3">
            <InputOTP
              maxLength={6}
              value={code}
              onChange={setCode}
              disabled={confirmAction.isPending}
              data-testid="input-verification-code"
            >
              <InputOTPGroup className="gap-2">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <InputOTPSlot
                    key={i}
                    index={i}
                    className="h-12 w-11 rounded-lg border-border/60 text-lg font-display"
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={resendCode}
              disabled={cooldown > 0 || requestCode.isPending}
              className="font-sans text-xs text-primary/80 hover:text-primary disabled:text-muted-foreground disabled:cursor-not-allowed"
              data-testid="button-resend-code"
            >
              {cooldown > 0
                ? `Reenviar código en ${cooldown}s`
                : "Reenviar código"}
            </button>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <button
              type="button"
              onClick={submitCode}
              disabled={code.length !== 6 || confirmAction.isPending}
              className="w-full h-12 rounded-xl flex items-center justify-center gap-2 font-display text-lg tracking-widest text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{
                background:
                  verifyAction === "delete"
                    ? "linear-gradient(135deg, hsl(0,75%,50%), hsl(20,85%,50%))"
                    : "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
              }}
              data-testid="button-confirm-code"
            >
              {confirmAction.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : verifyAction === "delete" ? (
                <Trash2 className="w-5 h-5" />
              ) : (
                <PauseCircle className="w-5 h-5" />
              )}
              {verifyAction === "delete"
                ? "Eliminar mi cuenta"
                : "Desactivar mi cuenta"}
            </button>
            <button
              type="button"
              onClick={() => setVerifyOpen(false)}
              disabled={confirmAction.isPending}
              className="w-full h-10 rounded-xl border border-border/40 font-sans text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              data-testid="button-cancel-verify"
            >
              Cancelar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
