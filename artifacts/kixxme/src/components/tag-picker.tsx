import { INTEREST_CATEGORIES } from "@/lib/profile-format";

interface TagPickerProps {
  selected: string[];
  onChange: (tags: string[]) => void;
  max?: number;
}

/**
 * Categorized tag picker for user interests. Tapping a chip toggles it;
 * once `max` is reached the unselected chips are dimmed (still tappable to
 * swap). Designed for mobile — full-width scrollable by category.
 */
export function TagPicker({ selected, onChange, max = 20 }: TagPickerProps) {
  const selectedSet = new Set(selected);
  const atMax = selected.length >= max;

  function toggle(slug: string) {
    if (selectedSet.has(slug)) {
      onChange(selected.filter((s) => s !== slug));
    } else {
      if (atMax) return;
      onChange([...selected, slug]);
    }
  }

  return (
    <div className="space-y-5">
      {INTEREST_CATEGORIES.map((cat) => (
        <div key={cat.label}>
          <p className="font-display text-xs tracking-widest text-muted-foreground uppercase mb-2.5">
            {cat.label}
          </p>
          <div className="flex flex-wrap gap-2">
            {cat.tags.map((tag) => {
              const isOn = selectedSet.has(tag.slug);
              const dimmed = !isOn && atMax;
              return (
                <button
                  key={tag.slug}
                  type="button"
                  onClick={() => toggle(tag.slug)}
                  disabled={dimmed}
                  className="px-3 py-1.5 rounded-full text-sm font-sans border transition-all duration-150 select-none"
                  style={
                    isOn
                      ? {
                          background:
                            "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
                          color: "#fff",
                          borderColor: "transparent",
                          boxShadow: "0 0 10px rgba(168,85,247,0.4)",
                        }
                      : dimmed
                        ? {
                            background: "rgba(255,255,255,0.02)",
                            color: "rgba(255,255,255,0.25)",
                            borderColor: "rgba(255,255,255,0.08)",
                            cursor: "not-allowed",
                          }
                        : {
                            background: "rgba(255,255,255,0.05)",
                            color: "rgba(255,255,255,0.7)",
                            borderColor: "rgba(255,255,255,0.12)",
                          }
                  }
                >
                  {tag.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <p className="font-sans text-xs text-muted-foreground text-right">
        {selected.length}/{max} seleccionados
      </p>
    </div>
  );
}
