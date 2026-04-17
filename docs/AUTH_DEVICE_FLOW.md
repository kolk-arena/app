# Kolk Arena Device Authorization Grant (CLI sign-in)

> **Status:** public beta contract · **Version:** 2026-04-17 first draft · **Authority:** Tier 1 (see `docs/BETA_DOC_HIERARCHY.md`)
>
> This document specifies how a CLI or headless tool obtains a Kolk Arena Personal Access Token (PAT) without asking the user to copy-paste anything sensitive into a terminal. It is a Kolk-Arena-flavored profile of **OAuth 2.0 Device Authorization Grant** ([RFC 8628](https://datatracker.ietf.org/doc/html/rfc8628)), the same flow GitHub CLI (`gh auth login`) uses.

## Why this exists

The machine surface (PATs, see `docs/API_TOKENS.md`) needs a way to reach a CLI without the user having to:

1. Open a browser on a separate flow,
2. Manually generate a PAT from `/profile`,
3. Copy the long `kat_…` string,
4. Paste it into the CLI.

That sequence is error-prone, trains the user to handle credentials in terminals (a bad habit), and actively discourages sensible scope restrictions. The device flow turns it into:

1. `kolk-arena login`
2. CLI prints a short code and a URL.
3. User opens the URL in their browser (already signed in or signs in once), enters the code, approves the scopes, clicks "Authorize".
4. CLI receives the token automatically.

No raw token is ever shown on the terminal or copied by the human.

## High-level flow

```
CLI                                   Kolk Arena server                    Browser (user)
────                                  ─────────────────                    ──────────────

kolk-arena login
  │
  ├── POST /api/auth/device/code ───►  generate device_code + user_code
  │                                    store with expires_at = now() + 15 min
  │◄─────────────── device_code + user_code + verification_uri + interval
  │
  ├── prints:
  │   "Open https://kolkarena.com/device and enter ABCD-1234"
  │                                                                        User visits /device
  │                                                                        (signs in if needed)
  │                                                                        enters ABCD-1234
  │                                                                        reviews scopes
  │                                                                        clicks Authorize
  │                                                         /device POSTs:
  │                                                         POST /api/auth/device/verify
  │                                                         with { user_code, granted_scopes }
  │                                   link device_code to user_id
  │                                   mint ka_api_tokens row
  │                                   mark device_code verified
  │
  ├── POST /api/auth/device/token  (poll every `interval` sec)
  │◄─────────────── { error: "authorization_pending" } ... until verified
  │◄─────────────── { access_token: "kat_...", scopes: [...], expires_at }
  │
  └── save ~/.config/kolk-arena/credentials.json (0600)
```

## Constants

- `USER_CODE_FORMAT` = four-char-hyphen-four-char, uppercase alphanumeric avoiding confusable characters. Regex: `^[A-Z0-9]{4}-[A-Z0-9]{4}$`. Example: `K6H2-4PQX`.
- `DEVICE_CODE_FORMAT` = 40-char base62, server-opaque.
- `DEVICE_CODE_TTL` = 900 seconds (15 minutes).
- `DEFAULT_POLL_INTERVAL` = 5 seconds.
- `MIN_POLL_INTERVAL` = 5 seconds. Server may tell the client to slow down; never speed up.

## Data model

```sql
CREATE TABLE public.ka_device_codes (
  device_code         text PRIMARY KEY,             -- opaque 40-char base62
  user_code           text NOT NULL UNIQUE,         -- ABCD-1234 shown to human
  requested_scopes    text[] NOT NULL DEFAULT '{}',
  granted_scopes      text[] NOT NULL DEFAULT '{}',
  client_kind         text NOT NULL DEFAULT 'cli',
  user_id             uuid REFERENCES ka_users(id), -- NULL until the user verifies
  issued_token_id     uuid REFERENCES ka_api_tokens(id),
  verified_at         timestamptz,
  denied_at           timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL,
  last_polled_at      timestamptz
);

CREATE INDEX idx_ka_device_codes_user_code ON ka_device_codes(user_code);
CREATE INDEX idx_ka_device_codes_expires   ON ka_device_codes(expires_at);
```

Expired rows are retained for 24h for audit visibility, then purged by a scheduled cleanup job.

## HTTP contract

### `POST /api/auth/device/code`

Called by the CLI to initiate a new device flow.

**Request**

```json
{
  "client_id": "kolk-arena-cli",
  "scopes": ["submit:ranked", "fetch:challenge"]
}
```

- `client_id` required. For public CLI use, value is `"kolk-arena-cli"`. (Validation is informational, not a security boundary.)
- `scopes` required, non-empty. All scopes must be in the published list (see `docs/API_TOKENS.md`); unknown scopes return `400 UNKNOWN_SCOPE`.

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

Called by the CLI periodically until the user finishes the browser flow.

**Request**

```json
{
  "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
  "device_code": "opaque-40-char-base62",
  "client_id": "kolk-arena-cli"
}
```

**Response — pending (status 400)**

Returned while `verified_at` is still NULL.

```json
{ "error": "authorization_pending" }
```

**Response — slow_down (status 400)**

Returned if the client polls faster than `interval`. The CLI must increase its polling interval by at least 5 seconds.

```json
{ "error": "slow_down" }
```

**Response — denied (status 400)**

Returned if the user explicitly clicked "Cancel" on the `/device` page.

```json
{ "error": "access_denied" }
```

**Response — expired (status 400)**

Returned if `now > expires_at` and the flow was never completed.

```json
{ "error": "expired_token" }
```

**Response — success (status 200)**

```json
{
  "access_token": "kat_abcd...xyz",
  "token_type": "Bearer",
  "scope": "submit:ranked fetch:challenge",
  "expires_at": "2026-10-17T00:00:00Z",
  "token_id": "uuid"
}
```

The raw `access_token` is shown **exactly once** in this response. The CLI must write it to its local credential store immediately and never log it in plaintext.

### `POST /api/auth/device/verify`

Called by the `/device` page (not by the CLI) after the user confirms.

**Request** (authenticated as the signed-in user via session cookie)

```json
{
  "user_code": "K6H2-4PQX",
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

- The session user must be verified (`is_verified = true`).
- `granted_scopes` must be a subset of `requested_scopes` stored on the device_code row. The UI must let the user deselect scopes, but must not let them grant scopes that were not originally requested.
- `user_code` must match, must not be expired, and must not already be `verified_at` / `denied_at`.

On success, the server:

1. Inserts a new `ka_api_tokens` row with `client_kind = 'device'`.
2. Sets `issued_token_id`, `granted_scopes`, `verified_at`, `user_id` on the `ka_device_codes` row.
3. Persists nothing else.

### `POST /api/auth/device/deny`

Called by the `/device` page if the user clicks "Cancel".

**Request**

```json
{ "user_code": "K6H2-4PQX" }
```

**Response**

```json
{ "success": true }
```

Sets `denied_at` on the row.

## `/device` browser page

A server-rendered page at `https://kolkarena.com/device` handles the human side.

**Behaviour contract**

- **Unauthenticated state:** prompt the user to sign in, preserving `?code=ABCD-1234` through the OAuth callback.
- **Authenticated state:**
  - If no `code` query param, show an input field for `user_code`.
  - If a `code` is present, look it up and render:
    - The CLI's requested scopes, **with checkboxes** the user can uncheck before authorizing.
    - A human-readable description of each scope.
    - The `client_kind` (e.g. "kolk-arena-cli") and the time the request was made.
    - Two buttons: `Authorize` (→ `/api/auth/device/verify`) and `Cancel` (→ `/api/auth/device/deny`).
  - On success, show "You can close this window; your CLI is now signed in."
  - On denial, show "Request cancelled. Return to your CLI and run `kolk-arena login` again if you want to restart."
  - On expired, show "This code has expired. Return to your CLI and run `kolk-arena login` again."
- The `/device` page is **server-rendered** — not a client-only SPA — so it degrades gracefully when JS is disabled.

## CLI commands

### `kolk-arena login [--scopes ...]`

1. Call `POST /api/auth/device/code` with the requested scopes (default: `submit:onboarding`, `submit:ranked`, `fetch:challenge`, `read:profile`).
2. Print `verification_uri` and `user_code` in bold.
3. Poll `POST /api/auth/device/token` every `interval` seconds, respecting `slow_down`.
4. On success, write the token to `~/.config/kolk-arena/credentials.json` with mode `0600`:

   ```json
   {
     "access_token": "kat_abcd...xyz",
     "token_id": "uuid",
     "scopes": ["submit:ranked", "fetch:challenge"],
     "expires_at": "2026-10-17T00:00:00Z",
     "base_url": "https://kolkarena.com",
     "signed_in_at": "2026-04-17T13:05:00Z"
   }
   ```

5. Print the user's display name (from a single `GET /api/tokens/me` call) and the granted scopes, then exit.

### `kolk-arena logout`

1. Read the token id from the local file.
2. Call `DELETE /api/tokens/:id`.
3. Remove `~/.config/kolk-arena/credentials.json`.
4. Print a short confirmation.

### `kolk-arena whoami`

Call `GET /api/tokens/me` and print the user + scopes. If there is no local credential, print "not signed in" and exit 1.

### Credential store

- Path: `~/.config/kolk-arena/credentials.json`, or `$KOLK_ARENA_CONFIG_DIR/credentials.json` if set.
- Mode: `0600` on POSIX. The CLI must refuse to read a credential file with wider permissions (prints a warning and exits).
- Windows: `%APPDATA%\kolk-arena\credentials.json`, ACL reset to current user only on write.
- Env override: `KOLK_TOKEN=<raw>` is honored before the file is read, for CI use.

## Error taxonomy

| Error | Where emitted | Client behavior |
|---|---|---|
| `authorization_pending` | `device/token` | Continue polling at `interval` |
| `slow_down` | `device/token` | Increase polling interval by ≥ 5 s |
| `access_denied` | `device/token` | Abort and show "cancelled" |
| `expired_token` | `device/token` | Abort and suggest re-running `login` |
| `invalid_grant` | `device/token` | Abort; the device_code is unknown or malformed |
| `invalid_client` | `device/code`, `device/token` | Abort; the client_id is not recognised |
| `UNKNOWN_SCOPE` | `device/code` | Abort; the CLI is asking for a scope the server does not publish |

## Security properties

- **No bearer ever in URL.** Neither `device_code` nor the issued PAT is ever carried in a query string, only in JSON bodies.
- **Short TTL.** The 15-minute `expires_at` means a stolen `user_code` is useful only briefly.
- **User-visible authorization step.** The user must click a button on an authenticated browser; automated abuse requires the victim's active cooperation.
- **Scope-down.** The UI may scope-down the requested set, never scope-up.
- **Revocation path.** The issued PAT appears on the user's `/profile` "API tokens" list and can be revoked immediately.
- **Audit.** Each completed device flow leaves a row in `ka_device_codes` linked to the issued `ka_api_tokens` row.

## Future extensions (not part of this contract)

- Refresh tokens (not needed yet — PATs are long-lived).
- OAuth authorization code flow for web-hosted integrators (different surface entirely).
- Backchannel device pairing via push notifications.

## Version history

- **2026-04-17 (first draft)** — first version. Introduced alongside `docs/API_TOKENS.md`, the renamed `attemptToken`, and the retry-until-pass session model.
