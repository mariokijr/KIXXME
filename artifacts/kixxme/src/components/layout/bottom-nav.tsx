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
      {/* Gradient glow line at top */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent 0%, rgba(168,85,247,0.7) 25%, rgba(236,72,153,0.6) 55%, rgba(139,92,246,0.5) 80%, transparent 100%)" }}
      />
      {/* Upward bloom */}
      <div
        className="absolute top-0 left-0 right-0 h-6 pointer-events-none"
        style={{ background: "linear-gradient(to top, transparent 0%, rgba(168,85,247,0.06) 100%)" }}
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
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-0.5 rounded-full"
                    style={{
                      background: "linear-gradient(90deg, hsl(273,85%,65%), hsl(330,85%,60%))",
                      boxShadow: "0 0 12px rgba(168,85,247,0.8), 0 0 24px rgba(168,85,247,0.4)",
                    }}
                  />
                  {/* glow bloom below the active bar */}
                  <span
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-4 pointer-events-none"
                    style={{
                      background: "radial-gradient(ellipse, rgba(168,85,247,0.30) 0%, transparent 70%)",
                      filter: "blur(4px)",
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
