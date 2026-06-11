import React from "react";
import { Camera, Plus, Trash2, Star, Loader2 } from "lucide-react";
import type { ProfilePhoto } from "@workspace/api-client-react";

// A single photo slot used by both "Mi perfil" and the mandatory onboarding
// profile step. Empty slots invite an upload; filled slots expose per-photo
// actions (set main / replace / delete).
export function PhotoSlot({
  photo,
  isMain,
  uploading,
  replacing,
  isDeleting,
  isSettingAvatar,
  onAdd,
  onReplace,
  onDelete,
  onSetAvatar,
}: {
  photo: ProfilePhoto | null;
  isMain: boolean;
  uploading: boolean;
  replacing: boolean;
  isDeleting: boolean;
  isSettingAvatar: boolean;
  onAdd: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onReplace: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDelete: () => void;
  onSetAvatar: () => void;
}) {
  // Empty slot — invite the user to add a photo here.
  if (!photo) {
    return (
      <label
        className="relative rounded-xl overflow-hidden border-2 border-dashed border-border/40 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-colors"
        style={{ aspectRatio: "1", background: "rgba(13,11,26,0.6)" }}
        data-testid={isMain ? "slot-add-main" : "slot-add-photo"}
      >
        {uploading ? (
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        ) : (
          <>
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center mb-1.5"
              style={{ background: "rgba(168,85,247,0.12)" }}
            >
              <Plus className="w-5 h-5 text-primary" />
            </div>
            <span className="font-sans text-[11px] text-muted-foreground text-center px-2">
              {isMain ? "Añadir foto principal" : "Añadir foto"}
            </span>
          </>
        )}
        <input type="file" className="hidden" accept="image/*" onChange={onAdd} disabled={uploading} />
      </label>
    );
  }

  // Filled slot — show the photo plus per-photo actions.
  const busy = replacing || isDeleting || isSettingAvatar;
  return (
    <div
      className="relative rounded-xl overflow-hidden border border-border/30"
      style={{ aspectRatio: "1" }}
      data-testid={isMain ? "photo-slot-main" : "photo-slot-extra"}
    >
      <img src={photo.url} alt="" className="w-full h-full object-cover" />

      {photo.is_avatar && (
        <div
          className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-sans font-medium text-white"
          style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))" }}
        >
          <Star className="w-2.5 h-2.5" fill="white" />
          Principal
        </div>
      )}

      {busy && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/70">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      )}

      <div
        className="absolute inset-x-0 bottom-0 p-2 flex items-center justify-center gap-2"
        style={{ background: "linear-gradient(to top, rgba(8,7,18,0.92), transparent)" }}
      >
        {!photo.is_avatar && (
          <button
            onClick={onSetAvatar}
            disabled={isSettingAvatar}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-white disabled:opacity-50"
            style={{ background: "rgba(168,85,247,0.85)" }}
            title="Elegir como principal"
            data-testid="button-set-main"
          >
            <Star className="w-4 h-4" />
          </button>
        )}
        <label
          className="w-8 h-8 flex items-center justify-center rounded-lg text-white cursor-pointer"
          style={{ background: "rgba(255,255,255,0.16)" }}
          title="Cambiar foto"
          data-testid="button-replace-photo"
        >
          <Camera className="w-4 h-4" />
          <input type="file" className="hidden" accept="image/*" onChange={onReplace} disabled={replacing} />
        </label>
        <button
          onClick={onDelete}
          disabled={isDeleting}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-white disabled:opacity-50"
          style={{ background: "rgba(239,68,68,0.85)" }}
          title="Eliminar foto"
          data-testid="button-delete-photo"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
