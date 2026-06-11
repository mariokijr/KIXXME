import { useEffect, useRef, useState } from "react";
import { Mic, Trash2, Send, Square, Loader2, Play, Pause } from "lucide-react";
import {
  pickAudioMime,
  formatDuration,
  MAX_RECORD_SECONDS,
  audioPlayback,
} from "@/lib/chat-media";

export type RecordedAudio = { blob: Blob; mime: string; duration: number };

/**
 * Tap-to-record voice note control. Idle = a mic button sized like the other
 * composer buttons. While recording it expands to a live timer + stop button
 * (auto-stops at 60s); after stopping it shows a review bar (play / discard /
 * send). It tells the parent when it's "active" so the parent can hide the text
 * input + send button. iOS-safe: single getUserMedia, tracks stopped on stop,
 * timeslice passed to MediaRecorder, duration measured by wall-clock (webm
 * reports Infinity).
 */
export function VoiceRecorder({
  onSend,
  onActiveChange,
  onError,
  disabled,
  sending,
  tint = "muted",
}: {
  onSend: (rec: RecordedAudio) => void;
  onActiveChange?: (active: boolean) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
  sending?: boolean;
  tint?: "muted" | "primary";
}) {
  const [phase, setPhase] = useState<"idle" | "recording" | "review">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [recorded, setRecorded] = useState<RecordedAudio | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    onActiveChange?.(phase !== "idle");
  }, [phase, onActiveChange]);

  const clearTimer = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };
  const cleanupStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };
  const revokeUrl = () => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  };

  // Hard cleanup on unmount.
  useEffect(() => {
    return () => {
      clearTimer();
      cleanupStream();
      revokeUrl();
    };
  }, []);

  const stop = () => {
    clearTimer();
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  };

  const start = async () => {
    if (disabled || sending) return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onError?.("No se pudo acceder al micrófono. Revisa los permisos.");
      return;
    }
    streamRef.current = stream;
    const mime = pickAudioMime();
    let rec: MediaRecorder;
    try {
      rec = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
    } catch {
      rec = new MediaRecorder(stream);
    }
    recorderRef.current = rec;
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      const actualMime = rec.mimeType || mime || "audio/webm";
      const blob = new Blob(chunksRef.current, { type: actualMime });
      cleanupStream();
      const duration = Math.min(
        MAX_RECORD_SECONDS,
        Math.max(1, Math.round((Date.now() - startRef.current) / 1000)),
      );
      revokeUrl();
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      setPreviewUrl(url);
      setRecorded({ blob, mime: actualMime, duration });
      setPhase("review");
    };
    startRef.current = Date.now();
    setElapsed(0);
    try {
      rec.start(1000); // periodic dataavailable — iOS Safari friendly
    } catch {
      cleanupStream();
      onError?.("Tu navegador no permite grabar audio.");
      return;
    }
    setPhase("recording");
    timerRef.current = window.setInterval(() => {
      const secs = Math.round((Date.now() - startRef.current) / 1000);
      setElapsed(secs);
      if (secs >= MAX_RECORD_SECONDS) stop();
    }, 250);
  };

  const reset = () => {
    revokeUrl();
    setPreviewUrl(null);
    setRecorded(null);
    setPlaying(false);
    setPhase("idle");
  };

  const send = () => {
    if (!recorded) return;
    onSend(recorded);
    reset();
  };

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
    } else {
      audioPlayback.play(el);
      void el.play();
    }
  };

  if (phase === "idle") {
    return (
      <button
        type="button"
        onClick={start}
        disabled={disabled || sending}
        data-testid="button-record-voice"
        className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl border border-border/40 hover:text-foreground transition-colors disabled:opacity-50"
        style={{
          background: "rgba(255,255,255,0.04)",
          color: tint === "primary" ? "hsl(273,85%,70%)" : undefined,
        }}
        aria-label="Grabar nota de voz"
      >
        <Mic
          className={`w-4 h-4 ${tint === "primary" ? "" : "text-muted-foreground"}`}
        />
      </button>
    );
  }

  if (phase === "recording") {
    return (
      <div
        className="flex-1 flex items-center gap-3 rounded-xl px-3 h-10 border border-red-500/30"
        style={{ background: "rgba(239,68,68,0.08)" }}
      >
        <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
        <span className="font-sans text-sm text-foreground tabular-nums flex-1">
          {formatDuration(elapsed)}
        </span>
        <span className="font-sans text-[11px] text-muted-foreground">
          Grabando…
        </span>
        <button
          type="button"
          onClick={stop}
          data-testid="button-stop-recording"
          className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg text-white"
          style={{
            background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
          }}
          aria-label="Detener grabación"
        >
          <Square className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  // review
  return (
    <div
      className="flex-1 flex items-center gap-2 rounded-xl px-2 h-10 border border-border/40"
      style={{ background: "rgba(255,255,255,0.04)" }}
    >
      <button
        type="button"
        onClick={reset}
        disabled={sending}
        data-testid="button-discard-voice"
        className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg text-red-400 hover:bg-white/5 disabled:opacity-50"
        aria-label="Descartar"
      >
        <Trash2 className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={togglePlay}
        className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg text-foreground hover:bg-white/5"
        aria-label={playing ? "Pausar" : "Reproducir"}
      >
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
      </button>
      <span className="font-sans text-sm text-muted-foreground tabular-nums flex-1">
        {recorded ? formatDuration(recorded.duration) : "0:00"}
      </span>
      <button
        type="button"
        onClick={send}
        disabled={sending}
        data-testid="button-send-voice"
        className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg text-white disabled:opacity-50"
        style={{
          background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
        }}
        aria-label="Enviar nota de voz"
      >
        {sending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Send className="w-4 h-4" />
        )}
      </button>
      <audio
        ref={audioRef}
        src={previewUrl ?? undefined}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        className="hidden"
      />
    </div>
  );
}
