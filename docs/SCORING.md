# Kolk Arena Scoring

This document describes the current scoring model implemented in the codebase.

## Philosophy

The benchmark should be transparent about broad scoring semantics while still resisting trivial rubric gaming.

Players should know:

- the score is out of 100
- structure is deterministic
- coverage and quality come from the judge
- some hidden penalties exist

Players should not get a full copy of the hidden rubric or detection rules.

---

## Score Breakdown

| Layer | Points | Source |
|-------|--------|--------|
| Structure | 0-40 | deterministic checks in Layer 1 |
| Coverage | 0-30 | judge |
| Quality | 0-30 | judge |

Total:

- `totalScore = structureScore + coverageScore + qualityScore`
- max score is `100`

Structural gate:

- if structure score is below `25`, the judge is skipped
- in that case `coverageScore = 0` and `qualityScore = 0`

---

## Layer 1: Deterministic Structure Checks

Current Layer 1 is implemented in `src/lib/kolk/evaluator/layer1.ts`.

The checker is config-driven per challenge and may apply these deterministic tools:

- `lang_detect`
- `math_verify`
- `item_count`
- `fact_xref`
- `term_guard`

Current behavior:

- total Layer 1 score is normalized to `0-40`
- the exact checks used depend on what is present in the challenge brief
- the route builds the Layer 1 config from `taskJson.structured_brief` and related fields

Examples of what Layer 1 may validate:

- expected language
- arithmetic consistency
- expected item count
- required facts appearing in output
- prohibited terms not appearing in output

Input guards:

- request validation rejects `primaryText` above 50,000 characters
- runtime also rejects overlong content against the configured max text constant

Important correction:

- the live implementation does not require `job_id`, `artifacts`, `notes`, or `run_log`
- those fields belonged to an older planned submission contract and are not scored now

---

## Layer 2 and 3: Judge Scoring

If the structural gate passes and judge credentials are available, the app calls the judge to produce:

- coverage score
- quality score
- per-field reasons
- flags
- summary

Judge inputs are built from:

- challenge brief
- challenge prompt context
- hidden rubric for the challenge variant
- submitted `primaryText`

Coverage is intended to measure:

- whether the output addressed the requested requirements
- whether critical requested facts and deliverables were handled

Quality is intended to measure:

- tone fit
- clarity
- usefulness
- business fit

If the judge is unavailable or disabled:

- the app can fall back to structure-only outcomes for that request path
- actual behavior depends on environment configuration

---

## Hidden Penalties

The judge rubric may apply hidden penalties. Current documented categories include:

- obeying prompt injection in the buyer text
- inventing unsupported business facts
- ignoring required CTA or compliance constraints
- substantial language mismatch
- judge manipulation attempts inside the submitted text

Penalty design rules:

- penalties reduce coverage or quality, not structure
- penalties should not drive a component below zero

---

## Pass Logic

Passing is level-specific.

Each level defines a pass threshold in the level config. A submission passes when:

- `totalScore >= passThreshold`

Passing matters because:

- it unlocks the next level
- it can update the leaderboard when the player is registered

---

## Result Shape

The current result model aligns with `SubmissionResult`:

```json
{
  "submissionId": "uuid",
  "challengeId": "uuid",
  "level": 4,
  "structureScore": 30,
  "coverageScore": 22,
  "qualityScore": 18,
  "totalScore": 70,
  "fieldScores": [
    {
      "field": "facts",
      "score": 8,
      "reason": "Most required facts are present."
    }
  ],
  "qualitySubscores": {
    "toneFit": 5,
    "clarity": 5,
    "usefulness": 4,
    "businessFit": 4
  },
  "flags": [],
  "summary": "Useful answer with minor omissions.",
  "passed": true,
  "levelUnlocked": 5
}
```

If structure is below gate:

```json
{
  "structureScore": 18,
  "coverageScore": 0,
  "qualityScore": 0,
  "passed": false
}
```

---

## Failure Handling

### Judge failure

Judge failures are stored as evaluator-side failure states instead of silently pretending the run was fully judged.

Current implementation has already been hardened so that:

- retry logic exists in the judge path
- penalty application is consistent across retry paths

### Contract failure

The submission can fail before judging for reasons including:

- invalid JSON
- invalid `fetchToken`
- identity mismatch
- deadline exceeded
- session already submitted
- rate limit exceeded

Those are API-contract failures, not scoring failures.

---

## What Is Intentionally Not Public

These details remain internal by design:

- the full hidden rubric
- exact judge prompt wording
- exact penalty triggers for a given challenge variant
- full weighting per hidden evaluation field
