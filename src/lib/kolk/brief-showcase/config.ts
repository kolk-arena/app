/**
 * Gig preview — runtime configuration
 */

import type { FrontendLocale } from '@/i18n/types';
import { AI_PROVIDERS, type AiProvider } from '@/lib/kolk/ai/runtime';

const SUPPORTED_LOCALES: readonly FrontendLocale[] = ['en', 'es-mx', 'zh-tw'] as const;

function isSupportedLocale(code: string): code is FrontendLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(code);
}

function parseLocales(raw: string | undefined): FrontendLocale[] {
  if (!raw) return ['en'];
  const codes = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(isSupportedLocale);
  // `new Set<FrontendLocale>(iter)` inherits the narrower element type from
  // its generic argument, so `Array.from` returns a correctly typed
  // `FrontendLocale[]` without needing a cast at the call site.
  return Array.from(new Set<FrontendLocale>(['en', ...codes]));
}

function parseProvider(raw: string | undefined): AiProvider {
  const fallback: AiProvider = 'xai';
  if (!raw) return fallback;
  const normalized = raw.trim().toLowerCase();
  return (AI_PROVIDERS as readonly string[]).includes(normalized)
    ? (normalized as AiProvider)
    : fallback;
}

export function normalizeLocale(raw: string | null | undefined): FrontendLocale {
  const normalized = (raw ?? '').trim().toLowerCase();
  if (normalized === 'es' || normalized === 'es-mx') return 'es-mx';
  if (normalized === 'zh' || normalized === 'zh-tw' || normalized === 'zh-hant') return 'zh-tw';
  return 'en';
}

function env(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

export const BRIEF_SHOWCASE_CONFIG = {
  enabled: env('KOLK_BRIEF_SHOWCASE_ENABLED', 'BRIEF_SHOWCASE_ENABLED') === '1',
  locales: parseLocales(env('KOLK_BRIEF_SHOWCASE_EXTRA_LOCALES', 'BRIEF_SHOWCASE_LOCALES')),
  refreshMinutes: Math.max(1, Math.min(180, Number(env('KOLK_BRIEF_SHOWCASE_REFRESH_MINUTES', 'BRIEF_SHOWCASE_REFRESH_MINUTES')) || 60)),
  provider: parseProvider(env('KOLK_BRIEF_SHOWCASE_PROVIDER', 'BRIEF_SHOWCASE_PROVIDER')),
  model: env('KOLK_BRIEF_SHOWCASE_MODEL', 'BRIEF_SHOWCASE_MODEL'),
  cronSecret: env('CRON_SECRET'),
} as const;

export function isBriefShowcaseEnabled(): boolean {
  return BRIEF_SHOWCASE_CONFIG.enabled;
}
