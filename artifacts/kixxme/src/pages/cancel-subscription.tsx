import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  useGetSubscription,
  useRequestSubscriptionCancelCode,
  useConfirmSubscriptionCancel,
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
  CreditCard,
  Crown,
  CalendarClock,
  Loader2,
  Mail,
  CheckCircle2,
  XCircle,
} from "lucide-react";

const RESEND_COOLDOWN_SECONDS = 60;
const GRADIENT = "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))";

function maskEmail(email?: string | null): string {
  if (!email) return "tu correo";
  const [user, domain] = email.split("@");
  if (!domain) return email;
  const shown = user.slice(0, 2);
  return `${shown}${"•".repeat(Math.max(user.length - 2, 1))}@${domain}`;
}

function formatDateEs(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

function planLabel(tier?: string | null, plan?: string | null): string {
  const t = (tier ?? plan ?? "").toLowerCase();
  if (t === "gold") return "Gold";
  if (t === "plus") return "Plus";
  return "Premium";
}

type Step = "intro" | "code";

export default function CancelSubscription() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: subscription, isLoading } = useGetSubscription();

  const [step, setStep] = useState<Step>("intro");
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [done, setDone] = useState(false);
  // The confirmed end date returned by the server, shown on the done screen.
  const [confirmedEnd, setConfirmedEnd] = useState<string | null>(null);

  const requestCode = useRequestSubscriptionCancelCode();
  const confirmCancel = useConfirmSubscriptionCancel();

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  // Guard: if there is no cancellable subscription (free user, test-Gold, or
  // already scheduled to cancel), bounce back to Ajustes. Never block the
  // success screen.
  useEffect(() => {
    if (isLoading || done || !subscription) return;
    if (
      !subscription.has_active_subscription ||
      subscription.cancel_at_period_end
    ) {
      setLocation("/settings");
    }
  }, [isLoading, done, subscription, setLocation]);

  const plan = planLabel(subscription?.tier, subscription?.plan);
  const periodEnd = formatDateEs(subscription?.current_period_end);

  const submitRequest = () => {
    requestCode.mutate(undefined, {
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
          title: "No se pudo solicitar la cancelación",
          description: err?.data?.error ?? err?.message ?? "Error desconocido",
          variant: "destructive",
        });
      },
    });
  };

  const resendCode = () => {
    if (cooldown > 0 || requestCode.isPending) return;
    requestCode.mutate(undefined, {
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
    confirmCancel.mutate(
      { data: { code } },
      {
        onSuccess: (res) => {
          setConfirmedEnd(formatDateEs(res.current_period_end));
          setDone(true);
          toast({
            title: "Suscripción cancelada",
            description:
              "Tu plan no se renovará. Seguirás disfrutando de las ventajas hasta el final del periodo.",
          });
        },
        onError: (err: any) => {
          setCode("");
          toast({
            title: "No se pudo cancelar la suscripción",
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
            step === "code" && !done ? setStep("intro") : setLocation("/settings")
          }
          className="w-9 h-9 flex items-center justify-center rounded-xl border border-border/40 text-muted-foreground hover:text-foreground transition-colors"
          style={{ background: "rgba(255,255,255,0.04)" }}
          data-testid="button-cancel-back"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-primary" />
          <h1 className="font-display text-2xl tracking-wide">
            Cancelar suscripción
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
              Suscripción cancelada
            </h2>
            <p className="font-sans text-sm text-muted-foreground">
              Tu plan {plan} no se renovará automáticamente.
              {confirmedEnd
                ? ` Conservarás todas las ventajas hasta el ${confirmedEnd}.`
                : " Conservarás todas las ventajas hasta el final del periodo de facturación."}
            </p>
            <button
              type="button"
              onClick={() => setLocation("/settings")}
              className="w-full h-12 rounded-xl flex items-center justify-center gap-2 font-display text-lg tracking-widest text-white transition-opacity hover:opacity-90"
              style={{ background: GRADIENT }}
              data-testid="button-cancel-done"
            >
              Volver a Ajustes
            </button>
          </div>
        ) : step === "intro" ? (
          <>
            <div className="flex items-center gap-2 mb-1">
              <Crown className="w-5 h-5 text-primary" />
              <h2 className="font-display text-xl tracking-wide text-foreground">
                Plan {plan}
              </h2>
            </div>
            <p className="font-sans text-sm text-muted-foreground mb-6">
              Vas a cancelar tu suscripción. No perderás nada de inmediato: tu
              plan seguirá activo hasta el final del periodo ya pagado y después
              pasará a gratuito sin volver a cobrarte.
            </p>

            <div
              className="border border-border/40 rounded-2xl p-5 space-y-4"
              style={{ background: "rgba(13,11,26,0.7)" }}
            >
              {periodEnd ? (
                <div
                  className="flex items-start gap-3 rounded-xl p-3"
                  style={{ background: "rgba(168,85,247,0.08)" }}
                >
                  <CalendarClock className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="font-sans text-sm font-medium text-foreground">
                      Acceso hasta el {periodEnd}
                    </p>
                    <p className="font-sans text-xs text-muted-foreground">
                      Mantienes todas las ventajas {plan} hasta esa fecha.
                    </p>
                  </div>
                </div>
              ) : null}

              <p className="font-sans text-sm text-muted-foreground">
                Para confirmar, te enviaremos un código de verificación a tu
                correo.
              </p>

              <button
                type="button"
                onClick={submitRequest}
                disabled={requestCode.isPending}
                className="w-full h-12 rounded-xl flex items-center justify-center gap-2 font-display text-lg tracking-widest text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: GRADIENT }}
                data-testid="button-request-cancel"
              >
                {requestCode.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Mail className="w-5 h-5" />
                )}
                Solicitar código
              </button>

              <button
                type="button"
                onClick={() => setLocation("/settings")}
                disabled={requestCode.isPending}
                className="w-full h-10 rounded-xl border border-border/40 font-sans text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                data-testid="button-keep-subscription"
              >
                Mantener mi suscripción
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-1">
              <XCircle className="w-5 h-5 text-primary" />
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
                  disabled={confirmCancel.isPending}
                  data-testid="input-cancel-code"
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
                  data-testid="button-resend-cancel-code"
                >
                  {cooldown > 0
                    ? `Reenviar código en ${cooldown}s`
                    : "Reenviar código"}
                </button>
              </div>

              <button
                type="button"
                onClick={submitCode}
                disabled={code.length !== 6 || confirmCancel.isPending}
                className="w-full h-12 rounded-xl flex items-center justify-center gap-2 font-display text-lg tracking-widest text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                style={{ background: GRADIENT }}
                data-testid="button-confirm-cancel"
              >
                {confirmCancel.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <XCircle className="w-5 h-5" />
                )}
                Confirmar cancelación
              </button>

              <button
                type="button"
                onClick={() => setStep("intro")}
                disabled={confirmCancel.isPending}
                className="w-full h-10 rounded-xl border border-border/40 font-sans text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                data-testid="button-back-to-intro"
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
