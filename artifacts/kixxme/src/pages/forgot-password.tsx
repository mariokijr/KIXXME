import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link } from "wouter";
import { useForgotPassword } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { KixxMeLogo } from "@/components/brand/kixxme-logo";
import { LegalFooter } from "@/components/legal-footer";
import { MailCheck, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import bgImage from "@/assets/bg-neon-bokeh.png";

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
    try {
      await forgot.mutateAsync({ data: { email: values.email } });
    } catch {
      // Ignore
    } finally {
      setSentTo(values.email);
      setSent(true);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col relative bg-[#0a0715] overflow-x-hidden">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <img src={bgImage} alt="" className="w-full h-full object-cover opacity-50 mix-blend-screen" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0715]/60 via-[#0a0715]/80 to-[#0a0715]" />
      </div>

      <div className="absolute top-6 left-6 z-20">
        <Link href="/login" className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/70 hover:bg-white/10 hover:text-white transition-colors backdrop-blur-md">
          <ArrowLeft className="w-5 h-5" />
        </Link>
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
            <h1 className="text-4xl font-display tracking-tight text-white glow-purple drop-shadow-md" data-testid="heading-forgot">
              RECUPERAR ACCESO
            </h1>
            <p className="text-white/60 text-[15px] px-4">
              {sent ? "Revisa tu correo para continuar." : "Te enviaremos un enlace seguro para crear una nueva contraseña."}
            </p>
          </div>

          <div className="space-y-6">
            {sent ? (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="border border-[#a855f7]/30 rounded-2xl p-6 text-center space-y-5 bg-[#a855f7]/5 backdrop-blur-md shadow-xl glow-purple" 
                data-testid="panel-forgot-sent"
              >
                <div className="flex justify-center">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#d946ef] to-[#8b5cf6] p-[1px]">
                    <div className="w-full h-full bg-[#0a0715] rounded-2xl flex items-center justify-center">
                      <MailCheck className="w-8 h-8 text-[#d8b4fe]" strokeWidth={1.5} />
                    </div>
                  </div>
                </div>
                <p className="text-[15px] text-white/70 leading-relaxed">
                  Si <strong className="text-white break-all font-medium">{sentTo}</strong> tiene una cuenta, recibirás instrucciones. Revisa también la carpeta de spam.
                </p>
                <Button
                  type="button"
                  onClick={() => { setSent(false); form.reset(); }}
                  variant="outline"
                  className="w-full h-[52px] rounded-2xl font-display text-[20px] tracking-wider border border-white/10 bg-white/5 text-white hover:bg-white/10 transition-all backdrop-blur-md mt-2"
                  data-testid="button-resend"
                >
                  REINTENTAR
                </Button>
              </motion.div>
            ) : (
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
                  <Button
                    type="submit"
                    disabled={form.formState.isSubmitting}
                    className="w-full mt-2 h-[52px] rounded-2xl font-display text-[22px] tracking-wider border-0 text-white shadow-xl glow-purple hover:scale-[1.02] active:scale-[0.98] transition-all"
                    style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))" }}
                    data-testid="button-submit"
                  >
                    {form.formState.isSubmitting ? "ENVIANDO..." : "ENVIAR ENLACE"}
                  </Button>
                </form>
              </Form>
            )}
          </div>
        </motion.div>

        <LegalFooter />
      </div>
    </div>
  );
}
