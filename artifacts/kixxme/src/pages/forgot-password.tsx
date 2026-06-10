import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link } from "wouter";
import { useForgotPassword } from "@workspace/api-client-react";
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
import { MailCheck } from "lucide-react";

const formSchema = z.object({
  email: z.string().email("Correo inválido"),
});

export default function ForgotPassword() {
  const [sent, setSent] = React.useState(false);
  const [sentTo, setSentTo] = React.useState("");
  const forgot = useForgotPassword();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    // The endpoint always responds 200 for valid input (no account enumeration),
    // so we show the same confirmation regardless of the outcome.
    try {
      await forgot.mutateAsync({ data: { email: values.email } });
    } catch {
      // Ignore — UX is intentionally identical whether or not the email exists.
    } finally {
      setSentTo(values.email);
      setSent(true);
    }
  };

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
            data-testid="heading-forgot"
          >
            ¿Olvidaste tu contraseña?
          </h1>
          <p className="text-muted-foreground font-sans text-base">
            {sent
              ? "Revisa tu correo para continuar."
              : "Te enviaremos un enlace para crear una nueva."}
          </p>
        </div>

        {sent ? (
          <div
            className="border border-border/60 rounded-2xl p-7 glow-purple text-center space-y-4"
            style={{ background: "rgba(13,11,26,0.85)", backdropFilter: "blur(12px)" }}
            data-testid="panel-forgot-sent"
          >
            <div className="flex justify-center">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center"
                style={{ background: "rgba(168,85,247,0.12)" }}
              >
                <MailCheck className="w-7 h-7 text-primary" />
              </div>
            </div>
            <p className="font-sans text-sm text-muted-foreground leading-relaxed">
              Si{" "}
              <strong className="text-foreground break-all">{sentTo}</strong>{" "}
              tiene una cuenta en KixxMe, recibirás un correo con instrucciones
              para restablecer tu contraseña. Revisa también la carpeta de spam.
            </p>
            <Button
              type="button"
              onClick={() => {
                setSent(false);
                form.reset();
              }}
              className="w-full h-12 rounded-xl font-display text-lg tracking-widest border-0 text-white hover:opacity-90 transition-opacity"
              style={{
                background:
                  "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
              }}
              data-testid="button-resend"
            >
              Enviar de nuevo
            </Button>
          </div>
        ) : (
          <div
            className="border border-border/60 rounded-2xl p-7 glow-purple"
            style={{ background: "rgba(13,11,26,0.85)", backdropFilter: "blur(12px)" }}
          >
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-5"
              >
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-display text-lg tracking-wider text-muted-foreground">
                        Correo
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="tu@correo.com"
                          {...field}
                          className="border border-border/60 rounded-xl focus-visible:ring-primary focus-visible:border-primary text-base px-4 py-3 h-12 font-sans bg-input/50"
                          data-testid="input-email"
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
                  {form.formState.isSubmitting ? "Enviando..." : "Enviar enlace"}
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
