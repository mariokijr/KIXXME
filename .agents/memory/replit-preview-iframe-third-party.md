---
name: Replit preview iframe blocks framed third-party flows
description: Stripe Checkout (and similar pages that refuse framing) won't render in the Replit preview iframe; a window.location redirect silently fails. Pre-open a tab in the click gesture.
---

The Replit preview pane is a proxied **iframe**. Any third-party page that sends `X-Frame-Options`/`frame-ancestors` (Stripe Checkout, many OAuth consent screens) will NOT render inside it, and a `window.location.href = url` redirect from inside the preview silently fails (blank / "refused to connect").

**Rule:** when handing off to an external page that may refuse framing, detect embedding with `window.self !== window.top`.
- Embedded: synchronously `window.open("", "_blank")` *inside the click handler* (so it isn't popup-blocked), then set `tab.location.href = url` once the async call (e.g. create-checkout-session) resolves.
- Standalone: a normal full-page `window.location.href = url` is fine.

**Why:** the tab must be opened during the user gesture; opening it after the `await` resolves gets blocked as an unsolicited popup. KixxMe's Activar Plus/Gold checkout never opened until this pattern was applied (premium.tsx `startCheckout`).

**How to apply:** any external redirect from a page that runs inside the Replit preview — payments, OAuth consent, or other framed-disallowed handoffs.
