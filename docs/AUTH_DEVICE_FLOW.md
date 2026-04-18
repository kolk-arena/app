# Kolk Arena Device Authorization Grant

> **Status:** public beta contract
> **Version:** 2026-04-17
> **Authority:** Tier 1 (see `docs/BETA_DOC_HIERARCHY.md`)

This document specifies how a CLI or other headless tool obtains a Kolk Arena Personal Access Token (PAT) without asking the user to paste a raw token into a terminal. It is a Kolk-Arena-flavored profile of **OAuth 2.0 Device Authorization Grant** ([RFC 8628](https://datatracker.ietf.org/doc/html/rfc8628)).

## Why this exists

The machine surface needs a login flow that:

1. works for CLIs and headless tools
2. avoids copy-pasting long bearer tokens
3. lets the human review and narrow scopes in the browser
4. keeps PAT issuance aligned with the same account system used by the web app

The user journey is:

1. run `kolk-arena login`
2. the CLI prints a short code and a browser URL
3. the user opens `/device`, signs in if needed, reviews scopes, and approves
4. the CLI receives the PAT automatically from the polling endpoint

## Constants

- `USER_CODE_FORMAT` = `^[A-Z0-9]{4}-[A-Z0-9]{4}$`
- `DEVICE_CODE_FORMAT` = opaque 40-character base62 string
- `DEVICE_CODE_TTL` = 900 seconds
- `DEFAULT_POLL_INTERVAL` = 5 seconds
- `MIN_POLL_INTERVAL` = 5 seconds

## Data model

```sql
CREATE TABLE public.ka_device_codes (
  device_code         text PRIMARY KEY,
  user_code           text NOT NULL UNIQUE,
  requested_scopes    text[] NOT NULL DEFAULT '{}',
  granted_scopes      text[] NOT NULL DEFAULT '{}',
  client_kind         text NOT NULL DEFAULT 'cli',
  user_id             uuid REFERENCES ka_users(id),
  issued_token_id     uuid REFERENCES ka_api_tokens(id),
  verified_at         timestamptz,
  denied_at           timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL,
  last_polled_at      timestamptz
);
```

Beta launch does **not** assume a scheduled cleanup job for expired rows. Operators may purge expired rows manually until automation is added later.

## High-level flow

```text
CLI                         Kolk Arena server                       Browser
---                         -----------------                       -------
kolk-arena login
  -> POST /api/auth/device/code
  <- { device_code, user_code, verification_uri, verification_uri_complete, interval }

open /device?code=ABCD-1234
sign in if needed
review scopes
  -> POST /api/auth/device/verify { user_code, device_code, granted_scopes }
  <- { success: true, issued_token_id, granted_scopes }

CLI polls:
  -> POST /api/auth/device/token
  <- { error: "authorization_pending" } until verified
  <- { access_token, token_type, scope, expires_at, token_id } on success
```

`device_code` is the high-entropy proof-of-knowledge value. It is never placed in URLs. The browser page reads it server-side from the pending row and includes it in the verify/deny POST body.

## HTTP contract

### `POST /api/auth/device/code`

Called by the CLI to start a new device flow.

**Request**

```json
{
  "client_id": "kolk-arena-cli",
  "scopes": ["submit:ranked", "fetch:challenge"]
}
```

Rules:

- `client_id` is required. Public CLI value is `kolk-arena-cli`.
- `scopes` is required and non-empty.
- Unknown scopes return `400 UNKNOWN_SCOPE`.

**Response**

```json
{
  "device_code": "opaque-40-char-base62",
  "user_code": "K6H2-4PQX",
  "verification_uri": "https://kolkarena.com/device",
  "verification_uri_complete": "https://kolkarena.com/device?code=K6H2-4PQX",
  "expires_in": 900,
  "interval": 5
}
```

### `POST /api/auth/device/token`

Called by the CLI until the user finishes the browser flow.

**Request**

```json
{
  "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
  "device_code": "opaque-40-char-base62",
  "client_id": "kolk-arena-cli"
}
```

**Pending**

```json
{ "error": "authorization_pending" }
```

**Slow down**

```json
{ "error": "slow_down" }
```

**Denied**

```json
{ "error": "access_denied" }
```

**Expired**

```json
{ "error": "expired_token" }
```

**Success**

```json
{
  "access_token": "kat_abcd...xyz",
  "token_type": "Bearer",
  "scope": "submit:ranked fetch:challenge",
  "expires_at": "2026-10-17T00:00:00Z",
  "token_id": "uuid"
}
```

The raw `access_token` is shown **exactly once** in this response. The CLI must write it to local credential storage immediately and never log it in plaintext.

### `POST /api/auth/device/verify`

Called by the `/device` page after the signed-in user approves the CLI request.

**Request**

```json
{
  "user_code": "K6H2-4PQX",
  "device_code": "opaque-40-char-base62",
  "granted_scopes": ["submit:ranked", "fetch:challenge"]
}
```

**Response**

```json
{
  "success": true,
  "issued_token_id": "uuid",
  "granted_scopes": ["submit:ranked", "fetch:challenge"]
}
```

Authorization rules:

- the user must be signed in through a browser session cookie
- the user must already be verified
- `granted_scopes` must be a subset of `requested_scopes`
- `user_code` and `device_code` must both match the same pending row
- the row must not be expired, verified, or denied already

On success the server:

1. creates a `ka_api_tokens` row with `client_kind = 'device'`
2. stores `issued_token_id`, `granted_scopes`, `verified_at`, and `user_id` on the device-code row
3. leaves token delivery to the next successful CLI poll

### `POST /api/auth/device/deny`

Called by the `/device` page if the user clicks `Cancel`.

**Request**

```json
{
  "user_code": "K6H2-4PQX",
  "device_code": "opaque-40-char-base62"
}
```

**Response**

```json
{ "success": true }
```

The server sets `denied_at` on the row.

## `/device` browser page

The human-side route is `https://kolkarena.com/device`.

Behavior contract:

- **Unauthenticated state:** render the shared sign-in panel and preserve `?code=ABCD-1234` through the auth return path.
- **Authenticated state without `code`:** show a code-entry form for the `user_code`.
- **Authenticated state with `code`:**
  - look up the pending row server-side
  - show requested scopes with checkboxes so the user may narrow scope
  - show `client_kind`, created time, and expiry
  - provide `Authorize` and `Cancel` actions
- **Success state:** show "You can close this window; your CLI is now signed in."
- **Denied state:** show "Request cancelled. Return to your CLI and run `kolk-arena login` again."
- **Expired state:** show "This code has expired. Return to your CLI and run `kolk-arena login` again."
- **Invalid state:** show "This code is not recognized."

Rendering note:

- the page uses a server-rendered auth gate and server-side request lookup
- the code-entry form plus authorize/cancel actions are implemented in a client component
- in the current beta, JS must be enabled for those interactions

## CLI commands

### `kolk-arena login [--scopes ...]`

1. call `POST /api/auth/device/code`
2. print `verification_uri` and `user_code`
3. poll `POST /api/auth/device/token` every `interval` seconds, respecting `slow_down`
4. on success, write the token to local credentials storage
5. print the user summary and granted scopes

### `kolk-arena logout`

1. read the local token id
2. call `DELETE /api/tokens/:id`
3. remove the local credential file
4. print a short confirmation

### `kolk-arena whoami`

Uses the stored PAT to call `GET /api/tokens/me` and prints the current signed-in identity plus granted scopes.

## Security notes

- `user_code` alone is not enough to verify or deny a request; the browser must also present the matching `device_code`
- raw PAT material is delivered only once, through the token polling response
- `/device` never writes the `device_code` into the URL
- browser authorization requires a human account session, not a PAT
