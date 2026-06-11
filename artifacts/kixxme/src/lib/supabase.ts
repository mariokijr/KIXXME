import { createClient } from "@supabase/supabase-js";

declare const __SUPABASE_URL__: string;
declare const __SUPABASE_ANON_KEY__: string;

export const supabase = createClient(__SUPABASE_URL__, __SUPABASE_ANON_KEY__, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    // OAuth (Google/Apple) returns tokens in the URL hash so /auth/callback can
    // adopt them manually; with detectSessionInUrl:false the client won't touch them.
    flowType: "implicit",
  },
});

export function setRealtimeAuth(token: string | null) {
  supabase.realtime.setAuth(token ?? "");
}
