import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

/**
 * Full-screen image viewer with tap-to-zoom (1x ↔ 2.5x) and drag-to-pan while
 * zoomed. Backdrop click, the close button and Escape all dismiss it.
 */
export function ImageLightbox({
  src,
  onClose,
}: {
  src: string | null;
  onClose: () => void;
}) {
  const [zoomed, setZoomed] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
    moved: boolean;
  }>({ active: false, startX: 0, startY: 0, baseX: 0, baseY: 0, moved: false });

  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [src, onClose]);

  // Reset zoom whenever a new image is opened.
  useEffect(() => {
    setZoomed(false);
    setOffset({ x: 0, y: 0 });
  }, [src]);

  if (!src) return null;

  const onPointerDown = (e: React.PointerEvent) => {
    if (!zoomed) return;
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      baseX: offset.x,
      baseY: offset.y,
      moved: false,
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d.active) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) d.moved = true;
    setOffset({ x: d.baseX + dx, y: d.baseY + dy });
  };
  const onPointerUp = () => {
    dragRef.current.active = false;
  };

  const onImageClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (dragRef.current.moved) return; // pan, not a tap
    if (zoomed) {
      setZoomed(false);
      setOffset({ x: 0, y: 0 });
    } else {
      setZoomed(true);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.92)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
      data-testid="image-lightbox"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 w-10 h-10 flex items-center justify-center rounded-full text-white"
        style={{ background: "rgba(255,255,255,0.12)" }}
        aria-label="Cerrar"
      >
        <X className="w-5 h-5" />
      </button>
      <img
        src={src}
        alt="Foto"
        onClick={onImageClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        draggable={false}
        className="max-h-[92vh] max-w-[94vw] object-contain select-none"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoomed ? 2.5 : 1})`,
          transition: dragRef.current.active ? "none" : "transform 0.2s ease",
          cursor: zoomed ? "grab" : "zoom-in",
          touchAction: "none",
        }}
      />
    </div>
  );
}
