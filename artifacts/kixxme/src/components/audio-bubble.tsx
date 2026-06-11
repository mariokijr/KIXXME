import { useRef, useState } from "react";
import { Play, Pause } from "lucide-react";
import { formatDuration, audioPlayback } from "@/lib/chat-media";

/**
 * Playback bubble for a sent voice note. Total length comes from the stored
 * `duration` (webm metadata reports Infinity, so never trust the element). Uses
 * the global playback manager so starting one voice note pauses any other.
 */
export function AudioBubble({
  src,
  duration,
  mine,
}: {
  src: string;
  duration?: number | null;
  mine: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);

  const total = duration && duration > 0 ? duration : 0;
  const pct = total > 0 ? Math.min(100, (current / total) * 100) : 0;
  const showTime = playing || current > 0 ? current : total;

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
    } else {
      audioPlayback.play(el);
      void el.play();
    }
  };

  const fg = mine ? "text-white" : "text-foreground";
  const track = mine ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.15)";
  const fill = mine ? "rgba(255,255,255,0.95)" : "hsl(273,85%,65%)";
  const btnBg = mine ? "rgba(255,255,255,0.18)" : "rgba(168,85,247,0.18)";

  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 min-w-[200px] max-w-[260px]">
      <button
        type="button"
        onClick={toggle}
        data-testid="button-play-voice"
        className={`w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full ${fg}`}
        style={{ background: btnBg }}
        aria-label={playing ? "Pausar" : "Reproducir"}
      >
        {playing ? (
          <Pause className="w-4 h-4" />
        ) : (
          <Play className="w-4 h-4 ml-0.5" />
        )}
      </button>
      <div className="flex-1 flex flex-col gap-1.5">
        <div
          className="h-1 rounded-full overflow-hidden"
          style={{ background: track }}
        >
          <div
            className="h-full rounded-full transition-[width] duration-150"
            style={{ width: `${pct}%`, background: fill }}
          />
        </div>
        <span
          className={`font-sans text-[11px] tabular-nums ${
            mine ? "text-white/70" : "text-muted-foreground"
          }`}
        >
          {formatDuration(showTime)}
        </span>
      </div>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
        }}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        className="hidden"
      />
    </div>
  );
}
