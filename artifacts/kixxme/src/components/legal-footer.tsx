import { Link } from "wouter";
import { LEGAL_LINKS } from "@/lib/legal-content";

export function LegalFooter() {
  const primary = LEGAL_LINKS.filter(
    (l) => l.slug === "privacidad" || l.slug === "terminos",
  );
  const secondary = LEGAL_LINKS.filter(
    (l) => l.slug !== "privacidad" && l.slug !== "terminos",
  );

  return (
    <footer className="w-full mt-10 pb-8 text-center px-4" data-testid="legal-footer">
      {/* Primary links — privacy + terms prominent */}
      <nav className="flex flex-wrap items-center justify-center gap-3 mb-4">
        {primary.map((l) => (
          <Link
            key={l.slug}
            href={l.path ?? `/legal/${l.slug}`}
            className="text-[13px] font-semibold text-white/70 hover:text-white underline underline-offset-2 decoration-white/20 hover:decoration-white transition-colors"
            data-testid={`link-legal-${l.slug}`}
          >
            {l.label}
          </Link>
        ))}
      </nav>

      {/* Secondary links */}
      <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 max-w-sm mx-auto">
        {secondary.map((l) => (
          <Link
            key={l.slug}
            href={l.path ?? `/legal/${l.slug}`}
            className="text-[12px] font-medium text-white/40 hover:text-white/70 transition-colors"
            data-testid={`link-legal-${l.slug}`}
          >
            {l.label}
          </Link>
        ))}
      </nav>

      <div className="mt-8 pt-6 border-t border-white/10 max-w-sm mx-auto">
        <p className="text-[11px] text-white/40 leading-relaxed max-w-[280px] mx-auto">
          KixxMe es exclusivo para mayores de 18 años. Al continuar confirmas que tienes
          al menos 18 años y aceptas nuestros Términos y Política de privacidad.
        </p>
      </div>
    </footer>
  );
}
