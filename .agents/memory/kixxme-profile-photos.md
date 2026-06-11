---
name: KixxMe profile photos
description: How profile photos are modeled (4 fixed slots) and why avatar_url must stay in lockstep with the main photo row.
---

# KixxMe profile photos

Profiles have **4 fixed photo slots** (slot 0 = main "Principal" + 3 additional). The UI always renders 4 slots; empty ones show an "Añadir" placeholder, filled ones offer Cambiar (replace) / Elegir como principal (set-main) / Eliminar.

## Single source of truth
`profile_photos` (Supabase) is the single source of truth for a user's photos. `profiles.avatar_url` is a **derived mirror** of whichever row has `is_avatar = true`.

**Why:** an earlier dual-write path (a separate top-of-profile avatar upload + photo reorder arrows) let `profiles.avatar_url` drift out of sync with `profile_photos`. The top avatar is now **display-only** — `avatar_url` only ever changes as a side effect of a main-photo write (upload-first, set-main, or replace-main). Never add a second writer to `avatar_url`.

**How to apply:** any new photo mutation that can affect the main photo must update `profiles.avatar_url` in the same flow. `avatar_url` is also the discover/"calidad mínima" NOT-NULL gate input, so desync silently drops users out of Descubrir.

## Replace endpoint ordering
PUT `/profiles/me/photos/:id` (`replacePhoto`): upload the new object **first**, repoint the row keeping `position` + `is_avatar`, rollback (delete) the new object if the row update fails, then — if the photo was main — sync `avatar_url` **before** best-effort deleting the old storage object. Syncing before the delete prevents `avatar_url` briefly pointing at an already-deleted file.

## Rules
- Cap = 4 (`MAX_PHOTOS`); 5th upload → 400.
- Can't delete the last photo: `count <= 1` → 400 with the exact Spanish message `Debes mantener al menos una foto en tu perfil.` (also guarded client-side without an API call). The web onboarding still gates completion on `avatar_url || photos.length > 0`.

## Known gap (not a regression)
POST and PUT photo routes do **not** validate `mime_type`/size, unlike the verification-selfie flow (jpeg/png/webp allowlist + decoded-size cap). An SVG could be stored in the public `avatars` bucket. Apply the same allowlist + cap if hardening photo uploads.
