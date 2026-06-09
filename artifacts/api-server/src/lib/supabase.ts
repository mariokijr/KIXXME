import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables");
}

if (!supabaseServiceRoleKey) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable");
}

// Admin client — uses service role key, bypasses RLS.
// Safe to use server-side because this process already validates the user JWT
// via requireAuth() before touching any user data.
export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// Auth-only client — uses anon key solely for token verification.
export const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
