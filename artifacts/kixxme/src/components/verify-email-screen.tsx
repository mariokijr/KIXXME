import React, { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useSendEmailVerificationCode,
  useConfirmEmailVerification,
  getGetEmailVerificationQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { KixxMeLogo } from "@/components/brand/kixxme-logo";
import { MailCheck, Loader2 } from "lucide-react";

const RESEND_COOLDOWN_SECONDS = 60;
const GRADIENT = "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))";

// The exact, product-mandated Spanish copy for the verification step.
const VERIFY_MESSAGE =
  "Te hemos enviado un código de verificación a tu correo electrónico. " +
  "Cópialo y pégalo aquí para completar tu registro. Si no lo ves en tu " +
  "bandeja de entrada, revisa la carpeta de spam o correo no deseado.";

function maskEmail(email?: string | null): string {
  if (!email) return "tu correo";
  const [user, domain] = email.split("@");
  if (!domain) return email;
  const shown = user.slice(0, 2);
  return `${shown}${"•".repeat(Math.max(user.length - 2, 1))}@${domain}`;
}

/**
 * Full-screen mandatory email-verification step shown by EmailVerificationGate
 * to a freshly-registered user. Mirrors the change-password OTP step: 6-digit
 * code, 60s resend cooldown, masked email. Auto-sends a code once on mount
 * (ref-guarded; tolerates the 429 that happens when signup already sent one).
 * On success it flips the cached status so the gate immediately lets the app
 * render, and invalidates every query so surfaces that 403'd while unverified
 * refetch cleanly.
 */
export function VerifyEmailScreen({ email }: { email?: string | null }) {
  const { toast } = useToast();
  const { logout } = useAuth();
  const queryClient = useQueryClient();

  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  const sendCode = useSendEmailVerificationCode();
  const confirm = useConfirmEmailVerification();
  const autoSentRef = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  // Auto-send a fresh code once on mount. A 429 means a code was already sent at
  // signup (still valid), so we silently keep the cooldown — never an error.
  useEffect(() => {
    if (autoSentRef.current) return;
    autoSentRef.current = true;
    sendCode.mutate(undefined, {
      onSuccess: () => setCooldown(RESEND_COOLDOWN_SECONDS),
      onError: () => setCooldown(RESEND_COOLDOWN_SECONDS),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flipVerified = (data: { verified: boolean; email: string }) => {
    queryClient.setQueryData(getGetEmailVerificationQueryKey(), data);
    // Everything that 403'd while unverified can now load.
    void queryClient.invalidateQueries();
  };

  const resendCode = () => {
    if (cooldown > 0 || sendCode.isPending) return;
    sendCode.mutate(undefined, {
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
    });
  };

  const submitCode = () => {
    if (code.length !== 6) return;
    confirm.mutate(
      { data: { code } },
      {
        onSuccess: (data) => {
          toast({
            title: "¡Correo verificado!",
            description: "Tu cuenta ya está activa. ¡Bienvenido a KixxMe!",
          });
          flipVerified(data);
        },
        onError: (err: any) => {
          setCode("");
          toast({
            title: "No se pudo verificar",
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
    <div
      className="min-h-[100dvh] w-full flex flex-col items-center justify-center px-5 py-10"
      style={{
        background:
          "radial-gradient(ellipse 80% 60% at 50% 0%, hsl(270 40% 12%) 0%, hsl(238 25% 5%) 65%)",
      }}
    >
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center text-center mb-6">
          <KixxMeLogo size={56} badge />
          <h1 className="mt-4 font-display text-2xl tracking-wide text-foreground">
            Confirma tu correo
          </h1>
        </div>

        <div
          className="border border-border/40 rounded-2xl p-6 space-y-5"
          style={{ background: "rgba(13,11,26,0.7)" }}
        >
          <div className="flex justify-center">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ background: "rgba(168,77,240,0.14)" }}
            >
              <MailCheck className="w-7 h-7 text-primary" />
            </div>
          </div>

          <p
            className="font-sans text-sm text-muted-foreground text-center leading-relaxed"
            data-testid="text-verify-message"
          >
            {VERIFY_MESSAGE}
          </p>

          <p className="font-sans text-xs text-center text-foreground/80">
            {maskEmail(email)}
          </p>

          <div className="flex justify-center py-1">
            <InputOTP
              maxLength={6}
              value={code}
              onChange={setCode}
              disabled={confirm.isPending}
              data-testid="input-email-code"
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
              disabled={cooldown > 0 || sendCode.isPending}
              className="font-sans text-xs text-primary/80 hover:text-primary disabled:text-muted-foreground disabled:cursor-not-allowed"
              data-testid="button-resend-email-code"
            >
              {cooldown > 0
                ? `Reenviar código en ${cooldown}s`
                : "Reenviar código"}
            </button>
          </div>

          <button
            type="button"
            onClick={submitCode}
            disabled={code.length !== 6 || confirm.isPending}
            className="w-full h-12 rounded-xl flex items-center justify-center gap-2 font-display text-lg tracking-widest text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ background: GRADIENT }}
            data-testid="button-confirm-email"
          >
            {confirm.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <MailCheck className="w-5 h-5" />
            )}
            Completar registro
          </button>
        </div>

        <p className="mt-5 text-center font-sans text-xs text-muted-foreground">
          ¿Te equivocaste de correo?{" "}
          <button
            type="button"
            onClick={() => logout()}
            className="text-primary/80 hover:text-primary underline-offset-2 hover:underline"
            data-testid="button-logout-verify"
          >
            Cerrar sesión
          </button>
        </p>
      </div>
    </div>
  );
}
