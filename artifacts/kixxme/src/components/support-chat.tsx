import { useRef, useState } from "react";
import { Image as ImageIcon, Loader2, Send, X } from "lucide-react";
import {
  useSendSupportMessage,
  useUploadSupportAttachment,
} from "@workspace/api-client-react";
import type { SupportTicketMessage } from "@workspace/api-client-react";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { VoiceRecorder, type RecordedAudio } from "@/components/voice-recorder";
import { AudioBubble } from "@/components/audio-bubble";
import { downscaleImage, blobToBase64, audioExt } from "@/lib/chat-media";

const GRADIENT = "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))";

function isGoldRequired(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  const code = (error as { data?: { code?: string } } | null)?.data?.code;
  return status === 402 || code === "gold_required";
}

/**
 * Shared message bubble for a support ticket thread (used by both the user-side
 * "Soporte" page and the admin moderation panel). Renders a photo (tap to open
 * the lightbox), a voice note, and/or text, plus the timestamp/footer label.
 */
export function SupportMessageBubble({
  message,
  mine,
  topLabel,
  footLabel,
  onImageClick,
}: {
  message: SupportTicketMessage;
  mine: boolean;
  topLabel?: string;
  footLabel: string;
  onImageClick: (src: string) => void;
}) {
  const hasMedia = !!message.imageUrl || !!message.audioUrl;
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[80%]">
        {topLabel && !mine && (
          <p className="font-sans text-[10px] uppercase tracking-wider text-amber-400 mb-1 px-1">
            {topLabel}
          </p>
        )}
        <div
          className={`rounded-2xl overflow-hidden ${
            mine ? "rounded-br-sm" : "rounded-bl-sm border border-border/40"
          }`}
          style={mine ? { background: GRADIENT } : { background: "rgba(255,255,255,0.04)" }}
        >
          {message.imageUrl && (
            <button
              type="button"
              onClick={() => onImageClick(message.imageUrl!)}
              className="block p-1"
            >
              <img
                src={message.imageUrl}
                alt="Foto"
                className="rounded-xl max-h-64 w-auto object-cover cursor-zoom-in"
                loading="lazy"
              />
            </button>
          )}
          {message.audioUrl && (
            <AudioBubble
              src={message.audioUrl}
              duration={message.audioDuration}
              mine={mine}
            />
          )}
          {message.body && (
            <p
              className={`px-3 py-2 font-sans text-sm whitespace-pre-wrap break-words ${
                mine ? "text-white" : "text-foreground"
              } ${hasMedia ? "pt-1" : ""}`}
            >
              {message.body}
            </p>
          )}
        </div>
        <p
          className={`font-sans text-[10px] text-muted-foreground mt-1 px-1 ${
            mine ? "text-right" : "text-left"
          }`}
        >
          {footLabel}
        </p>
      </div>
    </div>
  );
}

/**
 * Shared composer for a support ticket: text + photo (preview-before-send) +
 * voice note. Handles uploads and the send mutation internally; the parent
 * passes `onSent` (to refresh its queries) and may react to a lapsed-Gold gate
 * via `onGoldRequired`.
 */
export function SupportComposer({
  ticketId,
  onSent,
  onGoldRequired,
  placeholder = "Escribe un mensaje…",
}: {
  ticketId: string;
  onSent: () => void;
  onGoldRequired?: () => void;
  placeholder?: string;
}) {
  const { toast } = useToast();
  const sendMessage = useSendSupportMessage();
  const uploadAttachment = useUploadSupportAttachment();

  const [text, setText] = useState("");
  const [pendingImage, setPendingImage] = useState<{
    base64: string;
    dataUrl: string;
  } | null>(null);
  const [preparingImage, setPreparingImage] = useState(false);
  const [recorderActive, setRecorderActive] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const busy = sendMessage.isPending || uploadAttachment.isPending;

  const handleError = (error: unknown) => {
    if (isGoldRequired(error)) {
      toast({
        title: "Necesitas KixxMe Gold",
        description: "Hazte Gold para enviar mensajes al soporte prioritario.",
        variant: "destructive",
      });
      onGoldRequired?.();
      return;
    }
    toast({ title: "No se pudo enviar el mensaje", variant: "destructive" });
  };

  const handlePickImage = () => fileRef.current?.click();

  const handleImageSelected = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPreparingImage(true);
    try {
      const { base64, dataUrl } = await downscaleImage(file);
      setPendingImage({ base64, dataUrl });
    } catch (err: any) {
      toast({
        title: "No se pudo usar esa foto",
        description: err?.message ?? "Inténtalo con otra imagen.",
        variant: "destructive",
      });
    } finally {
      setPreparingImage(false);
    }
  };

  const handleSendText = () => {
    const body = text.trim();
    if (body.length < 1) return;
    sendMessage.mutate(
      { id: ticketId, data: { body } },
      {
        onSuccess: () => {
          setText("");
          onSent();
        },
        onError: handleError,
      },
    );
  };

  const handleSendImage = async () => {
    if (!pendingImage) return;
    const img = pendingImage;
    setPendingImage(null);
    try {
      const { url } = await uploadAttachment.mutateAsync({
        id: ticketId,
        data: { base64: img.base64, mime_type: "image/jpeg", filename: "foto.jpg" },
      });
      await sendMessage.mutateAsync({ id: ticketId, data: { imageUrl: url } });
      onSent();
    } catch (err) {
      setPendingImage(img);
      handleError(err);
    }
  };

  const handleSendAudio = async (rec: RecordedAudio) => {
    try {
      const base64 = await blobToBase64(rec.blob);
      const { url } = await uploadAttachment.mutateAsync({
        id: ticketId,
        data: {
          base64,
          mime_type: rec.mime,
          filename: `nota-de-voz.${audioExt(rec.mime)}`,
        },
      });
      await sendMessage.mutateAsync({
        id: ticketId,
        data: { audioUrl: url, audioDuration: rec.duration },
      });
      onSent();
    } catch (err) {
      handleError(err);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageSelected}
      />

      {pendingImage && (
        <div
          className="flex items-center gap-3 rounded-xl p-2 border border-border/40"
          style={{ background: "rgba(255,255,255,0.04)" }}
        >
          <img
            src={pendingImage.dataUrl}
            alt="Vista previa"
            className="w-14 h-14 rounded-lg object-cover border border-border/40"
          />
          <span className="flex-1 font-sans text-sm text-muted-foreground">
            Foto lista para enviar
          </span>
          <button
            type="button"
            onClick={() => setPendingImage(null)}
            disabled={busy}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-red-400 hover:bg-white/5 disabled:opacity-50"
            aria-label="Descartar foto"
          >
            <X className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleSendImage}
            disabled={busy}
            data-testid="button-support-send-image"
            className="h-8 px-3 flex items-center gap-1.5 rounded-lg text-white text-sm font-sans disabled:opacity-50"
            style={{ background: GRADIENT }}
          >
            {uploadAttachment.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Enviar
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        {!recorderActive && (
          <button
            type="button"
            onClick={handlePickImage}
            disabled={busy || preparingImage}
            className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-xl border border-border/40 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            style={{ background: "rgba(255,255,255,0.04)" }}
            data-testid="button-support-pick-image"
          >
            {preparingImage ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <ImageIcon className="w-5 h-5" />
            )}
          </button>
        )}
        {!recorderActive && (
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={5000}
            rows={1}
            placeholder={placeholder}
            className="resize-none min-h-[44px] max-h-32"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendText();
              }
            }}
            data-testid="input-support-reply"
          />
        )}
        {text.trim() && !recorderActive ? (
          <button
            type="button"
            onClick={handleSendText}
            disabled={busy || text.trim().length < 1}
            className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-xl text-white disabled:opacity-50"
            style={{ background: GRADIENT }}
            data-testid="button-support-send-reply"
          >
            <Send className="w-5 h-5" />
          </button>
        ) : (
          <VoiceRecorder
            onSend={handleSendAudio}
            onActiveChange={setRecorderActive}
            onError={(message) => toast({ title: message, variant: "destructive" })}
            sending={busy}
          />
        )}
      </div>
    </div>
  );
}
