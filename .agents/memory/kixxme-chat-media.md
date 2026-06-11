---
name: Chat media (photos + voice notes)
description: How chat photos/voice notes are stored across the two databases, and why media-only user↔user messages use an empty content string instead of null.
---

# Chat media: the `content:""` rule for media-only messages

Media-only chat messages (a photo or voice note with no text) in the
**Supabase** `messages` table store `content: ""` (empty string), NOT `null`.

**Why:** Supabase `messages.content` is `NOT NULL`, and we do **not** own
Supabase DDL from this repo (it's the non-modifiable Supabase schema — see
`kixxme-dual-database.md`). Inserting `content: null` for an image/audio-only
message throws `null value in column "content" … violates not-null constraint`
(this silently broke image-only sends too — a latent pre-existing bug). Forcing
a prod `ALTER … DROP NOT NULL` would add an operational migration step and risk
dev/prod schema divergence, so an app-level sentinel is preferred over changing
a DB we don't control.

**How to apply:** Any new code path that inserts into Supabase `messages` for a
media message must use `content: trimmed || ""`, never `|| null`. Rendering and
previews must give media precedence so the empty string never shows:
- Message render chain: `image_url ? <img> : audio_url ? <AudioBubble> : <p>{content}</p>`.
- Conversation-list preview order: `if (last.content) … else if (last.image_url) "📷 Foto" else if (last.audio_url) "🎤 Nota de voz"` — `""` is falsy so it falls through to the emoji.
- Spam detector still gets `trimmed || null` (don't feed it `""`).

**Asymmetry with support tickets (intentional):** the support thread lives in
**Replit Postgres** (`support_ticket_messages`, DDL we own), so its `body` is
genuinely **nullable** and media-only support messages store `body: null`. Each
surface's reader handles its own sentinel; don't try to unify them.

## Upload/validation invariants
- Shared validator `artifacts/api-server/src/lib/chat-media.ts` `decodeMedia`:
  image allowlist jpeg/png/webp (**no SVG** → no stored XSS), audio
  webm/mp4/mpeg/ogg; `;codecs=` param stripped before the mime check; decoded
  size caps 8MB image / 5MB audio; `crypto.randomUUID()` object paths.
- `express.json` limit is 15MB (base64 ~+33% over an 8MB binary); the real cap
  is the per-route decoded-size check, not the body parser.
- Guard chains mirror every other user-facing surface: conv upload/send =
  isParticipant→403, isBlockedBetween→403, isUnavailable→404; support upload/send
  = owner-or-admin-else-404 + Gold gate (402 `gold_required`, admin bypass).

## Known future-hardening (deliberate, not bugs)
- Send-message routes accept arbitrary `image_url`/`audio_url` strings — not
  verified to point at our buckets (IP-leak vector, not script exec). Matches
  the pre-existing chat-photo model.
- Chat/support media live in **public** buckets behind unguessable UUID paths;
  a leaked URL is fetchable. Same model as existing profile/chat photos.
