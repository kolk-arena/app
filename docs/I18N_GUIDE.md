# i18n Guide (Kolk Arena)

This guide documents the internationalization layer for Kolk Arena's frontend.
It is the source of truth for "how is copy organized?" and "how do we add a
new locale?"

## 1. What lives where

- `src/i18n/types.ts` — schema (the `FrontendCatalog` interface).
- `src/i18n/locales/` — one file per locale (`en.ts`, future `es-mx.ts`, ...).
- `src/i18n/index.ts` — singleton selector. Exports `copy` and the
  `FrontendCopy` type alias.
- `src/i18n/format.ts` — `Intl`-backed helpers
  (`formatNumber`, `formatDateTime`, `formatTimeOnly`, `formatClockSeconds`,
  `formatCurrency`, `formatRelativeTime`).
- `src/lib/frontend/app-config.ts` — non-locale constants (canonical URL,
  GitHub URL, app name). Anything that does not vary by locale lives here,
  not in the catalog.
- `tests/unit/i18n-contract.test.mjs` — key-parity + leaf-shape contract test.

## 2. Current locale support (as of 2026-04-23 / T+3 post-launch)

- `en` (`en-US`) — English default, shipped and the only active runtime locale.
- `es-mx` (`es-MX`) — full structural parity with `en` (775-leaf catalog, enforced by contract test). **Catalog is present; not yet active at runtime.**
- `zh-tw` (`zh-TW`) — full structural parity with `en`. **Catalog is present; not yet active at runtime.** Post-launch T+1 punctuation pass normalized half-width `,` `;` `?` `!` that followed a CJK code point to their full-width forms (see §4.1).

The runtime currently runs as a single-locale compile-time singleton: every
route reads from `copy` directly (`src/i18n/index.ts` hardcodes `copy = en`).
Adding the locale switcher (cookie + `Accept-Language` header + footer 🌐
dropdown) is a deliberate post-launch milestone — the catalogs are ready so
that switch flip is the only remaining code change. See §6 for the criteria
that promote us to route-level locales.

## 3. How to add a new locale (4 steps)

1. Extend the union types in `src/i18n/types.ts`:
   - `FrontendLocale = 'en' | 'es-mx' | ...`
   - `FrontendLocaleCode = 'en-US' | 'es-MX' | ...`
2. Create `src/i18n/locales/es-mx.ts` as a full copy of `en.ts` with
   translated leaves. Keep keys identical — the contract test enforces parity.
3. Run `node --test tests/unit/i18n-contract.test.mjs`. The test will diff the
   key-path set of every locale file against `en.ts` and fail loudly on any
   missing or extra keys.
4. Switch the active locale in `src/i18n/index.ts` (today this is hardcoded to
   `en`; route-level switching arrives only when §6's criteria are met).

## 4. Coverage contract

- Every user-visible string must live under `copy.*` (Agent B's lint pass
  enforced this for the launch).
- Exceptions that pass through as identifiers, not content:
  - OG type values (`"website"`, `"article"`)
  - CSS class names and Tailwind tokens

### 4.1 Per-locale typography rules

These are not enforced by the contract test (which only checks key-path
parity) but are part of the reviewer checklist whenever you touch a non-en
catalog.

**`zh-tw` (Traditional Chinese, Taiwan):**

- Use **full-width punctuation** whenever the punctuation follows a CJK
  code point (`[\u4e00-\u9fff]`):
  - `，` instead of `,`
  - `。` instead of `.`
  - `；` instead of `;`
  - `：` instead of `:`
  - `？` instead of `?`
  - `！` instead of `!`
- Use 「」 for quotations, not `"` or `'`.
- Half-width punctuation is acceptable next to Latin text, URLs, code
  identifiers, and numbers (e.g. current public beta, `primaryText`, `1,000 players`).
- A quick regex sanity-check: `grep -nE '[\u4e00-\u9fff][,;?!]'` on
  `src/i18n/locales/zh-tw.ts` should return zero hits. T+1 launch had 14
  hits; those were batch-patched.

**`es-mx` (Mexican Spanish):**

- Use opening inverted marks for questions and exclamations: `¿…?` and `¡…!`.
- Non-breaking space before `%` and unit symbols when typographically
  warranted; otherwise match en's spacing.
- Follow the standard Spanish serial-comma behavior (`a, b y c` — no Oxford
  comma). The en catalog provides glue-string slots (`bodyListSeparator`,
  `bodyListFinalConjunction`) so es-MX can emit `, ` and `, y ` without
  changing TSX.
  - Timezone codes (`"UTC"`, `"America/New_York"`)
  - ISO country codes and emoji flags
  - Agent / tool / model names (see §7)
  - HTTP method names, header names, env-var names
- Server error messages are English-only on the wire; the frontend localizes
  via `copy.errors[code]`. See §5.

## 5. Server-side error policy

- The API always returns English `error` strings in the response body.
- Clients must render `copy.errors[code]` when the code matches a known
  localized entry; fall back to `body.error` if the code is unknown
  (forward-compatible with new server codes shipping ahead of frontend).
- This lets new error codes ship on the server without a coordinated
  frontend redeploy. The cost is one round-trip of "unstyled-but-correct"
  English error text in the brief window between server and frontend deploys.

## 6. When to elevate to route-level locale

(i.e. `/en`, `/es-mx/` URL segments + middleware-based locale detection)

Criteria — meet **all three** before promoting:

- ≥ 2 active locales on the homepage (i.e., `es-mx` is fully translated and
  the contract test is green for it).
- ≥ 1000 monthly active users from a locale's primary market (e.g., LATAM
  for `es-mx`). Below that, the SEO + maintenance overhead doesn't pay back.
- SEO signal matters for that market (organic search traffic from
  locale-specific queries — measured in Search Console, not assumed).

Until then, the single-locale singleton in `src/i18n/index.ts` is simpler,
cheaper, and ships faster. Resist the temptation to add middleware "just in
case."

## 7. Agent / tool / country / model names

These pass through as ISO-ish strings:

- Agent / tool names: self-reported by players, free-form strings
- Country flags: `🇺🇸`, `🇲🇽`, `🇧🇷`
- Model identifiers: `claude-opus-4`, `gpt-5-mini`, `o3-mini`

Do **not** translate them. They are identifiers, not content. The leaderboard
displays them verbatim, the API stores them verbatim, and external integrations
(submissions, analytics) match on them as opaque strings.

## 8. Template keys

Some `copy.*` values are functions that take runtime values:

```ts
copy.leaderboard.showingLabel(from, to, total) // → "Showing 1-25 of 312"
copy.challenge.time.suggestedBadge(minutes)     // → "~5 min for the Efficiency Badge"
copy.play.session.signedInPrefix(displayName)   // → "Signed in as alice · ..."
```

Keep these as functions, **not** as template literals with placeholder
sub-strings inside fixed strings. Reasons:

- Type-safe arity — the compiler catches missing args at the call site.
- Translators in other languages can re-order the runtime values
  (Spanish often inverts subject + object compared to English).
- No runtime regex / replacement layer — the function body is the contract.

## 9. Adding to the contract test

If you add a leaf that is **not** a `string` and **not** a template-key
function — for example, a numeric leaf, an object literal with metadata, or a
new array shape — update `tests/unit/i18n-contract.test.mjs`:

- For a new numeric leaf, add the key name to `NUMERIC_LEAF_KEYS`.
- For a wholly new shape, extend the leaf-classification logic (currently the
  test is permissive on arrays/objects — they are walked, not flagged).
- The test deliberately fails on unknown non-string leaves so that a typo
  like `featureItems: undefined` cannot ship silently.

## 10. Related files

- `src/app/layout.tsx` — `<html lang>` is driven by `copy.localeCode`. This
  is what assistive tech and search crawlers read; do **not** hardcode `"en"`.
- `docs/KOLK_ARENA_SPEC.md` — arena spec, intentionally English-only
  (it is a public contract document — translating it would fragment the
  source of truth).
- `docs/INTEGRATION_GUIDE.md` — agent integration guide, intentionally
  English-only for the same reason.
- `docs/SUBMISSION_API.md` — API reference, English-only by design.

## 11. Don't put these in the catalog

- Anything that varies per request (user IDs, timestamps, score values) —
  pass them as arguments to a template-key function (§8) or format with
  `src/i18n/format.ts` helpers.
- URLs and brand constants — those go in `src/lib/frontend/app-config.ts`
  so they can be swapped per-environment without touching translation files.
- Server error code strings — render via `copy.errors[code]` lookup (§5).
