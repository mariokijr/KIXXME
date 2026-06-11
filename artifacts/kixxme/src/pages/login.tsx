import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuth, SOCIAL_AUTH_ENABLED } from "@/lib/auth";
import { Link, useSearch } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { KixxMeLogo } from "@/components/brand/kixxme-logo";
import { LegalFooter } from "@/components/legal-footer";
import { isIOS } from "@/lib/platform";
import { motion } from "framer-motion";
import bgImage from "@/assets/bg-neon-bokeh.png";

const formSchema = z.object({
  email: z.string().email("Correo inválido"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
});

export default function Login() {
  const { login, loginWithProvider } = useAuth();
  const { toast } = useToast();
  const search = useSearch();
  const confirmEmail = new URLSearchParams(search).get("confirm") === "1";
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [loadingProvider, setLoadingProvider] = React.useState<"google" | "apple" | null>(null);
  const showApple = isIOS();

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

  const handleProvider = async (provider: "google" | "apple") => {
    setLoadingProvider(provider);
    try {
      await loginWithProvider(provider);
    } catch (e: any) {
      setLoadingProvider(null);
      toast({
        title: "No disponible",
        description: e?.message ?? `El inicio de sesión con ${provider === "google" ? "Google" : "Apple"} no está disponible ahora mismo.`,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col relative bg-[#0a0715] overflow-x-hidden">
      {/* Background Image */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <img src={bgImage} alt="" className="w-full h-full object-cover opacity-50 mix-blend-screen" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0715]/60 via-[#0a0715]/80 to-[#0a0715]" />
      </div>

      <div className="flex-1 relative z-10 w-full max-w-sm mx-auto px-6 py-10 flex flex-col">
        
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex-1 flex flex-col justify-center"
        >
          <div className="text-center space-y-3 mb-8">
            <Link href="/" className="inline-block hover:scale-105 transition-transform">
              <KixxMeLogo size={72} badge glow />
            </Link>
            <h1 className="text-5xl font-display tracking-tight text-white glow-purple drop-shadow-md" data-testid="heading-login">
              INICIAR SESIÓN
            </h1>
            <p className="text-white/60 text-[15px]" data-testid="text-login-sub">
              Qué bueno verte de nuevo.
            </p>
          </div>

          {confirmEmail && (
            <div className="border border-[#a855f7]/30 rounded-2xl p-4 text-center mb-6 bg-[#a855f7]/10 backdrop-blur-md" data-testid="banner-confirm-email">
              <p className="font-semibold text-[#d8b4fe]">Revisa tu correo</p>
              <p className="text-sm text-white/70 mt-1">Confirma tu cuenta y vuelve aquí.</p>
            </div>
          )}

          <div className="space-y-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input
                          placeholder="Correo electrónico"
                          {...field}
                          className="h-[52px] rounded-2xl border-white/10 bg-white/5 text-white placeholder:text-white/40 focus-visible:border-[#a855f7] focus-visible:ring-1 focus-visible:ring-[#a855f7] px-5 text-base backdrop-blur-md transition-colors"
                          data-testid="input-email"
                        />
                      </FormControl>
                      <FormMessage className="text-red-400 px-1 text-xs" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Contraseña"
                          {...field}
                          className="h-[52px] rounded-2xl border-white/10 bg-white/5 text-white placeholder:text-white/40 focus-visible:border-[#a855f7] focus-visible:ring-1 focus-visible:ring-[#a855f7] px-5 text-base backdrop-blur-md transition-colors"
                          data-testid="input-password"
                        />
                      </FormControl>
                      <FormMessage className="text-red-400 px-1 text-xs" />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end pb-2">
                  <Link href="/forgot-password" className="text-sm font-medium text-white/50 hover:text-white transition-colors" data-testid="link-forgot-password">
                    ¿Olvidaste tu contraseña?
                  </Link>
                </div>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-[52px] rounded-2xl font-display text-[22px] tracking-wider border-0 text-white shadow-xl glow-purple hover:scale-[1.02] active:scale-[0.98] transition-all"
                  style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))" }}
                  data-testid="button-submit"
                >
                  {isSubmitting ? "ENTRANDO..." : "ENTRAR"}
                </Button>
              </form>
            </Form>

            {SOCIAL_AUTH_ENABLED && (
              <>
                <div className="flex items-center gap-3 py-2">
                  <span className="h-px flex-1 bg-white/10" />
                  <span className="text-xs uppercase tracking-wider font-semibold text-white/30">O continúa con</span>
                  <span className="h-px flex-1 bg-white/10" />
                </div>

                <div className="flex flex-col gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={loadingProvider !== null}
                    onClick={() => handleProvider("google")}
                    className="w-full h-[52px] rounded-2xl border border-white/10 bg-white/5 text-white hover:bg-white/10 hover:border-white/20 transition-all backdrop-blur-md gap-3 font-medium"
                    data-testid="button-google"
                  >
                    <GoogleIcon />
                    {loadingProvider === "google" ? "Conectando..." : "Google"}
                  </Button>

                  {showApple && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={loadingProvider !== null}
                      onClick={() => handleProvider("apple")}
                      className="w-full h-[52px] rounded-2xl border border-white/10 bg-white/5 text-white hover:bg-white/10 hover:border-white/20 transition-all backdrop-blur-md gap-3 font-medium"
                      data-testid="button-apple"
                    >
                      <AppleIcon />
                      {loadingProvider === "apple" ? "Conectando..." : "Apple"}
                    </Button>
                  )}
                </div>
              </>
            )}

            <div className="pt-4 text-center text-white/60 text-[15px]" data-testid="text-signup-prompt">
              ¿No tienes perfil?{" "}
              <Link href="/signup" className="font-semibold text-[#d946ef] hover:text-white transition-colors" data-testid="link-signup">
                Únete gratis
              </Link>
            </div>
          </div>
        </motion.div>

        <LegalFooter />
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="white" aria-hidden="true">
      <path d="M16.36 1.43c0 1.14-.42 2.2-1.25 3.06-.99 1.02-2.18 1.61-3.47 1.51a3.5 3.5 0 0 1-.03-.43c0-1.09.48-2.26 1.27-3.08.4-.42.9-.77 1.51-1.05.6-.27 1.17-.42 1.71-.44.02.15.03.29.03.43zM20.5 17.04c-.3.69-.45 1-.83 1.61-.54.85-1.3 1.91-2.24 1.92-.84.01-1.05-.55-2.18-.54-1.13 0-1.37.55-2.2.55-.95.01-1.67-.96-2.21-1.81-1.5-2.37-1.66-5.15-.73-6.63.66-1.05 1.69-1.66 2.67-1.66.99 0 1.61.55 2.43.55.8 0 1.28-.55 2.43-.55.86 0 1.78.47 2.43 1.28-2.13 1.17-1.79 4.22.4 5.28z" />
    </svg>
  );
}
