import React, { useState } from "react";
import {
  LifeBuoy,
  MessageCircle,
  Flag,
  Mail,
  ChevronRight,
} from "lucide-react";
import { SupportDialog } from "@/components/support-dialog";

const SUPPORT_EMAIL = "supportkixxme@gmail.com";

const FAQ = [
  {
    q: "¿Cómo edito mi perfil?",
    a: "Abre tu perfil desde la barra inferior para cambiar tus fotos, tu bio y tus datos. No olvides guardar los cambios.",
  },
  {
    q: "¿Cómo bloqueo o reporto a alguien?",
    a: "Entra en el perfil o el chat de esa persona y usa las opciones de bloquear o reportar. Dejará de ver tu perfil y tú el suyo.",
  },
  {
    q: "¿Cómo cambio o cancelo mi plan Premium?",
    a: "Tu suscripción se gestiona de forma segura con Stripe. Escríbenos a soporte y te ayudamos con el cambio o la cancelación.",
  },
  {
    q: "No recibo los correos de KixxMe",
    a: "Revisa tu carpeta de spam o promociones. Si aun así no llegan, contáctanos y lo solucionamos.",
  },
];

export default function Support() {
  const [contactOpen, setContactOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="min-h-full pb-6">
      <div
        className="relative px-5 pt-10 pb-10 text-center overflow-hidden"
        style={{
          background:
            "radial-gradient(ellipse 100% 80% at 50% 0%, hsl(270 40% 12%) 0%, hsl(238 25% 5%) 70%)",
        }}
      >
        <div
          className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
          style={{
            background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(20,90%,55%))",
            boxShadow: "0 0 40px rgba(249,115,22,0.4)",
          }}
        >
          <LifeBuoy className="w-7 h-7 text-white" />
        </div>
        <h1 className="font-display text-4xl tracking-widest text-gradient-brand">
          SOPORTE
        </h1>
        <p className="font-sans text-sm text-muted-foreground mt-2 max-w-xs mx-auto">
          Estamos aquí para ayudarte. Elige una opción y te responderemos lo antes
          posible.
        </p>
      </div>

      <div className="px-5 -mt-3 space-y-3">
        <button
          type="button"
          onClick={() => setContactOpen(true)}
          className="w-full flex items-center gap-4 p-4 rounded-2xl border border-primary/30 text-left hover:bg-primary/5 transition-colors"
          style={{ background: "rgba(168,85,247,0.06)" }}
          data-testid="button-contact-support"
        >
          <div
            className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-xl"
            style={{
              background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
            }}
          >
            <MessageCircle className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display text-lg tracking-wide text-foreground">
              Contactar soporte
            </p>
            <p className="font-sans text-xs text-muted-foreground">
              ¿Tienes una duda o un problema con la app?
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
        </button>

        <button
          type="button"
          onClick={() => setReportOpen(true)}
          className="w-full flex items-center gap-4 p-4 rounded-2xl border border-border/50 text-left hover:bg-white/5 transition-colors"
          style={{ background: "rgba(255,255,255,0.02)" }}
          data-testid="button-report-problem"
        >
          <div
            className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-xl border border-border/40"
            style={{ background: "rgba(255,255,255,0.04)" }}
          >
            <Flag className="w-5 h-5 text-orange-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display text-lg tracking-wide text-foreground">
              Reportar un problema
            </p>
            <p className="font-sans text-xs text-muted-foreground">
              Informa de un error, abuso o contenido inapropiado.
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
        </button>
      </div>

      <div className="px-5 mt-4">
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="flex items-center justify-center gap-2 p-3 rounded-xl border border-border/40 font-sans text-sm text-muted-foreground hover:text-foreground transition-colors"
          style={{ background: "rgba(255,255,255,0.02)" }}
          data-testid="link-support-email"
        >
          <Mail className="w-4 h-4" />
          ¿Necesitas ayuda?{" "}
          <span className="text-gradient-brand font-medium">{SUPPORT_EMAIL}</span>
        </a>
      </div>

      <div className="px-5 mt-8">
        <h2 className="font-display text-xl tracking-widest text-foreground mb-3">
          PREGUNTAS FRECUENTES
        </h2>
        <div className="space-y-2">
          {FAQ.map((item, i) => (
            <div
              key={i}
              className="border border-border/40 rounded-xl overflow-hidden"
              style={{ background: "rgba(255,255,255,0.02)" }}
            >
              <button
                type="button"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left"
                data-testid={`button-faq-${i}`}
              >
                <span className="font-sans text-sm text-foreground">{item.q}</span>
                <ChevronRight
                  className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform ${
                    openFaq === i ? "rotate-90" : ""
                  }`}
                />
              </button>
              {openFaq === i && (
                <p className="px-4 pb-3 font-sans text-sm text-muted-foreground leading-relaxed">
                  {item.a}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      <SupportDialog
        open={contactOpen}
        onOpenChange={setContactOpen}
        category="contact"
        title="Contactar soporte"
        description="Cuéntanos en qué podemos ayudarte y te responderemos por email."
        submitLabel="Enviar mensaje"
        successTitle="Mensaje enviado"
        successDescription="Gracias por escribirnos. Te responderemos muy pronto."
      />

      <SupportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        category="general"
        title="Reportar un problema"
        description="Describe el error o el problema con el mayor detalle posible."
        messageLabel="Describe el problema"
        messagePlaceholder="¿Qué ha pasado? ¿En qué pantalla? ¿Qué esperabas que ocurriera?"
        submitLabel="Enviar reporte"
        successTitle="Reporte enviado"
        successDescription="Gracias. Lo revisaremos lo antes posible."
      />
    </div>
  );
}
