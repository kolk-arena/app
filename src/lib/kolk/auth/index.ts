/**
 * Kolk Arena — Auth Utilities
 *
 * Shared auth utilities for Supabase Auth + Kolk Arena identity sync.
 */

import crypto from 'crypto';
import type { User } from '@supabase/supabase-js';

export type ArenaAuthMethod = 'email' | 'github' | 'google';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Hash a code or token for storage (never store plaintext) */
export function hashCode(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** Generate a session token */
export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function inferAuthMethodFromProvider(provider: string | null | undefined): ArenaAuthMethod {
  if (provider === 'github') return 'github';
  if (provider === 'google') return 'google';
  return 'email';
}

export function inferAuthMethodFromUser(user: User): ArenaAuthMethod {
  return inferAuthMethodFromProvider(
    typeof user.app_metadata?.provider === 'string' ? user.app_metadata.provider : undefined,
  );
}

/** Detect school from email domain */
export function detectSchool(email: string): string | null {
  const domain = normalizeEmail(email).split('@')[1];
  if (!domain) return null;

  // Mexican university detection
  if (domain.endsWith('.edu.mx')) {
    // Extract institution name from domain
    // e.g., "alumno.tecmilenio.edu.mx" → "TecMilenio"
    const parts = domain.replace('.edu.mx', '').split('.');
    const institution = parts[parts.length - 1];
    const schoolMap: Record<string, string> = {
      'tecmilenio': 'TecMilenio',
      'tec': 'Tec de Monterrey',
      'itesm': 'Tec de Monterrey',
      'unam': 'UNAM',
      'ipn': 'IPN',
      'uag': 'UAG',
      'udg': 'UdG',
      'ibero': 'Ibero',
      'anahuac': 'Anáhuac',
      'lasalle': 'La Salle',
      'up': 'UP',
      'itam': 'ITAM',
    };
    return schoolMap[institution] ?? institution.toUpperCase();
  }

  // US/other .edu domains
  if (domain.endsWith('.edu')) {
    const parts = domain.replace('.edu', '').split('.');
    return parts[parts.length - 1].toUpperCase();
  }

  return null;
}

/**
 * Extract auth token from request headers.
 * Supports: `Authorization: Bearer <token>` and `X-Kolk-Token: <token>`
 */
export function extractToken(headers: Headers): string | null {
  const auth = headers.get('authorization');
  if (auth?.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }
  return headers.get('x-kolk-token');
}

/**
 * Extract anonymous tracking token from request.
 * Uses IP + User-Agent hash for L1-L5 anonymous tracking.
 */
export function getAnonToken(request: Request): string {
  const ip = request.headers.get('x-forwarded-for')
    ?? request.headers.get('x-real-ip')
    ?? 'unknown';
  const ua = request.headers.get('user-agent') ?? '';
  return hashCode(`${ip}:${ua}`);
}
