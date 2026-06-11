import { createClient } from "@supabase/supabase-js";

const SUPA_URL = process.env.SUPABASE_URL;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const BASE = "http://localhost:80/api";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;

if (!SUPA_URL || !SRK || !ANON || !ADMIN_EMAIL) {
  console.log("MISSING_ENV", { hasUrl: !!SUPA_URL, hasSrk: !!SRK, hasAnon: !!ANON, adminEmail: ADMIN_EMAIL });
  process.exit(2);
}

const noSess = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(SUPA_URL, SRK, noSess);

const rid = Math.random().toString(36).slice(2, 8);
const goldEmail = `e2e-gold-${rid}@kixxme-e2e.test`;
const pw = `E2ePass!${rid}A9`;

const checks = [];
function check(name, ok, extra) {
  checks.push({ name, ok: !!ok });
  console.log((ok ? "PASS " : "FAIL ") + name + (extra ? "  [" + extra + "]" : ""));
}

async function token(email) {
  const c = createClient(SUPA_URL, ANON, noSess);
  const { data, error } = await c.auth.signInWithPassword({ email, password: pw });
  if (error) throw new Error("signin " + email + ": " + error.message);
  return data.session.access_token;
}

async function api(method, path, tok, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = null;
  try { j = await res.json(); } catch {}
  return { status: res.status, body: j };
}

let goldId, adminId, ticketId;
try {
  // --- provision ---
  const gu = await admin.auth.admin.createUser({ email: goldEmail, password: pw, email_confirm: true });
  if (gu.error) throw new Error("create gold: " + gu.error.message);
  goldId = gu.data.user.id;
  const au = await admin.auth.admin.createUser({ email: ADMIN_EMAIL, password: pw, email_confirm: true });
  if (au.error) throw new Error("create admin: " + au.error.message);
  adminId = au.data.user.id;

  const goldTok = await token(goldEmail);
  const adminTok = await token(ADMIN_EMAIL);

  // JIT-create gold profile, then promote to gold plan
  await api("GET", "/profiles/me", goldTok);
  const up = await admin.from("profiles").update({ plan: "gold" }).eq("id", goldId);
  if (up.error) throw new Error("set gold plan: " + up.error.message);
  await api("GET", "/profiles/me", adminTok);

  // 1) Official "Soporte KixxMe" thread present (frontend pins it on top for Gold)
  const off = await api("GET", "/support/official", goldTok);
  check("Official Soporte KixxMe thread present (pinned for Gold)", off.status === 200 && off.body?.ticket?.id, "status=" + off.status);

  // 2) Gold user writes to support (opens a ticket)
  const open = await api("POST", "/support/tickets", goldTok, {
    subject: "E2E prueba soporte",
    message: "Hola soporte, necesito ayuda con mi cuenta (E2E).",
  });
  ticketId = open.body?.ticket?.id;
  check("Gold user opens ticket (POST /support/tickets 201)", open.status === 201 && ticketId, "status=" + open.status);

  // 3) Support (admin) sees the ticket in the moderation queue
  const list = await api("GET", "/admin/tickets", adminTok);
  const seen = Array.isArray(list.body?.tickets) && list.body.tickets.some((t) => t.id === ticketId);
  check("Support sees ticket in /admin/tickets", list.status === 200 && seen, "status=" + list.status + " total=" + list.body?.total);

  // 4) Support replies (role derived = admin)
  const reply = await api("POST", `/support/tickets/${ticketId}/messages`, adminTok, {
    body: "Hola, equipo de Soporte KixxMe. Estamos revisando tu caso (E2E).",
  });
  const adminMsg = reply.body?.messages?.some((m) => m.senderRole === "admin");
  check("Support replies (senderRole=admin)", reply.status === 201 && adminMsg, "status=" + reply.status);

  // 5) User sees the reply + unread badge (Mensajes)
  const userList = await api("GET", "/support/tickets", goldTok);
  const ut = userList.body?.tickets?.find((t) => t.id === ticketId);
  check("User has unread admin reply (badge in Mensajes)", ut?.unread === true, "unread=" + ut?.unread);
  const detail = await api("GET", `/support/tickets/${ticketId}`, goldTok);
  const userSeesReply = detail.body?.messages?.some((m) => m.senderRole === "admin");
  check("User sees admin reply in thread (canReply while Gold)", detail.status === 200 && userSeesReply && detail.body?.ticket?.canReply === true, "canReply=" + detail.body?.ticket?.canReply);

  // 6 & 7) Emails fire (support inbox on new msg; user on reply) — verified via server logs after.

  // 8) Lapsed-Gold: keeps history, read-only (no new messages)
  await admin.from("profiles").update({ plan: "free" }).eq("id", goldId);
  const detail2 = await api("GET", `/support/tickets/${ticketId}`, goldTok);
  check("Lapsed-Gold: canReply=false (read-only)", detail2.body?.ticket?.canReply === false, "canReply=" + detail2.body?.ticket?.canReply);
  const blocked = await api("POST", `/support/tickets/${ticketId}/messages`, goldTok, { body: "intento tras perder Gold (E2E)" });
  check("Lapsed-Gold: sending blocked (402)", blocked.status === 402, "status=" + blocked.status);
  const after = await api("GET", `/support/tickets/${ticketId}`, goldTok);
  check("Lapsed-Gold: history preserved", after.status === 200 && (after.body?.messages?.length ?? 0) >= 2, "msgs=" + after.body?.messages?.length);

  console.log("IDS goldId=" + goldId + " adminId=" + adminId + " ticketId=" + ticketId);
} catch (e) {
  console.log("ERROR", e instanceof Error ? e.message : String(e));
} finally {
  // --- Supabase cleanup (auth users + profiles). Replit-PG tickets cleaned via executeSql. ---
  try { if (goldId) await admin.from("profiles").delete().eq("id", goldId); } catch {}
  try { if (adminId) await admin.from("profiles").delete().eq("id", adminId); } catch {}
  try { if (goldId) await admin.auth.admin.deleteUser(goldId); } catch {}
  try { if (adminId) await admin.auth.admin.deleteUser(adminId); } catch {}
  console.log("SUPABASE_CLEANUP_DONE");
  const failed = checks.filter((c) => !c.ok);
  console.log(`\nRESULT: ${checks.length - failed.length}/${checks.length} passed`);
  if (failed.length) console.log("FAILED: " + failed.map((c) => c.name).join(" | "));
}
