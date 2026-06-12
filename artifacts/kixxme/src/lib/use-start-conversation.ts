import { useLocation } from "wouter";
import { useCreateOrGetConversation } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useGoldUpsell } from "@/lib/gold-upsell";

/**
 * Centralizes "open a chat with this user" across discover, En línea, favorites,
 * matches, public profile and the map. Creating a conversation is gated server-
 * side: an existing conversation always opens; otherwise a match OR a paid plan
 * (Plus or Gold) is required. A 403 with code `premium_required_no_match`
 * surfaces the on-brand premium upsell modal instead of a generic error toast.
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
            err?.data?.code === "premium_required_no_match"
          ) {
            showGold({
              title: "Chatea sin esperar",
              subtitle:
                "Para escribir a alguien sin un match mutuo necesitas KixxMe Plus o Gold. ¡Mejora tu plan y conecta al instante!",
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
