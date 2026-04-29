import { APP_CONFIG } from '@/lib/frontend/app-config';
import { ANON_SESSION_COOKIE } from '@/lib/kolk/auth';
import { getAgentCompletionContract } from '@/lib/kolk/agent-contract';
import {
  ANONYMOUS_BETA_MAX_LEVEL,
  L0_ONBOARDING_LEVEL,
  PUBLIC_BETA_MIN_LEVEL,
  RANKED_BETA_MIN_LEVEL,
  SUBMIT_RATE_LIMIT_PER_ATTEMPT_TOKEN_PER_HOUR,
  SUBMIT_RATE_LIMIT_PER_ATTEMPT_TOKEN_PER_MINUTE,
  SUBMIT_RATE_LIMIT_PER_IDENTITY_PER_DAY,
  SUBMIT_RETRY_CAP_PER_ATTEMPT_TOKEN,
} from '@/lib/kolk/beta-contract';
import { MAX_PRIMARY_TEXT_CHARS } from '@/lib/kolk/constants';
import {
  ERROR_CODE_REGISTRY,
  refetchCodes,
  sameAttemptTokenCodes,
} from '@/lib/kolk/error-codes';
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
    // Cross-surface compatibility envelope. An agent can read this once
    // and confirm its mental model of the contract matches what every
    // sibling surface ships. Bumped only when at least one component
    // schema cuts an incompatible change.
    agentContractVersion: 'kolk-agent-contract.v1',
    compatibleSchemas: {
      manifest: 'kolk-automation-manifest.v1',
      catalog: 'kolk-catalog.v1',
      agentContext: 'kolk-agent-context.v2',
      submitResult: 'kolk-submit-result.v2',
      quota: 'kolk-quota.v1',
    },
    // Machine-readable JSON Schema (Draft 2020-12) for every wire surface.
    // Derived from the Zod definitions in src/lib/kolk/schemas; the same
    // Zod schemas validate live payloads in tests, so the JSON Schema
    // agents read here cannot drift from what the routes actually emit.
    schemas: {
      manifest: withCanonicalOrigin('/api/schema/automation-manifest.v1'),
      agentContext: withCanonicalOrigin('/api/schema/agent-context.v2'),
      submitResult: withCanonicalOrigin('/api/schema/submit-result.v2'),
      catalog: withCanonicalOrigin('/api/schema/catalog.v1'),
      quota: withCanonicalOrigin('/api/schema/quota.v1'),
    },
    name: APP_CONFIG.name,
    canonicalOrigin: APP_CONFIG.canonicalOrigin,
    docs: {
      manifest: withCanonicalOrigin('/ai-action-manifest.json'),
      skill: withCanonicalOrigin('/kolk_arena.md'),
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
      status: withCanonicalOrigin('/api/status'),
      sessionStatus: withCanonicalOrigin('/api/session/status'),
      sessionAttempts: withCanonicalOrigin('/api/session/attempts'),
      sessionQuota: withCanonicalOrigin('/api/session/quota'),
      catalog: withCanonicalOrigin('/api/challenges/catalog'),
      manifest: withCanonicalOrigin('/ai-action-manifest.json'),
      compatibilityManifest: withCanonicalOrigin('/api/agent-entrypoint'),
    },
    discovery: {
      browserAgent:
        'Open /play or /challenge/{level} in the same browser session, read inline #kolk-play-state or #kolk-challenge-state when present, then submit through the page.',
      apiAgent:
        'Read /ai-action-manifest.json, fetch /api/challenge/{level}, preserve cookie jar or bearer identity, then submit to /api/challenge/submit with Idempotency-Key.',
      completion:
        'Do not stop after fetch, brief extraction, draft, or payload preparation. A run is complete only after POST /api/challenge/submit returns submit evidence or a terminal API error.',
      recovery:
        'After a client timeout, call /api/session/attempts with the same cookie or bearer identity before refetching.',
      crawlerIndex: withCanonicalOrigin('/llms.txt'),
      robots: withCanonicalOrigin('/robots.txt'),
      sitemap: withCanonicalOrigin('/sitemap.xml'),
    },
    completionContract: getAgentCompletionContract(),
    levels: {
      min: PUBLIC_BETA_MIN_LEVEL,
      onboarding: L0_ONBOARDING_LEVEL,
      rankedMin: RANKED_BETA_MIN_LEVEL,
      anonymousMax: ANONYMOUS_BETA_MAX_LEVEL,
      authRequiredFrom: ANONYMOUS_BETA_MAX_LEVEL + 1,
      competitiveTier: 'L6+',
      catalogIsAuthoritative: true,
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
      identityRule: 'Anonymous L0-L5 automation must preserve the same cookie jar. L6+ browser pages may use the signed-in browser session; external automation should use a bearer token.',
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
      // Derived from src/lib/kolk/error-codes.ts so the manifest cannot drift
      // from the codes the route handlers actually emit.
      sameAttemptToken: sameAttemptTokenCodes(),
      refetch: refetchCodes(),
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
    // Full error-code contract. Agents can look up `byCode[code]` for
    // HTTP status, retry disposition, default Retry-After, and a fix
    // hint without round-tripping into the docs site.
    errorCodes: {
      byCode: Object.fromEntries(
        ERROR_CODE_REGISTRY.map((record) => [
          record.code,
          {
            http: record.http,
            retry: record.retry,
            retryAfterDefault: record.retryAfterDefault,
            fixHint: record.fixHint,
            surfaces: record.surfaces,
          },
        ]),
      ),
      retryDispositions: ['sameAttemptToken', 'refetch', 'auth', 'platform', 'terminal'],
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
