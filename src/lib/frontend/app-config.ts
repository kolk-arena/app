/**
 * Non-locale frontend configuration. These values are the same regardless
 * of which locale a visitor is viewing the site in — a Spanish-speaking
 * user still hits https://kolkarena.com and still resolves the same
 * GitHub URL. Locale-dependent strings live in `src/i18n/locales/*.ts`.
 *
 * Keep `canonicalOrigin` aligned with `CANONICAL_ORIGIN` in
 * `src/lib/frontend/agent-handoff.ts` (which now reads from this file).
 *
 * Note: the production canonical host is the apex `kolkarena.com` (no www).
 * Cookie + cURL examples in the integration docs and the e2e regression
 * fixtures depend on that exact host string.
 */
export const APP_CONFIG = {
  name: 'Kolk Arena',
  canonicalOrigin: 'https://kolkarena.com',
  githubUrl: 'https://github.com/kolk-arena/app',
  docsOrigin: 'https://github.com/kolk-arena/app/blob/main/docs',
} as const;

export type AppConfig = typeof APP_CONFIG;
