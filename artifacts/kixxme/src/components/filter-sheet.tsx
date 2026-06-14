import React, { useState } from "react";
import { X, Lock, SlidersHorizontal } from "lucide-react";
import {
  ROLE_LABELS,
  LOOKING_FOR_LABELS,
  ORIENTATION_LABELS,
} from "@/lib/profile-format";

// ---------------------------------------------------------------------------
// Filter state types
// ---------------------------------------------------------------------------
export interface DiscoverFilters {
  ageMin: number | null;
  ageMax: number | null;
  onlineOnly: boolean;
  verifiedOnly: boolean;
  role: string | null;
  lookingFor: string | null;
  orientation: string | null;
  distanceMaxKm: number | null;
}

export const DEFAULT_FILTERS: DiscoverFilters = {
  ageMin: null,
  ageMax: null,
  onlineOnly: false,
  verifiedOnly: false,
  role: null,
  lookingFor: null,
  orientation: null,
  distanceMaxKm: null,
};

export function countActiveFilters(f: DiscoverFilters): number {
  let n = 0;
  if (f.ageMin != null) n++;
  if (f.ageMax != null) n++;
  if (f.onlineOnly) n++;
  if (f.verifiedOnly) n++;
  if (f.role) n++;
  if (f.lookingFor) n++;
  if (f.orientation) n++;
  if (f.distanceMaxKm != null) n++;
  return n;
}

/** Convert filters to `GET /profiles` query params object. */
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
  };
}

// ---------------------------------------------------------------------------
// Pill chip selector
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Distance options (Gold)
// ---------------------------------------------------------------------------
const DISTANCE_OPTIONS = [5, 20, 50, 100, 250] as const;

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
interface FilterSheetProps {
  open: boolean;
  onClose: () => void;
  filters: DiscoverFilters;
  onChange: (f: DiscoverFilters) => void;
  plan: "free" | "plus" | "gold";
}

export function FilterSheet({ open, onClose, filters, onChange, plan }: FilterSheetProps) {
  const [draft, setDraft] = useState<DiscoverFilters>(filters);
  const isPaid = plan === "plus" || plan === "gold";
  const isGold = plan === "gold";

  const set = <K extends keyof DiscoverFilters>(k: K, v: DiscoverFilters[K]) =>
    setDraft((prev) => ({ ...prev, [k]: v }));

  const applyAndClose = () => {
    onChange(draft);
    onClose();
  };

  const resetAndClose = () => {
    const fresh = { ...DEFAULT_FILTERS };
    setDraft(fresh);
    onChange(fresh);
    onClose();
  };

  const upsell = (tier: "plus" | "gold") => {
    window.location.href = "/premium";
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[95] bg-black/60"
        style={{ backdropFilter: "blur(4px)" }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="fixed inset-x-0 bottom-0 z-[96] flex flex-col rounded-t-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-250"
        style={{ background: "rgba(14,12,30,0.98)", maxHeight: "88dvh" }}
      >
        {/* Handle + header */}
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

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">

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

          {/* Verified only (Plus+) */}
          <section>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium text-white">Solo verificados</p>
                  {!isPaid && (
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
                  if (!isPaid) { upsell("plus"); return; }
                  set("verifiedOnly", !draft.verifiedOnly);
                }}
                className="relative w-11 h-6 rounded-full transition-colors flex-shrink-0"
                style={{
                  background: (isPaid && draft.verifiedOnly)
                    ? "linear-gradient(135deg,#8b5cf6,#ec4899)"
                    : "rgba(255,255,255,0.12)",
                }}
              >
                <span
                  className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
                  style={{ transform: (isPaid && draft.verifiedOnly) ? "translateX(20px)" : "translateX(0)" }}
                />
              </button>
            </div>
          </section>

          {/* Role (Plus+) */}
          <section>
            <div className="flex items-center gap-1.5 mb-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rol</p>
              {!isPaid && (
                <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold"
                  style={{ background: "rgba(139,92,246,0.3)", color: "#c4b5fd" }}>
                  <Lock className="w-2.5 h-2.5" /> Plus
                </span>
              )}
            </div>
            <ChipGrid
              options={ROLE_LABELS}
              value={isPaid ? draft.role : null}
              onChange={(v) => set("role", v)}
              locked={!isPaid}
              onLockTap={() => upsell("plus")}
            />
          </section>

          {/* Looking for (Plus+) */}
          <section>
            <div className="flex items-center gap-1.5 mb-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Busca</p>
              {!isPaid && (
                <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold"
                  style={{ background: "rgba(139,92,246,0.3)", color: "#c4b5fd" }}>
                  <Lock className="w-2.5 h-2.5" /> Plus
                </span>
              )}
            </div>
            <ChipGrid
              options={LOOKING_FOR_LABELS}
              value={isPaid ? draft.lookingFor : null}
              onChange={(v) => set("lookingFor", v)}
              locked={!isPaid}
              onLockTap={() => upsell("plus")}
            />
          </section>

          {/* Orientation (Plus+) */}
          <section>
            <div className="flex items-center gap-1.5 mb-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Orientación</p>
              {!isPaid && (
                <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold"
                  style={{ background: "rgba(139,92,246,0.3)", color: "#c4b5fd" }}>
                  <Lock className="w-2.5 h-2.5" /> Plus
                </span>
              )}
            </div>
            <ChipGrid
              options={ORIENTATION_LABELS}
              value={isPaid ? draft.orientation : null}
              onChange={(v) => set("orientation", v)}
              locked={!isPaid}
              onLockTap={() => upsell("plus")}
            />
          </section>

          {/* Distance max (Gold) */}
          <section>
            <div className="flex items-center gap-1.5 mb-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Distancia máxima
              </p>
              {!isGold && (
                <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold"
                  style={{ background: "rgba(234,179,8,0.25)", color: "#fde047" }}>
                  <Lock className="w-2.5 h-2.5" /> Gold
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {DISTANCE_OPTIONS.map((km) => {
                const active = isGold && draft.distanceMaxKm === km;
                return (
                  <button
                    key={km}
                    type="button"
                    onClick={() => {
                      if (!isGold) { upsell("gold"); return; }
                      set("distanceMaxKm", draft.distanceMaxKm === km ? null : km);
                    }}
                    className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                    style={
                      active
                        ? { background: "linear-gradient(135deg,#8b5cf6,#ec4899)", color: "#fff" }
                        : {
                            background: "rgba(255,255,255,0.06)",
                            color: isGold ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.3)",
                            border: "1px solid rgba(255,255,255,0.1)",
                          }
                    }
                  >
                    {km < 1000 ? `${km} km` : "Ilimitado"}
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* Footer actions */}
        <div className="flex-shrink-0 flex gap-3 px-5 py-4 border-t border-white/[0.07]">
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
