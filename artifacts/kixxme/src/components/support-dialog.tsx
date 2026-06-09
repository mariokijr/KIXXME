import React, { useEffect, useState } from "react";
import {
  useCreateSupportReport,
  type SupportReportRequestCategory,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
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
import { Label } from "@/components/ui/label";
import { Loader2, Send } from "lucide-react";

interface SupportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: SupportReportRequestCategory;
  targetUserId?: string;
  title: string;
  description?: string;
  messageLabel?: string;
  messagePlaceholder?: string;
  submitLabel?: string;
  successTitle?: string;
  successDescription?: string;
}

const inputClass =
  "h-11 rounded-xl border border-border/60 focus-visible:ring-primary focus-visible:border-primary font-sans bg-input/40 text-sm";

export function SupportDialog({
  open,
  onOpenChange,
  category,
  targetUserId,
  title,
  description,
  messageLabel = "Mensaje",
  messagePlaceholder = "Cuéntanos qué ocurre con el mayor detalle posible…",
  submitLabel = "Enviar",
  successTitle = "Mensaje enviado",
  successDescription = "Gracias. Nuestro equipo te responderá pronto.",
}: SupportDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const createReport = useCreateSupportReport();

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  // Prefill the reply-to address each time the dialog opens.
  useEffect(() => {
    if (open) setContactEmail(user?.email ?? "");
  }, [open, user?.email]);

  const handleSubmit = () => {
    const trimmed = message.trim();
    if (!trimmed) {
      toast({
        title: "Escribe un mensaje",
        description: "Necesitamos algunos detalles para poder ayudarte.",
        variant: "destructive",
      });
      return;
    }

    createReport.mutate(
      {
        data: {
          category,
          targetUserId,
          subject: subject.trim() || undefined,
          message: trimmed,
          contactEmail: contactEmail.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: successTitle, description: successDescription });
          setSubject("");
          setMessage("");
          onOpenChange(false);
        },
        onError: (err: any) => {
          toast({
            title: "No se pudo enviar",
            description: err?.data?.error ?? err?.message ?? "Inténtalo de nuevo.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border/50 bg-card/95 backdrop-blur-xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-widest text-gradient-brand">
            {title}
          </DialogTitle>
          {description && (
            <DialogDescription className="font-sans text-sm text-muted-foreground">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label className="font-display text-sm tracking-widest text-muted-foreground">
              Asunto <span className="opacity-60">(opcional)</span>
            </Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              placeholder="Resumen breve"
              className={inputClass}
              data-testid="input-support-subject"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="font-display text-sm tracking-widest text-muted-foreground">
              {messageLabel}
            </Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={5000}
              rows={5}
              placeholder={messagePlaceholder}
              className="rounded-xl border border-border/60 focus-visible:ring-primary focus-visible:border-primary font-sans bg-input/40 text-sm resize-none"
              data-testid="input-support-message"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="font-display text-sm tracking-widest text-muted-foreground">
              Email de contacto
            </Label>
            <Input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="tu@email.com"
              className={inputClass}
              data-testid="input-support-email"
            />
            <p className="font-sans text-[11px] text-muted-foreground">
              Te responderemos a esta dirección.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={createReport.isPending}
          className="w-full h-12 rounded-xl font-display text-lg tracking-widest border-0 text-white hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
          style={{
            background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
          }}
          data-testid="button-support-submit"
        >
          {createReport.isPending ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          {submitLabel}
        </button>
      </DialogContent>
    </Dialog>
  );
}
