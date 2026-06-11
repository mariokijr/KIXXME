import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";

type ConfirmTone = "default" | "danger";

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Imperative confirm() for destructive/irreversible-feeling actions (blocking a
 * user, etc.). Mount <ConfirmProvider> once near the app root; call
 * `const confirm = useConfirm()` then `if (await confirm({...})) doIt()`.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions>({ title: "" });
  const resolverRef = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((o) => {
    setOpts(o);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = useCallback((v: boolean) => {
    setOpen(false);
    const resolve = resolverRef.current;
    resolverRef.current = null;
    resolve?.(v);
  }, []);

  const danger = opts.tone === "danger";

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) settle(false);
        }}
      >
        <DialogContent className="max-w-sm border-border/50" data-testid="dialog-confirm">
          <DialogHeader>
            <div className="flex items-center gap-2">
              {danger && <AlertTriangle className="w-5 h-5 text-red-400" />}
              <DialogTitle className="font-display text-xl tracking-wide">
                {opts.title}
              </DialogTitle>
            </div>
            {opts.description && (
              <DialogDescription className="font-sans text-sm text-muted-foreground pt-1">
                {opts.description}
              </DialogDescription>
            )}
          </DialogHeader>

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <button
              type="button"
              onClick={() => settle(true)}
              data-testid="button-confirm-accept"
              className="w-full h-12 rounded-xl flex items-center justify-center gap-2 font-display text-lg tracking-widest text-white transition-opacity hover:opacity-90"
              style={{
                background: danger
                  ? "linear-gradient(135deg, hsl(0,75%,50%), hsl(20,85%,50%))"
                  : "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))",
              }}
            >
              {opts.confirmLabel ?? "Confirmar"}
            </button>
            <button
              type="button"
              onClick={() => settle(false)}
              data-testid="button-confirm-cancel"
              className="w-full h-10 rounded-xl border border-border/40 font-sans text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {opts.cancelLabel ?? "Cancelar"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within a ConfirmProvider");
  }
  return ctx;
}
