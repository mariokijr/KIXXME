import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuth } from "@/lib/auth";
import { Link, useSearch } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Flame } from "lucide-react";

const formSchema = z.object({
  email: z.string().email("Correo inválido"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
});

export default function Login() {
  const { login } = useAuth();
  const { toast } = useToast();
  const search = useSearch();
  const confirmEmail = new URLSearchParams(search).get("confirm") === "1";
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setIsSubmitting(true);
      await login(values);
    } catch (err: any) {
      toast({
        title: "No pudimos entrar",
        description: err?.data?.error || "Revisa tu correo y contraseña.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-[100dvh] flex flex-col items-center justify-center p-4"
      style={{ background: "radial-gradient(ellipse 90% 65% at 50% 0%, hsl(270 40% 12%) 0%, hsl(238 25% 5%) 65%)" }}
    >
      <div className="w-full max-w-sm space-y-8">

        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-3">
            <Flame
              className="w-8 h-8 text-orange-400 glow-fire"
              style={{ filter: "drop-shadow(0 0 10px rgba(249,115,22,0.8))" }}
            />
            <h1
              className="text-7xl font-display tracking-tight text-gradient-brand"
              data-testid="heading-login"
            >
              KIXXME
            </h1>
            <Flame
              className="w-8 h-8 text-orange-400"
              style={{ filter: "drop-shadow(0 0 10px rgba(249,115,22,0.8))" }}
            />
          </div>
          <p className="text-muted-foreground font-sans text-base tracking-widest" data-testid="text-login-sub">
            Entra al mapa más caliente
          </p>
        </div>

        {confirmEmail && (
          <div
            className="border border-primary/40 rounded-xl p-4 text-center"
            style={{ background: "rgba(168,85,247,0.08)" }}
            data-testid="banner-confirm-email"
          >
            <p className="font-display text-lg text-primary">Revisa tu correo</p>
            <p className="font-sans text-sm text-muted-foreground mt-1">
              Confirma tu cuenta y vuelve aquí.
            </p>
          </div>
        )}

        <div
          className="border border-border/60 rounded-2xl p-7 glow-purple"
          style={{ background: "rgba(13,11,26,0.85)", backdropFilter: "blur(12px)" }}
        >
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
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
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-display text-lg tracking-wider text-muted-foreground">
                      Contraseña
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
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-13 rounded-xl font-display text-2xl tracking-widest border-0 text-white hover:opacity-90 transition-opacity mt-2"
                style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))" }}
                data-testid="button-submit"
              >
                {isSubmitting ? "Entrando..." : "Entrar"}
              </Button>
            </form>
          </Form>
        </div>

        <p className="text-center text-muted-foreground font-sans text-sm" data-testid="text-signup-prompt">
          ¿Sin perfil aún?{" "}
          <Link
            href="/signup"
            className="font-semibold hover:opacity-80 transition-opacity"
            style={{ color: "hsl(330,85%,65%)" }}
            data-testid="link-signup"
          >
            Únete aquí.
          </Link>
        </p>
      </div>
    </div>
  );
}
