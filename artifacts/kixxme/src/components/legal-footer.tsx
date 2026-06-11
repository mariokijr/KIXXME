import { Link } from "wouter";
import { LEGAL_LINKS } from "@/lib/legal-content";

export function LegalFooter() {
  return (
    <footer className="w-full mt-10 pb-8 text-center px-4" data-testid="legal-footer">
      <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3 max-w-sm mx-auto">
        {LEGAL_LINKS.map((l) => (
          <Link
            key={l.slug}
            href={`/legal/${l.slug}`}
            className="text-[13px] font-medium text-white/50 hover:text-white transition-colors"
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
