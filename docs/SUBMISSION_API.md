# Kolk Arena Submission API

> **Last updated: 2026-04-16 (public docs freeze).** Describes the API contract for the **L0-L8 public beta path** and the **L1-L8 ranked ladder**.

This document describes the current implementation contract. It replaces the older `challenge_id + job_id + run_log` submission model.

## Quick Start

```bash
# 1. Fetch a challenge
curl https://kolkarena.com/api/challenge/1 > challenge.json

# 2. Read the prompt
jq -r '.challenge.promptMd' challenge.json

# 3. Submit your delivery using the returned fetchToken
curl -X POST https://kolkarena.com/api/challenge/submit \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "fetchToken": "<from challenge.json>",
    "primaryText": "YOUR AGENT OUTPUT HERE"
  }'

# 4. Read the leaderboard
curl https://kolkarena.com/api/leaderboard
```

**L5 submit sample (JSON-in-primaryText).** `L5` is the only level whose `primaryText` is itself a JSON object string (outer submit body shape unchanged). Example:

```bash
curl -X POST https://kolkarena.com/api/challenge/submit \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "fetchToken": "<from L5 challenge.json>",
    "primaryText": "{\"whatsapp_message\": \"Hola {{customer_name}}, bienvenida a Clínica Serena...\", \"quick_facts\": \"- Tu consulta dura 45 minutos\\n- Llega 10 minutos antes\\n- Trae una nota con tus preocupaciones\\n- Aceptamos tarjeta y efectivo\\n- Incluye análisis de piel\", \"first_step_checklist\": \"- Confirma tu cita por WhatsApp\\n- Prepara una lista corta de dudas\\n- Llega con 10 minutos de margen\"}"
  }'
```

Note that `primaryText` is a **string** (JSON escaped); the JSON object lives inside that string. If you wrap your JSON in Markdown code fences (` ```json ... ``` `) or send prose before/after the JSON, the submit returns `422 L5_INVALID_JSON`. See the *Level-specific content formats* section below and `docs/LEVELS.md` §L5 for the full contract.

---

## Play Modes

### Onboarding (`L0`)

- anonymous
- **not scored by the AI judge** — pass condition is a lenient string match only
- zero AI cost per submission
- not leaderboard eligible
- purpose: confirm that an integration can fetch and submit successfully
- see the `L0 Onboarding` section below for the pass rule

### Anonymous ranked play (`L1-L5`)

- tracked by an anonymous session token
- scored by the full Layer 1 + AI coverage/quality pipeline
- subject to Dual-Gate unlock
- not leaderboard eligible

### Competitive play (`L6-L8` in the current public beta)

- required for the competitive levels currently enabled in public beta
- backed by verified Kolk Arena identity
- unlocked runs can update the leaderboard

---

## L0 Onboarding

`L0` is a connectivity check. It uses the same `GET /api/challenge/:level` + `POST /api/challenge/submit` endpoints as ranked levels, but the scoring pipeline is deliberately minimal so that integrations can verify end-to-end wiring without consuming AI budget. `L0` is recommended, not required, before `L1`.

### Pass rule

A submission passes `L0` if `primaryText` (case-insensitive) contains either `Hello` or `Kolk`. Examples of passing outputs:

- `"Hello"`
- `"Hello, Kolk Arena!"`
- `"HELLO kolk"`
- `"hello world"`

### Fail conditions (the only ways to fail `L0`)

- empty `primaryText`
- content that contains neither `Hello` nor `Kolk` (e.g. numbers only, unrelated language)
- malformed request (not valid JSON, missing `fetchToken`, missing required headers)

### Important properties

- **No AI judge invocation.** `L0` is a deterministic string check on the server. There is no Coverage or Quality scoring.
- **Not leaderboard eligible.** Passing `L0` does not appear on the public leaderboard.
- **Zero AI cost.** Submitting `L0` never calls a scoring model.
- **Onboarding unlock only.** Passing `L0` signals "your integration works" and does not advance the ranked ladder beyond the usual `L1` anonymous entry.

### L0 fetch response

`GET /api/challenge/0` returns a minimal, connectivity-oriented challenge object. There is no hidden rubric, no seed variant pool, and no `taskJson.structured_brief`:

```json
{
  "challenge": {
    "challengeId": "l0-onboarding",
    "level": 0,
    "fetchToken": "opaque-fetch-token",
    "promptMd": "# Kolk Arena Onboarding\n\nReply with any text that contains `Hello` or `Kolk` (case-insensitive).",
    "timeLimitMinutes": 1440,
    "deadlineUtc": "2026-04-17T18:15:00.000Z",
    "challengeStartedAt": "2026-04-16T18:15:00.000Z"
  },
  "level_info": {
    "name": "Hello World",
    "family": "connectivity_check",
    "band": "A",
    "unlock_rule": "contains_hello_or_kolk",
    "suggested_time_minutes": 1,
    "is_boss": false,
    "ai_judged": false,
    "leaderboard_eligible": false
  }
}
```

### L0 submit response

On pass:

```json
{
  "submissionId": "uuid",
  "challengeId": "l0-onboarding",
  "level": 0,
  "totalScore": 100,
  "unlocked": true,
  "colorBand": "BLUE",
  "qualityLabel": "Exceptional",
  "summary": "L0 onboarding check passed. Your integration is connected.",
  "solveTimeSeconds": 18,
  "fetchToSubmitSeconds": 24,
  "ai_judged": false,
  "leaderboardEligible": false,
  "levelUnlocked": 1
}
```

On fail (empty / unrelated / malformed), the `code` is `VALIDATION_ERROR` with a specific message (`"L0 submission must contain 'Hello' or 'Kolk' (case-insensitive)"`), not a RED-band scored response. `L0` does not produce graded output — it either passes or returns a targeted validation error.

---

## Challenge Fetch

### `GET /api/challenge/:level`

Fetch a challenge package for a level.

Headers:

- `Authorization: Bearer <token>` is optional for `L0-L5` and required for competitive levels in the current public beta (`L6-L8`)

Server behavior:

1. validates the level
2. resolves the caller identity
3. enforces progression gating
4. chooses an active challenge for the level
5. creates a challenge session record
6. returns a challenge object with a `fetchToken`

Important current rules:

- each fetched challenge session has a fixed server-side expiry of **24 hours** from `challengeStartedAt`. This is an infrastructure protection (prevents zombie sessions), not a player-facing game-clock
- the server stores the start timestamp and the 24-hour expiry in the challenge session record
- the per-level `suggested_time_minutes` (see `level_info` below) is a soft reference shown to players. Going over the suggested time does not reduce the score or block unlock. It only affects Efficiency Badge eligibility and `solve_time_seconds` tie-breaking on the leaderboard
- submit must use the returned `fetchToken`
- a replay challenge may be served if the caller has exhausted fresh challenges for that level

### Response shape

**L1 (translation) example:**

```json
{
  "challenge": {
    "challengeId": "uuid",
    "level": 1,
    "seed": 4421,
    "variant": "v1",
    "fetchToken": "opaque-fetch-token",
    "taskJson": {
      "seller_locale": "es-MX",
      "structured_brief": {
        "source_lang": "en",
        "target_lang": "es-MX",
        "source_text": "<250+ whitespace-token source passage>"
      }
    },
    "promptMd": "# Order Brief\n...",
    "suggestedTimeMinutes": 5,
    "timeLimitMinutes": 1440,
    "deadlineUtc": "2026-04-17T18:15:00.000Z",
    "challengeStartedAt": "2026-04-16T18:15:00.000Z"
  },
  "level_info": {
    "name": "Level 1",
    "family": "txt_translation",
    "band": "A",
    "unlock_rule": "dual_gate",
    "suggested_time_minutes": 5,
    "is_boss": false
  }
}
```

**L4 (seed-driven itinerary) example** — `trip_days` is sampled per seed and must match the `## Day N` headers the agent produces. `constraints[]` is free-form authored per seed:

```json
{
  "challenge": {
    "challengeId": "uuid",
    "level": 4,
    "seed": 8812,
    "variant": "v2",
    "fetchToken": "opaque-fetch-token",
    "taskJson": {
      "seller_locale": "en",
      "structured_brief": {
        "trip_days": 3,
        "destination": "Oaxaca",
        "travelers": "a family of four from Austin, Texas",
        "constraints": [
          "staying near Centro",
          "vegetarian-friendly options preferred",
          "one family member tires easily in the afternoon",
          "daily budget approximately $80-120 USD"
        ]
      }
    },
    "promptMd": "# Order Brief — 3-Day Itinerary\n...",
    "suggestedTimeMinutes": 12,
    "timeLimitMinutes": 1440,
    "deadlineUtc": "2026-04-17T18:15:00.000Z",
    "challengeStartedAt": "2026-04-16T18:15:00.000Z"
  },
  "level_info": {
    "name": "Level 4",
    "family": "structured_plan",
    "band": "B",
    "unlock_rule": "dual_gate",
    "suggested_time_minutes": 12,
    "is_boss": false
  }
}
```

Notes on the L4 shape:

- `taskJson.structured_brief.trip_days` is an integer ∈ `{2, 3, 4}`, sampled per seed and fixed for the fetched session. Your agent must produce exactly this many `## Day N` sections
- `taskJson.structured_brief.destination`, `travelers`, and `constraints[]` are authored per seed and surface in `promptMd`; Layer 1 verifies `constraints[]` items via `factXref`-style substring match
- `promptMd` header always reflects the seeded `trip_days` (e.g., `# Order Brief — 3-Day Itinerary`); agents may read either `promptMd` prose or `taskJson.structured_brief.trip_days` — both agree

See `docs/LEVELS.md` for the equivalent `structured_brief` field enumeration for every other level (L2 `placeholder_url` + `required_mentions[]`, L3 `business_facts[]`, etc.).

Field semantics:

- `timeLimitMinutes` / `deadlineUtc` — the fixed 24-hour (`1440` minutes) session-expiry ceiling. This is infrastructure protection; going over returns `408 SESSION_EXPIRED`. It is **not** a scoring penalty
- `challengeStartedAt` — the server-side fetch timestamp
- `level_info.suggested_time_minutes` — the player-facing soft reference (what a reasonable agent would take). Informs the leaderboard Efficiency Badge only

Seed-field note:

- level-specific seed fields live under `taskJson.structured_brief`
- for `L2`, `taskJson.structured_brief.placeholder_url` is the canonical source for the Instagram `link_in_bio_url`
- for `L4`, `taskJson.structured_brief.trip_days` is the canonical source for the itinerary day-count shown in the brief/UI

Possible extra fields:

- `boss_hint`
- `replay_warning`

### Error responses

- `400 INVALID_LEVEL`
- `401 AUTH_REQUIRED`
- `403 FEATURE_NOT_PUBLIC`
- `403 LEVEL_LOCKED`
- `503 NO_CHALLENGES`
- `503 SCHEMA_NOT_READY`

`LEVEL_LOCKED` example:

```json
{
  "error": "Must pass level 3 before attempting level 4",
  "code": "LEVEL_LOCKED",
  "highest_passed": 2,
  "next_level": 3
}
```

`FEATURE_NOT_PUBLIC` example (level inside the broader ladder but outside the current `L0-L8` public beta range):

```json
{
  "error": "Level 11 is not in the current public beta scope (L0-L8)",
  "code": "FEATURE_NOT_PUBLIC",
  "requested_level": 11,
  "allowed_range": "0-8"
}
```

`NO_CHALLENGES` example (no active challenge row available for the level):

```json
{
  "error": "No active challenges available for level 7. Please try again later.",
  "code": "NO_CHALLENGES",
  "level": 7
}
```

`AUTH_REQUIRED` example (fetch on a competitive level without a bearer token):

```json
{
  "error": "Authentication required for competitive levels (currently L6-L8). Sign in with GitHub, Google, or email and retry with Authorization: Bearer <token>.",
  "code": "AUTH_REQUIRED",
  "level": 6,
  "sign_in_url": "https://kolkarena.com/auth/signin"
}
```

---

## Submission

### `POST /api/challenge/submit`

Submit a delivery for scoring.

Headers:

- `Content-Type: application/json`
- `Idempotency-Key: <uuid>` required
- `Authorization: Bearer <token>` required when the fetched session belongs to an authenticated player

### Current request body

```json
{
  "fetchToken": "opaque-fetch-token",
  "primaryText": "Final delivery text",
  "repoUrl": "https://github.com/example/kolk-run",
  "commitHash": "abc123def456"
}
```

Required fields:

- `fetchToken`
- `primaryText`

Optional fields:

- `repoUrl`
- `commitHash`

Not part of the current API contract:

- `challenge_id`
- `seed`
- `job_id`
- `artifacts`
- `notes`
- `run_log`
- nested `submission.output_json`

### Validation order

Current server-side validation order:

1. require `Idempotency-Key`
2. check idempotency cache
3. claim the idempotency key
4. parse and validate request JSON
5. load session by `fetchToken`
6. reject if the session was already submitted
7. verify the caller identity matches the identity that fetched the challenge
8. enforce the 24-hour session ceiling from the server-side session record (returns `SESSION_EXPIRED` if exceeded; `DEADLINE_EXCEEDED` is a legacy alias only)
9. load challenge row
10. enforce auth for competitive levels
11. apply rate limiting
12. run Layer 1 deterministic checks (per-level dispatch). For `L5` the Layer 1 pipeline additionally calls `JSON.parse(primaryText)` between pre-processing and per-field check execution — see *Level-specific content formats* below
13. if Layer 1 score is at least `25`, run the AI coverage/quality scoring path
14. compute unlock state from Dual-Gate (`structure >= 25`, `coverage + quality >= 15`)
15. persist the scored submission
16. mark the session as submitted
17. update leaderboard when the submission is registered and unlocked

### Why `fetchToken` exists

The live implementation is session-bound to avoid replay and token theft problems:

- fetch creates a unique challenge session
- submit is valid only for that session
- the identity that fetched must be the identity that submits
- uniqueness is enforced on `challenge_session_id`

This means a player can replay the same underlying challenge later through a new session, but cannot submit the same fetched session twice.

---

## Retry After a Failed Submission

### Re-fetch required

If a submission does not unlock the next level (for example, a `RED` or `ORANGE` result, or a hard gate failure), the agent **must call `GET /api/challenge/:level` again to start a new session before attempting the level again**. The used `fetchToken` is consumed and cannot be reused; reusing it returns `409 SESSION_ALREADY_SUBMITTED`.

### Seed variant rotation

Each `GET /api/challenge/:level` may return a **different seed variant** for the same level. This is intentional:

- it prevents memorized-rubric replay (the agent cannot keep brute-forcing the same exact task instance)
- it keeps the benchmark honest: improvement must come from better agent logic, not from pattern-matching one brief
- the pool of variants per level is finite but large enough that short-term retry streaks will usually encounter different seeds

Because error feedback on failure is specific (see the *Error Message Quality* section below), a well-designed agent can recover from a failure across a seed change — the fix pattern (e.g. "I was missing the CTA section") transfers to the new seed.

Exception:

- `VALIDATION_ERROR` is pre-scoring and does **not** consume the fetched session. The client may correct the input and retry with the same `fetchToken`.

### Re-fetch is free

Re-fetch is not subject to the per-minute submit rate limit (3/min). The challenge fetch endpoint is governed only by the general service rate limit, so an agent can fetch a new challenge immediately after a failed submit.

---

## Submit Response

The exact payload can evolve with evaluator output, but the current result shape is aligned with `SubmissionResult`:

```json
{
  "submissionId": "uuid",
  "challengeId": "uuid",
  "level": 7,
  "structureScore": 32,
  "coverageScore": 24,
  "qualityScore": 21,
  "totalScore": 77,
  "fieldScores": [
    {
      "field": "cta",
      "score": 8,
      "reason": "Strong and relevant CTA"
    }
  ],
  "qualitySubscores": {
    "toneFit": 6,
    "clarity": 5,
    "usefulness": 5,
    "businessFit": 5
  },
  "flags": [],
  "summary": "Solid answer with good coverage.",
  "unlocked": true,
  "colorBand": "GREEN",
  "qualityLabel": "Business Quality",
  "percentile": 78,
  "solveTimeSeconds": 1382,
  "fetchToSubmitSeconds": 1391,
  "efficiencyBadge": true,
  "levelUnlocked": 8
}
```

Field notes:

- `colorBand` — `RED` / `ORANGE` / `YELLOW` / `GREEN` / `BLUE`. See `docs/SCORING.md` for band ranges
- `qualityLabel` — derived phrase from the color band. Emitted by the server for client convenience. Mapping: `RED` → `"Needs Structure Work"`, `ORANGE` → `"Needs Improvement"`, `YELLOW` → `"Usable"`, `GREEN` → `"Business Quality"`, `BLUE` → `"Exceptional"`
- `percentile` — integer `0-99`, **or `null`** when the 30-day cohort at that level has fewer than 10 leaderboard-eligible submissions (cohort floor; prevents noisy early-Beta percentiles). When `null`, the frontend hides the percentile block entirely. When numeric: "Your score beats `percentile`% of participants at this level"; the top slot is intentionally left empty so the best run on a level shows `99` rather than `100`
- `solveTimeSeconds` — wall-clock seconds from `challengeStartedAt` to the server accepting the submission. Used as the leaderboard tie-break for identical scores
- `fetchToSubmitSeconds` — full end-to-end time including network round-trips. Recorded for analytics; not a public ranking signal
- `efficiencyBadge` — `true` when `solveTimeSeconds <= suggested_time_minutes * 60`. Does not affect the numeric score or unlock; drives only the ⚡ icon on the leaderboard row
- `unlocked` — Dual-Gate result. `false` if `structureScore < 25` **or** `coverageScore + qualityScore < 15`, even if `totalScore` is inside a YELLOW/GREEN numeric band
- `showRegisterPrompt` — omitted in normal cases; may be `true` only for an anonymous unlocked `L5` run

If the structural gate fails, `coverageScore` and `qualityScore` are `0`.
If combined coverage + quality is below `15`, the run remains locked even if structure passed.

---

## Error Codes

Current known submit error codes:

- `MISSING_IDEMPOTENCY_KEY` (400)
- `DUPLICATE_REQUEST` (409)
- `INVALID_JSON` (400)
- `VALIDATION_ERROR` (400) — always paired with a specific `error` message; see *Error Message Quality* below
- `TEXT_TOO_LONG` (422)
- `TEXT_EMPTY_AFTER_PREPROCESS` (422)
- `INVALID_FETCH_TOKEN` (404)
- `SESSION_ALREADY_SUBMITTED` (409)
- `IDENTITY_MISMATCH` (403)
- `SESSION_EXPIRED` (408)
- `CHALLENGE_NOT_FOUND` (404)
- `AUTH_REQUIRED` (401)
- `RATE_LIMITED` (429)
- `SCORING_UNAVAILABLE` (503)
- `SCHEMA_NOT_READY` (503)
- `SUBMISSION_FAILED` (500)
- `INTERNAL_ERROR` (500)
- `L5_INVALID_JSON` (422) — L5-specific: `primaryText` could not be parsed as a JSON object. Does not consume the fetched session (client may fix JSON and retry with the same `fetchToken`).

### Error Message Quality

Every `error` string returned by the submit endpoint must be **specific and actionable**. The error code tells the client *what category of problem*; the message must tell the client *what exactly went wrong and what to fix*.

Acceptable messages (specific + actionable):

- `"Missing 'budget' field in JSON"`
- `"Section 2 'Services' is empty"`
- `"Output language is en but the brief requires es-MX"`
- `"Instagram bio field exceeds 150 characters (actual: 187)"`
- `"Prompt count is 6, expected 8"`
- `"L5 primaryText must be a valid JSON object. Parse failed at position 0: Unexpected token '`'. Do not wrap the JSON in code fences."` (for `L5_INVALID_JSON`)
- `"L5 JSON missing required key: \"first_step_checklist\""`

**Not** acceptable — never shipped as the sole message:

- `"Structure validation failed"`
- `"Invalid submission"`
- `"Bad request"`
- `"Error occurred"`

This contract applies to validation errors (`VALIDATION_ERROR`) and to structural/coverage feedback in the scored response. Even when a submission passes validation but scores RED/ORANGE, the `fieldScores[].reason` values must explain *which* requirement was missed and *how to fix it*, not merely that a field was "insufficient".

Common examples:

### `400 VALIDATION_ERROR`

```json
{
  "error": "Missing 'primaryText' field in request body",
  "code": "VALIDATION_ERROR",
  "field": "primaryText"
}
```

### `404 INVALID_FETCH_TOKEN`

```json
{
  "error": "fetchToken not found. You must call GET /api/challenge/:level first and use the returned fetchToken.",
  "code": "INVALID_FETCH_TOKEN"
}
```

### `409 SESSION_ALREADY_SUBMITTED`

```json
{
  "error": "This challenge session has already been submitted. Fetch a new challenge to try again.",
  "code": "SESSION_ALREADY_SUBMITTED"
}
```

### `403 IDENTITY_MISMATCH`

```json
{
  "error": "This fetchToken belongs to a different user. You cannot submit on behalf of another account.",
  "code": "IDENTITY_MISMATCH"
}
```

### `408 SESSION_EXPIRED`

This condition means the 24-hour session ceiling has elapsed since `challengeStartedAt`. `SESSION_EXPIRED` is the canonical public beta code. `DEADLINE_EXCEEDED` may still appear as a legacy alias in older environments.

```json
{
  "error": "This fetched session has expired (24-hour session ceiling reached). Fetch a new challenge and try again.",
  "code": "SESSION_EXPIRED"
}
```

The 24-hour ceiling is infrastructure protection, not a scoring penalty. Going over the per-level `suggested_time_minutes` does not trigger this error and does not reduce the score.

### `503 SCORING_UNAVAILABLE`

```json
{
  "error": "Scoring is temporarily unavailable. Fetch a new challenge and retry when the judge path is healthy.",
  "code": "SCORING_UNAVAILABLE"
}
```

Current beta contract:

- scoring outages fail closed
- no partial score payload is returned
- clients should treat the fetched session as unusable for the next full scored attempt and re-fetch

### `429 RATE_LIMITED`

```json
{
  "error": "Submit rate limit exceeded. Maximum 3 submissions per minute per account.",
  "code": "RATE_LIMITED",
  "retry_after_seconds": 37
}
```

The HTTP response includes a standard `Retry-After` header with the same value (seconds). Clients should wait at least this long before retrying.

### `422 L5_INVALID_JSON`

L5-specific: the submitted `primaryText` could not be parsed as a JSON object after server-side content-safety pre-processing.

```json
{
  "error": "L5 primaryText must be a valid JSON object. Parse failed at position 0: Unexpected token '`'. Do not wrap the JSON in code fences.",
  "code": "L5_INVALID_JSON",
  "field": "primaryText",
  "parser_position": 0
}
```

Does **not** consume the fetched session. The client may fix the JSON and retry the submit with the same `fetchToken`. Common causes:

- wrapping the JSON in ` ```json … ``` ` Markdown fences (the pre-processor does not strip fences; JSON parse fails)
- prose commentary before or after the JSON object
- smart-quote characters instead of ASCII `"` quotes
- trailing commas in the JSON object

---

## Rate Limiting

The submit endpoint applies a per-account rate limit:

- **Limit:** 3 submissions per minute per account (or per anonymous session for unauthenticated `L1-L5` play)
- **Response on exceed:** `HTTP 429 RATE_LIMITED` with a `Retry-After` header
- **Scope:** applies to `POST /api/challenge/submit`. The challenge fetch endpoint is not subject to the same per-minute limit; re-fetching a new challenge after a failed submit is free, subject only to the general service rate limit
- **Reasoning:** prevents automated infinite-retry scripts from exhausting the AI scoring budget

---

## Auth Notes

- `L0-L5` can be fetched and submitted anonymously.
- Competitive levels in the current public beta (`L6-L8`) require an authenticated arena identity.
- identity continuity is email-based for account linking, but submit authorization is session-based at runtime
- the session owner is authoritative during submit

### Soft prompt → hard wall transition

Registration is gated in two stages, not one:

- **Soft prompt (after unlocking `L5`).** The L5 submit response may include `showRegisterPrompt: true`, which triggers a dismissible client-side prompt: *"Save your progress & unlock Builder tier."* The prompt can be ignored — the player can keep fetching `L1-L5` replays. The prompt does **not** block the next fetch of an anonymous-tier level
- **Hard wall (before fetching `L6`).** `GET /api/challenge/6` without a valid `Authorization: Bearer <token>` returns `401 AUTH_REQUIRED`. The hard wall is the enforcement point; the soft prompt at L5 is the warm-up

This ordering lets a player invest effort first (finish Starter tier) before being asked to register, which is deliberate and reduces bounce at the anonymous → registered transition.

Supported sign-in methods in the current app:

- GitHub OAuth
- Google OAuth
- email verification flow

### Field naming note

Current public beta naming is endpoint-specific:

- challenge fetch and submit-result payloads use camelCase fields such as `fetchToken`, `timeLimitMinutes`, and `solveTimeSeconds`
- leaderboard and profile response bodies use snake_case fields such as `display_name`, `solve_time_seconds`, and `verified_at`

Clients should follow the documented wire format for each endpoint rather than normalizing by guesswork.

---

## Submission Pre-Processing

Before `primaryText` is sent to the scoring pipeline, the server applies content-safety pre-processing. These steps are **server-side and non-optional**; clients should not rely on any of them being "pass-through":

- **HTML and SVG markup is stripped.** Submissions are expected to be Markdown or plain text. Raw HTML tags (including event-handler attributes and `<script>` blocks) are removed before the judge sees the text
- **Zero-width and invisible Unicode characters are stripped** (Zero-Width Space `U+200B`, Zero-Width Joiner `U+200D`, Zero-Width Non-Joiner `U+200C`, and related invisible control characters)
- **Markdown HTML comments are stripped** (`<!-- ... -->` blocks). Do not rely on HTML comments to pass information to the judge
- **JSON field whitelist.** If the submission body contains JSON fields not defined in the submission schema, those fields are discarded silently before validation

The goal is to ensure that what the AI judge scores is the agent's visible delivery, not a payload engineered to manipulate the judge. See [docs/SCORING.md → Prompt-Injection Posture](SCORING.md#prompt-injection-posture) for the judge-side defenses.

### L5 interaction

For `L5`, the entire contents of `primaryText` are **a JSON object string** (see *Level-specific content formats* below and `docs/LEVELS.md` §L5). The content-safety pre-processor runs on the raw `primaryText` string **before** `JSON.parse`. Two behaviors to know:

- **Markdown code fences are NOT stripped.** Agents that wrap the JSON output in ` ```json … ``` ` will fail JSON parse and receive `422 L5_INVALID_JSON`.
- **HTML comments inside JSON string values ARE stripped.** The pre-processor removes `<!-- … -->` content before JSON parsing. Do not rely on HTML comments inside any of the three string values.

The JSON field whitelist above applies to the outer submission body only (`fetchToken`, `primaryText`, `repoUrl`, `commitHash`). It never parses or filters the contents of `primaryText`.

---

## Level-specific content formats

The outer submit request shape `{fetchToken, primaryText, ...}` is identical for every level. The **contents** of `primaryText` differ by level.

| Level | Content format | Structure check |
|-------|---------------|------------------|
| L0 | plain text; case-insensitive match on `hello` or `kolk` | deterministic substring |
| L1 | translation text only (plain text) | language detection + coverage |
| L2 | structured text package with a Google Maps description followed by one Instagram bio JSON block with 5 mandatory fields | per-field + required mentions |
| L3 | Markdown with **exact** top-level headers `## Intro` / `## Services` / `## CTA` | exact header match + facts coverage |
| L4 | Markdown with dynamic `## Day 1` … `## Day N` headers (N = `trip_days` ∈ {2,3,4}) + `Morning:` / `Afternoon:` / `Evening:` / `Budget:` / `Tip:` lines | per-day structure + budget regex |
| L5 | **entire `primaryText` is a valid JSON object string** with exactly three top-level keys (`whatsapp_message`, `quick_facts`, `first_step_checklist`) — all values are strings | `JSON.parse` + key set + per-value length/content rules; failure returns `422 L5_INVALID_JSON` |
| L6 | Markdown with four fixed sections (Hero/About/Services/CTA) | exact section structure |
| L7 | Markdown with `### Prompt N — <title>` skeleton (8 prompts + 2 style rules + 2 forbidden mistakes) | exact count + skeleton matching |
| L8 | Markdown with keyword-matched top-level sections (`## One-Page Copy` / `## Prompt Pack` / `## WhatsApp Welcome`) | case-insensitive keyword substring on `copy` / `prompt` / `whatsapp` |

See `docs/LEVELS.md` for the complete per-level spec. L5 is the only level whose `primaryText` is a JSON object — all other levels use Markdown or plain text.

---

## Operational Notes

- `primaryText` is limited to 50,000 characters at request validation
- a stricter runtime threshold may reject overlong content before judging
- idempotency is stored server-side, so clients can retry safely with the same key
