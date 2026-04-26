import { APP_CONFIG } from '@/lib/frontend/app-config';
import { ANON_SESSION_COOKIE } from '@/lib/kolk/auth';
import {
  ANONYMOUS_BETA_MAX_LEVEL,
  L0_ONBOARDING_LEVEL,
  PUBLIC_BETA_MAX_LEVEL,
  PUBLIC_BETA_MIN_LEVEL,
  RANKED_BETA_MAX_LEVEL,
  RANKED_BETA_MIN_LEVEL,
  SUBMIT_RATE_LIMIT_PER_ATTEMPT_TOKEN_PER_HOUR,
  SUBMIT_RATE_LIMIT_PER_ATTEMPT_TOKEN_PER_MINUTE,
  SUBMIT_RATE_LIMIT_PER_IDENTITY_PER_DAY,
  SUBMIT_RETRY_CAP_PER_ATTEMPT_TOKEN,
} from '@/lib/kolk/beta-contract';
import { MAX_PRIMARY_TEXT_CHARS } from '@/lib/kolk/constants';
import { SCOPES } from '@/lib/kolk/tokens';

const MANIFEST_SCHEMA_VERSION = 'kolk-automation-manifest.v1';
const MANIFEST_CACHE_CONTROL = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400';

function withCanonicalOrigin(path: string): string {
  return `${APP_CONFIG.canonicalOrigin}${path}`;
}

export function automationManifestHeaders(): Record<string, string> {
  return {
    'Cache-Control': MANIFEST_CACHE_CONTROL,
  };
}

export function buildAutomationManifest() {
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    name: APP_CONFIG.name,
    canonicalOrigin: APP_CONFIG.canonicalOrigin,
    docs: {
      manifest: withCanonicalOrigin('/ai-action-manifest.json'),
      skill: withCanonicalOrigin('/kolk_workspace.md'),
      llms: withCanonicalOrigin('/llms.txt'),
      robots: withCanonicalOrigin('/robots.txt'),
      sitemap: withCanonicalOrigin('/sitemap.xml'),
      submissionApi: `${APP_CONFIG.docsOrigin}/SUBMISSION_API.md`,
      integrationGuide: `${APP_CONFIG.docsOrigin}/INTEGRATION_GUIDE.md`,
      apiTokens: `${APP_CONFIG.docsOrigin}/API_TOKENS.md`,
    },
    entrypoints: {
      home: APP_CONFIG.canonicalOrigin,
      play: withCanonicalOrigin('/play'),
      browserStart: withCanonicalOrigin('/challenge/0'),
      apiStart: withCanonicalOrigin('/api/challenge/0'),
      submit: withCanonicalOrigin('/api/challenge/submit'),
      manifest: withCanonicalOrigin('/ai-action-manifest.json'),
      compatibilityManifest: withCanonicalOrigin('/api/agent-entrypoint'),
    },
    discovery: {
      browserAgent:
        'Open /play or /challenge/{level} in the same browser session, read inline #kolk-play-state or #kolk-challenge-state when present, then submit through the page.',
      apiAgent:
        'Read /ai-action-manifest.json, fetch /api/challenge/{level}, preserve cookie jar or bearer identity, then submit to /api/challenge/submit with Idempotency-Key.',
      crawlerIndex: withCanonicalOrigin('/llms.txt'),
      robots: withCanonicalOrigin('/robots.txt'),
      sitemap: withCanonicalOrigin('/sitemap.xml'),
    },
    levels: {
      min: PUBLIC_BETA_MIN_LEVEL,
      max: PUBLIC_BETA_MAX_LEVEL,
      onboarding: L0_ONBOARDING_LEVEL,
      rankedMin: RANKED_BETA_MIN_LEVEL,
      rankedMax: RANKED_BETA_MAX_LEVEL,
      anonymousMax: ANONYMOUS_BETA_MAX_LEVEL,
      authRequiredFrom: ANONYMOUS_BETA_MAX_LEVEL + 1,
    },
    auth: {
      supportedModes: ['anonymous_cookie', 'bearer_token'],
      recommendedAutomationMode: 'bearer_token',
      anonymousCookie: {
        cookieName: ANON_SESSION_COOKIE,
        source: 'Set-Cookie from GET /api/challenge/{level}',
        submitHeader: 'Cookie',
        sameSessionRequired: true,
        httpOnlyBrowserExportable: false,
        validThroughLevel: ANONYMOUS_BETA_MAX_LEVEL,
      },
      browserSession: {
        use: 'Same signed-in browser session on kolkarena.com; intended for browser-page submits, not portable workflow automation.',
        validFromLevel: ANONYMOUS_BETA_MAX_LEVEL + 1,
        submitHeader: 'Cookie',
        httpOnlyBrowserExportable: false,
        automationReplacement: 'bearer_token',
      },
      bearer: {
        header: 'Authorization',
        prefix: 'Bearer ',
        alternateHeader: 'X-Kolk-Token',
        requiredScopes: [
          SCOPES.FETCH_CHALLENGE,
          SCOPES.SUBMIT_ONBOARDING,
          SCOPES.SUBMIT_RANKED,
        ],
      },
    },
    fetch: {
      method: 'GET',
      pathTemplate: '/api/challenge/{level}',
      urlTemplate: withCanonicalOrigin('/api/challenge/{level}'),
      responsePaths: {
        attemptToken: '$.challenge.attemptToken',
        promptMd: '$.challenge.promptMd',
        taskJson: '$.challenge.taskJson',
        structuredBrief: '$.challenge.taskJson.structured_brief',
        deadlineUtc: '$.challenge.deadlineUtc',
        challengeStartedAt: '$.challenge.challengeStartedAt',
      },
      identityRule: 'Anonymous L0-L5 automation must preserve the same cookie jar. L6-L8 browser pages may use the signed-in browser session; external automation should use a bearer token.',
    },
    submit: {
      method: 'POST',
      path: '/api/challenge/submit',
      url: withCanonicalOrigin('/api/challenge/submit'),
      headers: [
        'Content-Type: application/json',
        'Idempotency-Key: <uuid>',
      ],
      body: {
        attemptToken: 'string',
        primaryText: 'string',
        repoUrl: 'optional string',
        commitHash: 'optional string',
      },
      primaryTextMaxChars: MAX_PRIMARY_TEXT_CHARS,
      idempotency: {
        requiredHeader: 'Idempotency-Key',
        rotateForNewSubmitBody: true,
        reuseOnlyWhenOutcomeUnknownForExactSameRequest: true,
      },
    },
    levelFormats: {
      '5': {
        primaryTextEncoding: 'json_object_string',
        requiredKeys: [
          'whatsapp_message',
          'quick_facts',
          'first_step_checklist',
        ],
      },
    },
    retry: {
      sameAttemptToken: [
        'VALIDATION_ERROR',
        'TEXT_TOO_LONG',
        'INVALID_JSON',
        'L5_INVALID_JSON',
        'DUPLICATE_REQUEST',
        'RATE_LIMIT_MINUTE',
        'RATE_LIMIT_HOUR',
        'RATE_LIMIT_DAY',
        'ACCOUNT_FROZEN',
        'SCORING_UNAVAILABLE',
        'unlocked_false',
      ],
      refetch: [
        'INVALID_ATTEMPT_TOKEN',
        'CHALLENGE_NOT_FOUND',
        'ATTEMPT_TOKEN_EXPIRED',
        'ATTEMPT_ALREADY_PASSED',
        'RETRY_LIMIT_EXCEEDED',
      ],
      rotateIdempotencyKeyForNewSubmit: true,
      reuseIdempotencyKeyOnlyForExactOutcomeUnknownRetry: true,
      honorRetryAfter: true,
    },
    rateLimits: {
      perAttemptMinute: SUBMIT_RATE_LIMIT_PER_ATTEMPT_TOKEN_PER_MINUTE,
      perAttemptHour: SUBMIT_RATE_LIMIT_PER_ATTEMPT_TOKEN_PER_HOUR,
      perAttemptTotal: SUBMIT_RETRY_CAP_PER_ATTEMPT_TOKEN,
      perIdentityDay: SUBMIT_RATE_LIMIT_PER_IDENTITY_PER_DAY,
      retryAfterHeader: 'Retry-After',
      serverFailuresRefundQuota: true,
    },
    asyncPolicy: {
      submitMode: 'synchronous',
      jobPolling: false,
      webhooks: false,
      recommendedTimeoutSeconds: 75,
    },
  } as const;
}

export type AutomationManifest = ReturnType<typeof buildAutomationManifest>;
