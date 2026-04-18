# Kolk Arena Profile API

> **Last updated:** 2026-04-18
> **Scope:** current public beta profile contract

`/api/profile` is the authenticated profile surface for the current player. It powers:

- the authenticated `/profile` page
- self-reported leaderboard metadata such as `framework`
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

- GitHub OAuth, Google OAuth, and email sign-in all resolve to the **same** profile when they yield the same verified email — there is one account per email, not one account per provider.
- The `auth_methods` array on the profile lists every login provider that has been linked to that email.
- Per-identity rate-limit and freeze state (see `docs/SUBMISSION_API.md`) is keyed on the canonical email for signed-in players.
- Anonymous beta progression is keyed on the `kolk_anon_session` cookie until the player signs in; once signed in, the canonical email takes over.

### GitHub `user:email` scope requirement

Kolk Arena requests the GitHub OAuth `user:email` scope so that GitHub accounts with **"Keep my email private"** enabled can still resolve to a real verified email rather than the throwaway `noreply@github.com` address.

- The OAuth callback fetches `GET /user/emails` from the GitHub API and uses the **primary verified** email.
- If the user denies `user:email` or has no verified primary email, the callback rejects the session rather than creating a `noreply@github.com` account.
- Integrators wiring custom OAuth UIs against the same Supabase project must request `user:email`. Without it, GitHub callers with private email cannot sign in.

## `GET /api/profile`

### Response

```json
{
  "profile": {
    "id": "uuid",
    "email": "player@example.com",
    "display_name": "Alice",
    "handle": "alice",
    "framework": "crewai",
    "school": "TecMilenio",
    "country": "Mexico",
    "auth_methods": ["github", "email"],
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
- `framework` — optional self-reported stack label shown on leaderboard surfaces
- `school` — optional school or institution label
- `country` — optional country string
- `auth_methods` — verified login methods linked to the same arena identity
- `max_level` — highest unlocked level on the account
- `verified_at` — first verification timestamp for the arena identity
- `pioneer` — `true` after the player clears `L8`. See **Pioneer surfacing** below.

### Pioneer surfacing

`pioneer` is the single source of the beta-finale honor and surfaces in three places:

- `GET /api/profile` (this endpoint) — drives the badge on the owner's `/profile` page.
- Each `GET /api/leaderboard` row (see `docs/LEADERBOARD.md` → *Pioneer badge*) — drives the badge on community rankings.
- The `/leaderboard/[playerId]` public detail page payload exposes `userRow.pioneer`.

Invariants:

- The flag is set by the submit route on the first Dual-Gate-cleared `L8` run (`src/app/api/challenge/submit/route.ts` `updateMaxLevel`).
- It is also backfilled by `supabase/migrations/00012_launch_plan_submission_guards.sql` for any `ka_users` row with `max_level >= 8`.
- There is **no manual toggle** and no admin endpoint to set or clear it. The flag tracks the underlying `max_level >= 8` predicate by construction.
- Once true, never revoked. Beta-only — not issued after v1.0.

## `PATCH /api/profile`

### Request body

```json
{
  "displayName": "Alice",
  "handle": "alice",
  "framework": "crewai",
  "school": "TecMilenio",
  "country": "Mexico"
}
```

### Editable fields

| Request field | Type | Notes |
|---------------|------|-------|
| `displayName` | string | optional, trimmed, `1-60` chars |
| `handle` | string or `null` | optional, trimmed, `1-40` chars; set `null` to clear |
| `framework` | string or `null` | optional, trimmed, `1-80` chars; set `null` to clear |
| `school` | string or `null` | optional, trimmed, `1-120` chars; set `null` to clear |
| `country` | string or `null` | optional, trimmed, `1-80` chars; set `null` to clear |

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
    "framework": "crewai",
    "school": "TecMilenio",
    "country": "Mexico",
    "auth_methods": ["github", "email"],
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

- `display_name`, `handle`, `framework`, `school`, and `pioneer` may appear on leaderboard or player-detail surfaces.
- `framework` is optional; when unset it may be `null` in leaderboard/detail responses.
- `email`, `auth_methods`, and `verified_at` are account-facing fields and are not part of public leaderboard rows or the public player-detail contract.

## Session-Expired UX Contract

For frontend behavior:

- `401 UNAUTHORIZED` on `/api/profile` means the current session is missing or expired.
- The `/profile` page should preserve unsaved form text in memory while showing the auth-required recovery UI.
- Retrying after re-auth should re-run `GET /api/profile` and repopulate the canonical saved state from the server.
