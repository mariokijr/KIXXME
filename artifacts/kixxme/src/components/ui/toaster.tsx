import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  ToastAction,
} from "@/components/ui/toast"

// Extract the leading emoji (if any) from a string title.
// Returns [emoji, restOfTitle] — emoji is "" when there is none.
const EMOJI_RE = /^(\p{Emoji_Presentation}|\p{Extended_Pictographic})\s*/u;
function splitEmoji(title: string): [string, string] {
  const m = title.match(EMOJI_RE);
  return m ? [m[1], title.slice(m[0].length)] : ["", title];
}

// Map leading emoji to a background color for the icon bubble.
const ICON_COLOR: Record<string, string> = {
  "💬": "bg-blue-500/20 text-blue-300",
  "💞": "bg-pink-500/20 text-pink-300",
  "⭐": "bg-amber-500/20 text-amber-300",
  "💜": "bg-violet-500/20 text-violet-300",
  "🚩": "bg-red-500/20 text-red-400",
};
function iconColor(emoji: string): string {
  return ICON_COLOR[emoji] ?? "bg-white/10 text-white/70";
}

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        const titleStr = typeof title === "string" ? title : "";
        const [emoji, rest] = splitEmoji(titleStr);

        return (
          <Toast key={id} {...props}>
            {/* Icon bubble */}
            {emoji && (
              <div
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-base ${iconColor(emoji)}`}
              >
                {emoji}
              </div>
            )}

            {/* Content */}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 pr-6">
              {(emoji ? rest : titleStr) && (
                <ToastTitle>{emoji ? rest : title}</ToastTitle>
              )}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
              {action && <div className="mt-2">{action}</div>}
            </div>

            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
