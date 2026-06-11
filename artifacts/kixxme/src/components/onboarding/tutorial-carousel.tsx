import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Sparkles,
  Compass,
  Heart,
  MessageCircle,
  Mic,
  LifeBuoy,
  Video,
  Crown,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  Loader2,
} from "lucide-react";
import { KixxMeLogo } from "@/components/brand/kixxme-logo";
import { useAuth } from "@/lib/auth";
import { clearWelcomePending } from "@/components/welcome-modal";

type Slide = {
  icon: React.ComponentType<{ className?: string }>;
  eyebrow: string;
  title: string;
  body: string;
  from: string;
  to: string;
};

// 9 topics — the full tour of what KixxMe offers, in Spanish.
const SLIDES: Slide[] = [
  {
    icon: Sparkles,
    eyebrow: "Bienvenido",
    title: "Esto es KixxMe",
    body: "La comunidad gay en español para conocer gente cerca de ti, chatear y conectar de verdad. Te enseñamos lo esencial en un minuto.",
    from: "hsl(273,85%,55%)",
    to: "hsl(330,85%,52%)",
  },
  {
    icon: Compass,
    eyebrow: "Descubrir",
    title: "Encuentra a quien te interesa",
    body: "Desliza tarjetas estilo Tinder, explora la cuadrícula o ábrete al mapa con filtros por cercanía. Tú decides cómo descubrir.",
    from: "hsl(258,85%,58%)",
    to: "hsl(291,85%,55%)",
  },
  {
    icon: Heart,
    eyebrow: "Matches",
    title: "Likes, Super Likes y matches",
    body: "Da like o un Super Like para destacar. Cuando el interés es mutuo, ¡es un Match! y se abre el chat al instante.",
    from: "hsl(330,85%,55%)",
    to: "hsl(0,85%,60%)",
  },
  {
    icon: MessageCircle,
    eyebrow: "Chats",
    title: "Habla en tiempo real",
    body: "Mensajes al momento con confirmaciones de lectura y contadores de no leídos. Conversa sin esperas.",
    from: "hsl(213,90%,58%)",
    to: "hsl(273,85%,55%)",
  },
  {
    icon: Mic,
    eyebrow: "Multimedia",
    title: "Fotos y notas de voz",
    body: "Comparte fotos que se abren a pantalla completa y graba notas de voz con su duración. Exprésate como quieras.",
    from: "hsl(291,85%,55%)",
    to: "hsl(330,85%,52%)",
  },
  {
    icon: LifeBuoy,
    eyebrow: "Soporte",
    title: "Estamos para ayudarte",
    body: "¿Una duda o un problema? Escríbenos desde Soporte en español. Los usuarios Gold tienen chat de soporte prioritario.",
    from: "hsl(173,80%,45%)",
    to: "hsl(213,90%,55%)",
  },
  {
    icon: Video,
    eyebrow: "KixxMe Live",
    title: "Videollamadas en directo",
    body: "Con Gold, conecta cara a cara con videollamadas aleatorias. Revela, salta a la siguiente y conoce gente al instante.",
    from: "hsl(258,85%,58%)",
    to: "hsl(330,85%,52%)",
  },
  {
    icon: Crown,
    eyebrow: "Premium",
    title: "Ventajas Plus y Gold",
    body: "Más likes, ver quién visitó tu perfil, filtros avanzados, prioridad y mucho más. Sube de nivel cuando quieras.",
    from: "hsl(43,96%,56%)",
    to: "hsl(330,85%,52%)",
  },
  {
    icon: ShieldCheck,
    eyebrow: "Seguridad",
    title: "Tu seguridad y privacidad",
    body: "Bloquea y reporta a quien quieras, verifica tu perfil y disfruta de un espacio respetuoso. KixxMe es solo para mayores de 18 años.",
    from: "hsl(152,70%,45%)",
    to: "hsl(173,80%,45%)",
  },
];

const variants = {
  enter: (dir: number) => ({ x: dir > 0 ? 320 : -320, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -320 : 320, opacity: 0 }),
};

/**
 * Mandatory, swipeable, animated onboarding tour. There is no skip — the only way
 * forward is to reach the last slide and tap "Crear mi perfil", which fires
 * `onFinish` (the gate persists the tutorial flag and advances to the profile step).
 */
export function TutorialCarousel({
  onFinish,
  finishing = false,
}: {
  onFinish: () => void;
  finishing?: boolean;
}) {
  const { user } = useAuth();
  const [[index, dir], setPage] = useState<[number, number]>([0, 0]);

  // The tutorial has superseded the one-time welcome modal — clear its pending
  // flag so it never pops up later behind the user's back.
  useEffect(() => {
    if (user?.id) clearWelcomePending(user.id);
  }, [user?.id]);

  const isLast = index === SLIDES.length - 1;
  const slide = SLIDES[index];
  const Icon = slide.icon;

  const paginate = (newDir: number) => {
    const next = index + newDir;
    if (next < 0 || next >= SLIDES.length) return;
    setPage([next, newDir]);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse 90% 55% at 50% 0%, hsl(270 35% 10%) 0%, hsl(238 25% 4%) 65%)",
      }}
      data-testid="onboarding-tutorial"
    >
      {/* Ambient gradient glow that shifts per slide. */}
      <motion.div
        key={`glow-${index}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.5 }}
        className="pointer-events-none absolute -top-32 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: `radial-gradient(circle, ${slide.from}, transparent 70%)` }}
      />

      <header className="relative flex items-center justify-center pt-[calc(env(safe-area-inset-top)+20px)] pb-2">
        <KixxMeLogo size={30} badge />
      </header>

      {/* Slide content */}
      <div className="relative flex-1 flex items-center justify-center px-7">
        <AnimatePresence custom={dir} mode="wait">
          <motion.div
            key={index}
            custom={dir}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.7}
            onDragEnd={(_e, info) => {
              if (info.offset.x < -80) paginate(1);
              else if (info.offset.x > 80) paginate(-1);
            }}
            className="flex flex-col items-center text-center max-w-sm cursor-grab active:cursor-grabbing"
          >
            <motion.div
              initial={{ scale: 0.8, rotate: -6 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 18 }}
              className="mb-8 flex h-28 w-28 items-center justify-center rounded-[28px] shadow-2xl"
              style={{
                background: `linear-gradient(135deg, ${slide.from}, ${slide.to})`,
                boxShadow: `0 18px 60px -12px ${slide.from}`,
              }}
            >
              <Icon className="h-14 w-14 text-white" />
            </motion.div>

            <span
              className="mb-3 rounded-full px-3 py-1 font-display text-xs tracking-[0.25em] uppercase text-white/90"
              style={{ background: "rgba(255,255,255,0.08)" }}
            >
              {slide.eyebrow}
            </span>
            <h2 className="font-display text-4xl leading-tight tracking-wide text-white">
              {slide.title}
            </h2>
            <p className="mt-4 font-sans text-base leading-relaxed text-white/65">
              {slide.body}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Progress dots */}
      <div className="relative flex items-center justify-center gap-2 pb-6">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={() => setPage([i, i > index ? 1 : -1])}
            aria-label={`Ir a la diapositiva ${i + 1}`}
            className="h-2 rounded-full transition-all duration-300"
            style={{
              width: i === index ? 26 : 8,
              background:
                i === index
                  ? "linear-gradient(90deg, hsl(273,85%,60%), hsl(330,85%,55%))"
                  : "rgba(255,255,255,0.22)",
            }}
            data-testid={`tutorial-dot-${i}`}
          />
        ))}
      </div>

      {/* Controls */}
      <div className="relative flex items-center gap-3 px-7 pb-[calc(env(safe-area-inset-bottom)+24px)]">
        <button
          onClick={() => paginate(-1)}
          disabled={index === 0}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white transition disabled:opacity-30"
          style={{ background: "rgba(255,255,255,0.08)" }}
          aria-label="Anterior"
          data-testid="tutorial-prev"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        <button
          onClick={() => (isLast ? onFinish() : paginate(1))}
          disabled={finishing}
          className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl font-display text-lg tracking-widest text-white shadow-lg transition active:scale-[0.98] disabled:opacity-70"
          style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))" }}
          data-testid={isLast ? "tutorial-finish" : "tutorial-next"}
        >
          {finishing ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              {isLast ? "Crear mi perfil" : "Siguiente"}
              <ArrowRight className="h-5 w-5" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
