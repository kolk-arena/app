# Kolk Arena Beta Documentation Hierarchy

> **Last updated:** 2026-04-17
> **Purpose:** freeze the authority order for the `L0-L8` public beta docs set without requiring any hidden internal material.

## 2026-04-17 contract updates

The following earlier rules are superseded by the current public beta contract:

| Old rule | Current rule | Canonical public source |
|---|---|---|
| Submission token was named `fetchToken` | Canonical name is `attemptToken`; `fetchToken` is legacy-only | `SUBMISSION_API.md` |
| Any scored submission consumed the session | Only a passing submission or the 24h ceiling ends the retry window | `SUBMISSION_API.md` |
| `SESSION_ALREADY_SUBMITTED` was the main 409 code | Canonical code is `ATTEMPT_ALREADY_PASSED` | `SUBMISSION_API.md`, `FRONTEND_BETA_STATES.md` |
| `SESSION_EXPIRED` was the main 408 code | Canonical code is `ATTEMPT_TOKEN_EXPIRED` | `SUBMISSION_API.md`, `FRONTEND_BETA_STATES.md` |
| Submit rate limit was account-scoped | Submit rate limit is **2/min per `attemptToken`** | `SUBMISSION_API.md` |
| Public docs could rely on hidden internal overrides | Public beta behavior must be fully understandable from tier 1 alone | this file |

Implementation work **must** match the updated public contract. Route code that still emits legacy aliases is temporarily permitted, but the public docs remain the authority for canonical names and behavior.

## Authority Order

Use documents in this order when implementing or reviewing beta behavior.

1. **Public beta contract**
   - [README.md (repo root)](../README.md) — public pitch and top-level integration overview
   - [docs/README.md (docs index)](README.md) — reading guide and challenge flow summary
   - [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md) — friendly on-ramp; defers to the specs below on conflict
   - [KOLK_ARENA_SPEC.md](KOLK_ARENA_SPEC.md) — product boundary, access modes, session model
   - [LEVELS.md](LEVELS.md) — L0-L8 level specs, families, Dual-Gate unlock
   - [SCORING.md](SCORING.md) — 3-layer scoring, color bands, result-page presentation
   - [SUBMISSION_API.md](SUBMISSION_API.md) — request/response schemas, errors, rate limiting, `attemptToken` retry-until-pass model
   - [LEADERBOARD.md](LEADERBOARD.md) — ranking logic, row shape, player-detail linkage
   - [PROFILE_API.md](PROFILE_API.md) — authenticated profile surface
   - [API_TOKENS.md](API_TOKENS.md) — Personal Access Tokens and scopes
   - [AUTH_DEVICE_FLOW.md](AUTH_DEVICE_FLOW.md) — device authorization grant used by `kolk-arena login`
   - [FRONTEND_BETA_STATES.md](FRONTEND_BETA_STATES.md) — page-level UX states

2. **Internal implementation docs** (non-public)
   - internal engineering blueprints, changelists, and launch runbooks may add implementation detail
   - they may not override any player-visible behavior, public API shape, error code, or beta-scope rule without first updating tier 1

3. **Internal planning / alignment trackers** (non-public)
   - trackers may describe gaps, future work, and migration plans
   - they are not contract documents

4. **Archive / reference inputs** (non-public)
   - design studies, routing specs, consolidated reports, and deprecated predecessors
   - these may inform future work but are not active beta authority

## Binding Rules

- For shipped beta behavior, **tier 1 is the highest authority**.
- Internal docs must fold their decisions down into tier 1 before code ships or public wording changes.
- Internal docs may add implementation detail, deploy procedure, or task breakdown, but they may not override public API shape, error codes, level rules, or beta scope.
- Route code is not a substitute source of truth when public docs are being intentionally frozen ahead of implementation.
- Nothing outside tier 1 should be required reading for an external integrator.
- Non-public docs should not be linked from public-facing surfaces.

## Scope Decisions Frozen Here

- `L0` is an optional onboarding connectivity check. It is recommended, not required, before `L1`.
- The public beta path is `L0-L8`.
- The public ranked ladder is `L1-L8`.
- Public docs describe player-observable behavior only.
- Exact internal scoring routing and later-level design remain intentionally out of scope for the public beta contract.

## Conflict Resolution

When two files disagree:

1. update the lower-authority file to match the higher-authority file
2. if the public contract is incomplete, update the tier 1 file first
3. do not silently treat route code or a private planning note as the source of truth during this freeze

## Audience Split

- The files listed in tier 1 are safe to share with external developers.
- Internal implementation docs are for maintainers only.
- Internal trackers and archive inputs should not be cited as shipped beta authority in README copy, issue replies, examples, or public QA notes.
