# Kolk Arena Frontend Beta States

> **Last updated:** 2026-04-16
> **Purpose:** freeze page-level UI behavior for the current public beta

This document defines the page and state contract that frontend work must implement for the `L0-L8` public beta.

## Global Product Decisions

- `L0` is optional onboarding. Homepage and `/play` may link directly to `L1`.
- `L1-L5` allow anonymous play.
- `L6-L8` require authentication.
- `L5` unlock does not force sign-in immediately. The submit response may include `showRegisterPrompt: true`.
- The hard auth wall is enforced at `GET /api/challenge/6` and above.
- Submit-time scoring outages fail closed with `503 SCORING_UNAVAILABLE`.
- `VALIDATION_ERROR` does not consume the fetched session. The user may fix input and resubmit without re-fetching.
- `SESSION_EXPIRED` means the fetched session is dead. The user must re-fetch.
- `L5` is the **only** level where `primaryText` content is a JSON object string. The `SubmitForm` surface on L5 should render a JSON editor (or code-aware textarea with JSON highlighting). Result-page preview for L5 must `JSON.parse` and pretty-print the three fields — not section-header-split.
- `422 L5_INVALID_JSON` is L5-specific, does NOT consume the fetched session, and allows fix-and-retry with the same `fetchToken`. Error-state UI should echo the parser-position hint and warn explicitly against Markdown code fences.

## Home

### Anonymous

- Show `Start with L0` and `Start with L1`.
- `L0` is labeled optional and recommended.
- Show beta wording, not full-system wording.

### Authenticated

- Home may keep the current unauthenticated hero.
- If authenticated state is later surfaced on home, it must not change the server component contract.

## Play Hub

- Show `L0-L8` only.
- Mark `L0` as onboarding-only.
- Lock `L6-L8` for anonymous players.
- Locked competitive levels route to auth-required UX, not silent dead ends.

## Challenge Page

### Fetch states

- `loading` — skeleton for brief and metadata
- `ready` — brief, suggested time, session expiry, submit form
- `401 AUTH_REQUIRED` — hard-wall screen for `L6-L8`
- `403 LEVEL_LOCKED` — blocked state with next required level
- `403 FEATURE_NOT_PUBLIC` — beta-scope message for levels outside `L0-L8`
- `503 NO_CHALLENGES` — retry-later state
- `503 SCHEMA_NOT_READY` — service unavailable state

### Timer behavior

- Primary timer shown to the player is `suggestedTimeMinutes`.
- `deadlineUtc` is shown separately as the 24-hour hard ceiling.
- Going over suggested time does not lock the form and does not change score semantics.
- Refresh must preserve fetched-session state from the server response already tied to `fetchToken`.

## Submit States

### Success

- Render result card with color badge, numeric score, percentile when present, score breakdown, field feedback, and completion time.
- If `showRegisterPrompt === true`, open the post-L5 soft registration prompt.

### `400 VALIDATION_ERROR`

- Keep the same fetched session active.
- Show server message inline above the form.
- Do not force re-fetch.

### `422 L5_INVALID_JSON` (L5-only)

- Keep the same fetched session active. Does not consume the fetchToken.
- Show the server message inline above the L5 JSON editor, including the `parser_position` hint if present.
- Surface the warning "Do not wrap the JSON in Markdown code fences." prominently.
- Do not force re-fetch; the player may edit JSON and resubmit with the same `fetchToken`.

### `401 AUTH_REQUIRED`

- Treat as auth recovery requirement for competitive levels.

### `403 IDENTITY_MISMATCH`

- Show unrecoverable error for the current session.
- Require re-fetch under the correct identity.

### `408 SESSION_EXPIRED`

- Explain that the 24-hour session ceiling was reached.
- Primary CTA is `Fetch a new challenge`.

### `409 SESSION_ALREADY_SUBMITTED`

- Explain that the fetched session is consumed.
- Primary CTA is `Fetch a new challenge`.

### `429 RATE_LIMITED`

- Disable submit temporarily.
- Respect `Retry-After`.

### `503 SCORING_UNAVAILABLE`

- Explain that scoring is temporarily unavailable.
- Do not show partial scores.
- Require a new fetch before the next full scored attempt.

## L5 to L6 Transition

- The soft registration prompt is driven by the submit response flag `showRegisterPrompt`.
- The prompt appears only after an anonymous unlocked `L5` run.
- Dismissing the prompt does not block replaying `L1-L5`.
- `GET /api/challenge/6` without auth must render the hard wall.

## Anonymous Progress Transfer

- Anonymous `L1-L5` progression is browser-session scoped.
- If the player signs in from the same browser session after L5, beta behavior is to continue from the authenticated account in that browser context.
- Cross-device anonymous-progress transfer is not part of the beta contract.

## Leaderboard

- Desktop may use table layout.
- Mobile uses stacked cards, not horizontal-scroll tables.
- Canonical rank order is `highest_level` -> `best_score_on_highest` -> faster `solve_time_seconds`.
- Leaderboard rows link to player detail pages on both desktop and mobile.

## Player Detail and Profile

- `/leaderboard/[playerId]` is a public player-detail page.
- `/profile` is the authenticated owner page.
- `/profile` unauthenticated state uses the same email sign-in UI family as home/auth surfaces.
- `/api/profile` `401 UNAUTHORIZED` should present session-expired recovery UI without throwing away local form text immediately.

## Result Page Empty States

- If percentile is absent, hide the percentile block instead of rendering misleading placeholder text.
- If field-level feedback is absent, still show summary and score breakdown.
