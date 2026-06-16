import { Link, useLocation } from "wouter";
import { Sparkles, Globe, MessageCircle, User, Settings, Video } from "lucide-react";
import { useNotifications } from "@/lib/notifications";

const tabs = [
  { href: "/discover", Icon: Sparkles, label: "Descubrir" },
  { href: "/map", Icon: Globe, label: "Mapa" },
  { href: "/live", Icon: Video, label: "Live" },
  { href: "/chats", Icon: MessageCircle, label: "Chats" },
  { href: "/profile", Icon: User, label: "Perfil" },
  { href: "/settings", Icon: Settings, label: "Ajustes" },
];

export default function BottomNav() {
  const [location] = useLocation();
  const { totalUnread } = useNotifications();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50"
      style={{
        background: "rgba(6,5,15,0.97)",
        backdropFilter: "blur(28px)",
        paddingBottom: "env(safe-area-inset-bottom)",
        boxShadow: "0 -1px 0 rgba(168,85,247,0.0), 0 -12px 48px rgba(0,0,0,0.7)",
        borderTop: "1px solid rgba(168,85,247,0.08)",
      }}
    >
      {/* Gradient glow line at top — two-layer for more depth */}
      <div
        className="absolute top-0 left-0 right-0 h-[1.5px]"
        style={{ background: "linear-gradient(90deg, transparent 0%, rgba(168,85,247,1.0) 18%, rgba(236,72,153,0.95) 50%, rgba(168,85,247,0.90) 78%, transparent 100%)", boxShadow: "0 0 16px 2px rgba(168,85,247,0.55), 0 0 6px 1px rgba(236,72,153,0.35)" }}
      />
      {/* Upward bloom — taller and warmer */}
      <div
        className="absolute top-0 left-0 right-0 h-14 pointer-events-none"
        style={{ background: "linear-gradient(to top, transparent 0%, rgba(168,85,247,0.16) 65%, rgba(168,85,247,0.22) 100%)" }}
      />
      <div className="flex justify-around items-center h-16 max-w-xl mx-auto px-2">
        {tabs.map(({ href, Icon, label }) => {
          const active = location === href;
          const showBadge = href === "/chats" && totalUnread > 0;
          return (
            <Link
              key={href}
              href={href}
              className="relative flex flex-col items-center justify-center gap-1 flex-1 py-2 group"
            >
              {active && (
                <>
                  <span
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-14 h-[2px] rounded-full"
                    style={{
                      background: "linear-gradient(90deg, hsl(290,90%,74%), hsl(273,85%,70%), hsl(330,90%,68%))",
                      boxShadow: "0 0 22px rgba(168,85,247,1.0), 0 0 48px rgba(168,85,247,0.70), 0 0 10px rgba(236,72,153,0.65)",
                    }}
                  />
                  {/* glow bloom below the active bar — wider + brighter */}
                  <span
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-6 pointer-events-none"
                    style={{
                      background: "radial-gradient(ellipse, rgba(168,85,247,0.42) 0%, rgba(236,72,153,0.18) 45%, transparent 75%)",
                      filter: "blur(5px)",
                    }}
                  />
                </>
              )}
              {showBadge && (
                <span
                  className="absolute top-1 left-1/2 ml-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full text-[10px] font-bold text-white border border-background"
                  style={{ background: "linear-gradient(135deg, hsl(273,85%,55%), hsl(330,85%,52%))" }}
                  data-testid="badge-unread"
                >
                  {totalUnread > 99 ? "99+" : totalUnread}
                </span>
              )}
              <Icon
                className="w-5 h-5 transition-all duration-200"
                style={{
                  color: active ? "hsl(273,85%,72%)" : "hsl(240,10%,50%)",
                  filter: active ? "drop-shadow(0 0 8px rgba(168,85,247,0.55))" : undefined,
                }}
              />
              <span
                className="text-[10px] font-sans font-medium transition-all duration-200 leading-none"
                style={{
                  color: active ? "hsl(273,85%,72%)" : "hsl(240,10%,45%)",
                }}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
