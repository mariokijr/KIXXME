import React, { useState } from "react";
import { X, Lock, SlidersHorizontal } from "lucide-react";
import {
  ROLE_LABELS,
  LOOKING_FOR_LABELS,
  ORIENTATION_LABELS,
} from "@/lib/profile-format";

// ---------------------------------------------------------------------------
// Feed options — moved here so FilterSheet owns the full filter surface
// ---------------------------------------------------------------------------
export type DiscoverFeed = "recommended" | "online" | "new" | "popular" | "compatible";

export const SWIPE_FEED_KEY = "kixxme:swipe-feed";

export const FEED_OPTIONS: { key: DiscoverFeed; emoji: string; label: string }[] = [
  { key: "recommended", emoji: "✨", label: "Para ti" },
  { key: "online",      emoji: "🟢", label: "En línea" },
  { key: "new",         emoji: "🆕", label: "Nuevos" },
  { key: "popular",     emoji: "🔥", label: "Populares" },
  { key: "compatible",  emoji: "❤️", label: "Compatibles" },
];

export function readFeed(): DiscoverFeed {
  try {
    const v = localStorage.getItem(SWIPE_FEED_KEY);
    if (
      v === "recommended" || v === "online" || v === "new" ||
      v === "popular" || v === "compatible"
    ) return v;
  } catch { /* ignore */ }
  return "recommended";
}

export function saveFeed(f: DiscoverFeed) {
  try { localStorage.setItem(SWIPE_FEED_KEY, f); } catch { /* ignore */ }
}

export interface DiscoverFilters {
  ageMin: number | null;
  ageMax: number | null;
  heightMin: number | null;
  heightMax: number | null;
  onlineOnly: boolean;
  verifiedOnly: boolean;
  role: string | null;
  lookingFor: string | null;
  orientation: string | null;
  distanceMaxKm: number | null;
  countryOnly: boolean;
}

export const DEFAULT_FILTERS: DiscoverFilters = {
  ageMin: null,
  ageMax: null,
  heightMin: null,
  heightMax: null,
  onlineOnly: false,
  verifiedOnly: false,
  role: null,
  lookingFor: null,
  orientation: null,
  distanceMaxKm: null,
  countryOnly: false,
};

export const DISCOVER_FILTERS_KEY = "kixxme:discover-filters";

export function readFilters(): DiscoverFilters {
  try {
    const raw = localStorage.getItem(DISCOVER_FILTERS_KEY);
    if (raw) return { ...DEFAULT_FILTERS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_FILTERS };
}

export function saveFilters(f: DiscoverFilters) {
  try { localStorage.setItem(DISCOVER_FILTERS_KEY, JSON.stringify(f)); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Online-grid specific filter state (separate key + nearby-first defaults)
// ---------------------------------------------------------------------------

/** Default for the "En línea" grid: 100 km radius so users see nearby people first. */
export const ONLINE_DEFAULT_FILTERS: DiscoverFilters = {
  ...DEFAULT_FILTERS,
  distanceMaxKm: 100,
};

export const ONLINE_FILTERS_KEY = "kixxme:online-filters";

export function readOnlineFilters(): DiscoverFilters {
  try {
    const raw = localStorage.getItem(ONLINE_FILTERS_KEY);
    if (raw) return { ...ONLINE_DEFAULT_FILTERS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...ONLINE_DEFAULT_FILTERS };
}

export function saveOnlineFilters(f: DiscoverFilters) {
  try { localStorage.setItem(ONLINE_FILTERS_KEY, JSON.stringify(f)); } catch { /* ignore */ }
}

/**
 * Active-filter count for the online grid.
 * Distance is only "active" when it differs from the 100 km online default.
 */
export function countOnlineActiveFilters(f: DiscoverFilters): number {
  let n = 0;
  if (f.ageMin != null) n++;
  if (f.ageMax != null) n++;
  if (f.heightMin != null) n++;
  if (f.heightMax != null) n++;
  if (f.onlineOnly) n++;
  if (f.verifiedOnly) n++;
  if (f.role) n++;
  if (f.lookingFor) n++;
  if (f.orientation) n++;
  const defaultKm = ONLINE_DEFAULT_FILTERS.distanceMaxKm;
  if (f.distanceMaxKm !== defaultKm || f.countryOnly) n++;
  return n;
}

export function countActiveFilters(f: DiscoverFilters): number {
  let n = 0;
  if (f.ageMin != null) n++;
  if (f.ageMax != null) n++;
  if (f.heightMin != null) n++;
  if (f.heightMax != null) n++;
  if (f.onlineOnly) n++;
  if (f.verifiedOnly) n++;
  if (f.role) n++;
  if (f.lookingFor) n++;
  if (f.orientation) n++;
  if (f.distanceMaxKm != null || f.countryOnly) n++;
  return n;
}

export function filtersToParams(
  f: DiscoverFilters,
): Record<string, string | number | boolean | undefined> {
  return {
    age_min: f.ageMin ?? undefined,
    age_max: f.ageMax ?? undefined,
    online_only: f.onlineOnly || undefined,
    verified_only: f.verifiedOnly || undefined,
    role: f.role ?? undefined,
    looking_for: f.lookingFor ?? undefined,
    orientation: f.orientation ?? undefined,
    distance_max_km: f.distanceMaxKm ?? undefined,
    country_only: f.countryOnly || undefined,
  };
}

function ChipGrid({
  options,
  value,
  onChange,
  locked,
  onLockTap,
}: {
  options: Record<string, string>;
  value: string | null;
  onChange: (v: string | null) => void;
  locked?: boolean;
  onLockTap?: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {Object.entries(options).map(([key, label]) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => {
              if (locked) { onLockTap?.(); return; }
              onChange(active ? null : key);
            }}
            className="relative flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
            style={
              active
                ? { background: "linear-gradient(135deg,#8b5cf6,#ec4899)", color: "#fff" }
                : {
                    background: "rgba(255,255,255,0.06)",
                    color: locked ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.75)",
                    border: "1px solid rgba(255,255,255,0.1)",
                  }
            }
          >
            {locked && <Lock className="w-2.5 h-2.5 flex-shrink-0" />}
            {label}
          </button>
        );
      })}
    </div>
  );
}

type DistanceOption =
  | { kind: "km"; km: number; label: string }
  | { kind: "country"; label: string }
  | { kind: "world"; label: string };

const DISTANCE_OPTIONS: DistanceOption[] = [
  { kind: "km", km: 5,   label: "5 km" },
  { kind: "km", km: 10,  label: "10 km" },
  { kind: "km", km: 25,  label: "25 km" },
  { kind: "km", km: 50,  label: "50 km" },
  { kind: "km", km: 100, label: "100 km" },
  { kind: "km", km: 250, label: "250 km" },
  { kind: "km", km: 500, label: "500 km" },
  { kind: "country",     label: "Mi país" },
  { kind: "world",       label: "Todo el mundo" },
];

function isDistanceActive(draft: DiscoverFilters, opt: DistanceOption): boolean {
  if (opt.kind === "km")      return !draft.countryOnly && draft.distanceMaxKm === opt.km;
  if (opt.kind === "country") return draft.countryOnly;
  return !draft.countryOnly && draft.distanceMaxKm === null;
}

function applyDistance(prev: DiscoverFilters, opt: DistanceOption): DiscoverFilters {
  const active = isDistanceActive(prev, opt);
  if (opt.kind === "km") {
    return { ...prev, distanceMaxKm: active ? null : opt.km, countryOnly: false };
  }
  if (opt.kind === "country") {
    return { ...prev, distanceMaxKm: null, countryOnly: !active };
  }
  return { ...prev, distanceMaxKm: null, countryOnly: false };
}

interface FilterSheetProps {
  open: boolean;
  onClose: () => void;
  filters: DiscoverFilters;
  onChange: (f: DiscoverFilters) => void;
  plan: "free" | "plus" | "gold";
  feed?: DiscoverFeed;
  onFeedChange?: (f: DiscoverFeed) => void;
}

export function FilterSheet({ open, onClose, filters, onChange, plan, feed, onFeedChange }: FilterSheetProps) {
  const [draft, setDraft] = useState<DiscoverFilters>(filters);
  const [draftFeed, setDraftFeed] = useState<DiscoverFeed>(feed ?? "recommended");
  const isPaid = plan === "plus" || plan === "gold";
  const canVerifiedFilter = isPaid;

  const set = <K extends keyof DiscoverFilters>(k: K, v: DiscoverFilters[K]) =>
    setDraft((prev) => ({ ...prev, [k]: v }));

  const applyAndClose = () => {
    onChange(draft);
    onFeedChange?.(draftFeed);
    onClose();
  };

  const resetAndClose = () => {
    const fresh = { ...DEFAULT_FILTERS };
    setDraft(fresh);
    onChange(fresh);
    setDraftFeed("recommended");
    onFeedChange?.("recommended");
    onClose();
  };

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[95] bg-black/60"
        style={{ backdropFilter: "blur(4px)" }}
        onClick={onClose}
      />

      <div
        className="fixed inset-x-0 bottom-0 z-[96] flex flex-col rounded-t-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-250"
        style={{ background: "rgba(14,12,30,0.98)", maxHeight: "88dvh" }}
      >
        <div className="flex-shrink-0 flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/[0.07]">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-primary" />
            <span className="font-semibold text-white text-sm">Filtros</span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-white transition-colors"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">

          {/* ── Mostrar (feed) ── */}
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Mostrar
            </p>
            <div className="flex flex-wrap gap-2">
              {FEED_OPTIONS.map(({ key, emoji, label }) => {
                const active = draftFeed === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setDraftFeed(key)}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium transition-all"
                    style={
                      active
                        ? { background: "linear-gradient(135deg,#8b5cf6,#ec4899)", color: "#fff", boxShadow: "0 0 14px rgba(168,85,247,0.45)" }
                        : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.75)", border: "1px solid rgba(255,255,255,0.1)" }
                    }
                    data-testid={`filter-feed-${key}`}
                  >
                    <span>{emoji}</span>
                    {label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Distance */}
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Distancia máxima
            </p>
            <div className="flex flex-wrap gap-2">
              {DISTANCE_OPTIONS.map((opt) => {
                const active = isDistanceActive(draft, opt);
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setDraft((prev) => applyDistance(prev, opt))}
                    className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                    style={
                      active
                        ? { background: "linear-gradient(135deg,#8b5cf6,#ec4899)", color: "#fff" }
                        : {
                            background: "rgba(255,255,255,0.06)",
                            color: "rgba(255,255,255,0.75)",
                            border: "1px solid rgba(255,255,255,0.1)",
                          }
                    }
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Age range */}
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Edad
            </p>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="text-[11px] text-muted-foreground mb-1 block">Mínima</label>
                <input
                  type="number"
                  min={18}
                  max={99}
                  value={draft.ageMin ?? ""}
                  onChange={(e) => set("ageMin", e.target.value ? parseInt(e.target.value, 10) : null)}
                  placeholder="18"
                  className="w-full px-3 py-2 rounded-xl text-sm text-white placeholder:text-muted-foreground/50 outline-none"
                  style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}
                />
              </div>
              <span className="text-muted-foreground text-sm mt-4">—</span>
              <div className="flex-1">
                <label className="text-[11px] text-muted-foreground mb-1 block">Máxima</label>
                <input
                  type="number"
                  min={18}
                  max={99}
                  value={draft.ageMax ?? ""}
                  onChange={(e) => set("ageMax", e.target.value ? parseInt(e.target.value, 10) : null)}
                  placeholder="99"
                  className="w-full px-3 py-2 rounded-xl text-sm text-white placeholder:text-muted-foreground/50 outline-none"
                  style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}
                />
              </div>
            </div>
          </section>

          {/* Height range */}
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Altura (cm)
            </p>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="text-[11px] text-muted-foreground mb-1 block">Mínima</label>
                <input
                  type="number"
                  min={140}
                  max={220}
                  value={draft.heightMin ?? ""}
                  onChange={(e) => set("heightMin", e.target.value ? parseInt(e.target.value, 10) : null)}
                  placeholder="—"
                  className="w-full px-3 py-2 rounded-xl text-sm text-white placeholder:text-muted-foreground/50 outline-none"
                  style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}
                />
              </div>
              <span className="text-muted-foreground text-sm mt-4">—</span>
              <div className="flex-1">
                <label className="text-[11px] text-muted-foreground mb-1 block">Máxima</label>
                <input
                  type="number"
                  min={140}
                  max={220}
                  value={draft.heightMax ?? ""}
                  onChange={(e) => set("heightMax", e.target.value ? parseInt(e.target.value, 10) : null)}
                  placeholder="—"
                  className="w-full px-3 py-2 rounded-xl text-sm text-white placeholder:text-muted-foreground/50 outline-none"
                  style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}
                />
              </div>
            </div>
          </section>

          {/* Online only */}
          <section>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white">Solo en línea</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Activos en los últimos 15 min
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={draft.onlineOnly}
                onClick={() => set("onlineOnly", !draft.onlineOnly)}
                className="relative w-11 h-6 rounded-full transition-colors flex-shrink-0"
                style={{
                  background: draft.onlineOnly
                    ? "linear-gradient(135deg,#8b5cf6,#ec4899)"
                    : "rgba(255,255,255,0.12)",
                }}
              >
                <span
                  className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
                  style={{ transform: draft.onlineOnly ? "translateX(20px)" : "translateX(0)" }}
                />
              </button>
            </div>
          </section>

          {/* Verified only — Plus+ */}
          <section>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium text-white">Solo verificados</p>
                  {!canVerifiedFilter && (
                    <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold"
                      style={{ background: "rgba(139,92,246,0.3)", color: "#c4b5fd" }}>
                      <Lock className="w-2.5 h-2.5" /> Plus
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Perfiles con foto de identidad verificada
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={draft.verifiedOnly}
                onClick={() => {
                  if (!canVerifiedFilter) { window.location.href = "/premium"; return; }
                  set("verifiedOnly", !draft.verifiedOnly);
                }}
                className="relative w-11 h-6 rounded-full transition-colors flex-shrink-0"
                style={{
                  background: (canVerifiedFilter && draft.verifiedOnly)
                    ? "linear-gradient(135deg,#8b5cf6,#ec4899)"
                    : "rgba(255,255,255,0.12)",
                }}
              >
                <span
                  className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
                  style={{ transform: (canVerifiedFilter && draft.verifiedOnly) ? "translateX(20px)" : "translateX(0)" }}
                />
              </button>
            </div>
          </section>

          {/* Role */}
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Rol</p>
            <ChipGrid
              options={ROLE_LABELS}
              value={draft.role}
              onChange={(v) => set("role", v)}
            />
          </section>

          {/* Looking for */}
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Busca</p>
            <ChipGrid
              options={LOOKING_FOR_LABELS}
              value={draft.lookingFor}
              onChange={(v) => set("lookingFor", v)}
            />
          </section>

          {/* Orientation */}
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Orientación</p>
            <ChipGrid
              options={ORIENTATION_LABELS}
              value={draft.orientation}
              onChange={(v) => set("orientation", v)}
            />
          </section>

        </div>

        <div className="flex-shrink-0 flex gap-3 px-5 py-4 border-t border-white/[0.07]"
          style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
        >
          <button
            type="button"
            onClick={resetAndClose}
            className="flex-1 py-3 rounded-xl text-sm font-semibold text-muted-foreground transition-colors hover:text-white"
            style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            Limpiar
          </button>
          <button
            type="button"
            onClick={applyAndClose}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
            style={{ background: "linear-gradient(135deg,#8b5cf6,#ec4899)" }}
          >
            Aplicar
          </button>
        </div>
      </div>
    </>
  );
}
