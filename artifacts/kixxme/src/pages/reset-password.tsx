import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link } from "wouter";
import { useResetPassword } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { KixxMeLogo } from "@/components/brand/kixxme-logo";
import { AlertTriangle } from "lucide-react";

const formSchema = z
  .object({
    password: z.string().min(6, "Mínimo 6 caracteres"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Las contraseñas no coinciden",
    path: ["confirm"],
  });

export default function ResetPassword() {
  const { applySession } = useAuth();
  const { toast } = useToast();
  const reset = useResetPassword();

  const [ready, setReady] = React.useState(false);
  const [token, setToken] = React.useState<string | null>(null);
  const [linkError, setLinkError] = React.useState<string | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { password: "", confirm: "" },
  });

  // The recovery link lands here with the session (or an error) in the URL hash.
  // The frontend supabase client has detectSessionInUrl:false, so we parse it
  // ourselves, then strip the sensitive hash from history.
  React.useEffect(() => {
    const raw = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    const params = new URLSearchParams(raw);

    const errorCode = params.get("error_code");
    const error = params.get("error");
    const accessToken = params.get("access_token");

    if (error || errorCode) {
      setLinkError(
        errorCode === "otp_expired"
          ? "El enlace ha caducado. Solicita uno nuevo."
          : "El enlace no es válido. Solicita uno nuevo.",
      );
    } else if (accessToken) {
      setToken(accessToken);
    } else {
      setLinkError("El enlace no es válido o ha caducado. Solicita uno nuevo.");
    }

    // Remove the token / error from the URL so it isn't left in browser history.
    window.history.replaceState(
      {},
      "",
      window.location.pathname + window.location.search,
    );
    setReady(true);
  }, []);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!token) return;
    try {
      const res = await reset.mutateAsync({
        data: { accessToken: token, password: values.password },
      });
      toast({
        title: "Contraseña actualizada",
        description: "Tu contraseña se ha cambiado correctamente.",
      });
      applySession(res);
    } catch (err: any) {
      const msg =
        err?.data?.error ?? "No se pudo restablecer la contraseña.";
      // A token that was valid on load can expire before submit — treat any
      // server rejection as a dead link and let the user request a new one.
      setLinkError(msg);
      toast({
        title: "No se pudo restablecer",
        description: msg,
        variant: "destructive",
      });
    }
  };

  if (!ready) return null;

  return (
    <div
      className="min-h-[100dvh] flex flex-col items-center justify-center p-4"
      style={{
        background:
          "radial-gradient(ellipse 90% 65% at 50% 0%, hsl(270 40% 12%) 0%, hsl(238 25% 5%) 65%)",
      }}
    >
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <KixxMeLogo size={72} badge />
          </div>
          <h1
            className="text-4xl font-display tracking-tight text-gradient-brand"
            data-testid="heading-reset"
          >
            Nueva contraseña
          </h1>
          <p className="text-muted-foreground font-sans text-base">
            {linkError
              ? "Necesitas un enlace válido para continuar."
              : "Crea una contraseña nueva para tu cuenta."}
          </p>
        </div>

        {linkError ? (
          <div
            className="border border-border/60 rounded-2xl p-7 text-center space-y-4"
            style={{ background: "rgba(13,11,26,0.85)", backdropFilter: "blur(12px)" }}
            data-testid="panel-link-error"
          >
            <div className="flex justify-center">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center"
                style={{ background: "rgba(249,115,22,0.12)" }}
              >
                <AlertTriangle className="w-7 h-7" style={{ color: "rgb(249,115,22)" }} />
              </div>
            </div>
            <p className="font-sans text-sm text-muted-foreground leading-relaxed">
              {linkError}
            </p>
            <Link href="/forgot-password" data-testid="link-request-new">
              <Button
                type="button"
                className="w-full h-12 rounded-xl font-display text-lg tracking-widest border-0 text-white hover:opacity-90 transition-opacity"
                style={{
                  background:
                    "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
                }}
              >
                Solicitar nuevo enlace
              </Button>
            </Link>
          </div>
        ) : (
          <div
            className="border border-border/60 rounded-2xl p-7 glow-purple"
            style={{ background: "rgba(13,11,26,0.85)", backdropFilter: "blur(12px)" }}
          >
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-display text-lg tracking-wider text-muted-foreground">
                        Nueva contraseña
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="••••••••"
                          {...field}
                          className="border border-border/60 rounded-xl focus-visible:ring-primary focus-visible:border-primary text-base px-4 py-3 h-12 font-sans bg-input/50"
                          data-testid="input-password"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confirm"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-display text-lg tracking-wider text-muted-foreground">
                        Repite la contraseña
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="••••••••"
                          {...field}
                          className="border border-border/60 rounded-xl focus-visible:ring-primary focus-visible:border-primary text-base px-4 py-3 h-12 font-sans bg-input/50"
                          data-testid="input-confirm"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  disabled={form.formState.isSubmitting}
                  className="w-full h-13 rounded-xl font-display text-2xl tracking-widest border-0 text-white hover:opacity-90 transition-opacity mt-2"
                  style={{
                    background:
                      "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
                  }}
                  data-testid="button-submit"
                >
                  {form.formState.isSubmitting
                    ? "Guardando..."
                    : "Guardar contraseña"}
                </Button>
              </form>
            </Form>
          </div>
        )}

        <p className="text-center text-muted-foreground font-sans text-sm">
          <Link
            href="/login"
            className="font-semibold hover:opacity-80 transition-opacity"
            style={{ color: "hsl(330,85%,65%)" }}
            data-testid="link-back-login"
          >
            Volver a iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
