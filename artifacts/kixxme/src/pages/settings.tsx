import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  useRequestAccountActionCode,
  useConfirmAccountAction,
  useGetSubscription,
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
  ChevronLeft,
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

export default function Settings() {
  const [, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const { toast } = useToast();

  const [duration, setDuration] = useState<DeactivationType>("1m");
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyAction, setVerifyAction] = useState<AccountAction>("deactivate");
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);

  const requestCode = useRequestAccountActionCode();
  const confirmAction = useConfirmAccountAction();
  const { data: subscription } = useGetSubscription();

  // Only a real, not-yet-cancelled paid subscription can be cancelled here.
  // GOLD_TEST_EMAILS overrides have no Stripe sub, so this stays false for them.
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

  return (
    <div className="min-h-full pb-10">
      <header
        className="px-4 py-3 flex items-center gap-3 border-b border-border/30 sticky top-0 z-10"
        style={{ background: "rgba(8,7,18,0.7)", backdropFilter: "blur(12px)" }}
      >
        <button
          type="button"
          onClick={() => setLocation("/profile")}
          className="w-9 h-9 flex items-center justify-center rounded-xl border border-border/40 text-muted-foreground hover:text-foreground transition-colors"
          style={{ background: "rgba(255,255,255,0.04)" }}
          data-testid="button-settings-back"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <SettingsIcon className="w-5 h-5 text-primary" />
          <h1 className="font-display text-2xl tracking-wide">Ajustes</h1>
        </div>
      </header>

      <div className="px-5 pt-6">
        {/* Quick actions: blocked users + logout */}
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

        <h2 className="font-display text-xl tracking-widest text-foreground mb-1">
          SEGURIDAD
        </h2>
        <p className="font-sans text-sm text-muted-foreground mb-5">
          Mantén tu cuenta protegida.
        </p>

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

        {showCancelSubscription ? (
          <>
            <h2 className="font-display text-xl tracking-widest text-foreground mb-1">
              SUSCRIPCIÓN
            </h2>
            <p className="font-sans text-sm text-muted-foreground mb-5">
              Gestiona tu plan premium.
            </p>

            <div className="space-y-3 mb-8">
              <button
                type="button"
                onClick={() => setLocation("/settings/cancel-subscription")}
                className="w-full flex items-center gap-3 p-4 rounded-2xl border border-border/40 hover:border-border transition-colors"
                style={{ background: "rgba(13,11,26,0.7)" }}
                data-testid="button-cancel-subscription"
              >
                <CreditCard className="w-5 h-5 text-primary flex-shrink-0" />
                <span className="flex-1 text-left font-display text-base tracking-wide text-foreground">
                  Cancelar suscripción
                </span>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
          </>
        ) : null}

        <h2 className="font-display text-xl tracking-widest text-foreground mb-1">
          GESTIÓN DE CUENTA
        </h2>
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
            {requestCode.isPending && requestCode.variables?.data.action === "deactivate" ? (
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
            Eliminar tu cuenta es <span className="text-red-300 font-medium">permanente</span>.
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
            {requestCode.isPending && requestCode.variables?.data.action === "delete" ? (
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
              className={`w-full h-12 rounded-xl flex items-center justify-center gap-2 font-display text-lg tracking-widest text-white transition-opacity hover:opacity-90 disabled:opacity-40 ${
                verifyAction === "delete" ? "" : ""
              }`}
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
