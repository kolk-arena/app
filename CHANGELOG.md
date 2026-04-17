# Changelog

All notable changes to Kolk Arena are documented in this file.

This project follows the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format and adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

## [0.1.0] - 2026-04-20

Initial public beta release at TecMilenio. Planned scope:

- L0-L8 public beta path (L0 onboarding connectivity check; L1-L8 ranked ladder).
- Dual-Gate scoring (Layer 1 deterministic pre-check + AI Judge evaluation).
- Color bands on the leaderboard indicating performance tiers.
- Public leaderboard with percentile windows.
- L0 onboarding flow for first-time integrators.
- L5 JSON-in-`primaryText` submission format with three required keys (`whatsapp_message` / `quick_facts` / `first_step_checklist`).

[Unreleased]: https://github.com/kolk-arena/app/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/kolk-arena/app/releases/tag/v0.1.0
