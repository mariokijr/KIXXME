import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  useRequestPasswordChangeCode,
  useConfirmPasswordChange,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import {
  ChevronLeft,
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  Loader2,
  Mail,
  CheckCircle2,
} from "lucide-react";

const RESEND_COOLDOWN_SECONDS = 60;
const MIN_PASSWORD_LENGTH = 8;

const GRADIENT = "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))";

function maskEmail(email?: string | null): string {
  if (!email) return "tu correo";
  const [user, domain] = email.split("@");
  if (!domain) return email;
  const shown = user.slice(0, 2);
  return `${shown}${"•".repeat(Math.max(user.length - 2, 1))}@${domain}`;
}

/** Mirrors the server-side `validateNewPassword` rules (≥8, letra + número). */
function validateNewPassword(pw: string): string | null {
  if (pw.length < MIN_PASSWORD_LENGTH) {
    return `La nueva contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (!/[a-zA-Z]/.test(pw)) {
    return "La nueva contraseña debe incluir al menos una letra.";
  }
  if (!/[0-9]/.test(pw)) {
    return "La nueva contraseña debe incluir al menos un número.";
  }
  return null;
}

type Step = "form" | "code";

function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  testId,
  error,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoComplete: string;
  testId: string;
  error?: string | null;
  disabled?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="block font-sans text-sm font-medium text-foreground"
      >
        {label}
      </label>
      <div className="relative">
        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          disabled={disabled}
          className={`w-full h-12 rounded-xl border bg-transparent pl-10 pr-11 font-sans text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus:border-primary/60 disabled:opacity-50 ${
            error ? "border-red-500/60" : "border-border/50"
          }`}
          style={{ background: "rgba(255,255,255,0.02)" }}
          data-testid={testId}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          tabIndex={-1}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
          data-testid={`${testId}-toggle`}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {error ? (
        <p className="font-sans text-xs text-red-400" data-testid={`${testId}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default function ChangePassword() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("form");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [showErrors, setShowErrors] = useState(false);

  // The new password is held only in memory between the two screens and is
  // re-sent at confirm. It is never persisted anywhere on the client.
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [done, setDone] = useState(false);

  const requestCode = useRequestPasswordChangeCode();
  const confirmChange = useConfirmPasswordChange();

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const newPasswordError = useMemo(() => {
    if (!newPassword) return "La nueva contraseña es obligatoria.";
    const formatError = validateNewPassword(newPassword);
    if (formatError) return formatError;
    if (currentPassword && newPassword === currentPassword) {
      return "La nueva contraseña no puede ser igual a la actual.";
    }
    return null;
  }, [newPassword, currentPassword]);

  const repeatError = useMemo(() => {
    if (!repeatPassword) return "Repite la nueva contraseña.";
    if (repeatPassword !== newPassword) return "Las contraseñas no coinciden.";
    return null;
  }, [repeatPassword, newPassword]);

  const currentError = currentPassword ? null : "La contraseña actual es obligatoria.";

  const formValid = !currentError && !newPasswordError && !repeatError;

  const submitRequest = () => {
    setShowErrors(true);
    if (!formValid) return;
    requestCode.mutate(
      { data: { currentPassword, newPassword } },
      {
        onSuccess: (res) => {
          if (res.sent) {
            setCode("");
            setStep("code");
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
            title: "No se pudo solicitar el cambio",
            description: err?.data?.error ?? err?.message ?? "Error desconocido",
            variant: "destructive",
          });
        },
      },
    );
  };

  const resendCode = () => {
    if (cooldown > 0 || requestCode.isPending) return;
    requestCode.mutate(
      { data: { currentPassword, newPassword } },
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
    confirmChange.mutate(
      { data: { code, newPassword } },
      {
        onSuccess: () => {
          setDone(true);
          toast({
            title: "Contraseña actualizada correctamente",
            description: "Tu nueva contraseña ya está activa.",
          });
        },
        onError: (err: any) => {
          setCode("");
          toast({
            title: "No se pudo cambiar la contraseña",
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
          onClick={() =>
            step === "code" && !done
              ? setStep("form")
              : setLocation("/settings")
          }
          className="w-9 h-9 flex items-center justify-center rounded-xl border border-border/40 text-muted-foreground hover:text-foreground transition-colors"
          style={{ background: "rgba(255,255,255,0.04)" }}
          data-testid="button-password-back"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-primary" />
          <h1 className="font-display text-2xl tracking-wide">
            Cambiar contraseña
          </h1>
        </div>
      </header>

      <div className="px-5 pt-6 max-w-md mx-auto">
        {done ? (
          <div
            className="border border-border/40 rounded-2xl p-6 text-center space-y-4"
            style={{ background: "rgba(13,11,26,0.7)" }}
          >
            <div className="flex justify-center">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center"
                style={{ background: "rgba(34,197,94,0.12)" }}
              >
                <CheckCircle2 className="w-8 h-8 text-green-400" />
              </div>
            </div>
            <h2 className="font-display text-xl tracking-wide text-foreground">
              Contraseña actualizada correctamente
            </h2>
            <p className="font-sans text-sm text-muted-foreground">
              Tu nueva contraseña ya está activa. Te hemos enviado un correo de
              confirmación de seguridad.
            </p>
            <button
              type="button"
              onClick={() => setLocation("/settings")}
              className="w-full h-12 rounded-xl flex items-center justify-center gap-2 font-display text-lg tracking-widest text-white transition-opacity hover:opacity-90"
              style={{ background: GRADIENT }}
              data-testid="button-password-done"
            >
              Volver a Ajustes
            </button>
          </div>
        ) : step === "form" ? (
          <>
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="w-5 h-5 text-primary" />
              <h2 className="font-display text-xl tracking-wide text-foreground">
                Tu seguridad primero
              </h2>
            </div>
            <p className="font-sans text-sm text-muted-foreground mb-6">
              Confirma tu contraseña actual y elige una nueva. Te enviaremos un
              código de verificación a tu correo para completar el cambio.
            </p>

            <div
              className="border border-border/40 rounded-2xl p-5 space-y-4"
              style={{ background: "rgba(13,11,26,0.7)" }}
            >
              <PasswordField
                id="current-password"
                label="Contraseña actual"
                value={currentPassword}
                onChange={setCurrentPassword}
                placeholder="Tu contraseña actual"
                autoComplete="current-password"
                testId="input-current-password"
                disabled={requestCode.isPending}
                error={showErrors ? currentError : null}
              />
              <PasswordField
                id="new-password"
                label="Nueva contraseña"
                value={newPassword}
                onChange={setNewPassword}
                placeholder="Mínimo 8 caracteres, con letras y números"
                autoComplete="new-password"
                testId="input-new-password"
                disabled={requestCode.isPending}
                error={showErrors ? newPasswordError : null}
              />
              <PasswordField
                id="repeat-password"
                label="Repetir nueva contraseña"
                value={repeatPassword}
                onChange={setRepeatPassword}
                placeholder="Vuelve a escribir la nueva contraseña"
                autoComplete="new-password"
                testId="input-repeat-password"
                disabled={requestCode.isPending}
                error={showErrors ? repeatError : null}
              />

              <button
                type="button"
                onClick={submitRequest}
                disabled={requestCode.isPending}
                className="w-full h-12 rounded-xl flex items-center justify-center gap-2 font-display text-lg tracking-widest text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: GRADIENT }}
                data-testid="button-request-change"
              >
                {requestCode.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Mail className="w-5 h-5" />
                )}
                Solicitar cambio
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="w-5 h-5 text-primary" />
              <h2 className="font-display text-xl tracking-wide text-foreground">
                Introduce el código
              </h2>
            </div>
            <p className="font-sans text-sm text-muted-foreground mb-6">
              <span className="flex items-center gap-1.5">
                <Mail className="w-4 h-4 flex-shrink-0" />
                Enviamos un código de 6 dígitos a{" "}
                <span className="text-foreground">{maskEmail(user?.email)}</span>
              </span>
            </p>

            <div
              className="border border-border/40 rounded-2xl p-5 space-y-4"
              style={{ background: "rgba(13,11,26,0.7)" }}
            >
              <div className="flex justify-center py-2">
                <InputOTP
                  maxLength={6}
                  value={code}
                  onChange={setCode}
                  disabled={confirmChange.isPending}
                  data-testid="input-password-code"
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
                  data-testid="button-resend-password-code"
                >
                  {cooldown > 0
                    ? `Reenviar código en ${cooldown}s`
                    : "Reenviar código"}
                </button>
              </div>

              <button
                type="button"
                onClick={submitCode}
                disabled={code.length !== 6 || confirmChange.isPending}
                className="w-full h-12 rounded-xl flex items-center justify-center gap-2 font-display text-lg tracking-widest text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                style={{ background: GRADIENT }}
                data-testid="button-confirm-change"
              >
                {confirmChange.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <KeyRound className="w-5 h-5" />
                )}
                Cambiar contraseña
              </button>

              <button
                type="button"
                onClick={() => setStep("form")}
                disabled={confirmChange.isPending}
                className="w-full h-10 rounded-xl border border-border/40 font-sans text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                data-testid="button-back-to-form"
              >
                Volver
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
