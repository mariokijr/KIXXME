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

// IMPORTANT: never run a session-establishing auth call (signUp /
// signInWithPassword / refreshSession / setSession) on the `supabase` or
// `supabaseAuth` clients below. Those calls attach the resulting user session to
// the client instance, after which supabase-js sends that user's JWT as the
// Authorization header on EVERY subsequent `.from()` request — silently
// demoting a service-role client to that user's RLS context (reads collapse to
// the rows that user can see; writes throw "new row violates row-level security
// policy"). Because these clients are module-level singletons shared across all
// requests, a single login would poison the whole process. User auth that
// returns a session must go through `supabaseUserAuth` instead — that routing
// discipline is the real protection. The `persistSession:false` /
// `autoRefreshToken:false` options below only disable on-disk persistence and
// background refresh; they do NOT stop an in-memory session from being attached
// by a sign-in call, so never rely on the flags alone.
const noSessionAuth = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
} as const;

// Admin client — uses service role key, bypasses RLS. Used ONLY for data access
// and for admin auth operations that do NOT establish a session (admin.*,
// getUser). Safe to use server-side because this process already validates the
// user JWT via requireAuth() before touching any user data.
export const supabase = createClient(
  supabaseUrl,
  supabaseServiceRoleKey,
  noSessionAuth,
);

// Auth-only client — uses anon key solely for token verification (getUser).
export const supabaseAuth = createClient(
  supabaseUrl,
  supabaseAnonKey,
  noSessionAuth,
);

// Dedicated client for user-facing auth flows that RETURN a session
// (signUp / signInWithPassword / refreshSession). Kept separate from the data
// clients above so the in-memory session those calls attach can never leak into
// any `.from()` data query. We only read the session off the returned value, so
// even though these calls set state on this client, that state is never used.
export const supabaseUserAuth = createClient(
  supabaseUrl,
  supabaseAnonKey,
  noSessionAuth,
);
