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
  /** Accent colour used for subtle text highlight */
  accent: string;
};

const SLIDES: Slide[] = [
  {
    icon: Sparkles,
    eyebrow: "Bienvenido",
    title: "Esto es KixxMe",
    body: "La comunidad gay en español para conocer gente cerca de ti, chatear y conectar de verdad. Te enseñamos lo esencial en un minuto.",
    from: "hsl(273,85%,55%)",
    to: "hsl(330,85%,52%)",
    accent: "hsl(273,85%,72%)",
  },
  {
    icon: Compass,
    eyebrow: "Descubrir",
    title: "Encuentra a quien te interesa",
    body: "Desliza tarjetas estilo Tinder, explora la cuadrícula o ábrete al mapa con filtros por cercanía. Tú decides cómo descubrir.",
    from: "hsl(258,85%,58%)",
    to: "hsl(291,85%,55%)",
    accent: "hsl(258,85%,78%)",
  },
  {
    icon: Heart,
    eyebrow: "Matches",
    title: "Likes, Super Likes y matches",
    body: "Da like o un Super Like para destacar. Cuando el interés es mutuo, ¡es un Match! y se abre el chat al instante.",
    from: "hsl(330,85%,55%)",
    to: "hsl(0,85%,60%)",
    accent: "hsl(330,85%,72%)",
  },
  {
    icon: MessageCircle,
    eyebrow: "Chats",
    title: "Habla en tiempo real",
    body: "Mensajes al momento con confirmaciones de lectura y contadores de no leídos. Conversa sin esperas.",
    from: "hsl(213,90%,58%)",
    to: "hsl(273,85%,55%)",
    accent: "hsl(213,90%,75%)",
  },
  {
    icon: Mic,
    eyebrow: "Multimedia",
    title: "Fotos y notas de voz",
    body: "Comparte fotos que se abren a pantalla completa y graba notas de voz con su duración. Exprésate como quieras.",
    from: "hsl(291,85%,55%)",
    to: "hsl(330,85%,52%)",
    accent: "hsl(291,85%,74%)",
  },
  {
    icon: LifeBuoy,
    eyebrow: "Soporte",
    title: "Estamos para ayudarte",
    body: "¿Una duda o un problema? Escríbenos desde Soporte en español. Los usuarios Gold tienen chat de soporte prioritario.",
    from: "hsl(173,80%,45%)",
    to: "hsl(213,90%,55%)",
    accent: "hsl(173,80%,64%)",
  },
  {
    icon: Video,
    eyebrow: "KixxMe Live",
    title: "Videollamadas en directo",
    body: "Con Gold, conecta cara a cara con videollamadas aleatorias. Revela, salta a la siguiente y conoce gente al instante.",
    from: "hsl(258,85%,58%)",
    to: "hsl(330,85%,52%)",
    accent: "hsl(258,85%,78%)",
  },
  {
    icon: Crown,
    eyebrow: "Premium",
    title: "Ventajas Plus y Gold",
    body: "Más likes, ver quién visitó tu perfil, filtros avanzados, prioridad en el mapa y mucho más. Sube de nivel cuando quieras.",
    from: "hsl(43,96%,56%)",
    to: "hsl(330,85%,52%)",
    accent: "hsl(43,96%,72%)",
  },
  {
    icon: ShieldCheck,
    eyebrow: "Seguridad",
    title: "Tu seguridad, primero",
    body: "Bloquea y reporta a quien quieras, verifica tu perfil con foto y disfruta de un espacio respetuoso. Solo para mayores de 18.",
    from: "hsl(152,70%,45%)",
    to: "hsl(173,80%,45%)",
    accent: "hsl(152,70%,64%)",
  },
];

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? "100%" : "-100%", opacity: 0, scale: 0.94 }),
  center: { x: 0, opacity: 1, scale: 1 },
  exit:   (dir: number) => ({ x: dir > 0 ? "-100%" : "100%", opacity: 0, scale: 0.94 }),
};

/**
 * Mandatory, swipeable, animated onboarding tour. No skip — the only exit is
 * the last slide's "Crear mi perfil" button, which fires `onFinish`.
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
      className="fixed inset-0 z-50 flex flex-col overflow-hidden select-none"
      style={{
        background:
          "radial-gradient(ellipse 90% 55% at 50% 0%, hsl(270 35% 10%) 0%, hsl(238 25% 4%) 65%)",
      }}
      data-testid="onboarding-tutorial"
    >
      {/* ── Large background glow ── */}
      <motion.div
        key={`glow-${index}`}
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 0.55, scale: 1 }}
        transition={{ duration: 0.6 }}
        className="pointer-events-none absolute -top-40 left-1/2 h-[560px] w-[560px] -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: `radial-gradient(circle, ${slide.from}, transparent 65%)` }}
      />
      {/* Secondary smaller glow — opposite colour, bottom */}
      <motion.div
        key={`glow2-${index}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.2 }}
        transition={{ duration: 0.8, delay: 0.15 }}
        className="pointer-events-none absolute -bottom-20 right-0 h-[300px] w-[300px] rounded-full blur-3xl"
        style={{ background: `radial-gradient(circle, ${slide.to}, transparent 70%)` }}
      />

      {/* ── Header: logo + counter ── */}
      <header className="relative flex items-center justify-between px-6 pt-[calc(env(safe-area-inset-top)+18px)] pb-2">
        <KixxMeLogo size={28} badge />
        <span
          className="font-display text-sm tracking-widest"
          style={{ color: slide.accent }}
        >
          {index + 1} / {SLIDES.length}
        </span>
      </header>

      {/* ── Slide content ── */}
      <div className="relative flex-1 flex items-center justify-center px-7 overflow-hidden">
        <AnimatePresence custom={dir} mode="wait">
          <motion.div
            key={index}
            custom={dir}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.6}
            onDragEnd={(_e, info) => {
              if (info.offset.x < -80) paginate(1);
              else if (info.offset.x > 80) paginate(-1);
            }}
            className="flex flex-col items-center text-center max-w-xs cursor-grab active:cursor-grabbing"
          >
            {/* Icon container — bounces in */}
            <motion.div
              initial={{ scale: 0.6, rotate: -10, y: 20 }}
              animate={{ scale: 1, rotate: 0, y: 0 }}
              transition={{ type: "spring", stiffness: 220, damping: 16 }}
              className="relative mb-8 flex items-center justify-center"
            >
              {/* Outer ring pulse */}
              <motion.div
                animate={{ scale: [1, 1.12, 1], opacity: [0.35, 0.1, 0.35] }}
                transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
                className="absolute rounded-[36px]"
                style={{
                  inset: -12,
                  background: `linear-gradient(135deg, ${slide.from}, ${slide.to})`,
                  filter: "blur(8px)",
                }}
              />
              <div
                className="relative h-28 w-28 flex items-center justify-center rounded-[28px] shadow-2xl"
                style={{
                  background: `linear-gradient(145deg, ${slide.from}, ${slide.to})`,
                  boxShadow: `0 22px 70px -14px ${slide.from}aa`,
                }}
              >
                <Icon className="h-14 w-14 text-white drop-shadow-lg" />
              </div>
            </motion.div>

            {/* Eyebrow */}
            <motion.span
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mb-3 rounded-full px-4 py-1 font-display text-xs tracking-[0.25em] uppercase"
              style={{
                background: "rgba(255,255,255,0.08)",
                color: slide.accent,
                border: `1px solid ${slide.accent}33`,
              }}
            >
              {slide.eyebrow}
            </motion.span>

            {/* Title */}
            <motion.h2
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.14 }}
              className="font-display text-[2.1rem] leading-[1.15] tracking-wide text-white"
            >
              {slide.title}
            </motion.h2>

            {/* Body */}
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mt-4 font-sans text-[0.95rem] leading-relaxed text-white/60"
            >
              {slide.body}
            </motion.p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Progress dots ── */}
      <div className="relative flex items-center justify-center gap-2 pb-5">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={() => setPage([i, i > index ? 1 : -1])}
            aria-label={`Ir a la diapositiva ${i + 1}`}
            className="h-1.5 rounded-full transition-all duration-350"
            style={{
              width: i === index ? 28 : 7,
              background:
                i === index
                  ? `linear-gradient(90deg, ${slide.from}, ${slide.to})`
                  : i < index
                  ? "rgba(255,255,255,0.45)"
                  : "rgba(255,255,255,0.15)",
            }}
            data-testid={`tutorial-dot-${i}`}
          />
        ))}
      </div>

      {/* ── Navigation controls ── */}
      <div className="relative flex items-center gap-3 px-6 pb-[calc(env(safe-area-inset-bottom)+22px)]">
        <button
          onClick={() => paginate(-1)}
          disabled={index === 0}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white transition disabled:opacity-0 disabled:pointer-events-none"
          style={{ background: "rgba(255,255,255,0.08)" }}
          aria-label="Anterior"
          data-testid="tutorial-prev"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => (isLast ? onFinish() : paginate(1))}
          disabled={finishing}
          className="flex h-14 flex-1 items-center justify-center gap-2.5 rounded-2xl font-display text-lg tracking-widest text-white shadow-lg disabled:opacity-70"
          style={{
            background: `linear-gradient(135deg, ${slide.from}, ${slide.to})`,
            boxShadow: `0 8px 32px -8px ${slide.from}99`,
          }}
          data-testid={isLast ? "tutorial-finish" : "tutorial-next"}
        >
          {finishing ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <span>{isLast ? "Crear mi perfil" : "Siguiente"}</span>
              <ArrowRight className="h-5 w-5" />
            </>
          )}
        </motion.button>
      </div>
    </div>
  );
}
