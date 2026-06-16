import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { X, Shield, FileText, Cookie, Users, Mail, Info } from "lucide-react";

const LINKS = [
  { slug: "privacidad",      label: "Política de privacidad",   Icon: Shield  },
  { slug: "terminos",        label: "Términos y condiciones",    Icon: FileText },
  { slug: "cookies",         label: "Política de cookies",       Icon: Cookie  },
  { slug: "normas-comunidad",label: "Normas de la comunidad",    Icon: Users   },
  { slug: "contacto",        label: "Contacto",                  Icon: Mail    },
  { slug: "aviso-legal",     label: "Información legal",         Icon: Info    },
];

interface LegalSidebarProps {
  open: boolean;
  onClose: () => void;
}

export function LegalSidebar({ open, onClose }: LegalSidebarProps) {
  const [, setLocation] = useLocation();

  const go = (slug: string) => {
    onClose();
    setTimeout(() => setLocation(`/legal/${slug}`), 120);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[200]"
            style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
            onClick={onClose}
          />

          <motion.aside
            key="drawer"
            initial={{ x: -290 }}
            animate={{ x: 0 }}
            exit={{ x: -290 }}
            transition={{ type: "spring", stiffness: 340, damping: 32 }}
            className="fixed top-0 left-0 bottom-0 z-[201] flex flex-col"
            style={{
              width: 278,
              background: "linear-gradient(170deg, #100d26 0%, #0b0820 50%, #09061a 100%)",
              borderRight: "1px solid rgba(168,85,247,0.18)",
              boxShadow: "6px 0 48px rgba(0,0,0,0.7), 1px 0 0 rgba(168,85,247,0.10)",
            }}
          >
            <div
              className="flex items-center justify-between px-5 py-5"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))" }}
                >
                  <Shield className="w-4 h-4 text-white" />
                </div>
                <span className="font-display text-xl tracking-wide text-white">Legal</span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                style={{ background: "rgba(255,255,255,0.05)" }}
              >
                <X className="w-4 h-4 text-white/60" />
              </button>
            </div>

            <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
              {LINKS.map(({ slug, label, Icon }) => (
                <button
                  key={slug}
                  type="button"
                  onClick={() => go(slug)}
                  className="w-full flex items-center gap-3.5 px-3.5 py-3.5 rounded-xl text-left transition-all group"
                  style={{ background: "transparent" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors"
                    style={{ background: "rgba(168,85,247,0.12)", border: "1px solid rgba(168,85,247,0.18)" }}
                  >
                    <Icon className="w-3.5 h-3.5 text-purple-400" />
                  </div>
                  <span className="font-sans text-[14px] text-white/70 leading-tight group-hover:text-white transition-colors">
                    {label}
                  </span>
                  <span className="ml-auto text-white/20 text-sm">›</span>
                </button>
              ))}
            </nav>

            <div
              className="px-5 py-4"
              style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
            >
              <p className="text-[11px] text-white/22 text-center">
                KixxMe · Todos los derechos reservados
              </p>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
