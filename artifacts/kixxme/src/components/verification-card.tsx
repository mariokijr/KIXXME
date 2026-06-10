import { useRef, useState } from "react";
import {
  useGetMyVerification,
  useRequestVerification,
  getGetMyVerificationQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import {
  BadgeCheck,
  Clock,
  ShieldCheck,
  Loader2,
  XCircle,
  Camera,
} from "lucide-react";

/**
 * Self-service verification card for the user's own profile. Shows the current
 * standing (verified / pending / rejected / none) and lets the user submit an
 * identity SELFIE for manual review. The badge itself is `profiles.is_verified`;
 * this only manages the request queue. The selfie is downscaled in the browser
 * (max 1024px JPEG) and stored privately — it never becomes a public photo.
 */

const MAX_DIM = 1024;
const JPEG_QUALITY = 0.8;

/** Downscale an image File to a <=MAX_DIM JPEG and return its base64 payload. */
async function downscaleToJpeg(
  file: File,
): Promise<{ base64: string; dataUrl: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("No se pudo procesar la imagen."));
    i.src = dataUrl;
  });
  let width = img.naturalWidth || img.width;
  let height = img.naturalHeight || img.height;
  if (width > MAX_DIM || height > MAX_DIM) {
    if (width >= height) {
      height = Math.round((height * MAX_DIM) / width);
      width = MAX_DIM;
    } else {
      width = Math.round((width * MAX_DIM) / height);
      height = MAX_DIM;
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Tu navegador no permite procesar la imagen.");
  ctx.drawImage(img, 0, 0, width, height);
  const outUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  const base64 = outUrl.split(",")[1] ?? "";
  if (!base64) throw new Error("No se pudo procesar la imagen.");
  return { base64, dataUrl: outUrl };
}

export function VerificationCard() {
  const { session } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selfie, setSelfie] = useState<{
    base64: string;
    dataUrl: string;
  } | null>(null);
  const [preparing, setPreparing] = useState(false);

  const { data, isLoading } = useGetMyVerification({
    query: { enabled: !!session, queryKey: getGetMyVerificationQueryKey() },
  });
  const request = useRequestVerification();

  if (isLoading || !data) return null;

  const handlePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setPreparing(true);
    try {
      const result = await downscaleToJpeg(file);
      setSelfie(result);
    } catch (err: any) {
      toast({
        title: "No se pudo usar esa foto",
        description: err?.message ?? "Inténtalo con otra imagen.",
        variant: "destructive",
      });
    } finally {
      setPreparing(false);
    }
  };

  const handleSubmit = () => {
    if (!selfie) return;
    request.mutate(
      {
        data: { selfie_base64: selfie.base64, selfie_mime_type: "image/jpeg" },
      },
      {
        onSuccess: () => {
          setSelfie(null);
          toast({
            title: "Solicitud enviada",
            description: "Revisaremos tu perfil lo antes posible.",
          });
          qc.invalidateQueries({ queryKey: getGetMyVerificationQueryKey() });
        },
        onError: (err: any) => {
          qc.invalidateQueries({ queryKey: getGetMyVerificationQueryKey() });
          toast({
            title: "No se pudo enviar",
            description: err?.data?.error ?? "Inténtalo de nuevo.",
            variant: "destructive",
          });
        },
      },
    );
  };

  if (data.is_verified) {
    return (
      <div
        className="mx-4 mb-4 border border-sky-500/30 rounded-2xl p-5"
        style={{ background: "rgba(14,165,233,0.06)" }}
        data-testid="card-verification-approved"
      >
        <div className="flex items-center gap-2 mb-1">
          <BadgeCheck className="w-5 h-5 text-sky-400" />
          <h3 className="font-display text-lg tracking-widest text-foreground">
            Perfil verificado
          </h3>
        </div>
        <p className="font-sans text-sm text-muted-foreground">
          Tu identidad está verificada. La insignia azul aparece en tu perfil y
          en tus tarjetas.
        </p>
      </div>
    );
  }

  if (data.status === "pending") {
    return (
      <div
        className="mx-4 mb-4 border border-amber-500/30 rounded-2xl p-5"
        style={{ background: "rgba(245,158,11,0.05)" }}
        data-testid="card-verification-pending"
      >
        <div className="flex items-center gap-2 mb-1">
          <Clock className="w-5 h-5 text-amber-400" />
          <h3 className="font-display text-lg tracking-widest text-foreground">
            Verificación en revisión
          </h3>
        </div>
        <p className="font-sans text-sm text-muted-foreground">
          Hemos recibido tu selfie. Te avisaremos cuando nuestro equipo revise tu
          solicitud.
        </p>
      </div>
    );
  }

  const rejected = data.status === "rejected";
  const busy = request.isPending || preparing;

  return (
    <div
      className="mx-4 mb-4 border border-border/40 rounded-2xl p-5 space-y-3"
      style={{ background: "rgba(13,11,26,0.7)" }}
      data-testid="card-verification-request"
    >
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-5 h-5 text-primary" />
        <h3 className="font-display text-lg tracking-widest text-foreground">
          Verifica tu perfil
        </h3>
      </div>
      <p className="font-sans text-sm text-muted-foreground">
        Hazte un selfie mostrando tu cara con claridad para conseguir la insignia
        azul. Lo usaremos solo para comprobar que coincide con tus fotos; es
        privado y nunca se publica.
      </p>
      {rejected && (
        <div
          className="flex items-start gap-2 rounded-xl border border-red-500/30 p-3"
          style={{ background: "rgba(239,68,68,0.06)" }}
        >
          <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
          <p className="font-sans text-xs text-red-300/90">
            {data.note?.trim()
              ? data.note
              : "Tu solicitud anterior fue rechazada. Asegúrate de que tu selfie muestre tu cara con claridad e inténtalo de nuevo."}
          </p>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="user"
        onChange={handlePick}
        className="hidden"
        data-testid="input-selfie"
      />

      {selfie ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <img
              src={selfie.dataUrl}
              alt="Vista previa del selfie"
              className="w-20 h-20 rounded-xl object-cover border border-border/40"
              data-testid="img-selfie-preview"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="font-sans text-sm text-primary hover:underline disabled:opacity-60"
              data-testid="button-change-selfie"
            >
              Cambiar foto
            </button>
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={busy}
            className="w-full h-11 rounded-xl border border-primary/30 flex items-center justify-center gap-2 font-sans text-sm font-medium text-primary hover:bg-primary/5 transition-colors disabled:opacity-60"
            style={{ background: "rgba(168,85,247,0.06)" }}
            data-testid="button-submit-verification"
          >
            {request.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <BadgeCheck className="w-4 h-4" />
            )}
            Enviar solicitud
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="w-full h-11 rounded-xl border border-primary/30 flex items-center justify-center gap-2 font-sans text-sm font-medium text-primary hover:bg-primary/5 transition-colors disabled:opacity-60"
          style={{ background: "rgba(168,85,247,0.06)" }}
          data-testid="button-request-verification"
        >
          {preparing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Camera className="w-4 h-4" />
          )}
          {rejected ? "Hacer un nuevo selfie" : "Hacerme un selfie"}
        </button>
      )}
    </div>
  );
}
