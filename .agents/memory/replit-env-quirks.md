---
name: Replit env / secret verification quirks
description: How to inspect and validate env vars and secrets in this environment, and why the code_execution sandbox can't see them.
---

# Reading & validating secrets/env vars

## The code_execution (JS notebook) sandbox does NOT expose `process.env`
`process.env` is `undefined` inside the code_execution tool — secrets/env vars
are deliberately protected there (`process.env.FOO` throws "Cannot read
properties of undefined"). Use `viewEnvVars()`/`requestEnvVar()` (environment-
secrets skill) for existence checks, and a **bash-spawned node process** when you
need to read an actual value's *shape* (it inherits Replit Secrets as real env
vars). Always print only derived booleans/lengths, never the value.

**How to apply:** to validate a secret's format without leaking it, e.g.
`node -e 'const s=process.env.X||""; console.log(JSON.stringify({present:!!s, hasWhitespace:/\s/.test(s)}))'`
A running server process reads `process.env` at startup, so **restart the
workflow** after a secret changes or it keeps the stale value.

## Secrets entered via chat / the Secrets UI can carry transcription artifacts
A user-supplied secret came in with a Unicode "×" (U+00D7 multiplication sign)
where a literal "x" belonged; the Secrets UI stored it verbatim and the wrong
char only surfaced at connect time (auth rejected). HMAC signing still
"succeeds" locally with a wrong key, so a local token-mint test does NOT prove a
secret is correct — only a format check (stray unicode/whitespace) or a real
round-trip does.
**Why:** copy/paste from dashboards and OCR-style inputs silently swap
look-alike glyphs (× vs x, en-dash vs hyphen, smart quotes).
**How to apply:** after a secret is set, sanity-check it for non-ASCII/whitespace
via a bash node check (booleans only); if suspicious, re-request it through the
secure flow and tell the user the exact glyph problem.
