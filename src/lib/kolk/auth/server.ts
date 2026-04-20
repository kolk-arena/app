import type { NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';
import {
  createRouteHandlerSupabaseClient,
  createServerComponentSupabaseClient,
  supabaseAdmin,
} from '@/lib/kolk/db';
import {
  detectAffiliation,
  extractToken,
  generateToken,
  hashCode,
  inferAuthMethodFromUser,
  normalizeEmail,
} from '@/lib/kolk/auth';
import {
  hashToken,
  looksLikeKatToken,
  type Scope,
} from '@/lib/kolk/tokens';
import { APP_CONFIG } from '@/lib/frontend/app-config';

type ArenaAuthMethod = 'email' | 'github' | 'google';

export interface ArenaUserRecord {
  id: string;
  email: string;
  display_name: string | null;
  handle: string | null;
  agent_stack: string | null;
  affiliation: string | null;
  country: string | null;
  is_verified: boolean;
  max_level: number;
  auth_methods: string[] | null;
  auth_user_ids: string[] | null;
  token_hash: string | null;
  last_login_method: string | null;
  verified_at: string | null;
  pioneer: boolean;
}

const ARENA_USER_SELECT = [
  'id',
  'email',
  'display_name',
  'handle',
  'agent_stack',
  'affiliation',
  'country',
  'is_verified',
  'max_level',
  'auth_methods',
  'auth_user_ids',
  'token_hash',
  'last_login_method',
  'verified_at',
  'pioneer',
].join(', ');

function dedupe(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function sanitizeDisplayName(value: string | null | undefined, fallbackEmail: string): string {
  const trimmed = value?.trim();
  if (trimmed) return trimmed.slice(0, 60);
  return fallbackEmail.split('@')[0];
}

/**
 * Sanitize a `next` redirect path to prevent open-redirect attacks.
 * Only allows relative paths (starts with `/`) and blocks protocol-relative URLs (`//`).
 */
export function sanitizeNextPath(next: string | null | undefined): string {
  if (!next) return '/';
  if (next.startsWith('/') && !next.startsWith('//')) return next;
  return '/';
}

// Priority order for determining the app's public URL (used in emails,
// OAuth redirects, and any absolute-URL surface):
//   1. NEXT_PUBLIC_APP_URL env var (operator-configured, wins always)
//   2. request.nextUrl.origin (real host the request landed on), UNLESS
//      it's a localhost / preview origin and we're running in production
//      — in that case we ignore it so a forwarded preview deploy never
//      emits `http://localhost:3000/...` magic-link URLs into emails
//      that real users receive.
//   3. APP_CONFIG.canonicalOrigin (https://www.kolkarena.com), the
//      hard-coded launch-day host. Previous fallback was localhost,
//      which meant a missing env var on prod leaked into email links
//      and broke email sign-in on launch (2026-04-20).
export function getAppUrl(request?: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');

  if (request) {
    const origin = request.nextUrl.origin;
    if (origin) {
      const isLocalishOrigin = /^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(origin);
      const isProd = process.env.NODE_ENV === 'production';
      if (!(isProd && isLocalishOrigin)) {
        return origin.replace(/\/$/, '');
      }
    }
  }

  return APP_CONFIG.canonicalOrigin.replace(/\/$/, '');
}

export async function upsertArenaIdentity(input: {
  email: string;
  displayName?: string | null;
  authMethod: ArenaAuthMethod;
  authUserId?: string | null;
  verified?: boolean;
  issueApiToken?: boolean;
}) {
  const normalizedEmail = normalizeEmail(input.email);
  const affiliation = detectAffiliation(normalizedEmail);
  const now = new Date().toISOString();

  // Look up by email first, then fall back to auth_user_ids (handles email changes)
  let existingRaw = null;
  const { data: byEmail } = await supabaseAdmin
    .from('ka_users')
    .select(ARENA_USER_SELECT)
    .eq('email', normalizedEmail)
    .maybeSingle();
  existingRaw = byEmail;

  if (!existingRaw && input.authUserId) {
    // Email changed on Supabase side — find by auth_user_id to maintain identity continuity
    const { data: byAuthId } = await supabaseAdmin
      .from('ka_users')
      .select(ARENA_USER_SELECT)
      .contains('auth_user_ids', [input.authUserId])
      .maybeSingle();
    if (byAuthId) {
      existingRaw = byAuthId;
      const matched = byAuthId as unknown as ArenaUserRecord;
      // Update email to the new one
      await supabaseAdmin
        .from('ka_users')
        .update({ email: normalizedEmail })
        .eq('id', matched.id);
    }
  }

  const existing = (existingRaw ?? null) as ArenaUserRecord | null;

  const authMethods = dedupe([
    ...(existing?.auth_methods ?? []),
    input.authMethod,
  ]);

  const authUserIds = dedupe([
    ...(existing?.auth_user_ids ?? []),
    input.authUserId ?? null,
  ]);

  const displayName = existing?.display_name
    ? (input.displayName?.trim() ? sanitizeDisplayName(input.displayName, normalizedEmail) : existing.display_name)
    : sanitizeDisplayName(input.displayName, normalizedEmail);

  let apiToken: string | null = null;
  let tokenHash = existing?.token_hash ?? null;
  if (input.issueApiToken) {
    apiToken = generateToken();
    tokenHash = hashCode(apiToken);
  }

  const payload = {
    email: normalizedEmail,
    display_name: displayName,
    affiliation: existing?.affiliation ?? affiliation,
    is_verified: input.verified ?? existing?.is_verified ?? false,
    verified_at: (input.verified ?? existing?.is_verified) ? (existing?.verified_at ?? now) : existing?.verified_at,
    auth_methods: authMethods,
    auth_user_ids: authUserIds,
    last_login_method: input.authMethod,
    token_hash: tokenHash,
  };

  const query = existing
    ? supabaseAdmin.from('ka_users').update(payload).eq('id', existing.id)
    : supabaseAdmin.from('ka_users').insert(payload);

  const { data: savedRaw, error } = await query
    .select(ARENA_USER_SELECT)
    .single();
  const data = (savedRaw ?? null) as ArenaUserRecord | null;

  if (error || !data) {
    throw error ?? new Error('Failed to upsert Kolk Arena identity');
  }

  return {
    user: data as ArenaUserRecord,
    apiToken,
  };
}

export async function syncArenaIdentityFromSupabaseUser(
  user: User,
  options?: { displayName?: string | null; issueApiToken?: boolean },
) {
  const email = user.email;
  if (!email) {
    throw new Error('Supabase user is missing email');
  }

  // Only mark as verified if Supabase has actually confirmed the email/provider
  const isEmailConfirmed = !!user.email_confirmed_at;
  const isOAuthUser = user.app_metadata?.provider !== 'email';
  const shouldVerify = isEmailConfirmed || isOAuthUser;

  return upsertArenaIdentity({
    email,
    displayName:
      options?.displayName
      ?? (typeof user.user_metadata?.display_name === 'string' ? user.user_metadata.display_name : null)
      ?? (typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : null)
      ?? (typeof user.user_metadata?.name === 'string' ? user.user_metadata.name : null),
    authMethod: inferAuthMethodFromUser(user),
    authUserId: user.id,
    verified: shouldVerify,
    issueApiToken: options?.issueApiToken,
  });
}

/**
 * Result of an auth resolution. Carries the arena user plus (when the
 * credential was a PAT) the scopes the token was issued with. The session
 * path returns `scopes === null` to mark "human surface" — PAT creation
 * / revocation endpoints should refuse these cases.
 */
export interface ArenaAuthContext {
  user: ArenaUserRecord;
  /** PAT id when resolved from a kat_* token; null when resolved from a session. */
  apiTokenId: string | null;
  /**
   * null = session cookie (human surface); array = PAT scopes (machine surface).
   */
  scopes: Scope[] | null;
}

export async function resolveArenaAuthContext(request: NextRequest): Promise<ArenaAuthContext | null> {
  const token = extractToken(request.headers);

  if (token) {
    // Machine surface: Personal Access Token (kat_*)
    if (looksLikeKatToken(token)) {
      const apiToken = await resolveApiToken(token);
      if (apiToken) {
        return {
          user: apiToken.user,
          apiTokenId: apiToken.id,
          scopes: apiToken.scopes,
        };
      }
    }

    // Legacy: ka_users.token_hash (pre-PAT era). Kept for one minor release.
    const tokenHash = hashCode(token);
    const { data: tokenUserRaw } = await supabaseAdmin
      .from('ka_users')
      .select(ARENA_USER_SELECT)
      .eq('token_hash', tokenHash)
      .eq('is_verified', true)
      .maybeSingle();
    const tokenUser = (tokenUserRaw ?? null) as ArenaUserRecord | null;
    if (tokenUser) {
      return { user: tokenUser, apiTokenId: null, scopes: null };
    }
  }

  // Human surface: Supabase session cookie
  const { supabase } = createRouteHandlerSupabaseClient(request);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email) {
    return null;
  }

  const synced = await syncArenaIdentityFromSupabaseUser(data.user, { issueApiToken: false });
  return { user: synced.user, apiTokenId: null, scopes: null };
}

/**
 * Backwards-compat wrapper — returns just the user. New code should use
 * `resolveArenaAuthContext` when it needs the scopes or the PAT id.
 */
export async function resolveArenaUserFromRequest(request: NextRequest): Promise<ArenaUserRecord | null> {
  const ctx = await resolveArenaAuthContext(request);
  return ctx?.user ?? null;
}

export async function resolveArenaUserFromServerComponent(): Promise<ArenaUserRecord | null> {
  const { supabase } = await createServerComponentSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email) {
    return null;
  }

  const synced = await syncArenaIdentityFromSupabaseUser(data.user, { issueApiToken: false });
  return synced.user;
}

/**
 * Look up a PAT by hash. Returns null if unknown, revoked, or expired.
 * Updates last_used_at on success (best-effort; not awaited).
 */
async function resolveApiToken(raw: string): Promise<{
  id: string;
  user: ArenaUserRecord;
  scopes: Scope[];
} | null> {
  const tokenHash = hashToken(raw);

  const { data: tokenRowRaw } = await supabaseAdmin
    .from('ka_api_tokens')
    .select('id, user_id, scopes, expires_at, revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  const tokenRow = tokenRowRaw as {
    id: string;
    user_id: string;
    scopes: string[] | null;
    expires_at: string | null;
    revoked_at: string | null;
  } | null;

  if (!tokenRow) return null;
  if (tokenRow.revoked_at) return null;
  if (tokenRow.expires_at && new Date(tokenRow.expires_at).getTime() <= Date.now()) return null;

  const { data: userRaw } = await supabaseAdmin
    .from('ka_users')
    .select(ARENA_USER_SELECT)
    .eq('id', tokenRow.user_id)
    .eq('is_verified', true)
    .maybeSingle();

  const user = (userRaw ?? null) as ArenaUserRecord | null;
  if (!user) return null;

  // Best-effort last_used_at update (not awaited, not blocking)
  void supabaseAdmin
    .from('ka_api_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', tokenRow.id);

  return {
    id: tokenRow.id,
    user,
    scopes: (tokenRow.scopes ?? []) as Scope[],
  };
}
