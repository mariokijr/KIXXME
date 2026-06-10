import React, { useEffect, useState } from "react";
import {
  useCreateReport,
  type CreateReportRequestReportType,
  type CreateReportRequestTargetType,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Flag, Check } from "lucide-react";

interface ReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Supabase user id of the person being reported. */
  targetUserId: string;
  /** What is being reported. Defaults to the whole profile. */
  targetType?: CreateReportRequestTargetType;
  username?: string | null;
  targetMessageId?: string | null;
  targetConversationId?: string | null;
  targetCallId?: string | null;
  targetPhotoId?: string | null;
}

const REPORT_TYPES: { value: CreateReportRequestReportType; label: string }[] = [
  { value: "spam", label: "Spam o publicidad" },
  { value: "fake_profile", label: "Perfil falso" },
  { value: "harassment", label: "Acoso o comportamiento abusivo" },
  { value: "video_behavior", label: "Comportamiento inapropiado en vídeo" },
  { value: "underage", label: "Parece ser menor de edad" },
  { value: "other", label: "Otro" },
];

/**
 * Shared "Reportar" dialog used at every surface that exposes another user
 * (profiles, chat, swipe deck, grid, map, favorites, Live). Files a moderation
 * report via POST /reports — the abuse category + the reported content's ids.
 */
export function ReportDialog({
  open,
  onOpenChange,
  targetUserId,
  targetType = "profile",
  username,
  targetMessageId,
  targetConversationId,
  targetCallId,
  targetPhotoId,
}: ReportDialogProps) {
  const { toast } = useToast();
  const createReport = useCreateReport();

  const [reportType, setReportType] =
    useState<CreateReportRequestReportType | null>(null);
  const [message, setMessage] = useState("");

  // Reset the form each time the dialog opens.
  useEffect(() => {
    if (open) {
      setReportType(null);
      setMessage("");
    }
  }, [open]);

  const handleSubmit = () => {
    if (!reportType) {
      toast({
        title: "Elige un motivo",
        description: "Selecciona por qué quieres reportar a esta persona.",
        variant: "destructive",
      });
      return;
    }

    createReport.mutate(
      {
        data: {
          targetUserId,
          reportType,
          targetType,
          message: message.trim() || undefined,
          targetMessageId: targetMessageId ?? undefined,
          targetConversationId: targetConversationId ?? undefined,
          targetCallId: targetCallId ?? undefined,
          targetPhotoId: targetPhotoId ?? undefined,
        },
      },
      {
        onSuccess: () => {
          toast({
            title: "Reporte enviado",
            description: "Gracias. Nuestro equipo lo revisará lo antes posible.",
          });
          onOpenChange(false);
        },
        onError: (err: any) => {
          toast({
            title: "No se pudo enviar el reporte",
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
          <DialogTitle className="font-display text-2xl tracking-widest text-gradient-brand flex items-center gap-2">
            <Flag className="w-5 h-5" />
            Reportar
          </DialogTitle>
          <DialogDescription className="font-sans text-sm text-muted-foreground">
            {username
              ? `¿Qué problema hay con ${username}?`
              : "Cuéntanos qué ha pasado."}{" "}
            Tu reporte es confidencial.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <Label className="font-display text-sm tracking-widest text-muted-foreground">
              Motivo
            </Label>
            <div className="grid grid-cols-1 gap-2">
              {REPORT_TYPES.map((t) => {
                const active = reportType === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setReportType(t.value)}
                    className={`flex items-center justify-between gap-2 rounded-xl border px-4 py-3 text-left font-sans text-sm transition-colors ${
                      active
                        ? "border-primary bg-primary/15 text-foreground"
                        : "border-border/60 bg-input/30 text-muted-foreground hover:border-primary/50"
                    }`}
                    data-testid={`button-report-type-${t.value}`}
                  >
                    {t.label}
                    {active && <Check className="w-4 h-4 text-primary" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="font-display text-sm tracking-widest text-muted-foreground">
              Detalle <span className="opacity-60">(opcional)</span>
            </Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={5000}
              rows={4}
              placeholder="Añade cualquier detalle que nos ayude a revisarlo…"
              className="rounded-xl border border-border/60 focus-visible:ring-primary focus-visible:border-primary font-sans bg-input/40 text-sm resize-none"
              data-testid="input-report-detail"
            />
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
          data-testid="button-report-submit"
        >
          {createReport.isPending ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Flag className="w-4 h-4" />
          )}
          Enviar reporte
        </button>
      </DialogContent>
    </Dialog>
  );
}
