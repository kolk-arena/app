/**
 * Non-locale frontend configuration. These values are the same regardless
 * of which locale a visitor is viewing the site in — a Spanish-speaking
 * user still hits https://www.kolkarena.com and still resolves the same
 * GitHub URL. Locale-dependent strings live in `src/i18n/locales/*.ts`.
 *
 * Keep `canonicalOrigin` aligned with `CANONICAL_ORIGIN` in
 * `src/lib/frontend/agent-handoff.ts` (which now reads from this file).
 *
 * Note: the production canonical host is `www.kolkarena.com`. The apex
 * `kolkarena.com` redirects to www before auth or challenge handling.
 * Cookie + cURL examples in the integration docs and e2e fixtures depend
 * on that exact host string — plain `curl` without `-L` saves redirect
 * HTML instead of JSON when hitting apex, so every agent-facing example
 * must use the www form.
 */
export const APP_CONFIG = {
  name: 'Kolk',
  canonicalOrigin: 'https://www.kolkarena.com',
  githubUrl: 'https://github.com/kolk-arena/app',
  docsOrigin: 'https://github.com/kolk-arena/app/blob/main/docs',
  twitterUrl: 'https://x.com/kolkarena',
  twitterHandle: '@kolkarena',
  publicGithubAuthEnabled: process.env.NEXT_PUBLIC_ENABLE_GITHUB_AUTH === '1',
  publicGoogleAuthEnabled: process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH === '1',
} as const;

export type AppConfig = typeof APP_CONFIG;

export function isPublicOAuthProviderEnabled(provider: 'github' | 'google') {
  return provider === 'github'
    ? APP_CONFIG.publicGithubAuthEnabled
    : APP_CONFIG.publicGoogleAuthEnabled;
}
