import crypto from 'crypto';
import {
  DEFAULT_DEVICE_FLOW_SCOPES,
  isKnownScope,
  type Scope,
} from '@/lib/kolk/tokens';

const DEVICE_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const USER_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const DEVICE_FLOW_CLIENT_ID = 'kolk-arena-cli';
export const DEVICE_CODE_TTL_SECONDS = 900;
export const DEVICE_CODE_LENGTH = 40;
export const DEFAULT_POLL_INTERVAL_SECONDS = 5;
export const MIN_POLL_INTERVAL_SECONDS = 5;
export const DEVICE_TOKEN_LIFETIME_DAYS = 180;
export const USER_CODE_REGEX = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/;

export const DEVICE_SCOPE_DESCRIPTIONS: Record<Scope, { label: string; detail: string }> = {
  'submit:onboarding': {
    label: 'submit:onboarding',
    detail: 'Submit the L0 onboarding connectivity check.',
  },
  'submit:ranked': {
    label: 'submit:ranked',
    detail: 'Submit ranked runs for the current public ladder.',
  },
  'fetch:challenge': {
    label: 'fetch:challenge',
    detail: 'Fetch challenge packages from GET /api/challenge/:level.',
  },
  'read:profile': {
    label: 'read:profile',
    detail: 'Read the authenticated profile and token identity metadata.',
  },
  'write:profile': {
    label: 'write:profile',
    detail: 'Update editable profile fields for the authenticated user.',
  },
  admin: {
    label: 'admin',
    detail: 'Reserved internal scope. Never granted by the public device flow.',
  },
  'read:submissions': {
    label: 'read:submissions',
    detail: 'Reserved scope for future submission-history APIs.',
  },
};

function randomFromAlphabet(length: number, alphabet: string): string {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}

export function generateDeviceCode(): string {
  return randomFromAlphabet(DEVICE_CODE_LENGTH, DEVICE_CODE_ALPHABET);
}

export function generateUserCode(): string {
  const raw = randomFromAlphabet(8, USER_CODE_ALPHABET);
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export function normalizeUserCode(value: string | null | undefined): string {
  const compact = (value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  if (compact.length === 8) {
    return `${compact.slice(0, 4)}-${compact.slice(4)}`;
  }

  return (value ?? '').trim().toUpperCase();
}

export function isValidUserCode(value: string): boolean {
  return USER_CODE_REGEX.test(value);
}

export function defaultDeviceScopes(): Scope[] {
  return [...DEFAULT_DEVICE_FLOW_SCOPES];
}

export function describeScope(scope: string) {
  if (isKnownScope(scope)) {
    return DEVICE_SCOPE_DESCRIPTIONS[scope];
  }

  return {
    label: scope,
    detail: 'Unknown scope.',
  };
}

export function deviceTokenExpiresAt(now = new Date()): string {
  const expires = new Date(now.getTime() + DEVICE_TOKEN_LIFETIME_DAYS * 24 * 60 * 60 * 1000);
  return expires.toISOString();
}
