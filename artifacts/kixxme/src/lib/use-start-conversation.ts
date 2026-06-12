import { useLocation } from "wouter";
import { useCreateOrGetConversation } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useGoldUpsell } from "@/lib/gold-upsell";

/**
 * Centralizes "open a chat with this user" across discover, En línea, favorites,
 * matches, public profile and the map. Creating a conversation is gated server-
 * side: an existing conversation always opens; otherwise a match OR Gold is
 * required. A 403 with code `gold_required_no_match` surfaces the on-brand Gold
 * upsell modal instead of a generic error toast.
 */
export function useStartConversation() {
  const createConv = useCreateOrGetConversation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { showGold } = useGoldUpsell();

  const start = (userId: string) => {
    createConv.mutate(
      { data: { other_user_id: userId } },
      {
        onSuccess: (conv) => setLocation(`/chats/${conv.id}`),
        onError: (err: any) => {
          if (
            err?.status === 403 &&
            err?.data?.code === "gold_required_no_match"
          ) {
            showGold({
              title: "Inicia el chat con Gold",
              subtitle:
                "Para escribir a alguien sin un match mutuo necesitas Gold. ¡Hazte Gold y conecta sin esperar!",
            });
          } else {
            toast({
              title: "No se pudo abrir el chat",
              variant: "destructive",
            });
          }
        },
      },
    );
  };

  return { start, isPending: createConv.isPending };
}
