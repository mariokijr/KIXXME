import React from "react";
import { Link } from "wouter";
import { MessageCircle, Search, Edit2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Chats() {
  return (
    <div className="flex flex-col h-full">
      <header
        className="sticky top-0 z-20 px-4 py-3 flex items-center justify-between border-b border-border/30"
        style={{ background: "rgba(8,7,18,0.9)", backdropFilter: "blur(20px)" }}
      >
        <h1 className="font-display text-2xl tracking-wide">Mensajes</h1>
        <button
          className="w-9 h-9 flex items-center justify-center rounded-xl border border-border/40 text-muted-foreground hover:text-foreground transition-colors"
          style={{ background: "rgba(255,255,255,0.04)" }}
        >
          <Edit2 className="w-4 h-4" />
        </button>
      </header>

      <div className="px-4 pt-3 pb-2">
        <div
          className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border/40"
          style={{ background: "rgba(255,255,255,0.04)" }}
        >
          <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span className="font-sans text-sm text-muted-foreground">Buscar conversaciones...</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-6 py-16">
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center border border-primary/20"
          style={{ background: "rgba(168,85,247,0.08)" }}
        >
          <MessageCircle
            className="w-10 h-10 text-primary"
            style={{ filter: "drop-shadow(0 0 10px rgba(168,85,247,0.5))" }}
          />
        </div>

        <div className="space-y-2">
          <h2 className="font-display text-2xl tracking-wide text-foreground">
            Nadie te ha escrito... todavía
          </h2>
          <p className="font-sans text-sm text-muted-foreground leading-relaxed">
            Explora perfiles, conecta con alguien y déjate llevar.
          </p>
        </div>

        <Link href="/discover">
          <Button
            className="h-12 px-8 rounded-xl font-display text-lg tracking-widest border-0 text-white hover:opacity-90 transition-opacity"
            style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))" }}
          >
            Ir a Descubrir
          </Button>
        </Link>

        <div
          className="w-full p-4 rounded-xl border border-yellow-500/20 flex items-start gap-3 text-left mt-2"
          style={{ background: "rgba(234,179,8,0.06)" }}
        >
          <Lock className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-display text-sm text-yellow-400 tracking-wide">
              Chats ilimitados con Premium
            </p>
            <p className="font-sans text-xs text-muted-foreground mt-0.5">
              Con KixxMe Plus o Gold puedes enviar mensajes a quien quieras sin límites.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
