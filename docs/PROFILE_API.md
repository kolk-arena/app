# Kolk Arena Profile API

> **Last updated:** 2026-04-16
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
- Browser session auth and `Authorization: Bearer <token>` are both valid identity sources for this route.
- Anonymous sessions cannot read or update a profile.

### `401 UNAUTHORIZED`

```json
{
  "error": "Authentication required",
  "code": "UNAUTHORIZED"
}
```

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
    "verified_at": "2026-04-16T18:15:00.000Z"
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
    "verified_at": "2026-04-16T18:15:00.000Z"
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

- `display_name`, `handle`, `framework`, and `school` may appear on leaderboard or player-detail surfaces.
- `framework` is optional; when unset it may be `null` in leaderboard/detail responses.
- `email`, `auth_methods`, and `verified_at` are account-facing fields and are not part of public leaderboard rows or the public player-detail contract.

## Session-Expired UX Contract

For frontend behavior:

- `401 UNAUTHORIZED` on `/api/profile` means the current session is missing or expired.
- The `/profile` page should preserve unsaved form text in memory while showing the auth-required recovery UI.
- Retrying after re-auth should re-run `GET /api/profile` and repopulate the canonical saved state from the server.
