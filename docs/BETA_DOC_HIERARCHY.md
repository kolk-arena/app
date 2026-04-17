# Kolk Arena Beta Documentation Hierarchy

> **Last updated:** 2026-04-16
> **Purpose:** freeze the documentation authority order for the `L0-L8` public beta and the `L1-L8` ranked ladder.

## Authority Order

Use documents in this order when implementing or reviewing beta behavior.

0. **Authorized engineering overrides** (internal; gitignored)
   - `docs/L0L8_ENGINEERING_CHANGELIST.md` — **Highest** authority on L0-L8 level-definition items within its stated scope (2026-04-16 22:15 America/Mexico_City). Internal-only; never linked from public surfaces. Must be folded down into the public beta contract files as the canonical public expression of its rules.

1. **Public beta contract**
   - [README.md (repo root)](../README.md) — public pitch and top-level integration overview
   - [docs/README.md (docs index)](README.md) — reading guide and challenge flow summary
   - [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md) — friendly on-ramp: 60-second smoke test, code examples, common pitfalls (does **not** override the specs below; defers to them on conflict)
   - [KOLK_ARENA_SPEC.md](KOLK_ARENA_SPEC.md) — product boundary, access modes, session model
   - [LEVELS.md](LEVELS.md) — L0-L8 level specs, families, Dual-Gate unlock
   - [SCORING.md](SCORING.md) — 3-layer scoring, color bands, result-page presentation
   - [SUBMISSION_API.md](SUBMISSION_API.md) — request/response schemas, errors, rate limiting, pre-processing
   - [LEADERBOARD.md](LEADERBOARD.md) — ranking logic, row shape, player-detail linkage
   - [PROFILE_API.md](PROFILE_API.md) — authenticated profile contract
   - [FRONTEND_BETA_STATES.md](FRONTEND_BETA_STATES.md) — page-level UX states

2. **Internal implementation blueprints** (gitignored)
   - `docs/BETA_ENGINEERING_BLUEPRINT.md`
   - `docs/BETA_FRONTEND_BLUEPRINT.md`

3. **Internal alignment / planning trackers** (gitignored)
   - `docs/SPEC_V5_ALIGNMENT_TRACKER.md`

4. **Archived or reference-only inputs** (gitignored)
   - `docs/LEVELS_BETA_DESIGN.md`
   - `docs/kolk_model_routing_spec_v5.md`
   - `docs/kolk_arena_consolidated_report.md`
   - deprecated predecessors

## Binding Rules

- **Authorized engineering overrides (tier 0)** win against any other tier on the items they explicitly touch. An override's scope is whatever its own "Scope" / "Effective date" section states. Outside that scope, tier 1 is authoritative.
- Public implementation work must match the **Public beta contract** (tier 1), even if current route code temporarily differs. If tier 0 has folded-pending changes, public contract must be updated to reflect them before engineering lands code.
- Internal blueprints (tier 2) may add implementation detail, but they may not override public API shape, error codes, level rules, or beta scope.
- Internal trackers (tier 3) may describe gaps and future work, but they are not contract documents.
- Reference-only inputs (tier 4) may inform design direction, but they are not active authority for beta behavior.
- **Nothing in tiers 0, 2, 3, or 4 should be linked from public-facing surfaces** (public README, PR descriptions on public PRs, GitHub issue replies to external integrators). External developers must always be pointed to tier 1 files only.

## Scope Decisions Frozen Here

- `L0` is an optional onboarding connectivity check. It is recommended, not required, before `L1`.
- The public beta path is `L0-L8`.
- The public ranked ladder is `L1-L8`.
- Public docs describe player-observable behavior only.
- Internal routing architecture beyond the shipped beta contract remains internal.

## Conflict Resolution

When two files disagree:

1. update the lower-authority file to match the higher-authority file
2. if the higher-authority file is incomplete, update it first
3. do not silently treat route code as the source of truth during this pre-development freeze

## Audience Split

- Files listed in the **Public beta contract** section are safe to treat as external-facing product and API documentation.
- Internal blueprints and trackers are for engineering/design coordination.
- Reference-only inputs should not be cited as shipped beta authority in new docs, code comments, PR descriptions, or QA notes.
