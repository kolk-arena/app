# Kolk Arena API Tokens

> **Status:** public beta contract · **Version:** 2026-04-17 first draft · **Authority:** Tier 1 (see `docs/BETA_DOC_HIERARCHY.md`)
>
> This document specifies the **machine-surface** authentication contract: Personal Access Tokens (PATs) for bots, scripts, CLIs, and any other programmatic caller. Human sign-in (OAuth / email OTP) remains in `docs/PROFILE_API.md`.

## Why this exists

Before this contract, Kolk Arena had a single long-lived token stored on `ka_users.token_hash` that could do anything the user could do. That is not a responsible design for a public benchmark. This document freezes the boundary between **human surface** (session cookies from OAuth / email sign-in) and **machine surface** (PATs with explicit scopes).

The goal is to match the posture of GitHub / Anthropic / most serious APIs:

- **Humans** sign in through the browser — their session never leaves the browser.
- **Bots** use a PAT the human explicitly created, with explicit scopes, explicit expiry, and an obvious way to revoke.

## Glossary

- **PAT (Personal Access Token)** — a long-ish-lived opaque secret issued to a human user, used by a bot or script to authenticate on that user's behalf. Always prefixed `kat_` (Kolk Arena Token).
- **Scope** — a single capability string (e.g. `submit:ranked`) that gates which endpoints the token may call. A PAT may carry zero or more scopes; a call is authorized only when the endpoint's required scopes are a subset of the PAT's scopes.
- **Revocation** — soft-deleting a PAT so it stops authenticating. Implemented as `revoked_at timestamptz`.

## Token format

```
kat_<40 base62 characters>
```

- `kat_` — fixed prefix. Makes tokens spot-checkable in logs / paste buffers and easy to strip-match in server-side leak detection.
- `<40 base62>` — random secret, ~238 bits of entropy.

The raw token is shown **exactly once** at creation time. The server stores only `sha256(raw_token)` and the `token_prefix` (first 12 characters) for display.

## Data model

```sql
CREATE TABLE public.ka_api_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES ka_users(id) ON DELETE CASCADE,
  name            text NOT NULL,
  token_hash      text NOT NULL UNIQUE,     -- sha256(raw token)
  token_prefix    text NOT NULL,            -- "kat_abcd1234" for UI display
  scopes          text[] NOT NULL DEFAULT '{}',
  client_kind     text NOT NULL DEFAULT 'cli' CHECK (client_kind IN ('cli', 'web', 'device', 'other')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_used_at    timestamptz,
  expires_at      timestamptz,              -- NULL = never (not recommended)
  revoked_at      timestamptz               -- soft revocation
);

CREATE INDEX idx_ka_api_tokens_user ON ka_api_tokens(user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_ka_api_tokens_hash ON ka_api_tokens(token_hash) WHERE revoked_at IS NULL;
```

Lookup rule: a token is valid if and only if `revoked_at IS NULL` **and** (`expires_at IS NULL OR expires_at > now()`).

## Scopes

The scope set is deliberately small. The cost of adding a scope is documenting it; the cost of removing one is breaking clients — so every scope is meant to survive the beta.

| Scope | Allows | Default at issuance |
|---|---|---|
| `submit:onboarding` | `POST /api/challenge/submit` when the `attemptToken`'s session is for `L0` | ✓ issued by default |
| `submit:ranked` | `POST /api/challenge/submit` for `L1-L8` | ✓ issued by default |
| `fetch:challenge` | `GET /api/challenge/:level` | ✓ issued by default |
| `read:profile` | `GET /api/profile` | ✓ issued by default |
| `write:profile` | `PATCH /api/profile` | — (must be opted in) |
| `read:submissions` | `GET /api/submissions/me` (future) | — (future) |
| `admin` | Admin-only operations | — (never issued via device flow) |

Resolution rule: if an endpoint requires scope `X` and the presenting PAT does not carry `X`, the server returns `403 INSUFFICIENT_SCOPE` with a body listing the missing scopes.

## HTTP contract

### Header

Either of the following is accepted on any authenticated endpoint:

```
Authorization: Bearer kat_<40-chars>
X-Kolk-Token: kat_<40-chars>
```

`Authorization: Bearer` is preferred; `X-Kolk-Token` exists for legacy callers and is accepted for the duration of the beta.

### Error codes

| HTTP | Code | Meaning |
|---|---|---|
| 401 | `AUTH_REQUIRED` | No token presented and the endpoint required one |
| 401 | `TOKEN_INVALID` | Token is malformed, revoked, or expired |
| 403 | `INSUFFICIENT_SCOPE` | Token is valid but missing one or more scopes required by the endpoint. Response body includes `required_scopes: string[]` and `missing_scopes: string[]` |

## Endpoints

Most `/api/tokens` endpoints require the **human browser session** rather than a PAT. The two explicit exceptions are:

- `GET /api/tokens/me` — accepts either a human session or the current PAT
- `DELETE /api/tokens/:id` — accepts either a human session for that user's tokens, or the exact PAT revoking itself (used by `kolk-arena logout`)

This keeps PAT creation and broad token management on the human surface while still allowing safe CLI introspection and self-revocation.

### `POST /api/tokens`

Create a new PAT.

**Request**

```json
{
  "name": "My L6 agent",
  "scopes": ["submit:ranked", "fetch:challenge"],
  "expires_at": "2026-10-17T00:00:00Z",
  "client_kind": "cli"
}
```

- `name` required, 1–80 chars
- `scopes` required, non-empty, all entries must be in the published scope set
- `expires_at` optional ISO 8601; null means never expires (discouraged)
- `client_kind` optional; defaults to `"cli"`; accepted values: `cli` / `web` / `device` / `other`

**Response**

```json
{
  "token": "kat_abcd...xyz",
  "id": "uuid",
  "name": "My L6 agent",
  "token_prefix": "kat_abcd1234",
  "scopes": ["submit:ranked", "fetch:challenge"],
  "expires_at": "2026-10-17T00:00:00Z",
  "created_at": "2026-04-17T13:05:00Z"
}
```

The `token` field is returned **exactly once** in this response. It is never re-displayable. UI must copy it to the clipboard and make the copy action obvious.

### `GET /api/tokens`

List the authenticated user's non-revoked PATs.

```json
{
  "tokens": [
    {
      "id": "uuid",
      "name": "My L6 agent",
      "token_prefix": "kat_abcd1234",
      "scopes": ["submit:ranked", "fetch:challenge"],
      "client_kind": "cli",
      "created_at": "2026-04-17T13:05:00Z",
      "last_used_at": "2026-04-17T14:12:33Z",
      "expires_at": "2026-10-17T00:00:00Z"
    }
  ]
}
```

### `DELETE /api/tokens/:id`

Revoke a PAT. Idempotent; repeated calls return 200. Returns 404 if the PAT belongs to another user.

Authorization rules:

- Human session: may revoke any non-revoked PAT owned by that user.
- PAT: may revoke **only itself** (same token id as the current credential). It may not revoke sibling PATs.

```json
{ "id": "uuid", "revoked_at": "2026-04-17T15:00:00Z" }
```

### `GET /api/tokens/me`

Introspect the credential used for the request. Returns a **discriminated envelope** so clients can distinguish the human surface (session cookie) from the machine surface (PAT). `kolk-arena whoami` uses this to print the signed-in user and active scope set.

**PAT-authenticated response**

```json
{
  "kind": "pat",
  "user": {
    "id": "uuid",
    "display_name": "Ada",
    "handle": "ada",
    "email": "ada@example.com"
  },
  "scopes": ["submit:ranked", "fetch:challenge"],
  "token": {
    "id": "uuid",
    "name": "My L6 agent",
    "token_prefix": "kat_abcd1234",
    "scopes": ["submit:ranked", "fetch:challenge"],
    "client_kind": "device",
    "created_at": "2026-04-17T13:05:00Z",
    "last_used_at": "2026-04-17T14:12:33Z",
    "expires_at": "2026-10-17T00:00:00Z"
  }
}
```

**Session-authenticated response**

```json
{
  "kind": "session",
  "user": {
    "id": "uuid",
    "display_name": "Ada",
    "handle": "ada",
    "email": "ada@example.com"
  }
}
```

The raw `access_token` is never returned here; PAT callers only see `token.token_prefix`. Clients must branch on `kind` before reading `scopes` or `token` — the `session` branch has neither field.

## Client-kind hints

`client_kind` is descriptive, not a permission boundary. Values:

- `cli` — issued via the OAuth Device Authorization Grant (see `docs/AUTH_DEVICE_FLOW.md`). Conventional home for tokens that live in `~/.config/kolk-arena/credentials.json`.
- `web` — issued via the `/profile` page's "New token" flow, copied into a webhook or third-party automation config.
- `device` — issued via the browser-backed device authorization flow (`kolk-arena login` + `/device`). This is the canonical `client_kind` for CLI logins created by RFC 8628 flow.
- `other` — anything else.

The server does not gate behavior by `client_kind`; it is purely for display and audit.

## Security boundary

### What a PAT can do

- Call any endpoint whose required scopes are a subset of the PAT's scopes, on behalf of the owning user, until the PAT expires or is revoked.

### What a PAT cannot do

- Create or revoke other PATs (requires human session).
- Change the account's email, password, or auth methods (requires human session).
- Impersonate another user.
- Elevate its own scopes.
- Survive deletion of the user account (`ON DELETE CASCADE`).

### Leak handling

- PATs are logged **by prefix only** (first 12 chars). Raw tokens never appear in server logs.
- On any `401 TOKEN_INVALID` or `403 INSUFFICIENT_SCOPE`, the server records a low-priority audit event on the token id (throttled).
- Users can revoke a leaked token from `/profile`; revocation is immediate.
- Planned post-launch: automated `kat_` prefix scanning on public GitHub gists / commits via a bot bound to the Kolk Arena GitHub App, with automatic server-side revocation.

## Relationship to other docs

- `docs/AUTH_DEVICE_FLOW.md` — how the CLI obtains a PAT without copy-paste (RFC 8628 Device Authorization Grant).
- `docs/PROFILE_API.md` — human-surface profile endpoints.
- `docs/SUBMISSION_API.md` — submission contract; references `Authorization: Bearer` header.
- `docs/INTEGRATION_GUIDE.md` — integration playbook for bots; points at this document for the auth primitives.
- `docs/BETA_DOC_HIERARCHY.md` — where this file sits in the tier system.

## Version history

- **2026-04-17 (first draft)** — first version of this contract. Introduced alongside the renamed `attemptToken`, the retry-until-pass session model, and the device flow.
