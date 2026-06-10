import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuth } from "@/lib/auth";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { KixxMeLogo } from "@/components/brand/kixxme-logo";

const formSchema = z.object({
  email: z.string().email("Correo inválido"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
  username: z.string().min(3, "Mínimo 3 caracteres").max(30, "Máximo 30 caracteres"),
});

export default function Signup() {
  const { signup } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "", password: "", username: "" },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setIsSubmitting(true);
      await signup(values);
    } catch (err: any) {
      toast({
        title: "No pudimos crear tu perfil",
        description: err?.data?.error || "Inténtalo de nuevo.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-[100dvh] flex flex-col items-center justify-center p-4"
      style={{ background: "radial-gradient(ellipse 90% 65% at 50% 0%, hsl(300 35% 10%) 0%, hsl(238 25% 5%) 65%)" }}
    >
      <div className="w-full max-w-sm space-y-8">

        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <KixxMeLogo size={76} badge />
          </div>
          <h1
            className="text-7xl font-display tracking-tight text-gradient-brand"
            data-testid="heading-signup"
          >
            KIXXME
          </h1>
          <p className="text-muted-foreground font-sans text-base tracking-widest" data-testid="text-signup-sub">
            Conecta con chicos cerca de ti.
          </p>
        </div>

        <div
          className="border border-border/60 rounded-2xl p-7 glow-pink"
          style={{ background: "rgba(13,11,26,0.85)", backdropFilter: "blur(12px)" }}
        >
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-display text-lg tracking-wider text-muted-foreground">
                      Nombre de usuario
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="atleta123"
                        {...field}
                        className="border border-border/60 rounded-xl focus-visible:ring-primary focus-visible:border-primary text-base px-4 py-3 h-12 font-sans bg-input/50"
                        data-testid="input-username"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
                style={{ background: "linear-gradient(135deg, hsl(330,85%,50%), hsl(273,85%,55%))" }}
                data-testid="button-submit"
              >
                {isSubmitting ? "Creando perfil..." : "Únete gratis"}
              </Button>
            </form>
          </Form>
        </div>

        <p className="text-center text-muted-foreground font-sans text-sm" data-testid="text-login-prompt">
          ¿Ya tienes perfil?{" "}
          <Link
            href="/login"
            className="font-semibold hover:opacity-80 transition-opacity"
            style={{ color: "hsl(273,85%,70%)" }}
            data-testid="link-login"
          >
            Entra aquí.
          </Link>
        </p>
      </div>
    </div>
  );
}
