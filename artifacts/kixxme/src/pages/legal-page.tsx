import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { KixxMeLogo } from "@/components/brand/kixxme-logo";
import { LEGAL_DOCS, LEGAL_LINKS } from "@/lib/legal-content";
import { LegalFooter } from "@/components/legal-footer";
import bgImage from "@/assets/bg-neon-bokeh.png";

export default function LegalPage({ slug }: { slug?: string }) {
  const doc = slug ? LEGAL_DOCS[slug] : undefined;

  return (
    <div className="min-h-[100dvh] flex flex-col relative bg-[#0a0715] selection:bg-[#d946ef]/30 selection:text-white">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <img src={bgImage} alt="" className="w-full h-full object-cover opacity-20 mix-blend-screen" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0715]/80 to-[#0a0715]" />
      </div>

      <header className="sticky top-0 z-20 backdrop-blur-xl border-b border-white/5 bg-[#0a0715]/70">
        <div className="mx-auto w-full max-w-3xl flex items-center gap-4 px-4 py-4">
          <button
            type="button"
            onClick={() => {
              if (window.history.length > 1) window.history.back();
              else window.location.href = import.meta.env.BASE_URL;
            }}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 text-white/80 hover:text-white transition-colors"
            aria-label="Volver"
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity" data-testid="link-home">
            <KixxMeLogo size={28} />
            <span className="font-display text-xl tracking-wide text-white">
              KIXXME
            </span>
          </Link>
        </div>
      </header>

      <main className="flex-1 relative z-10 mx-auto w-full max-w-3xl px-5 py-10 lg:py-16">
        {!doc ? (
          <div className="space-y-8">
            <header className="mb-10 border-b border-white/10 pb-8">
              <h1 className="text-4xl font-display tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[#d946ef] to-[#8b5cf6] mb-3">
                Información legal
              </h1>
              <p className="text-white/60 text-base">
                Todo lo que necesitas saber sobre KixxMe.
              </p>
            </header>
            <nav className="space-y-3">
              {LEGAL_LINKS.map((link) => (
                <Link
                  key={link.slug}
                  href={`/legal/${link.slug}`}
                  className="flex items-center justify-between w-full px-5 py-4 rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/20 transition-all group"
                  data-testid={`link-legal-${link.slug}`}
                >
                  <span className="font-sans text-base text-white/80 group-hover:text-white transition-colors">
                    {link.label}
                  </span>
                  <span className="text-white/30 group-hover:text-white/60 transition-colors text-lg">→</span>
                </Link>
              ))}
            </nav>
            <div className="pt-6 text-center">
              <p className="text-sm text-white/40">
                ¿Necesitas ayuda?{" "}
                <a href="mailto:supportkixxme@gmail.com" className="text-[#d946ef] hover:text-[#e879f9] transition-colors">
                  supportkixxme@gmail.com
                </a>
              </p>
            </div>
          </div>
        ) : (
          <article className="prose prose-invert prose-p:text-white/70 prose-headings:text-white prose-li:text-white/70 max-w-none">
            <header className="mb-12 border-b border-white/10 pb-8">
              <h1 className="text-4xl lg:text-5xl font-display tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[#d946ef] to-[#8b5cf6] mb-4" data-testid="heading-legal">
                {doc.title}
              </h1>
              <p className="text-sm text-white/40 uppercase tracking-widest font-semibold">
                Última actualización: {doc.updated}
              </p>
            </header>

            {doc.intro && (
              <p className="text-lg text-white/80 leading-relaxed font-medium mb-10">
                {doc.intro}
              </p>
            )}

            <div className="space-y-12">
              {doc.blocks.map((block, i) => (
                <section key={i} className="space-y-4">
                  {block.heading && (
                    <h2 className="text-2xl font-semibold text-white tracking-tight">
                      {block.heading}
                    </h2>
                  )}
                  {block.body.map((p, j) => (
                    <p key={j} className="text-[15px] leading-relaxed text-white/70">
                      {p}
                    </p>
                  ))}
                  {block.list && (
                    <ul className="space-y-3 mt-4">
                      {block.list.map((item, k) => (
                        <li key={k} className="flex gap-4 text-[15px] text-white/70 leading-relaxed">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#d946ef] shadow-[0_0_8px_rgba(217,70,239,0.8)]" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}
            </div>
          </article>
        )}

        <div className="mt-16 pt-8 border-t border-white/10">
          <LegalFooter />
        </div>
      </main>
    </div>
  );
}
