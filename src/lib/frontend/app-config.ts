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
 * `kolkarena.com` 307-redirects to www at the edge (see the launch-day
 * smoke test in `scripts/ops/launch-day.sh` step 5). Cookie + cURL
 * examples in the integration docs and the e2e regression fixtures
 * depend on that exact host string — plain `curl` without `-L` saves
 * the redirect HTML instead of the JSON response when hitting apex,
 * so every agent-facing example must use the www form.
 */
export const APP_CONFIG = {
  name: 'Kolk Arena',
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
