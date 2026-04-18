/**
 * Kolk Arena Personal Access Tokens (machine surface).
 *
 * Contract: docs/API_TOKENS.md
 *
 * Tokens are `kat_<40 base62 chars>`, stored as sha256(raw). A raw token
 * is returned to the client exactly once at creation; afterwards only the
 * prefix and hash are retrievable.
 */

import crypto from 'crypto';

// ============================================================================
// Token format
// ============================================================================

export const TOKEN_PREFIX = 'kat_';
export const TOKEN_RANDOM_LENGTH = 40;
const BASE62_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Full token = "kat_" + 40 base62 chars. */
export function generateRawToken(): string {
  const bytes = crypto.randomBytes(TOKEN_RANDOM_LENGTH);
  let out = '';
  for (let i = 0; i < TOKEN_RANDOM_LENGTH; i++) {
    out += BASE62_ALPHABET[bytes[i]! % BASE62_ALPHABET.length];
  }
  return `${TOKEN_PREFIX}${out}`;
}

/** sha256 hex of the raw token. Stored in ka_api_tokens.token_hash. */
export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/** First 12 characters of the raw token (e.g. "kat_abcd1234"). UI display only. */
export function tokenPrefix(raw: string): string {
  return raw.slice(0, 12);
}

/** Structure check only — does NOT validate the hash. */
export function looksLikeKatToken(value: string): boolean {
  return typeof value === 'string'
    && value.startsWith(TOKEN_PREFIX)
    && value.length === TOKEN_PREFIX.length + TOKEN_RANDOM_LENGTH;
}

// ============================================================================
// Scopes
// ============================================================================

export const SCOPES = {
  SUBMIT_ONBOARDING: 'submit:onboarding',
  SUBMIT_RANKED: 'submit:ranked',
  FETCH_CHALLENGE: 'fetch:challenge',
  READ_PROFILE: 'read:profile',
  WRITE_PROFILE: 'write:profile',
  READ_SUBMISSIONS: 'read:submissions',   // reserved; not emitted yet
  ADMIN: 'admin',                         // reserved; never issued via device flow
} as const;

export type Scope = typeof SCOPES[keyof typeof SCOPES];

export const ALL_SCOPES: readonly Scope[] = Object.values(SCOPES);

export const DEFAULT_DEVICE_FLOW_SCOPES: readonly Scope[] = [
  SCOPES.SUBMIT_ONBOARDING,
  SCOPES.SUBMIT_RANKED,
  SCOPES.FETCH_CHALLENGE,
  SCOPES.READ_PROFILE,
];

export function isKnownScope(value: unknown): value is Scope {
  return typeof value === 'string' && (ALL_SCOPES as readonly string[]).includes(value);
}

export function normalizeScopes(input: readonly string[]): {
  valid: Scope[];
  unknown: string[];
} {
  const valid: Scope[] = [];
  const unknown: string[] = [];
  for (const scope of input) {
    if (isKnownScope(scope)) valid.push(scope);
    else unknown.push(scope);
  }
  // Dedupe while preserving order
  const seen = new Set<Scope>();
  const deduped: Scope[] = [];
  for (const scope of valid) {
    if (!seen.has(scope)) {
      seen.add(scope);
      deduped.push(scope);
    }
  }
  return { valid: deduped, unknown };
}

export function hasScope(tokenScopes: readonly string[], required: Scope): boolean {
  return tokenScopes.includes(required);
}

export function missingScopes(
  tokenScopes: readonly string[],
  required: readonly Scope[],
): Scope[] {
  return required.filter((scope) => !tokenScopes.includes(scope));
}

// ============================================================================
// DB row shape (mirrors ka_api_tokens columns without the token_hash)
// ============================================================================

export type ClientKind = 'cli' | 'web' | 'device' | 'other';

export interface ApiTokenRow {
  id: string;
  user_id: string;
  name: string;
  token_hash: string;
  token_prefix: string;
  scopes: string[];
  client_kind: ClientKind;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
}

export interface ApiTokenPublicView {
  id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  client_kind: ClientKind;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
}

export function toPublicTokenView(row: ApiTokenRow): ApiTokenPublicView {
  return {
    id: row.id,
    name: row.name,
    token_prefix: row.token_prefix,
    scopes: row.scopes,
    client_kind: row.client_kind,
    created_at: row.created_at,
    last_used_at: row.last_used_at,
    expires_at: row.expires_at,
  };
}

export function isActive(row: Pick<ApiTokenRow, 'revoked_at' | 'expires_at'>): boolean {
  if (row.revoked_at !== null) return false;
  if (row.expires_at === null) return true;
  return new Date(row.expires_at).getTime() > Date.now();
}
