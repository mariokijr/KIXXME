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
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { KixxMeLogo } from "@/components/brand/kixxme-logo";
import { AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";
import bgImage from "@/assets/bg-neon-bokeh.png";
import { LegalFooter } from "@/components/legal-footer";

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

  React.useEffect(() => {
    const raw = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
    const params = new URLSearchParams(raw);

    const errorCode = params.get("error_code");
    const error = params.get("error");
    const accessToken = params.get("access_token");

    if (error || errorCode) {
      setLinkError(errorCode === "otp_expired" ? "El enlace ha caducado. Solicita uno nuevo." : "El enlace no es válido. Solicita uno nuevo.");
    } else if (accessToken) {
      setToken(accessToken);
    } else {
      setLinkError("El enlace no es válido o ha caducado. Solicita uno nuevo.");
    }

    window.history.replaceState({}, "", window.location.pathname + window.location.search);
    setReady(true);
  }, []);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!token) return;
    try {
      const res = await reset.mutateAsync({
        data: { accessToken: token, password: values.password },
      });
      toast({ title: "Contraseña actualizada", description: "Tu contraseña se ha cambiado correctamente." });
      applySession(res);
    } catch (err: any) {
      const msg = err?.data?.error ?? "No se pudo restablecer la contraseña.";
      setLinkError(msg);
      toast({ title: "No se pudo restablecer", description: msg, variant: "destructive" });
    }
  };

  if (!ready) return null;

  return (
    <div className="min-h-[100dvh] flex flex-col relative bg-[#0a0715] overflow-x-hidden">
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
            <div className="flex justify-center mb-6">
              <KixxMeLogo size={72} badge glow />
            </div>
            <h1 className="text-4xl font-display tracking-tight text-white glow-purple drop-shadow-md" data-testid="heading-reset">
              NUEVA CONTRASEÑA
            </h1>
            <p className="text-white/60 text-[15px] px-4">
              {linkError ? "Necesitas un enlace válido para continuar." : "Crea una contraseña nueva para tu cuenta."}
            </p>
          </div>

          <div className="space-y-6">
            {linkError ? (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="border border-red-500/30 rounded-2xl p-6 text-center space-y-5 bg-red-500/5 backdrop-blur-md shadow-xl" 
                data-testid="panel-link-error"
              >
                <div className="flex justify-center">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-500 to-orange-500 p-[1px]">
                    <div className="w-full h-full bg-[#0a0715] rounded-2xl flex items-center justify-center">
                      <AlertTriangle className="w-8 h-8 text-red-400" strokeWidth={1.5} />
                    </div>
                  </div>
                </div>
                <p className="text-[15px] text-white/70 leading-relaxed">
                  {linkError}
                </p>
                <Link href="/forgot-password" data-testid="link-request-new">
                  <Button
                    type="button"
                    className="w-full h-[52px] rounded-2xl font-display text-[20px] tracking-wider border-0 text-white shadow-xl glow-purple hover:scale-[1.02] active:scale-[0.98] transition-all mt-2"
                    style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))" }}
                  >
                    SOLICITAR NUEVO
                  </Button>
                </Link>
              </motion.div>
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="Nueva contraseña"
                            {...field}
                            className="h-[52px] rounded-2xl border-white/10 bg-white/5 text-white placeholder:text-white/40 focus-visible:border-[#a855f7] focus-visible:ring-1 focus-visible:ring-[#a855f7] px-5 text-base backdrop-blur-md transition-colors"
                            data-testid="input-password"
                          />
                        </FormControl>
                        <FormMessage className="text-red-400 px-1 text-xs" />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="confirm"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="Repite la contraseña"
                            {...field}
                            className="h-[52px] rounded-2xl border-white/10 bg-white/5 text-white placeholder:text-white/40 focus-visible:border-[#a855f7] focus-visible:ring-1 focus-visible:ring-[#a855f7] px-5 text-base backdrop-blur-md transition-colors"
                            data-testid="input-confirm"
                          />
                        </FormControl>
                        <FormMessage className="text-red-400 px-1 text-xs" />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    disabled={form.formState.isSubmitting}
                    className="w-full mt-2 h-[52px] rounded-2xl font-display text-[22px] tracking-wider border-0 text-white shadow-xl glow-purple hover:scale-[1.02] active:scale-[0.98] transition-all"
                    style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))" }}
                    data-testid="button-submit"
                  >
                    {form.formState.isSubmitting ? "GUARDANDO..." : "GUARDAR CONTRASEÑA"}
                  </Button>
                </form>
              </Form>
            )}

            <div className="pt-4 text-center">
              <Link href="/login" className="text-sm font-medium text-white/50 hover:text-white transition-colors" data-testid="link-back-login">
                Volver a iniciar sesión
              </Link>
            </div>
          </div>
        </motion.div>
        
        <LegalFooter />
      </div>
    </div>
  );
}
