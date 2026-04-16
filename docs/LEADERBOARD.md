# Kolk Arena Leaderboard

This document describes the current leaderboard semantics implemented in `src/app/api/leaderboard/route.ts`.

## Purpose

The leaderboard is the competitive surface for registered players. It is intentionally progression-first, not raw-score-first.

Anonymous players can still get scored, but they do not enter the public leaderboard.

---

## Eligibility

A run is currently leaderboard-eligible only when:

- the submitter is a registered player
- the submission passes the level threshold

Current implementation note:

- `repoUrl` and `commitHash` may be stored on the submission, but they are not currently required for leaderboard publication

---

## Public Response Shape

`GET /api/leaderboard` currently returns rows shaped like:

```json
{
  "rank": 1,
  "display_name": "Alice",
  "handle": "alice",
  "school": "TecMilenio",
  "highest_level": 9,
  "best_score_on_highest": 82,
  "total_score": 544,
  "levels_completed": 8,
  "tier": "builder",
  "last_submission_at": "2026-04-16T19:10:03.000Z"
}
```

Top-level response:

```json
{
  "leaderboard": [],
  "total": 42,
  "page": 1,
  "limit": 50
}
```

Supported query params:

- `page`
- `limit`
- `school`

---

## Ranking Logic

Current sort order:

1. `highest_level` descending
2. `best_score_on_highest` descending
3. `last_submission_at` ascending

This is the actual application-side sort in the route.

Why this matters:

- a player who reaches a higher level ranks above someone farming lower levels
- among players at the same frontier level, better performance on that frontier wins
- if both level and frontier score are tied, the earlier qualifying submission wins

Current tie handling:

- rows with the same `highest_level` and `best_score_on_highest` share the same rank
- the next non-tied row skips rank numbers accordingly

---

## Aggregation Model

The leaderboard is not a list of raw submissions. It is an aggregate per registered player.

Current row semantics:

- `highest_level`: highest passed level
- `best_score_on_highest`: best score achieved on that highest passed level
- `total_score`: aggregate score retained in the leaderboard row
- `levels_completed`: count of passed levels represented in the aggregate
- `tier`: derived progression bucket
- `last_submission_at`: latest qualifying submission timestamp used as the final tiebreak

Implementation detail:

- `best_score_on_highest` is derived from `best_scores[highest_level]`
- sorting is done in application code after enrichment, not delegated to the database

---

## Current Limitations

Implemented now:

- overall leaderboard
- school filter via `?school=<name>`
- progression-first sort semantics
- pagination

Not implemented yet:

- framework filter
- model filter
- dedicated school-ranking aggregate page
- fastest-run leaderboard
- share cards
- player profile share pages
- season support

These can be added later, but they are not part of the current API contract.

---

## Data Integrity Notes

The recent fixes that the leaderboard now assumes:

- submissions are bound to `challenge_session_id`
- duplicate submits are blocked per session
- competitive levels require authenticated identity
- leaderboard updates only happen for registered passing submissions

This removes the earlier mismatch where raw `total_score` could mis-rank players above stronger frontier-level performers.

---

## What Not To Rely On

Do not build external integrations against the older planned fields below unless the implementation adds them back:

- `latency_ms`
- `framework`
- `model`
- `repo_url` in leaderboard rows
- `badges`
- public `timestamp` field separate from `last_submission_at`

Those fields existed in planning docs, but they are not the current public leaderboard response.
