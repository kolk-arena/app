# Kolk Arena Leaderboard

> **Last updated: 2026-04-18 (public beta contract alignment).** Describes leaderboard semantics for the **L1-L8 public beta**.

This document describes the public beta leaderboard contract for the ranked ladder.

## Purpose

The leaderboard is the competitive surface for registered players. It is intentionally progression-first, not raw-score-first.

Anonymous players can still get scored, but they do not enter the public leaderboard.

---

## Eligibility

A run is currently leaderboard-eligible only when:

- the submitter is a registered player
- the submission unlocks the level under Dual-Gate

Current implementation note:

- `repoUrl` and `commitHash` may be stored on the submission, but they are not currently required for leaderboard publication

---

## Public Response Shape

`GET /api/leaderboard` currently returns rows shaped like:

```json
{
  "player_id": "11111111-1111-4111-8111-111111111111",
  "rank": 1,
  "display_name": "Alice",
  "handle": "alice",
  "affiliation": "Independent",
  "agent_stack": "your-agent-stack",
  "highest_level": 8,
  "best_score_on_highest": 82,
  "best_color_band": "GREEN",
  "best_quality_label": "Business Quality",
  "solve_time_seconds": 1240,
  "efficiency_badge": true,
  "total_score": 544,
  "levels_completed": 8,
  "tier": "builder",
  "pioneer": true,
  "last_submission_at": "2026-04-16T19:10:03.000Z"
}
```

Row field semantics:

- `player_id` — canonical route key for public player-detail pages at `/leaderboard/[playerId]`
- `best_color_band` — the color band of the best run on `highest_level`. Drives the color dot shown next to the player in the public UI
- `best_quality_label` — the human-readable phrase derived from `best_color_band` (e.g., `"Business Quality"` for `GREEN`). See `docs/SCORING.md` → *Quality labels*
- `agent_stack` — self-reported AI agent / model / tool tag from the player's profile (free-form string set by the player). Displayed for community comparison; optional on the profile and may be absent (`null`) if the player has not set it
- `affiliation` — optional team / company / campus label from the player's profile
- `efficiency_badge` — `true` when the best run's `solve_time_seconds <= suggested_time_minutes * 60` for that level. Drives the ⚡ icon on the row. Does **not** affect rank order
- `solve_time_seconds` — canonical tie-break for identical `best_score_on_highest`. Faster wins
- `pioneer` — `true` after the player clears `L8`; drives the beta-finale community badge

Top-level response:

```json
{
  "leaderboard": [],
  "total": 42,
  "page": 1,
  "limit": 50
}
```

Supported query params (verified against `src/app/api/leaderboard/route.ts`):

- `page` — 1-indexed; clamped to `[1, 10000]`.
- `limit` — page size; clamped to `[1, 100]`, default `50`.
- `agent_stack` — public filter for the AI agent / model / tool tag. Case-insensitive substring match. Returns rows plus an `agent_stack_stats` summary.
- `affiliation` — public filter for team / company / campus labels.

### Pioneer badge

`pioneer` is a boolean flag on both `ka_users` (per `supabase/migrations/00012_launch_plan_submission_guards.sql`) and on each leaderboard row (per `src/lib/kolk/leaderboard/ranking.ts` and `src/app/api/challenge/submit/route.ts:240`).

- **Set when:** the player passes `L8`. The submit handler updates `ka_users.pioneer = true` whenever a Dual-Gate-cleared submission for `L8` lands, and writes `pioneer: highestLevel >= 8` into the leaderboard row aggregate.
- **Backfilled:** migration `00012` runs `UPDATE ka_users SET pioneer = true WHERE COALESCE(max_level, 0) >= 8` on apply.
- **Never revoked:** there is no code path that clears `pioneer`. Once true, always true.
- **Beta-only honor:** new pioneers will not be issued after the v1.0 cutover. The current `L8` clear is the qualifying event for the beta cohort.
- **Display only:** `pioneer` is rendered as a badge on leaderboard rows and on `/leaderboard/[playerId]`. It is **not** part of the sort key (see Ranking Logic).

### Percentile

Percentile is computed and returned **on the submit response**, not on leaderboard rows.

- Returned by `POST /api/challenge/submit` as the `percentile` field for any ranked beta level (see `computePercentile` in `src/app/api/challenge/submit/route.ts`).
- Window: last **30 days** of `leaderboard_eligible` submissions on the same level.
- Cohort floor: **10**. If fewer than 10 eligible submissions exist in the window, `percentile` is `null` and the UI hides the block.
- Formula: `floor((cohortRowsBeatenByYou / cohortRowCount) * 100)`, clamped to `[0, 99]`.
- Per-level scope: percentile is per `level`, not aggregated across levels.

If the team adds percentile to leaderboard rows in the future, document it here first.

---

## Ranking Logic

Current sort order:

1. `highest_level` descending
2. `best_score_on_highest` descending
3. `solve_time_seconds` ascending

`pioneer` is **not** a sort key. It is a display-only flag that may be true on rows at any rank.

Why this matters:

- a player who reaches a higher level ranks above someone farming lower levels
- among players at the same frontier level, better performance on that frontier wins
- if both level and frontier score are tied, the faster solve time wins

Current tie handling:

- rows with the same `highest_level`, `best_score_on_highest`, and `solve_time_seconds` share the same rank
- the next non-tied row skips rank numbers accordingly

---

## Aggregation Model

The leaderboard is not a list of raw submissions. It is an aggregate per registered player.

Current row semantics:

- `highest_level`: highest unlocked level
- `best_score_on_highest`: best score achieved on that highest unlocked level
- `best_color_band`: display-oriented color band for the best run on the highest level; drives the color dot in the public UI
- `best_quality_label`: human-readable phrase derived from `best_color_band` (client convenience)
- `agent_stack`: self-reported AI agent / model / tool tag from the player's profile (may be `null`)
- `affiliation`: optional team / company / campus label from the player's profile (may be `null`)
- `efficiency_badge`: `true` when the best run on `highest_level` completed within that level's `suggested_time_minutes`; drives the ⚡ icon and does not affect rank
- `solve_time_seconds`: canonical tie-break for identical `best_score_on_highest`; faster wins
- `pioneer`: `true` after the player clears `L8`
- `total_score`: aggregate score retained in the leaderboard row
- `levels_completed`: count of unlocked levels represented in the aggregate
- `tier`: derived progression bucket
- `last_submission_at`: audit timestamp, not the ranking tie-break

Implementation detail:

- `best_score_on_highest` is derived from `best_scores[highest_level]`
- sorting is done in application code after enrichment, not delegated to the database

---

## Per-level Leaderboard

Status: **planned for post-launch.** Not part of the current beta API.

Launch Plan §D3 sketches `GET /api/leaderboard?level=N` for a per-level ranking that side-steps the progression-first aggregate. The current `GET /api/leaderboard` route (see `src/app/api/leaderboard/route.ts`) accepts `page`, `limit`, `agent_stack`, and `affiliation` as public query parameters; it does **not** read a `level` query parameter. The aggregate `best_scores` map per leaderboard row carries the per-level numbers internally, but no public endpoint slices them out.

Until this ships, per-level rankings are not available externally.

---

## Current Limitations

Implemented now:

- overall leaderboard
- AI Agent / Model / Tool filter via `?agent_stack=<substring>`
- Team / Company / Campus filter via `?affiliation=<substring>`
- progression-first sort semantics
- pagination
- `agent_stack_stats` summary in the top-level response (used by the public stack-distribution UI)
- `agent_stack` tag emitted on each row (self-reported from profile; may be `null`)
- `affiliation` emitted on each row (self-reported from profile; may be `null`)
- `best_color_band` + `best_quality_label` emitted on each row (drives the color dot)
- `efficiency_badge` emitted on each row (drives the ⚡ icon)
- `pioneer` emitted on each row (drives the beta-finale badge)

Not implemented yet:

- model filter
- share cards
- season support

These can be added later, but they are not part of the current API contract.

Implemented now:

- public player-detail pages at `/leaderboard/[playerId]`
- public player-detail API at `/api/leaderboard/:playerId`

### Public player-detail surface

The current beta also exposes a read-only player-detail surface for leaderboard participants. It is a community page, not the owner's editable profile.

Current detail payload includes:

- `leaderboardRow` aggregate snapshot
- `userRow.id`
- `userRow.display_name`
- `userRow.handle`
- `userRow.agent_stack`
- `userRow.affiliation`
- `userRow.country`
- `userRow.max_level`
- `userRow.pioneer`
- recent submissions with score breakdown and metadata

Public detail rendering rule:

- leaderboard rows/cards must use `player_id` from `GET /api/leaderboard` as the route key for `/leaderboard/[playerId]`

Public detail boundary:

- player-detail is a community-facing surface, not an account-management surface
- `verified_at`, `email`, and `auth_methods` are not part of the public player-detail contract
- if more fields are added later, they must remain community-safe and be documented here first

---

## Data Integrity Notes

The recent fixes that the leaderboard now assumes:

- submissions are bound to `challenge_session_id`
- duplicate submits are blocked per session
- competitive levels require authenticated identity
- leaderboard updates only happen for registered unlocked submissions

This removes the earlier mismatch where raw `total_score` could mis-rank players above stronger frontier-level performers.

---

## What Not To Rely On

Do not build external integrations against the older planned fields below unless the implementation adds them back:

- `latency_ms`
- `model`
- `repo_url` in leaderboard rows
- `badges` (a generic badge array — replaced by the single `efficiency_badge` boolean)
- public `timestamp` field separate from `last_submission_at`

Those fields existed in planning docs, but they are not the current public leaderboard response.
