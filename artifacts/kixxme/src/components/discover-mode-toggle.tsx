import { Layers, LayoutGrid, Radio } from "lucide-react";

export type DiscoverMode = "tarjetas" | "cuadricula" | "enlinea";

const OPTIONS: { key: DiscoverMode; label: string; Icon: typeof Layers; dot?: boolean }[] = [
  { key: "tarjetas",   label: "Tarjetas",   Icon: Layers },
  { key: "cuadricula", label: "Cuadrícula", Icon: LayoutGrid },
  { key: "enlinea",    label: "En línea",   Icon: Radio, dot: true },
];

/**
 * Segmented control for the Discover tab:
 * - "Tarjetas": Tinder-style swipe deck (discovery candidates).
 * - "Cuadrícula": grid of the profiles you've liked / SuperLiked.
 * - "En línea": grid of users currently online.
 */
export function ModeToggle({
  mode,
  setMode,
}: {
  mode: DiscoverMode;
  setMode: (m: DiscoverMode) => void;
}) {
  return (
    <div
      className="flex items-center gap-1 p-1 rounded-full border border-border/40"
      style={{ background: "rgba(255,255,255,0.04)" }}
      role="tablist"
      aria-label="Modo de descubrimiento"
    >
      {OPTIONS.map(({ key, label, Icon, dot }) => {
        const active = mode === key;
        return (
          <button
            key={key}
            role="tab"
            aria-selected={active}
            onClick={() => setMode(key)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-sans font-medium transition-all duration-200"
            style={
              active
                ? {
                    background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
                    color: "white",
                    boxShadow: "0 0 18px rgba(168,85,247,0.55), 0 0 6px rgba(236,72,153,0.35)",
                  }
                : { color: "hsl(240,10%,55%)" }
            }
            data-testid={`toggle-mode-${key}`}
          >
            {dot
              ? <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
              : <Icon className="w-3.5 h-3.5" />}
            {label}
          </button>
        );
      })}
    </div>
  );
}
