import { supabase } from "./supabase.js";

/**
 * Idempotently ensure a conversation exists between two users, returning
 * nothing (the row is fetched by the normal conversation routes afterwards).
 *
 * Used to AUTO-create a conversation the moment two users match, so a mutual
 * like immediately surfaces a thread in Mensajes for both of them.
 *
 * Robust WITHOUT relying on a Supabase unique constraint (the Supabase schema
 * is not modifiable from this repo): we sort the ids for a canonical pair, look
 * for an existing row first, and — if the insert still fails (e.g. a race) —
 * re-select to confirm a row now exists rather than surfacing the error. Callers
 * treat this as best-effort (fire-and-forget with a try/catch), so a match is
 * never blocked by a conversation-creation hiccup.
 */
export async function ensureConversation(
  a: string,
  b: string,
): Promise<void> {
  const [u1, u2] = [a, b].sort();

  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("user1_id", u1)
    .eq("user2_id", u2)
    .maybeSingle();
  if (existing) return;

  const { error } = await supabase
    .from("conversations")
    .insert({ user1_id: u1, user2_id: u2 })
    .select("id")
    .single();
  if (!error) return;

  // Insert failed — most likely a concurrent create won the race. Re-select to
  // confirm a row now exists; only surface the error if it genuinely doesn't.
  const { data: after } = await supabase
    .from("conversations")
    .select("id")
    .eq("user1_id", u1)
    .eq("user2_id", u2)
    .maybeSingle();
  if (!after) {
    throw new Error(`ensureConversation failed: ${error.message}`);
  }
}
