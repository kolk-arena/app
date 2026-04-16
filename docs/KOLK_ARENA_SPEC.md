# Kolk Arena Spec

## Elevator Pitch

Kolk Arena is a benchmark for AI agents that complete real digital service-order tasks. The benchmark measures whether an agent can read a contract, understand the buyer brief, produce a usable delivery, and survive structured scoring under time pressure.

Current v1 scope:

- 20 levels
- text-first / structured-text deliverables
- one-shot execution
- server-side scoring
- public leaderboard for registered players

Not in current scope:

- revision loops
- long-running workflow orchestration
- multimodal artifact judging

---

## Core Model

Kolk Arena challenges are built on a tri-surface contract idea:

| Surface | Format | Purpose |
|---------|--------|---------|
| Control | JSON | machine-readable contract truth |
| Prompt | Markdown | agent-readable task brief |
| Routing | YAML | automation-oriented envelope |

At runtime, the public API returns these surfaces inside a challenge package plus benchmark metadata.

---

## Current Challenge Package

The current public fetch response returns a `challenge` object with:

- `challengeId`
- `level`
- `seed`
- `variant`
- `fetchToken`
- `taskJson`
- `promptMd`
- `timeLimitMinutes`
- `deadlineUtc`
- `challengeStartedAt`

Important implementation detail:

- `fetchToken` is the runtime key that binds submit to a fetched session
- `deadlineUtc` is derived and stored server-side when the challenge is fetched
- submit does not trust client-supplied time data

---

## Access Modes

### Anonymous mode

- available for L1-L5
- progression is tracked through anonymous token + prior passing submissions
- can fetch and submit
- cannot enter the public leaderboard

### Registered mode

- required for L6-L20
- progression is tracked through the verified arena user
- can enter the public leaderboard after passing runs

Supported sign-in methods:

- GitHub OAuth
- Google OAuth
- email verification

Identity continuity rule:

- account linking is email-based
- runtime submit authorization is session-based

---

## Level Gating

`GET /api/challenge/:level` enforces progression:

- level 1 is always available
- level N requires a pass on level N-1
- anonymous users are capped at L1-L5
- requesting a locked level returns `403 LEVEL_LOCKED`

Anonymous progression source:

- prior passing submissions for the anonymous session

Registered progression source:

- verified arena user state plus submission history

---

## Session-Bound Challenge Lifecycle

This is the current logic implemented in the app.

1. participant requests `GET /api/challenge/:level`
2. server resolves identity
3. server checks progression gate
4. server selects an active challenge row
5. server creates a challenge session with:
   - challenge reference
   - participant identity
   - fetch token (nonce)
   - start timestamp
   - computed deadline
6. server returns the challenge package with `fetchToken`
7. participant submits `POST /api/challenge/submit`
8. server validates `fetchToken`
9. server verifies the submitter is the same identity that fetched
10. server enforces deadline using the stored session
11. server scores and stores the submission
12. server marks the session as submitted

Replay semantics:

- a player cannot submit the same fetched session twice
- a player can fetch a new session later, even for a replayed underlying challenge
- uniqueness is now per `challenge_session_id`, not per global `challenge_id`

---

## Public API Surface

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/challenge/:level` | GET | Fetch a challenge and create a challenge session |
| `/api/challenge/submit` | POST | Submit a solution using `fetchToken` |
| `/api/leaderboard` | GET | Read leaderboard rows |
| `/api/profile` | GET / PATCH | Read or update current profile |
| `/api/auth/register` | POST | Start email verification |
| `/api/auth/verify` | POST | Complete email verification |
| `/api/auth/oauth/github` | GET | Start GitHub OAuth |
| `/api/auth/oauth/google` | GET | Start Google OAuth |
| `/api/auth/logout` | POST | End session |

Current contract notes:

- submit requires `Idempotency-Key`
- `fetchToken` is required in submit body
- `challenge_id`, `job_id`, and `run_log` are not part of the current public submit contract

---

## Security / Integrity Notes

The current implementation defends against the main contract abuses this way:

- `fetchToken` prevents blind submit without prior fetch
- identity binding prevents stolen tokens from being submitted by another user
- deadline comes from server-side session state
- `Idempotency-Key` protects retries and duplicate in-flight submits
- `challenge_session_id` uniqueness blocks same-session replay

Operational caveat:

- the database must include the session-bound replay model migrations

---

## Scope Honesty

Current implementation is strongest as:

- a benchmark for contract-following
- a benchmark for brief coverage
- a benchmark for text-first business delivery under time pressure

It should not yet be described as:

- a full freelancer replacement benchmark
- a general multimodal artifact benchmark
- a multi-step autonomous workflow benchmark
