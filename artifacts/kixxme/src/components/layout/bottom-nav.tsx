import { Link, useLocation } from "wouter";
import { Flame, Globe, MessageCircle, User, Star } from "lucide-react";

const tabs = [
  { href: "/discover", Icon: Flame, label: "Descubrir" },
  { href: "/map", Icon: Globe, label: "Mapa" },
  { href: "/chats", Icon: MessageCircle, label: "Chats" },
  { href: "/profile", Icon: User, label: "Perfil" },
  { href: "/premium", Icon: Star, label: "Premium" },
];

export default function BottomNav() {
  const [location] = useLocation();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/30"
      style={{ background: "rgba(8,7,18,0.97)", backdropFilter: "blur(24px)" }}
    >
      <div className="flex justify-around items-center h-16 max-w-xl mx-auto px-2">
        {tabs.map(({ href, Icon, label }) => {
          const active = location === href;
          const isPremium = href === "/premium";
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
