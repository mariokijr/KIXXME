---
name: KixxMe branding emblem
description: How the KixxMe logo/emblem is structured, the favicon-sync gotcha, and the fire-icon brand rule.
---

# KixxMe brand emblem

The official mark is `KixxMeLogo` (`artifacts/kixxme/src/components/brand/kixxme-logo.tsx`):
a neon line-art "K" whose upper arm rises into an integrated **teardrop location pin**
(purple→pink gradient). Variants via props: `badge` (rounded-square app-icon),
`withWordmark` (glyph + "KIXXME"), plain glyph; `glow` toggles the drop-shadow.

**Favicon is a hand-duplicated copy.** `artifacts/kixxme/public/favicon.svg` re-draws the
badge glyph by hand (it can't import the React component). The two share the same path data
and gradient stops but are separate files.
**Why:** an SVG asset file can't reuse a TSX component.
**How to apply:** any time you change the emblem geometry/gradient in `kixxme-logo.tsx`,
update `favicon.svg` in lockstep or the browser/app icon drifts from the in-app logo.

**Fire-icon brand rule:** the brand deliberately has NO fire/flame iconography. The ONLY
allowed `🔥` in the app is the Live "🔥 Buscar videollamada" button in `pages/live.tsx`.
**Why:** the old fire branding was replaced by the K+pin emblem; the single fire emoji on the
Live CTA is an intentional exception. Don't reintroduce flame icons elsewhere.

**Tagline:** canonical brand tagline is "Conecta con chicos cerca de ti." (login + signup).
