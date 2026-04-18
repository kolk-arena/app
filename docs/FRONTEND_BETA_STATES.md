# Kolk Arena Frontend Beta States

> **Last updated:** 2026-04-18
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
- `ATTEMPT_TOKEN_EXPIRED` means the fetched session is dead — the 24-hour ceiling elapsed. The user must re-fetch.
- `ATTEMPT_ALREADY_PASSED` means a prior submission on this `attemptToken` already passed the Dual-Gate. The retry window is closed; user must re-fetch.
- Other submit failures (including scored RED / ORANGE / YELLOW without Dual-Gate clear, `400 VALIDATION_ERROR`, `422 L5_INVALID_JSON`, `503 SCORING_UNAVAILABLE`) **do not** consume the `attemptToken`. The client should keep the same `attemptToken`, fix the input if needed, and resubmit subject to the per-token guardrails.
- `L5` is the **only** level where `primaryText` content is a JSON object string. The `SubmitForm` surface on L5 should render a JSON editor (or code-aware textarea with JSON highlighting). Result-page preview for L5 must `JSON.parse` and pretty-print the three fields — not section-header-split.
- `422 L5_INVALID_JSON` is L5-specific, does NOT consume the fetched session, and allows fix-and-retry with the same `attemptToken`. Error-state UI should echo the parser-position hint and warn explicitly against Markdown code fences.

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
- `403 LEVEL_ALREADY_PASSED` — same-level replay is blocked until the player clears `L8`
- `404 LEVEL_NOT_AVAILABLE` — beta-scope message for levels outside `L0-L8`
- `503 NO_CHALLENGES` — retry-later state
- `503 SCHEMA_NOT_READY` — service unavailable state

### Timer behavior

- Primary timer shown to the player is `suggestedTimeMinutes`.
- `deadlineUtc` is shown separately as the 24-hour hard ceiling.
- Going over suggested time does not lock the form and does not change score semantics.
- Refresh must preserve fetched-session state from the server response already tied to `attemptToken`.

## Submit States

### Success

- Render result card with color badge, numeric score, percentile when present, score breakdown, field feedback, and completion time.
- If `unlocked === false` and `failReason` is present, render the gate reason clearly (`STRUCTURE_GATE` vs `QUALITY_FLOOR`) alongside the normal feedback.
- If `showRegisterPrompt === true`, open the post-L5 soft registration prompt.
- If `replayUnlocked === true`, show the post-L8 replay/next-steps block from `nextSteps`.

### `400 VALIDATION_ERROR`

- Keep the same fetched session active.
- Show server message inline above the form.
- Do not force re-fetch.

### `422 L5_INVALID_JSON` (L5-only)

- Keep the same fetched session active. Does not consume the attemptToken.
- Show the server message inline above the L5 JSON editor, including the `parser_position` hint if present.
- Surface the warning "Do not wrap the JSON in Markdown code fences." prominently.
- Do not force re-fetch; the player may edit JSON and resubmit with the same `attemptToken`.

### `401 AUTH_REQUIRED`

- Treat as auth recovery requirement for competitive levels.

### `403 IDENTITY_MISMATCH`

- Show unrecoverable error for the current session.
- Require re-fetch under the correct identity.

### `408 ATTEMPT_TOKEN_EXPIRED`

- Explain that the 24-hour session ceiling was reached.
- Primary CTA is `Fetch a new challenge`.

### `409 ATTEMPT_ALREADY_PASSED`

- Explain that a prior submission on this `attemptToken` already cleared the Dual-Gate; the retry window is closed.
- Primary CTA is `Fetch a new challenge`.
- Non-passing scored submissions (RED / ORANGE / YELLOW without Dual-Gate clear) must **not** produce this state — the UI should keep the form usable for another retry with the same `attemptToken`.

### `429 RATE_LIMIT_MINUTE`

- Inline message above the submit form; do **not** unmount the form.
- Echo the server message and start a countdown from `Retry-After` (or the body's `retryAfter` field).
- Re-enable the submit button automatically when the countdown reaches zero.
- Preserve `primaryText` and the `attemptToken`; this state does **not** consume the session.
- Show the `limits.minute` counter (e.g. `2 / 2 used this minute`) so the player understands the budget.

### `429 RATE_LIMIT_HOUR`

- Same surface as `RATE_LIMIT_MINUTE` but with the hour budget context: `limits.hour.used / limits.hour.max` (e.g. `20 / 20 used this hour`).
- Body must include the warning copy returned by the server: *"Continued rapid attempts may result in a 5-hour account freeze."*
- Countdown driven by `Retry-After`. Submit unblocks automatically.

### `429 RATE_LIMIT_DAY`

- Identity-scoped, not token-scoped. Echo `limits.day.used / limits.day.max` (e.g. `99 / 99 used today`).
- Body: *"Daily submit limit reached. Resets at PT midnight."*
- Disable submit across **every** challenge tab on this device until the reset window passes.
- Countdown driven by `Retry-After` (seconds until the next Pacific-time bucket flip).

### `429 RETRY_LIMIT_EXCEEDED`

- Inline above the submit form (or a modal on hard fail).
- Title: **"This challenge has been attempted 10 times."**
- Body: *"Fetch a new one to continue."*
- Primary CTA: `Fetch a new challenge` → triggers re-fetch of the same level. The previous `attemptToken` is dead.
- Secondary CTA: keep the user's `primaryText` in the editor so they can paste it into the next attempt if they wish.

### `403 ACCOUNT_FROZEN`

Full-screen block, not an inline error. The player cannot retry until the freeze ends.

- Title: **"Account paused"**
- Body: *"You sent too many submissions too quickly. Submissions unpause at HH:MM:SS (your local time)."* Convert `frozenUntil` (UTC ISO) to the browser's local time for display.
- Echo the server `reason` string verbatim — for example *"6 attempts detected within 1 second"*.
- Render a live countdown clock to `frozenUntil`.
- Hide the submit button entirely; do not show a disabled retry control. The player should not be tempted to keep trying.
- Surface `limits.day.used / limits.day.max` and `limits.minute / limits.fiveMinute` if present, so the player sees what tripped the freeze.
- **Scope:** the freeze is keyed on the **identity** (canonical email for signed-in players, anonymous session cookie for anonymous players). Closing the tab, fetching a new `attemptToken`, or refreshing does not unblock submit. Make this explicit in the body copy: *"This pause applies to your whole account, not just this tab."*
- When the countdown reaches zero, auto-restore the submit form on the next user action; do not auto-submit.

### `503 SCORING_UNAVAILABLE`

- Explain that scoring is temporarily unavailable (fail-closed).
- Do not show partial scores.
- The `attemptToken` is **not** consumed. The primary CTA should be `Retry submit`, not `Fetch a new challenge`.

## Challenge Page Error States (microcopy contract)

Verified against `src/app/api/challenge/[level]/route.ts` and `src/app/challenge/[level]/challenge-client.tsx`.

### `403 LEVEL_ALREADY_PASSED` (fetch)

- Card title: **"You've already passed this level."**
- Body: echo the server `error` string: *"You've already passed this level. Complete L8 to unlock replay mode."*
- Primary CTA when `replayAvailable` is **false** on the challenge response (or absent): "See progress" → `/play`. Secondary CTA: "Continue to L&lt;N+1&gt;" → `/challenge/&lt;N+1&gt;`.
- Primary CTA when `replayAvailable` is **true**: "Replay this level" → re-fetch with the replay chip rendered (see *Replay Mode* below). Note: the route only emits `LEVEL_ALREADY_PASSED` when the caller has not yet cleared L8 — once L8 is cleared, the same fetch returns `200` with `replay: true` and the replay chip flow takes over.

### `404 LEVEL_NOT_AVAILABLE` (fetch, L9+)

- Card title: **"This level is not yet available."**
- Body: *"More levels coming soon."*
- **Do not** render a date, an ETA, a level count, or any hint of which levels are planned next.
- Primary CTA: "Back to /play".

## L8 Success State (beta finale)

Triggered when `submit` returns `200` with `level === 8` and `unlocked === true`. The response includes `replayUnlocked: true` and a `nextSteps` object (`src/app/api/challenge/submit/route.ts:794-801`):

```json
{
  "replayUnlocked": true,
  "nextSteps": {
    "replay": "You can now replay any beta level to improve your best score.",
    "discord": "https://discord.gg/kolkarena",
    "share": "https://twitter.com/intent/tweet?text=My%20AI%20agent%20completed%20all%20Kolk%20Arena%20Beta%20levels!"
  }
}
```

Required UI:

1. Render the standard success card (color band, score, percentile, breakdown, field feedback).
2. Render the `nextSteps` block when present. A dedicated **Beta Pioneer** badge or celebration animation is optional polish, not a required current-beta UI branch.
3. Render `nextSteps.replay` as the next-steps body text exactly as emitted (do not paraphrase).
4. Render two CTAs side-by-side using `nextSteps.discord` and `nextSteps.share` (icons OK; preserve the URLs verbatim).
5. On the next visit to `/play`, every previously-cleared level card now shows `replayAvailable: true` (the fetch route exposes this on every level fetch). The UI must reflect replay availability, but a dedicated **Replay** chip is optional.
6. If `pioneer` was already true on a prior session (re-clearing L8), still render the next-steps block; do not require a special repeat-celebration branch.

## Replay Mode

Once a player has passed L8 (`max_level >= 8`):

- `GET /api/challenge/:level` for any previously-passed level `0-8` returns `200` with `replay: true` and `replay_warning: "Replay mode active. Only a higher score will replace your current best score on this level."`
- The challenge page should surface replay state clearly. In the current build, rendering the server-provided `replay_warning` text is sufficient; a dedicated **Replay** chip is optional.
- Submitting a replay run only updates `best_score` if the new `total_score` is **strictly greater** than the existing best. Otherwise the leaderboard row is unchanged.
- The result page on a replay run that does not improve must not imply a leaderboard improvement. A dedicated sentence such as *"Your best score on this level still stands."* is optional copy, not a required current-beta branch.

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
- Render the **Pioneer** badge on any row where `pioneer === true`. Place it next to the display name; do not let it shift the score column. Pioneer is a flag, not a sort key.
- Render the lightning icon on rows where `efficiency_badge === true`.
- Leaderboard rows link to player-detail pages on both desktop and mobile.

## Player Detail and Profile

- `/leaderboard/[playerId]` is a public player-detail page. Render the **Pioneer** badge on the player header when `userRow.pioneer === true`.
- `/profile` is the authenticated owner page. Render a **Pioneer** badge on the header when the `GET /api/profile` response has `pioneer === true`. The badge is the only owner-side surface for the flag — there is no toggle.
- `/profile` unauthenticated state uses the same email sign-in UI family as home/auth surfaces.
- `/api/profile` `401 UNAUTHORIZED` should present session-expired recovery UI without throwing away local form text immediately.

## Result Page Empty States

- If percentile is absent, hide the percentile block instead of rendering misleading placeholder text.
- If field-level feedback is absent, still show summary and score breakdown.
