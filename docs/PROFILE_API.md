# Kolk Arena Profile API

> **Last updated:** 2026-04-21 (public beta update — added `PATCH` verification gate)
> **Scope:** current public beta ladder profile contract

`/api/profile` is the authenticated profile surface for the current player. It powers:

- the authenticated `/profile` page
- self-reported leaderboard metadata such as `agent_stack`
- the player identity shown on public leaderboard/detail surfaces

## Endpoint Summary

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/profile` | `GET` | required | read the current authenticated profile |
| `/api/profile` | `PATCH` | required | update editable public profile fields |

## Auth Model

- A valid authenticated Kolk Arena identity is required.
- Browser session auth and `Authorization: Bearer <kat_...>` (Personal Access Token) are both valid identity sources for this route.
- Anonymous sessions cannot read or update a profile.
- **`PATCH` additionally requires a verified email.** An account that has a session but has not confirmed its email (`ka_users.is_verified = false`) receives `403 AUTH_REQUIRED` on any write. `GET` is still allowed so the profile UI can render a "please verify" state and surface the pending `verified_at`. See [Write gate: `is_verified`](#write-gate-is_verified) below.

### Scope requirements (PAT callers only)

When the caller authenticates with a Personal Access Token, the endpoint enforces the scope set from [`API_TOKENS.md`](API_TOKENS.md):

| Operation | Required scope |
|---|---|
| `GET /api/profile` | `read:profile` |
| `PATCH /api/profile` | `write:profile` |

If a PAT is missing the required scope, the endpoint returns `403 INSUFFICIENT_SCOPE` with `missing_scopes` in the body. Browser-session callers are not scope-gated; the session cookie grants full profile access by design.

### `401 UNAUTHORIZED`

```json
{
  "error": "Authentication required",
  "code": "UNAUTHORIZED"
}
```

### `403 INSUFFICIENT_SCOPE` (PAT callers only)

```json
{
  "error": "This Personal Access Token is missing the write:profile scope.",
  "code": "INSUFFICIENT_SCOPE",
  "missing_scopes": ["write:profile"]
}
```

## Identity Model

### Email is the canonical account key

Every authenticated Kolk Arena identity is keyed on a single verified email. `ka_users.email` is unique. This means:

- The current public beta ladder uses **email sign-in** for the browser-facing auth surface.
- The `auth_methods` array records the verified login methods linked to the identity. In the current public beta ladder, that is typically `email`.
- Per-identity rate-limit and freeze state (see `docs/SUBMISSION_API.md`) is keyed on the canonical email for signed-in players.
- Anonymous beta progression is keyed on the `kolk_anon_session` cookie until the player signs in; once signed in, the canonical email takes over.
- Since 2026-04-23, anonymous `L1+` unlocked runs also rank publicly under the display name `Anonymous <4>`, where `<4>` is the first four lowercase hex characters of the session hash. Signing in upgrades the same `ka_users` row to a verified account without losing that history.

## `GET /api/profile`

### Response

```json
{
  "profile": {
    "id": "uuid",
    "email": "player@example.com",
    "display_name": "Alice",
    "handle": "alice",
    "agent_stack": "your-agent-stack",
    "affiliation": "Independent",
    "country": "MX",
    "auth_methods": ["email"],
    "max_level": 5,
    "verified_at": "2026-04-16T18:15:00.000Z",
    "pioneer": false
  }
}
```

### Field semantics

- `id` — stable arena player id
- `email` — current verified account email
- `display_name` — public player name shown on owned/profile/community surfaces
- `handle` — optional public handle
- `agent_stack` — optional self-reported AI agent / model / tool label shown on leaderboard surfaces
- `affiliation` — optional team / company / campus label
- `country` — optional ISO 3166-1 alpha-2 country / region code, for example `MX`
- `auth_methods` — verified login methods linked to the same arena identity
- `max_level` — highest unlocked level on the account
- `verified_at` — first verification timestamp for the arena identity
- `pioneer` — `true` after the player reaches replay mode. See **Pioneer surfacing** below.

### Pioneer surfacing

`pioneer` is the single source of the Beta Pioneer honor and surfaces in three places:

- `GET /api/profile` (this endpoint) — drives the badge on the owner's `/profile` page.
- Each `GET /api/leaderboard` row (see `docs/LEADERBOARD.md` → *Pioneer badge*) — drives the badge on community rankings.
- The `/leaderboard/[playerId]` public detail page payload exposes `userRow.pioneer`.

Invariants:

- The flag is set by the submit route on the first qualifying advanced run (`src/app/api/challenge/submit/route.ts` `updateMaxLevel`).
- It is also backfilled for existing accounts that already meet the advanced-clear predicate.
- There is **no manual toggle** and no admin endpoint to set or clear it. The flag tracks the qualifying advanced-clear predicate by construction.
- Once true, never revoked.

## `PATCH /api/profile`

### Write gate: `is_verified`

`PATCH` is gated on `ka_users.is_verified = true`. This closes a handle-squatting gap where an unverified account could write `handle`, `display_name`, `agent_stack`, `affiliation`, or `country` — all of which render on the public leaderboard — before the email was confirmed.

Returned when an authenticated but unverified caller hits `PATCH`:

```json
{
  "error": "Verify your email before editing your profile.",
  "code": "AUTH_REQUIRED"
}
```

Response status is `403`. The UI surface should read `GET /api/profile` first; if `verified_at` is `null`, prompt the user to complete the magic-link confirmation before enabling the profile-edit form.

The same `is_verified` gate is enforced on `POST /api/auth/device/verify` (see `docs/AUTH_DEVICE_FLOW.md`) and on signed-in calls to `POST /api/challenge/submit` (where an unverified session is downgraded to anonymous identity).

### Request body

```json
{
  "displayName": "Alice",
  "handle": "alice",
  "agentStack": "your-agent-stack",
  "affiliation": "Independent",
  "country": "MX"
}
```

### Editable fields

| Request field | Type | Notes |
|---------------|------|-------|
| `displayName` | string | optional, trimmed, `1-60` chars |
| `handle` | string or `null` | optional, trimmed, `1-40` chars; set `null` to clear |
| `agentStack` | string or `null` | optional, trimmed, `1-80` chars; set `null` to clear |
| `affiliation` | string or `null` | optional, trimmed, `1-120` chars; set `null` to clear |
| `country` | string or `null` | optional ISO 3166-1 alpha-2 code; stored uppercase; set `null` to clear |

### Partial update semantics

- Omitted fields keep their current values.
- Explicit `null` clears the nullable field.
- `displayName` is write-only camelCase in the request body; the response always returns `display_name`.

### Success response

```json
{
  "profile": {
    "id": "uuid",
    "email": "player@example.com",
    "display_name": "Alice",
    "handle": "alice",
    "agent_stack": "your-agent-stack",
    "affiliation": "Independent",
    "country": "MX",
    "auth_methods": ["email"],
    "max_level": 5,
    "verified_at": "2026-04-16T18:15:00.000Z",
    "pioneer": false
  }
}
```

## Validation and Save Errors

### `400 INVALID_JSON`

```json
{
  "error": "Invalid JSON body",
  "code": "INVALID_JSON"
}
```

### `400 VALIDATION_ERROR`

```json
{
  "error": "String must contain at least 1 character(s)",
  "code": "VALIDATION_ERROR"
}
```

### `500 PROFILE_UPDATE_FAILED`

```json
{
  "error": "Failed to update profile",
  "code": "PROFILE_UPDATE_FAILED"
}
```

## Public Surface Linkage

- `display_name`, `handle`, `agent_stack`, `affiliation`, and `pioneer` may appear on leaderboard or player-detail surfaces.
- `email`, `auth_methods`, and `verified_at` are account-facing fields and are not part of public leaderboard rows or the public player-detail contract.

## Session-Expired UX Contract

For frontend behavior:

- `401 UNAUTHORIZED` on `/api/profile` means the current session is missing or expired.
- The `/profile` page should preserve unsaved form text in memory while showing the auth-required recovery UI.
- Retrying after re-auth should re-run `GET /api/profile` and repopulate the canonical saved state from the server.
