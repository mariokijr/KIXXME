import { Link, useLocation } from "wouter";
import { Sparkles, Globe, MessageCircle, User, Star, Video } from "lucide-react";
import { useNotifications } from "@/lib/notifications";

const tabs = [
  { href: "/discover", Icon: Sparkles, label: "Descubrir" },
  { href: "/map", Icon: Globe, label: "Mapa" },
  { href: "/live", Icon: Video, label: "Live" },
  { href: "/chats", Icon: MessageCircle, label: "Chats" },
  { href: "/profile", Icon: User, label: "Perfil" },
  { href: "/premium", Icon: Star, label: "Premium" },
];

export default function BottomNav() {
  const [location] = useLocation();
  const { totalUnread } = useNotifications();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/30"
      style={{
        background: "rgba(8,7,18,0.97)",
        backdropFilter: "blur(24px)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="flex justify-around items-center h-16 max-w-xl mx-auto px-2">
        {tabs.map(({ href, Icon, label }) => {
          const active = location === href;
          const isPremium = href === "/premium";
          const showBadge = href === "/chats" && totalUnread > 0;
          return (
            <Link
              key={href}
              href={href}
              className="relative flex flex-col items-center justify-center gap-1 flex-1 py-2 group"
            >
              {active && (
                <span
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full"
                  style={{
                    background: isPremium
                      ? "linear-gradient(90deg, hsl(38,95%,55%), hsl(25,100%,55%))"
                      : "linear-gradient(90deg, hsl(273,85%,65%), hsl(330,85%,60%))",
                  }}
                />
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
                  color: active
                    ? isPremium
                      ? "hsl(38,95%,58%)"
                      : "hsl(273,85%,70%)"
                    : "hsl(240,10%,50%)",
                  filter: active && !isPremium ? "drop-shadow(0 0 6px rgba(168,85,247,0.6))" : undefined,
                }}
              />
              <span
                className="text-[10px] font-sans font-medium transition-all duration-200 leading-none"
                style={{
                  color: active
                    ? isPremium
                      ? "hsl(38,95%,58%)"
                      : "hsl(273,85%,70%)"
                    : "hsl(240,10%,45%)",
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
