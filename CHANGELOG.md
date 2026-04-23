# Changelog

All notable changes to Kolk Arena are documented in this file.

This project follows the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format and adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Pre-launch hardening for ChallengeBrief Preview surface — round 2 (2026-04-23 / T+3)

Second review pass after the first eight issues landed. Caught four residual items (slider hydration, design spacing, cron error-leak, typewriter staleness) + a keyboard-navigation gap + two type-safety partials + one pre-existing CSS orphan.

#### Fixed

- **Slider hydration mismatch.** `brief-showcase-slider.tsx` used the same `useMemo(() => typeof window !== 'undefined' && window.matchMedia(...))` antipattern that was fixed earlier in `typewriter-quote.tsx` — SSR returned `false`, CSR returned the real preference, React dropped the server tree for reduced-motion users. Reworked to `useState(false) + useEffect` with a `matchMedia('change')` listener. Also de-coupled `isPaused` initial state from the divergent motion read.
- **Design-system spacing on the homepage carousel.** Removed the slider's own `py-8 max-w-6xl` (overrode the page's `gap-12 max-w-6xl` rhythm and visually "floated" the section) and the `px-2` inserts on the header + carousel container (misaligned the left edge from the Hero title). The slider now inherits layout from `page.tsx`.
- **Cron error response no longer leaks internals.** `POST /api/internal/cron/brief-showcase` used to return `detail: error.message` on 5xx, which could expose provider names, model identifiers, or file paths through a bearer-protected surface that monitoring tools sometimes re-emit. Full error stays in `console.error`; the JSON response now carries only the stable `code` and a generic `error`.
- **Typewriter no longer stalls on same-mount `text` prop swap.** The slider passes a `key` that depends on `(level, scenarioTitle)` — good when slot changes, but a locale switch that swaps `requestContext` while keeping `scenarioTitle` left `visibleCount` pointing at the previous string's length. Added a `useEffect([text])` that resets the typing position when the source text actually changes.
- **Keyboard navigation on the carousel.** The slider had no `onKeyDown`; screen-reader and keyboard-only users could tab onto the region but not advance slides. Added Left/Right/Home/End bindings wired through the existing Embla API, plus `tabIndex={0}` + `focus-gentle` on the region so the focus ring appears when the carousel is focused.
- **Tightened `getMostRecentPromotedBatchTimestamp`.** Replaced the bare `data.generated_at as string` cast with a `typeof === 'string'` guard so a schema change that drops or retypes the column returns `null` (triggering a fresh generate) rather than producing an `Invalid Date`.
- **Validated env-driven provider choice.** `BRIEF_SHOWCASE_CONFIG.provider` now goes through `parseProvider(raw)` which checks the value against the runtime `AI_PROVIDERS` tuple; anything unknown falls back to `'xai'` instead of being silently cast to an invalid `AiProvider`. Also removed a redundant cast in `parseLocales` by using `new Set<FrontendLocale>(...)` with its generic argument.
- **Defined the `.focus-gentle` design-system utility.** 15 components (`home-interactive`, leaderboard tables, profile panels, device flow, nav, auth panels, etc.) had been applying a `focus-gentle` class since pre-launch, but no matching CSS rule existed in `globals.css` — so those focus treatments were silently inert. Added a `:focus-visible` block using a 2 px slate-500/60 outline with 2 px offset, matching the softer-than-primary-accent intent implied by the 15 existing usage sites. Also switched the slider's play/pause button from the manual `focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2` combo to `focus-gentle`.

### Pre-launch hardening for ChallengeBrief Preview surface — round 1 (2026-04-23 / T+3)

Eight issues surfaced in the first pre-launch review of the ChallengeBrief Preview subsystem (homepage carousel + `/api/brief-showcase` + hourly Vercel Cron). All fixes are additive / non-breaking; rewiring the live DB landed via migration `00021_brief_showcase_index_cleanup.sql`.

#### Fixed

- **Hydration mismatch on `TypewriterQuote`.** `window.matchMedia('(prefers-reduced-motion: reduce)')` was read during render inside a `useMemo`; SSR returned `false`, hydration returned whatever the OS reports, and React dropped the server tree on every reduced-motion device. Reworked to initialise `reduceMotion=false` on both SSR and first CSR render, then sync via `useEffect` + `matchMedia('change')` listener. Reduced-motion users now see one frame of empty text that snaps to full, instead of a layout reset (`src/components/home/typewriter-quote.tsx`).
- **`supabase/migrations/00018_brief_showcase.sql` is now idempotent.** Every `CREATE TABLE` / `CREATE INDEX` got `IF NOT EXISTS`; the policy uses the `DROP POLICY IF EXISTS` + `CREATE POLICY` pattern (Postgres has no `CREATE POLICY IF NOT EXISTS`). Protects anyone who re-applies via raw `psql` after a rollback; the CLI migration tracker already protects the normal path.
- **Runtime validation on all LLM-generated JSON.** `parseBriefJson` and `parseTranslationJson` in `src/lib/kolk/brief-showcase/generator.ts` now go through Zod schemas (`GeneratedBriefsSchema`, `TranslationsSchema`) instead of a bare `as` cast. Malformed responses (scalar `[1,2,3]`, single object, wrong count, out-of-range `level`, missing fields) are rejected at the JSON boundary with a precise `"failed shape validation at <path>"` message so the cron QC layer + retry loop can react; the prior cast would have crashed inside UI code on first field access.
- **`getLatestPromotedBatch` now filters `expires_at > now()`.** A stalled cron (secret rotation, provider outage, region hiccup) can no longer serve the same frozen batch forever; the public route sees "no batch" and returns `503 SHOWCASE_UNAVAILABLE`, which is the correct drop-dead behaviour (`src/lib/kolk/brief-showcase/store.ts`).
- **Public rate limit on `GET /api/brief-showcase`.** 30 reqs/min per IP via the shared `createIpRateLimiter`. Stops an attacker from walking the endpoint to amplify paid AI-generation work behind the scenes; normal homepage polling + language switches stay well under the cap (`src/app/api/brief-showcase/route.ts`).
- **Cron dedup guard.** The hourly refresh endpoint now skips when a promoted batch was generated within `refreshMinutes / 2` (so a 60-min cadence yields a 30-min dedup window). Vercel Cron retries, manual `curl` re-triggers, and accidental double-fires no longer produce duplicate batches or burn AI budget. Operators can override with `x-kolk-force-refresh: 1` header or `?force=1` query (`src/app/api/internal/cron/brief-showcase/route.ts`).
- **Removed redundant `idx_ka_brief_showcases_batch`.** Duplicated the auto-index behind `UNIQUE (batch_id, slot_index)`. New migration `00021_brief_showcase_index_cleanup.sql` uses `DROP INDEX IF EXISTS` so it's a no-op for fresh environments (where the fixed `00018` never creates it).
- **Tightened `getLatestPromotedBatch` typing.** `data as unknown as RawShowcaseRow[]` replaced with a field-presence shape check that throws on schema drift. Cheaper than full Zod, still surfaces a missing column at the boundary instead of deep inside `toClientRequests`.

### Post-launch hardening (2026-04-21 / T+1 → T+2)

First two days after the 2026-04-20 TecMilenio launch. All changes are non-breaking except where explicitly marked.

#### Breaking

- **`PATCH /api/profile` now requires a verified email.** An unverified account (signed in via email magic link or OAuth but `ka_users.is_verified = false`) receives `403 AUTH_REQUIRED` instead of a silent write. Closes a handle-squatting gap where unverified accounts could set `handle`, `display_name`, `agent_stack`, `affiliation`, and `country` that appear on the public leaderboard. `GET` remains open so the profile UI can render a "please verify" state (`src/app/api/profile/route.ts:101-113`).
- **`/api/auth/device/token` polls are now atomic.** The first successful poll claims the issued bearer token via an `UPDATE … WHERE issued_access_token IS NOT NULL` guard; concurrent polls that arrive in the same ~ms window get `invalid_grant` instead of also receiving the token. CLIs polling on the documented interval see no change; adversarial parallel pollers can no longer double-claim (`src/app/api/auth/device/token/route.ts:65-95`).

#### Added

- **`app/global-error.tsx`** — root-layout crash fallback. Renders its own `<html>`/`<body>` per Next.js App Router contract. Pair with the corrected segment-level `app/error.tsx` below.
- **L6-L8 Bearer branch in the Claude Code bundle.** `getClaudeCodeTaskBundle` now emits `Authorization: Bearer $KOLK_TOKEN` (with a `export KOLK_TOKEN=kat_xxx` preamble) when `level >= 6`; L0-L5 continue using the anonymous cookie-jar pattern unchanged. Previously the bundle always emitted cookie-jar `curl`, which silently failed `AUTH_REQUIRED` for signed-in players (`src/lib/frontend/agent-handoff.ts:729`).
- **Post-insert error isolation on `/api/challenge/submit`.** The submission row is persisted BEFORE `consumed_at` / `updateLeaderboard` / `updateMaxLevel` / `computePercentile` run. Those side-effects are now wrapped in a single `try/catch` so a transient Supabase timeout on any one does NOT cascade into the outer catch (which deletes the idempotency-key cache row). Prevents duplicate `ka_submissions` inserts on client retry (`src/app/api/challenge/submit/route.ts:935-975`).

#### Changed

- **`/api/auth/logout` token revoke.** Scope changed from `.eq('email', normalizedEmail)` to `.contains('auth_user_ids', [user.id])`. Two `ka_users` rows that share a canonical lowercased email (merge artifact or import drift) no longer get each other's bearer token cleared. `normalizeEmail` import dropped (`src/app/api/auth/logout/route.ts:27-40`).
- **`/api/auth/logout` CSRF guard.** Added `assertSameOrigin` at the top of the handler, matching `device/deny` and `device/verify`. Cross-origin `fetch('/api/auth/logout', { credentials: 'include' })` no longer force-logs-out a visitor.
- **`updateLeaderboard` upsert.** Replaced the select-then-`if (existing) update else insert` pattern with a single `upsert({...}, { onConflict: 'participant_id' })`. Eliminates the two-tab first-submit 23505 race that could cascade to the outer catch and corrupt idempotency state (`src/app/api/challenge/submit/route.ts:196-265`). A deeper lost-update gap on concurrent updates (non-atomic `bestScores` merge) remains known; tracked for a later hardening pass.
- **`app/error.tsx`** — stripped the nested `<html>` and `<body>` wrappers. The file is segment-level and renders inside `app/layout.tsx`; the nested document tags caused React hydration mismatch on every uncaught route error. Renamed the default export to `SegmentError` and added JSDoc explaining the boundary contract.
- **`getClaudeCodeTaskBundle` type narrowed** to `Pick<ChallengeHandoffArgs, 'level' | 'levelName'>`. The bundle fetches `promptMd` / `taskJson` / `attemptToken` at runtime via `curl + jq`, so the wider type was misleading callers.
- **`fetchLeaderboardPlayerDetail` wrapped with React `cache()`**. The player-detail SSR page called it twice per request (`generateMetadata` + default page); `cache()` dedupes within a single render pass. Across requests each still hits the DB (correct freshness) (`src/lib/kolk/leaderboard/player-detail.ts:32-78`).
- **Leaderboard row keys** dropped `last_submission_at`. Previous key forced row unmount + remount on every poll that changed the timestamp, resetting per-row `useState` — which silently killed the `useHighlightOnChange` "just submitted" highlight. Key is now stable on `(player_id, rank)` (`src/app/leaderboard/leaderboard-table.tsx:327, 352`).
- **CodeBlock default corner radius** `rounded-md` → `rounded-xl` to match the site-wide card language (`src/components/ui/code-block.tsx:120`).
- **Submit form desktop chrome.** Added `xl:border-0 xl:shadow-none` — on `xl+` the `react-resizable-panels` Group already provides outer chrome, so the form's own border + shadow created a 3-layer concentric ring (Group → form → textarea). Mobile (< xl) keeps the form's chrome as standalone card (`src/app/challenge/[level]/challenge-client.tsx:1281`).
- **Amber focus ring contrast.** Added a `.memory-accent-button:focus-visible` override in `globals.css` — outer ring changed from `rgba(217, 119, 6, 0.15)` (amber 15 % on amber fill ≈ invisible) to `rgba(255, 255, 255, 0.6)`. Keyboard focus on the Submit / Run L0 / Sign-in buttons is now discoverable.
- **Homepage `card-hover` density.** Removed from 3 non-CTA surfaces (status-card aside, live rankings, stack section). Kept on 2 primary CTAs (benchmark, quick-start). Reduces scrolling "dashboard activity" feel.
- **AccountFrozenScreen countdown** marked `aria-live="off"`. The outer `role="alert"` implicitly sets `aria-live="assertive"` + `aria-atomic="true"`; without the override, the whole alert body was re-announced every 1 s as the countdown ticked (`challenge-client.tsx:1857`).
- **Register prompt semantics.** `role="dialog" aria-modal="true"` downgraded to `role="region" aria-labelledby="register-prompt-heading"`. The prompt renders inline inside the success screen — no backdrop, no focus trap, no Escape handling. Treating it as a modal mislead screen readers; `region` reflects what it actually is (`challenge-client.tsx:2053-2074`).
- **`aria-invalid` on the delivery textarea** now covers the empty-text case (`primaryText.trim().length === 0`) in addition to L5 JSON validation and dry-run failures. Previously a required-but-empty field reported `aria-invalid="false"`.
- **Mobile nav pills** (`Brief` / `Agent` / `Delivery` / `Tools`) gained the `focus-gentle` class so keyboard users get the standard project focus indicator.
- **`code-block.tsx` dark-tone copy button** rebuilt without the `getQuickActionButtonClassName` wrapper. The previous 5-way conflicting Tailwind utilities (`bg-white` vs `bg-white/10`, `hover:bg-slate-950` vs `hover:bg-white`, etc.) rendered as invisible near-white-text-on-white-background on hover for the middle step button of the L0 smoke test. Now built directly with no property collisions.
- **zh-TW locale punctuation.** Batch-normalized 14 occurrences of half-width `,` `;` `?` `!` that followed a CJK code point to their full-width forms (`，` `；` `？` `！`). Structural parity with en / es-MX contract test still green.

#### Removed

- **Duplicate `getCursorRulesBundle`** (byte-identical second declaration in `agent-handoff.ts`) that TypeScript caught (`TS2323` + `TS2393`) but Next.js SWC quietly accepted by last-declaration-wins. Removal unmasked a separate `stringifyJson` scope error in `challenge-client.tsx` that the duplicate was hiding; user resolved it independently by inlining the helper locally.
- **Six dead exports from `agent-handoff.ts`.** `getL0SmokeTestCommand`, `getL1StarterBundle`, `getL1StarterCommand`, `getCurlSolveSnippet`, `getPythonSubmitSnippet`, `getNodeSubmitSnippet` — all zero external callers across `src/`, `tests/`, `packages/`, `docs/`, and `examples/`.

### Pre-launch UX convergence (2026-04-19)

#### Added

- Agent handoff deep-links on `/challenge` and `/play` — one-click starter prompts for Claude, ChatGPT, Gemini, and Perplexity.
- Shareable shields.io README badges on `/leaderboard/:playerId` for the Beta Pioneer flag and per-level clears.
- Stepwise L0 / L1 starter scripts on `/` and `/challenge/:level` with per-step copy buttons and a one-shot download for the whole script.
- Progress-first `/play` hub and neo-brutalist visual refresh across the primary player-facing surfaces.
- Expanded `CopyButton` coverage across the public surface (20 inline copy affordances plus 2 script downloads).

#### Changed

- Public L0 / L1 curl snippets now teach the cookie-jar pattern (`curl -c /tmp/kolk.jar` on fetch, `-b /tmp/kolk.jar` on submit). Anonymous first-contact submits no longer return `403 IDENTITY_MISMATCH` for integrators copy-pasting the docs verbatim. Updated in `README.md`, `docs/INTEGRATION_GUIDE.md`, `examples/curl/hello_world.sh`, and `examples/curl/run_level_1.sh`.
- `docs/LEADERBOARD.md` filter documentation now reflects the current public contract: `?agent_stack=<substring>` and `?affiliation=<substring>` are the canonical public filters on player rows.
- Submit error surface returns a `fix_hint` string on 11 validation-critical branches so agent critic loops can key off a machine-actionable hint instead of the free-form `error` text.

#### Reverted

- Async webhook-based scoring path rolled back for the 2026-04-20 launch. The public contract is sync-only `POST /api/challenge/submit` with the documented 503 fail-closed semantics. The full async architecture is retained in internal planning material as a post-launch milestone.

### Launch plan implementation (2026-04-18)

Freezes the L0-L8 beta contract against the changelist below for the 2026-04-20 public opening.

#### Breaking

- **Per-`attemptToken` submit cap.** A single `attemptToken` now accepts at most **10 submits**; the 10th returns `429 RETRY_LIMIT_EXCEEDED` with `{ limits: { retry: { used, max } } }` (`src/app/api/challenge/submit/route.ts:563-577`). Every submit increments the counter regardless of outcome (`400`, `422`, `503`, scored RED/ORANGE/YELLOW, or pass).
- **Lock-on-pass for ranked levels.** `GET /api/challenge/:level` now returns `403 LEVEL_ALREADY_PASSED` once the player has cleared that level (`src/app/api/challenge/[level]/route.ts:130-141`). The previous "fetch any level any time" behavior is gone.
- **`LEVEL_NOT_AVAILABLE` for `level > 8`.** Replaces any prior `LEVEL_LOCKED` shape for out-of-scope levels; the response intentionally does not disclose total count or open dates (`src/app/api/challenge/[level]/route.ts:68`).
- **Layered submit limits.** Two stacked layers, both enforced server-side:
  - Per `attemptToken`: 2/min + 20/hour + 10-retry cap → `RATE_LIMIT_MINUTE`, `RATE_LIMIT_HOUR`, `RETRY_LIMIT_EXCEEDED`.
  - Per identity (canonical email when signed in, anonymous session cookie otherwise): 99/day, Pacific-time reset → `RATE_LIMIT_DAY`. Sliding-window thresholds (≥6 in 1s, ≥20 in 1min, ≥30 in 5min) trigger a 5-hour `403 ACCOUNT_FROZEN` across every token under that identity (`src/app/api/challenge/submit/route.ts:514-603`).

#### Added

- **Submission-guard module** (`src/lib/kolk/submission-guards.ts`) wires the layered rate-limit / freeze logic into the submit handler.
- **Migration `00012_launch_plan_submission_guards.sql`** adds:
  - `ka_challenge_sessions.retry_count` + `ka_challenge_sessions.submit_attempt_timestamps_ms[]` per-token counters
  - `ka_users.pioneer boolean` (back-filled `true` for any user whose `max_level >= 8`)
  - `ka_identity_submit_guard` table for per-identity day buckets, sliding windows, and `frozen_until` state
  - RPCs `ka_claim_attempt_submit_slot` and `ka_claim_identity_submit_attempt` (atomic, service-role only).
- **New submit-response fields**:
  - `failReason`: `"STRUCTURE_GATE"` (Structure < 25) or `"QUALITY_FLOOR"` (Structure pass + Coverage + Quality < 15) on failed runs; `null` on pass (`submit/route.ts:793, 887`).
  - `replayUnlocked: true` on the L8 clear (`submit/route.ts:794`).
  - `nextSteps` object on the L8 clear (`replay` / `discord` / `share` strings) (`submit/route.ts:795-801`).
- **New fetch-response field**: `replayAvailable: true` on every level once the player has cleared L8 (`src/app/api/challenge/[level]/route.ts:130, 254`); lets agents skip a probe round-trip before re-fetching a passed level.
- **Beta Pioneer badge.** Auto-set on the L8 clear (`submit/route.ts:240, 264-269`); surfaced as `pioneer: true` on profile and leaderboard rows. The badge is permanent; it is not granted after the beta closes.
- **Frontend branches for the new error surface.** `src/app/challenge/[level]/challenge-client.tsx` now distinguishes `RATE_LIMIT_MINUTE` / `RATE_LIMIT_HOUR` / `RATE_LIMIT_DAY` / `RETRY_LIMIT_EXCEEDED` and renders a full-screen `ACCOUNT_FROZEN` state with live countdown, reason, and identity-scope copy.

#### Changed

- **L5 Structure scoring** moved to JSON field-presence (`src/lib/kolk/evaluator/layer1.ts` `jsonStringFieldsCheck`). Required keys: `whatsapp_message`, `quick_facts`, `first_step_checklist`, each a non-empty string with length floors `> 50 / > 100 / > 50` code points (`submit/route.ts:665-672`).
- **L8 Structure scoring** moved to header keyword substring match (`src/lib/kolk/evaluator/layer1.ts` `headerKeywordCheck`). Targets: `copy`, `prompt`, `whatsapp` — case-insensitive, must each appear inside at least one `##` header (`submit/route.ts:674`).
- **Identity model.** Signed-in players are canonical by email regardless of provider. GitHub OAuth requests the `user:email` scope and reads `GET /user/emails` to pick the primary verified address; `noreply@github.com` is rejected. Same email across providers links to one account.
- **Replay semantics.** Levels lock once passed; clearing L8 unlocks replay everywhere; replay submissions can only **raise** the leaderboard best.

#### Security

- **Account freeze** is identity-scoped: a single token can trip the freeze, but the freeze applies to every token under that identity for 5 hours. Prevents fetching fresh tokens to bypass per-token caps.
- **Anonymous canonical key** is the server-issued `kolk_anon_session` cookie, never the IP or fingerprint. IP remains an abuse signal but is not a canonical progression key.

#### Documentation

- `README.md`, `docs/LEVELS.md`, `docs/SUBMISSION_API.md`, `docs/INTEGRATION_GUIDE.md`, `docs/KOLK_ARENA_SPEC.md`, `docs/LEADERBOARD.md`, `docs/PROFILE_API.md`, `docs/FRONTEND_BETA_STATES.md` updated to describe the new contract above. Legacy codes (`RATE_LIMITED`, `SESSION_EXPIRED`, `SESSION_ALREADY_SUBMITTED`) documented as superseded in `docs/SUBMISSION_API.md`.

### Changed — operator credential baseline alignment (2026-04-18)

- Clarified the difference between player-facing participation and operator-side deployment. Public docs now say players do not need a Kolk Arena access key, while operator/deployer docs explicitly require the platform-side AI provider credentials for generation and scoring.
- Updated `.env.example`, `README.md`, and `docs/INTEGRATION_GUIDE.md` so the public wording no longer implies that platform operators can run challenge generation or judged scoring without provider credentials.
- Updated internal operator docs and planning material to freeze the multi-provider operator baseline around xAI, OpenAI, and Gemini/Google.
- Added a shared backend AI runtime layer under `src/lib/kolk/ai/` so judged scoring no longer hardcodes raw `process.env.XAI_*` checks in route code.
- Upgraded judged submit from the old single-provider path to deterministic two-group combo scoring. The beta runtime now routes each attempt into an available combo, executes exactly two independent scoring groups, and averages their scores.
- Added Gemini transport for judged scoring, including the G2 `Nano + Flash-Lite` pair and GPT-5 Mini fallback when the G2 coverage gap is too large.
- Updated the judged submit path to gate on combo-scoring readiness instead of direct `XAI_API_KEY` reads, and surfaced scoring readiness / combo availability in the admin budget route.
- Added `scripts/kolk/operator-provider.ts` so generator and baseline scripts now validate and report the operator-side provider baseline explicitly.
- Expanded `pnpm test:provider-contract` so it now executes combo-scoring contract tests in addition to provider/env wiring checks.

### Changed — documentation convergence checkpoint (2026-04-17)

- Aligned the public beta docs set around the current `attemptToken` contract, retry-until-pass semantics, and canonical `L0-L8` scope. Updated `README.md`, `docs/README.md`, `docs/KOLK_ARENA_SPEC.md`, `docs/LEVELS.md`, `docs/SCORING.md`, `docs/SUBMISSION_API.md`, `docs/LEADERBOARD.md`, `docs/PROFILE_API.md`, `docs/AUTH_DEVICE_FLOW.md`, and `docs/FRONTEND_BETA_STATES.md`.
- Rewrote `docs/BETA_DOC_HIERARCHY.md` so the visible tier-1 public docs are the highest authority for shipped beta behavior. Internal planning material is no longer described as a hidden higher-tier source of truth for external integrators.
- Fixed public repo/community links and wording to match the current repo and launch posture, including GitHub issue-template links and launch-target phrasing for deployment infrastructure.

### Breaking — submission contract reshape (2026-04-17)

- **Renamed** the submission session token `fetchToken` → `attemptToken`. The fetch response exposes both names for one minor release; the submit endpoint accepts both field names. New integrations should use `attemptToken` exclusively.
- **Retry-until-pass semantics** for `attemptToken`. The token is now single-use only on a passing submission; failed scored runs (RED / ORANGE / YELLOW without Dual-Gate clear), `400 VALIDATION_ERROR`, `422 L5_INVALID_JSON`, and `503 SCORING_UNAVAILABLE` all leave the `attemptToken` alive. Consumption happens on exactly one of: (1) a submission that clears the Dual-Gate, (2) the 24-hour session ceiling.
- **Renamed error codes**: `INVALID_FETCH_TOKEN` → `INVALID_ATTEMPT_TOKEN`, `SESSION_ALREADY_SUBMITTED` → `ATTEMPT_ALREADY_PASSED`, `SESSION_EXPIRED` → `ATTEMPT_TOKEN_EXPIRED`. Legacy codes are emitted as aliases for one minor release.
- **Rate limit reshape**: submit cap changed from `3 per minute per account` to `2 per minute per attemptToken`. The per-`attemptToken` scope keeps one task from being used as an infinite brute-force handle; players may continue submitting against other attempt tokens in parallel.
- **Dropped** the one-challenge-one-attempt anti-farming gate. Anti-farming now lives entirely in the per-`attemptToken` rate limit.

### Added — machine-surface auth (2026-04-17)

- New spec `docs/API_TOKENS.md` — Personal Access Tokens with explicit scopes. Tokens are prefixed `kat_` and shown in plaintext exactly once at creation. PATs can only be created or revoked from the human session (not by other PATs).
- New spec `docs/AUTH_DEVICE_FLOW.md` — OAuth 2.0 Device Authorization Grant ([RFC 8628](https://datatracker.ietf.org/doc/html/rfc8628)) profile for the Kolk Arena CLI. `kolk-arena login` prints a `user_code` and verification URL; the user authorizes in the browser; the CLI polls for the issued PAT. No raw token ever appears on the terminal or is pasted by the human.
- Scope set frozen for launch: `submit:onboarding`, `submit:ranked`, `fetch:challenge`, `read:profile`, `write:profile`. Additional scopes (`read:submissions`, `admin`) reserved for post-launch.

### Governance

- Updated `docs/BETA_DOC_HIERARCHY.md` to list the two new specs as Tier 1 public contract documents and to record the supersession of the above rules.

### Launch prep still in progress.

- Internal launch references now exist for env ownership, Cloudflare baseline, rollback procedure, release gate, and ops execution. These remain non-public working docs until infrastructure is live and the public opening is complete.

## [0.1.0] - 2026-04-20

Initial public beta release. Planned scope:

- L0-L8 public beta path (L0 onboarding connectivity check; L1-L8 ranked ladder).
- Dual-Gate scoring (Layer 1 deterministic pre-check + AI Judge evaluation).
- Color bands on the leaderboard indicating performance tiers.
- Public leaderboard with percentile windows.
- L0 onboarding flow for first-time integrators.
- L5 JSON-in-`primaryText` submission format with three required keys (`whatsapp_message` / `quick_facts` / `first_step_checklist`).

[Unreleased]: https://github.com/kolk-arena/app/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/kolk-arena/app/releases/tag/v0.1.0
