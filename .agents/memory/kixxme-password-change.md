---
name: KixxMe password change & Supabase session revocation
description: Two-step OTP-verified "Cambiar contraseña" flow + the non-obvious Supabase quirk that changing a password does not revoke other sessions.
---

# Cambiar contraseña (Perfil/Ajustes → Seguridad)

Two-step, email-verified password change for Supabase email/password accounts. It
reuses the shared account-OTP lifecycle (`account_action_codes`) with a new
free-text action `change_password` (no DB migration needed) and a 10-min TTL.

## Durable decisions
- **New password is NEVER stored server-side.** The client holds it in memory
  between the two screens and re-sends it at the confirm step; the server only
  validates + applies it then.
  **Why:** avoids persisting a plaintext/recoverable credential anywhere.
- **Current password is NOT re-checked at confirm.** Proof of intent at confirm =
  a valid session + the single-use, expiring code emailed to the account. The
  current password is verified only at the *request* step (to issue the code).
- **Consume the code BEFORE applying the new password.** Preserves the single-use
  guarantee. A transient `applyNewPassword` failure burns the code (user must
  re-request) — accepted tradeoff vs. leaving a replayable code after a write.
- **Validate the new password on BOTH sides** (≥8 + letter + number). Server is
  the gate; the client mirror is UX only. "New == current" is enforced at the
  request step (where both are in hand), not at confirm.
- **Never log or email the password.** Confirm logs only the provider's error
  message; the code emails carry only the 6-digit code (or nothing).

## Supabase quirk — password change must revoke other sessions
`supabase.auth.admin.updateUserById(id, { password })` changes the password but
does **NOT** invalidate existing sessions / refresh tokens. A hijacker on another
device keeps a working session, and a victim "resetting" their password would not
evict them.

**How to apply:** after any sensitive credential change, call
`supabase.auth.admin.signOut(token, "others")` (best-effort try/catch) to evict
other devices while keeping the current session. Use `"global"` when you want to
evict everyone (the deactivate flow does this so re-login is what reactivates).

**Lesser nit:** `verifyCurrentPassword` mints a throwaway Supabase session via
`signInWithPassword` on the dedicated `supabaseUserAuth` client (persistSession
off). It leaves an orphan refresh-token row server-side; not signed out because
signing out a shared singleton client races concurrent verifications. Acceptable.
