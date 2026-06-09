import { Link } from "wouter";
import { Flame } from "lucide-react";

export default function NotFound() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6 text-center"
      style={{ background: "radial-gradient(ellipse 80% 60% at 50% 0%, hsl(270 40% 12%) 0%, hsl(238 25% 5%) 65%)" }}
    >
      <div className="space-y-6 max-w-sm">
        <Flame
          className="w-16 h-16 text-orange-400 mx-auto"
          style={{ filter: "drop-shadow(0 0 16px rgba(249,115,22,0.9))" }}
        />
        <h1 className="text-8xl font-display text-gradient-brand">404</h1>
        <p className="font-display text-2xl tracking-widest text-muted-foreground">
          Esta página no existe...
        </p>
        <p className="font-sans text-sm text-muted-foreground/70">
          Pero tú sí. Vuelve al mapa más caliente.
        </p>
        <Link href="/">
          <button
            className="px-8 py-3 rounded-xl font-display text-xl tracking-widest text-white hover:opacity-90 transition-opacity"
            style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))" }}
          >
            Volver al inicio
          </button>
        </Link>
      </div>
    </div>
  );
}
