import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import {
  LifeBuoy,
  MessageCircle,
  Flag,
  Mail,
  ChevronRight,
  ChevronLeft,
  Crown,
  Plus,
  Send,
  ShieldCheck,
} from "lucide-react";
import { SupportDialog } from "@/components/support-dialog";
import {
  useListSupportTickets,
  useGetSupportTicket,
  useOpenSupportTicket,
  useSendSupportMessage,
  useGetMyProfile,
  getListSupportTicketsQueryKey,
  getGetSupportTicketQueryKey,
  getGetNotificationsSummaryQueryKey,
  getGetMyProfileQueryKey,
} from "@workspace/api-client-react";
import type {
  SupportTicket,
  SupportTicketStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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

const STATUS_META: Record<
  SupportTicketStatus,
  { label: string; className: string }
> = {
  pending: {
    label: "Pendiente",
    className: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
  answered: {
    label: "Respondido",
    className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  closed: {
    label: "Cerrado",
    className: "bg-white/5 text-muted-foreground border-border/40",
  },
  urgent: {
    label: "Urgente",
    className: "bg-red-500/15 text-red-300 border-red-500/40",
  },
};

function StatusChip({ status }: { status: SupportTicketStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.pending;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-medium ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr} h`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `hace ${days} d`;
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
  });
}

export default function Support() {
  const search = useSearch();
  const initialTicketId = useMemo(
    () => new URLSearchParams(search).get("ticket"),
    [search],
  );
  const [contactOpen, setContactOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(
    initialTicketId,
  );

  if (activeTicketId) {
    return (
      <TicketThread
        ticketId={activeTicketId}
        onBack={() => setActiveTicketId(null)}
      />
    );
  }

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

      <PrioritySupportSection onOpenTicket={setActiveTicketId} />

      <div className="px-5 mt-6 space-y-3">
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

function PrioritySupportSection({
  onOpenTicket,
}: {
  onOpenTicket: (id: string) => void;
}) {
  const [, setLocation] = useLocation();
  const [createOpen, setCreateOpen] = useState(false);
  const { data: profile } = useGetMyProfile({
    query: { queryKey: getGetMyProfileQueryKey(), staleTime: 30_000 },
  });
  const isGold = (profile?.plan ?? "free") === "gold";

  const { data, isLoading } = useListSupportTickets({
    query: {
      queryKey: getListSupportTicketsQueryKey(),
      refetchInterval: 20_000,
    },
  });
  const tickets = data?.tickets ?? [];

  return (
    <div className="px-5 mt-5">
      <div
        className="rounded-2xl border p-4"
        style={{
          background:
            "linear-gradient(160deg, rgba(245,158,11,0.08), rgba(168,85,247,0.05))",
          borderColor: "rgba(245,158,11,0.3)",
        }}
      >
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-xl"
            style={{
              background: "linear-gradient(135deg, hsl(38,92%,55%), hsl(20,90%,52%))",
            }}
          >
            <Crown className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display text-lg tracking-wide text-foreground">
              Soporte prioritario
            </p>
            <p className="font-sans text-xs text-muted-foreground mt-0.5">
              {isGold
                ? "Como usuario Gold, abre un ticket y te respondemos con prioridad."
                : "Disponible con KixxMe Gold: abre tickets y recibe respuesta prioritaria."}
            </p>
          </div>
        </div>

        {isGold ? (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="mt-3 w-full h-11 rounded-xl font-display tracking-wide text-white flex items-center justify-center gap-2"
            style={{
              background: "linear-gradient(135deg, hsl(38,92%,52%), hsl(20,90%,52%))",
            }}
            data-testid="button-open-ticket"
          >
            <Plus className="w-4 h-4" />
            Abrir ticket
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setLocation("/premium")}
            className="mt-3 w-full h-11 rounded-xl font-display tracking-wide text-white flex items-center justify-center gap-2"
            style={{
              background: "linear-gradient(135deg, hsl(38,92%,52%), hsl(20,90%,52%))",
            }}
            data-testid="button-upsell-gold-support"
          >
            <Crown className="w-4 h-4" />
            Hazte Gold
          </button>
        )}

        {/* Existing tickets — visible for any plan (admins can start a ticket
            with a free user, who must still be able to read and reply). */}
        {isLoading ? (
          <p className="mt-3 font-sans text-xs text-muted-foreground text-center py-2">
            Cargando tus tickets…
          </p>
        ) : tickets.length > 0 ? (
          <div className="mt-3 space-y-2">
            {tickets.map((t) => (
              <TicketRow key={t.id} ticket={t} onClick={() => onOpenTicket(t.id)} />
            ))}
          </div>
        ) : null}
      </div>

      {isGold && (
        <OpenTicketDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={(id) => {
            setCreateOpen(false);
            onOpenTicket(id);
          }}
        />
      )}
    </div>
  );
}

function TicketRow({
  ticket,
  onClick,
}: {
  ticket: SupportTicket;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 rounded-xl border border-border/40 text-left hover:bg-white/5 transition-colors"
      style={{ background: "rgba(13,11,26,0.6)" }}
      data-testid={`ticket-row-${ticket.id}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-sans text-sm font-medium text-foreground truncate">
            {ticket.subject}
          </p>
          {ticket.unread && (
            <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
          )}
        </div>
        {ticket.lastMessagePreview && (
          <p className="font-sans text-xs text-muted-foreground truncate mt-0.5">
            {ticket.lastSenderRole === "admin" ? "Soporte: " : "Tú: "}
            {ticket.lastMessagePreview}
          </p>
        )}
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <StatusChip status={ticket.status} />
        <span className="font-sans text-[10px] text-muted-foreground">
          {timeAgo(ticket.lastMessageAt)}
        </span>
      </div>
    </button>
  );
}

function OpenTicketDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const openTicket = useOpenSupportTicket();

  useEffect(() => {
    if (open) {
      setSubject("");
      setMessage("");
    }
  }, [open]);

  const submit = () => {
    const s = subject.trim();
    const m = message.trim();
    if (s.length < 1 || m.length < 1) {
      toast({
        title: "Completa el asunto y el mensaje",
        variant: "destructive",
      });
      return;
    }
    openTicket.mutate(
      { data: { subject: s, message: m } },
      {
        onSuccess: (detail) => {
          qc.invalidateQueries({ queryKey: getListSupportTicketsQueryKey() });
          qc.invalidateQueries({
            queryKey: getGetNotificationsSummaryQueryKey(),
          });
          onCreated(detail.ticket.id);
        },
        onError: () => {
          toast({
            title: "No se pudo abrir el ticket",
            description: "Inténtalo de nuevo en unos momentos.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display tracking-wide flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-400" />
            Abrir ticket prioritario
          </DialogTitle>
          <DialogDescription>
            Cuéntanos qué necesitas. Te responderemos con prioridad Gold.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="font-sans text-xs text-muted-foreground mb-1 block">
              Asunto
            </label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              placeholder="Ej: Problema con mi suscripción"
              data-testid="input-ticket-subject"
            />
          </div>
          <div>
            <label className="font-sans text-xs text-muted-foreground mb-1 block">
              Mensaje
            </label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={5000}
              rows={5}
              placeholder="Describe tu consulta con el mayor detalle posible…"
              data-testid="input-ticket-message"
            />
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={openTicket.isPending}
            className="w-full h-11 rounded-xl font-display tracking-wide text-white flex items-center justify-center gap-2 disabled:opacity-60"
            style={{
              background: "linear-gradient(135deg, hsl(38,92%,52%), hsl(20,90%,52%))",
            }}
            data-testid="button-submit-ticket"
          >
            <Send className="w-4 h-4" />
            {openTicket.isPending ? "Enviando…" : "Enviar ticket"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TicketThread({
  ticketId,
  onBack,
}: {
  ticketId: string;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [reply, setReply] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useGetSupportTicket(ticketId, {
    query: {
      queryKey: getGetSupportTicketQueryKey(ticketId),
      refetchInterval: 5000,
    },
  });
  const sendMessage = useSendSupportMessage();

  const ticket = data?.ticket;
  const messages = useMemo(() => data?.messages ?? [], [data?.messages]);

  // Reading the thread marks it read server-side; refresh the unread badges.
  useEffect(() => {
    qc.invalidateQueries({ queryKey: getGetNotificationsSummaryQueryKey() });
    qc.invalidateQueries({ queryKey: getListSupportTicketsQueryKey() });
  }, [qc, messages.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const isClosed = ticket?.status === "closed";

  const submit = () => {
    const body = reply.trim();
    if (body.length < 1) return;
    sendMessage.mutate(
      { id: ticketId, data: { body } },
      {
        onSuccess: () => {
          setReply("");
          qc.invalidateQueries({
            queryKey: getGetSupportTicketQueryKey(ticketId),
          });
          qc.invalidateQueries({ queryKey: getListSupportTicketsQueryKey() });
        },
        onError: () => {
          toast({
            title: "No se pudo enviar el mensaje",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div
        className="flex items-center gap-3 px-4 py-3 border-b border-border/40 flex-shrink-0"
        style={{ background: "rgba(13,11,26,0.9)" }}
      >
        <button
          type="button"
          onClick={onBack}
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/5"
          data-testid="button-ticket-back"
        >
          <ChevronLeft className="w-5 h-5 text-foreground" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-display text-base tracking-wide text-foreground truncate">
            {ticket?.subject ?? "Ticket"}
          </p>
          {ticket && (
            <div className="flex items-center gap-2 mt-0.5">
              <StatusChip status={ticket.status} />
            </div>
          )}
        </div>
        <ShieldCheck className="w-5 h-5 text-amber-400 flex-shrink-0" />
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
        data-testid="ticket-messages"
      >
        {isLoading ? (
          <p className="font-sans text-sm text-muted-foreground text-center py-8">
            Cargando conversación…
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.senderRole === "user";
            return (
              <div
                key={m.id}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
                <div className="max-w-[80%]">
                  {!mine && (
                    <p className="font-sans text-[10px] uppercase tracking-wider text-amber-400 mb-1 px-1">
                      Soporte KixxMe
                    </p>
                  )}
                  <div
                    className={`px-3 py-2 rounded-2xl font-sans text-sm whitespace-pre-wrap break-words ${
                      mine
                        ? "text-white rounded-br-sm"
                        : "text-foreground rounded-bl-sm border border-border/40"
                    }`}
                    style={
                      mine
                        ? {
                            background:
                              "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
                          }
                        : { background: "rgba(255,255,255,0.04)" }
                    }
                  >
                    {m.body}
                  </div>
                  <p
                    className={`font-sans text-[10px] text-muted-foreground mt-1 px-1 ${
                      mine ? "text-right" : "text-left"
                    }`}
                  >
                    {timeAgo(m.createdAt)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {isClosed ? (
        <div className="px-4 py-3 border-t border-border/40 flex-shrink-0">
          <p className="font-sans text-xs text-muted-foreground text-center">
            Este ticket está cerrado. Si escribes un mensaje, se reabrirá.
          </p>
          <div className="flex items-end gap-2 mt-2">
            <ReplyBox
              value={reply}
              onChange={setReply}
              onSubmit={submit}
              pending={sendMessage.isPending}
            />
          </div>
        </div>
      ) : (
        <div
          className="px-4 py-3 border-t border-border/40 flex items-end gap-2 flex-shrink-0"
          style={{ background: "rgba(13,11,26,0.9)" }}
        >
          <ReplyBox
            value={reply}
            onChange={setReply}
            onSubmit={submit}
            pending={sendMessage.isPending}
          />
        </div>
      )}
    </div>
  );
}

function ReplyBox({
  value,
  onChange,
  onSubmit,
  pending,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  pending: boolean;
}) {
  return (
    <>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={5000}
        rows={1}
        placeholder="Escribe un mensaje…"
        className="resize-none min-h-[44px] max-h-32"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
          }
        }}
        data-testid="input-ticket-reply"
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={pending || value.trim().length < 1}
        className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-xl text-white disabled:opacity-50"
        style={{
          background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
        }}
        data-testid="button-send-reply"
      >
        <Send className="w-5 h-5" />
      </button>
    </>
  );
}
