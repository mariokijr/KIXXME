import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuth, SOCIAL_AUTH_ENABLED } from "@/lib/auth";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { KixxMeLogo } from "@/components/brand/kixxme-logo";
import { LegalFooter } from "@/components/legal-footer";
import { LegalSidebar } from "@/components/legal-sidebar";
import { motion } from "framer-motion";
import { Menu } from "lucide-react";
import bgImage from "@/assets/bg-neon-bokeh.png";

const formSchema = z.object({
  email: z.string().email("Correo inválido"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
  username: z.string().min(3, "Mínimo 3 caracteres").max(30, "Máximo 30 caracteres"),
});

export default function Signup() {
  const { signup, loginWithProvider } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [loadingProvider, setLoadingProvider] = React.useState<"google" | null>(null);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

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

  const handleProvider = async (provider: "google") => {
    setLoadingProvider(provider);
    try {
      await loginWithProvider(provider);
    } catch (e: any) {
      setLoadingProvider(null);
      toast({
        title: "No disponible",
        description: e?.message ?? "El inicio de sesión con Google no está disponible ahora mismo.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col relative bg-[#0a0715] overflow-x-hidden">
      <LegalSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Background Image */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <img src={bgImage} alt="" className="w-full h-full object-cover opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0715]/70 via-[#0a0715]/85 to-[#0a0715]" />
      </div>

      {/* Ambient glows */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div style={{ position: "absolute", top: "-15%", right: "5%", width: "55%", height: "45%", background: "radial-gradient(ellipse, rgba(236,72,153,0.12) 0%, transparent 70%)", filter: "blur(40px)" }} />
        <div style={{ position: "absolute", top: "10%", left: "-5%", width: "40%", height: "35%", background: "radial-gradient(ellipse, rgba(139,92,246,0.10) 0%, transparent 70%)", filter: "blur(32px)" }} />
      </div>

      {/* Hamburger menu button */}
      <button
        type="button"
        onClick={() => setSidebarOpen(true)}
        className="absolute top-4 left-4 z-20 w-10 h-10 flex items-center justify-center rounded-xl transition-all hover:scale-105 active:scale-95"
        style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)" }}
        aria-label="Menú"
      >
        <Menu className="w-5 h-5 text-white/75" />
      </button>

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
            <h1 className="text-5xl font-display tracking-tight text-white glow-pink drop-shadow-md" data-testid="heading-signup">
              CREAR CUENTA
            </h1>
            <p className="text-white/60 text-[15px]" data-testid="text-signup-sub">
              Bienvenido a la comunidad.
            </p>
          </div>

          <div className="space-y-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input
                          placeholder="Nombre de usuario"
                          {...field}
                          className="h-[52px] rounded-2xl border-white/10 bg-white/[0.08] text-white placeholder:text-white/40 focus-visible:border-[#ec4899] focus-visible:ring-1 focus-visible:ring-[#ec4899] px-5 text-base transition-colors"
                          data-testid="input-username"
                        />
                      </FormControl>
                      <FormMessage className="text-red-400 px-1 text-xs" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input
                          placeholder="Correo electrónico"
                          {...field}
                          className="h-[52px] rounded-2xl border-white/10 bg-white/[0.08] text-white placeholder:text-white/40 focus-visible:border-[#ec4899] focus-visible:ring-1 focus-visible:ring-[#ec4899] px-5 text-base transition-colors"
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
                          className="h-[52px] rounded-2xl border-white/10 bg-white/[0.08] text-white placeholder:text-white/40 focus-visible:border-[#ec4899] focus-visible:ring-1 focus-visible:ring-[#ec4899] px-5 text-base transition-colors"
                          data-testid="input-password"
                        />
                      </FormControl>
                      <FormMessage className="text-red-400 px-1 text-xs" />
                    </FormItem>
                  )}
                />

                {/* Legal disclaimer */}
                <div
                  className="rounded-xl px-4 py-3 text-[12px] leading-relaxed text-white/55"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                >
                  KixxMe es exclusivo para mayores de 18 años. Al continuar confirmas que tienes al menos 18 años y aceptas nuestros{" "}
                  <Link href="/legal/terminos" className="text-[#d946ef] hover:text-[#e879f9] underline underline-offset-2 transition-colors">
                    Términos
                  </Link>
                  {" "}y{" "}
                  <Link href="/legal/privacidad" className="text-[#d946ef] hover:text-[#e879f9] underline underline-offset-2 transition-colors">
                    Política de privacidad
                  </Link>
                  .
                </div>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full mt-2 h-[52px] rounded-2xl font-display text-[22px] tracking-wider border-0 text-white shadow-xl glow-pink hover:scale-[1.02] active:scale-[0.98] transition-all"
                  style={{ background: "linear-gradient(135deg, hsl(330,85%,50%), hsl(273,85%,55%))" }}
                  data-testid="button-submit"
                >
                  {isSubmitting ? "CREANDO..." : "CREAR CUENTA"}
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
                    className="w-full h-[52px] rounded-2xl border border-white/10 bg-white/[0.08] text-white hover:bg-white/[0.13] hover:border-white/20 transition-all gap-3 font-medium"
                    data-testid="button-google"
                  >
                    <GoogleIcon />
                    {loadingProvider === "google" ? "Conectando..." : "Google"}
                  </Button>
                </div>
              </>
            )}

            <div className="pt-2 text-center text-white/60 text-[15px]" data-testid="text-login-prompt">
              ¿Ya tienes perfil?{" "}
              <Link href="/login" className="font-semibold text-[#a855f7] hover:text-white transition-colors" data-testid="link-login">
                Entra aquí
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
