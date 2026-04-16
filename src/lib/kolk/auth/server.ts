import type { NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createRouteHandlerSupabaseClient, supabaseAdmin } from '@/lib/kolk/db';
import {
  detectSchool,
  extractToken,
  generateToken,
  hashCode,
  inferAuthMethodFromUser,
  normalizeEmail,
} from '@/lib/kolk/auth';

type ArenaAuthMethod = 'email' | 'github' | 'google';

export interface ArenaUserRecord {
  id: string;
  email: string;
  display_name: string | null;
  handle: string | null;
  framework: string | null;
  school: string | null;
  country: string | null;
  is_verified: boolean;
  max_level: number;
  auth_methods: string[] | null;
  auth_user_ids: string[] | null;
  token_hash: string | null;
  last_login_method: string | null;
  verified_at: string | null;
}

const ARENA_USER_SELECT = [
  'id',
  'email',
  'display_name',
  'handle',
  'framework',
  'school',
  'country',
  'is_verified',
  'max_level',
  'auth_methods',
  'auth_user_ids',
  'token_hash',
  'last_login_method',
  'verified_at',
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

export function getAppUrl(request?: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');

  if (request) {
    const origin = request.nextUrl.origin;
    if (origin) return origin.replace(/\/$/, '');
  }

  return 'http://localhost:3000';
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
  const school = detectSchool(normalizedEmail);
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
    school: existing?.school ?? school,
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

export async function resolveArenaUserFromRequest(request: NextRequest): Promise<ArenaUserRecord | null> {
  const token = extractToken(request.headers);
  if (token) {
    const tokenHash = hashCode(token);
    const { data: tokenUserRaw } = await supabaseAdmin
      .from('ka_users')
      .select(ARENA_USER_SELECT)
      .eq('token_hash', tokenHash)
      .eq('is_verified', true)
      .maybeSingle();
    const tokenUser = (tokenUserRaw ?? null) as ArenaUserRecord | null;

    if (tokenUser) {
      return tokenUser;
    }
  }

  const { supabase } = createRouteHandlerSupabaseClient(request);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email) {
    return null;
  }

  const synced = await syncArenaIdentityFromSupabaseUser(data.user, { issueApiToken: false });
  return synced.user;
}
