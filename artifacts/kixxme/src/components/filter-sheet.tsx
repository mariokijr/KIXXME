import React, { useRef, useCallback, useEffect } from "react";
import { X, Lock, BadgeCheck } from "lucide-react";
import {
  ROLE_LABELS,
  LOOKING_FOR_LABELS,
  ORIENTATION_LABELS,
} from "@/lib/profile-format";

export interface DiscoverFilters {
  ageMin: number | null;
  ageMax: number | null;
  onlineOnly: boolean;
  verifiedOnly: boolean;
  role: string | null;
  lookingFor: string | null;
  orientation: string | null;
  distanceMaxKm: number | null;
  internationalFallback: boolean;
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
  internationalFallback: true,
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

const AGE_MIN = 18;
const AGE_MAX = 80;
const DIST_MAX = 250;

function distLabel(km: number | null): string {
  if (km == null) return "Todo el mundo";
  if (km >= DIST_MAX) return "Todo el mundo";
  return `${km} km`;
}

function ageLabel(min: number | null, max: number | null): string {
  const lo = min ?? AGE_MIN;
  const hi = max ?? AGE_MAX;
  if (lo === AGE_MIN && hi === AGE_MAX) return "Cualquier edad";
  if (hi === AGE_MAX) return `${lo}+`;
  return `${lo} — ${hi}`;
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className="relative w-11 h-6 rounded-full transition-colors flex-shrink-0"
      style={{
        background: checked
          ? "linear-gradient(135deg,#8b5cf6,#ec4899)"
          : "rgba(0,0,0,0.12)",
      }}
    >
      <span
        className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
        style={{ transform: checked ? "translateX(20px)" : "translateX(0)" }}
      />
    </button>
  );
}

function Chips({
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
            className="flex items-center gap-1 px-3.5 py-1.5 rounded-full text-sm font-medium transition-all"
            style={
              active
                ? { background: "#111", color: "#fff", border: "1.5px solid #111" }
                : {
                    background: "#f5f5f5",
                    color: locked ? "#bbb" : "#333",
                    border: "1.5px solid #e5e5e5",
                  }
            }
          >
            {locked && <Lock className="w-2.5 h-2.5" />}
            {label}
          </button>
        );
      })}
    </div>
  );
}

function DualRangeSlider({
  low,
  high,
  onLow,
  onHigh,
}: {
  low: number;
  high: number;
  onLow: (v: number) => void;
  onHigh: (v: number) => void;
}) {
  const lowRef = useRef<HTMLInputElement>(null);
  const highRef = useRef<HTMLInputElement>(null);

  const lowPct = ((low - AGE_MIN) / (AGE_MAX - AGE_MIN)) * 100;
  const highPct = ((high - AGE_MIN) / (AGE_MAX - AGE_MIN)) * 100;

  const handleLow = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Math.min(Number(e.target.value), high - 1);
      onLow(v);
    },
    [high, onLow],
  );

  const handleHigh = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Math.max(Number(e.target.value), low + 1);
      onHigh(v);
    },
    [low, onHigh],
  );

  return (
    <div className="relative pt-2 pb-1">
      <style>{`
        .fr-thumb::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:24px;height:24px;border-radius:50%;background:#111;border:2.5px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,0.25);pointer-events:all;cursor:pointer;}
        .fr-thumb::-moz-range-thumb{width:24px;height:24px;border-radius:50%;background:#111;border:2.5px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,0.25);pointer-events:all;cursor:pointer;border:none;}
        .fr-thumb{-webkit-appearance:none;appearance:none;background:transparent;position:absolute;width:100%;height:24px;top:50%;transform:translateY(-50%);pointer-events:none;outline:none;}
      `}</style>

      <div className="relative h-1.5 mx-3 rounded-full bg-gray-200">
        <div
          className="absolute h-full rounded-full bg-gray-900"
          style={{ left: `${lowPct}%`, right: `${100 - highPct}%` }}
        />
      </div>

      <input
        ref={lowRef}
        type="range"
        min={AGE_MIN}
        max={AGE_MAX}
        value={low}
        onChange={handleLow}
        className="fr-thumb"
        style={{ zIndex: low > AGE_MAX - 5 ? 5 : 4 }}
      />
      <input
        ref={highRef}
        type="range"
        min={AGE_MIN}
        max={AGE_MAX}
        value={high}
        onChange={handleHigh}
        className="fr-thumb"
        style={{ zIndex: 5 }}
      />
    </div>
  );
}

function DistSlider({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const sliderVal = value == null || value >= DIST_MAX ? DIST_MAX : value;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    onChange(v >= DIST_MAX ? null : v);
  };

  const pct = (sliderVal / DIST_MAX) * 100;

  return (
    <div className="relative pt-2 pb-1">
      <style>{`
        .dist-thumb::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:24px;height:24px;border-radius:50%;background:#111;border:2.5px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,0.25);cursor:pointer;}
        .dist-thumb::-moz-range-thumb{width:24px;height:24px;border-radius:50%;background:#111;border:2.5px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,0.25);cursor:pointer;border:none;}
        .dist-thumb{-webkit-appearance:none;appearance:none;background:transparent;width:100%;outline:none;}
      `}</style>

      <div className="relative h-1.5 mx-3 rounded-full bg-gray-200">
        <div
          className="absolute h-full rounded-full bg-gray-900 left-0"
          style={{ right: `${100 - pct}%` }}
        />
      </div>

      <input
        type="range"
        min={10}
        max={DIST_MAX}
        step={5}
        value={sliderVal}
        onChange={handleChange}
        className="dist-thumb absolute inset-x-0 h-6"
        style={{ top: "50%", transform: "translateY(-50%)", position: "absolute" }}
      />
    </div>
  );
}

interface FilterSheetProps {
  open: boolean;
  onClose: () => void;
  filters: DiscoverFilters;
  onChange: (f: DiscoverFilters) => void;
  plan: "free" | "plus" | "gold";
}

export function FilterSheet({ open, onClose, filters, onChange, plan }: FilterSheetProps) {
  const [draft, setDraft] = React.useState<DiscoverFilters>(filters);

  useEffect(() => {
    if (open) setDraft(filters);
  }, [open]);

  const isPaid = plan === "plus" || plan === "gold";

  const set = <K extends keyof DiscoverFilters>(k: K, v: DiscoverFilters[K]) =>
    setDraft((prev) => ({ ...prev, [k]: v }));

  const low = draft.ageMin ?? AGE_MIN;
  const high = draft.ageMax ?? AGE_MAX;

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

  if (!open) return null;

  const hasAny =
    draft.ageMin != null ||
    draft.ageMax != null ||
    draft.onlineOnly ||
    draft.verifiedOnly ||
    draft.role ||
    draft.lookingFor ||
    draft.orientation ||
    draft.distanceMaxKm != null;

  return (
    <>
      <div
        className="fixed inset-0 z-[95] bg-black/50"
        style={{ backdropFilter: "blur(3px)" }}
        onClick={onClose}
      />

      <div
        className="fixed inset-x-0 bottom-0 z-[96] flex flex-col rounded-t-3xl overflow-hidden"
        style={{
          background: "#fff",
          maxHeight: "92dvh",
          boxShadow: "0 -8px 48px rgba(0,0,0,0.18)",
        }}
      >
        {/* Handle bar */}
        <div className="flex-shrink-0 flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-3">
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
            style={{ background: "#f5f5f5" }}
          >
            <X className="w-4 h-4 text-gray-800" />
          </button>

          <span className="font-semibold text-gray-900 text-base">Filtros</span>

          <button
            onClick={resetAndClose}
            className="text-sm font-medium transition-colors"
            style={{ color: hasAny ? "#8b5cf6" : "#bbb" }}
          >
            Eliminar
          </button>
        </div>

        {/* Divider */}
        <div className="h-px bg-gray-100 mx-5" />

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">

          {/* Busca */}
          <section className="px-5 py-4 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-500 mb-3">Busca</p>
            <Chips
              options={LOOKING_FOR_LABELS}
              value={draft.lookingFor}
              onChange={(v) => set("lookingFor", v)}
            />
          </section>

          {/* Rol */}
          <section className="px-5 py-4 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-500 mb-3">Rol</p>
            <Chips
              options={ROLE_LABELS}
              value={draft.role}
              onChange={(v) => set("role", v)}
            />
          </section>

          {/* Orientación */}
          <section className="px-5 py-4 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-500 mb-3">Orientación</p>
            <Chips
              options={ORIENTATION_LABELS}
              value={draft.orientation}
              onChange={(v) => set("orientation", v)}
            />
          </section>

          {/* Edad */}
          <section className="px-5 py-4 border-b border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-gray-500">Edad</p>
              <span className="text-sm font-semibold text-gray-900">{ageLabel(draft.ageMin, draft.ageMax)}</span>
            </div>
            <DualRangeSlider
              low={low}
              high={high}
              onLow={(v) => set("ageMin", v === AGE_MIN ? null : v)}
              onHigh={(v) => set("ageMax", v === AGE_MAX ? null : v)}
            />
          </section>

          {/* Distancia */}
          <section className="px-5 py-4 border-b border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-gray-500">Distancia</p>
              <span className="text-sm font-semibold text-gray-900">{distLabel(draft.distanceMaxKm)}</span>
            </div>
            <div className="relative h-8">
              <DistSlider
                value={draft.distanceMaxKm}
                onChange={(v) => set("distanceMaxKm", v)}
              />
            </div>
          </section>

          {/* Avanzados */}
          <section className="px-5 pt-5 pb-2">
            <p className="text-base font-bold text-gray-900 mb-0.5">Avanzados</p>
            <p className="text-xs text-gray-400 mb-4">Combina varios filtros para encontrar exactamente lo que buscas</p>

            {/* Solo en línea */}
            <div className="flex items-center justify-between py-3.5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Solo en línea</p>
                  <p className="text-xs text-gray-400">Activos en los últimos 15 min</p>
                </div>
              </div>
              <Toggle
                checked={draft.onlineOnly}
                onChange={() => set("onlineOnly", !draft.onlineOnly)}
              />
            </div>

            {/* Solo verificados */}
            <div className="flex items-center justify-between py-3.5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <BadgeCheck className="w-4 h-4 text-sky-500 flex-shrink-0" />
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-gray-900">Solo verificados</p>
                    {!isPaid && (
                      <span
                        className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold"
                        style={{ background: "#ede9fe", color: "#7c3aed" }}
                      >
                        <Lock className="w-2.5 h-2.5" />Plus
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">Perfiles con identidad verificada</p>
                </div>
              </div>
              <Toggle
                checked={isPaid && draft.verifiedOnly}
                onChange={() => {
                  if (!isPaid) { window.location.href = "/premium"; return; }
                  set("verifiedOnly", !draft.verifiedOnly);
                }}
              />
            </div>

            {/* Fallback internacional */}
            <div className="flex items-center justify-between py-3.5">
              <div className="flex items-center gap-3">
                <span className="text-base leading-none">🌍</span>
                <div>
                  <p className="text-sm font-medium text-gray-900">Internacional</p>
                  <p className="text-xs text-gray-400">Mostrar perfiles si no hay cerca</p>
                </div>
              </div>
              <Toggle
                checked={draft.internationalFallback}
                onChange={() => set("internationalFallback", !draft.internationalFallback)}
              />
            </div>
          </section>

          <div className="h-4" />
        </div>

        {/* Apply button */}
        <div
          className="flex-shrink-0 px-5 py-4"
          style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))", borderTop: "1px solid #f0f0f0" }}
        >
          <button
            type="button"
            onClick={applyAndClose}
            className="w-full py-3.5 rounded-2xl text-base font-bold text-white transition-opacity hover:opacity-90 active:opacity-80"
            style={{ background: "#111" }}
          >
            Aplicar
          </button>
        </div>
      </div>
    </>
  );
}
