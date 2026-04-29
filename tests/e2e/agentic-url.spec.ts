import { expect, test, type APIResponse, type Page } from '@playwright/test';

const AGENTIC_STATE_TIMEOUT_MS = 20_000;
const AGENTIC_NAV_TIMEOUT_MS = 20_000;

async function parseJsonResponse(response: APIResponse) {
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/json');
  return response.json();
}

async function readJsonScript<T>(page: Page, selector: string): Promise<T> {
  const script = page.locator(selector);
  await expect(script).toHaveCount(1, { timeout: AGENTIC_STATE_TIMEOUT_MS });
  const text = await script.textContent();
  expect(text?.trim()).toBeTruthy();
  return JSON.parse(text ?? 'null') as T;
}

function visibleTarget(page: Page, selector: string) {
  return page.locator(selector).filter({ visible: true }).first();
}

async function mockAnonymousPlaySession(page: Page, maxLevel = 0) {
  await page.route('**/api/profile', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Authentication required', code: 'UNAUTHORIZED' }),
    });
  });

  await page.route('**/api/play-state', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'anonymous', max_level: maxLevel }),
    });
  });
}

async function mockLevelZeroChallenge(page: Page) {
  let submitCount = 0;

  await page.route('**/api/challenge/0*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        challenge: {
          challengeId: 'l0-agentic-url',
          level: 0,
          seed: 0,
          variant: 'agentic-url',
          attemptToken: 'attempt-token-agentic-url',
          fetchToken: 'attempt-token-agentic-url',
          taskJson: {
            mode: 'onboarding',
            structured_brief: {
              pass_condition: 'contains Hello or Kolk',
            },
          },
          promptMd: '# Kolk Arena Onboarding\n\nReply with any text that contains `Hello` or `Kolk`.',
          suggestedTimeMinutes: 1,
          timeLimitMinutes: 1440,
          deadlineUtc: '2026-04-18T00:00:00.000Z',
          challengeStartedAt: '2026-04-17T00:00:00.000Z',
        },
        level_info: {
          name: 'Hello World',
          family: 'connectivity_check',
          band: 'A',
          unlock_rule: 'contains_hello_or_kolk',
          suggested_time_minutes: 1,
          is_boss: false,
          ai_judged: false,
          leaderboard_eligible: false,
        },
      }),
    });
  });

  await page.route('**/api/challenge/submit', async (route) => {
    submitCount += 1;
    const body = route.request().postDataJSON() as { attemptToken?: string; primaryText?: string };
    expect(body).toEqual({
      attemptToken: 'attempt-token-agentic-url',
      primaryText: 'Hello, Kolk Arena!',
    });
    expect(route.request().headers()['idempotency-key']).toBeTruthy();

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        submissionId: 'submission-agentic-url',
        challengeId: 'l0-agentic-url',
        level: 0,
        totalScore: 100,
        unlocked: true,
        colorBand: 'BLUE',
        qualityLabel: 'Exceptional',
        summary: 'L0 onboarding check passed from the agentic URL flow.',
        solveTimeSeconds: 18,
        fetchToSubmitSeconds: 18,
        efficiencyBadge: true,
        aiJudged: false,
        leaderboardEligible: false,
        levelUnlocked: 1,
        flags: [],
      }),
    });
  });

  return {
    submitCount: () => submitCount,
  };
}

async function mockLevelOneChallengeWithScoredMiss(page: Page) {
  let fetchCount = 0;
  let submitCount = 0;
  const seenBodies: Array<{ attemptToken?: string; primaryText?: string }> = [];
  const seenIdempotencyKeys: string[] = [];

  await page.route('**/api/challenge/1*', async (route) => {
    fetchCount += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        challenge: {
          challengeId: 'l1-agentic-retry',
          level: 1,
          seed: 1,
          variant: 'agentic-retry',
          attemptToken: 'attempt-token-same-retry',
          fetchToken: 'attempt-token-same-retry',
          taskJson: {
            source_lang: 'en',
            target_lang: 'es-MX',
            structured_brief: {
              source_text: 'Welcome to Kolk Arena.',
              target_locale: 'es-MX',
            },
          },
          promptMd: '# L1 Translation\n\nTranslate the source text into Mexican Spanish.',
          suggestedTimeMinutes: 5,
          timeLimitMinutes: 1440,
          deadlineUtc: '2026-04-18T00:00:00.000Z',
          challengeStartedAt: '2026-04-17T00:00:00.000Z',
        },
        level_info: {
          name: 'Quick Translation',
          family: 'translation',
          band: 'A',
          unlock_rule: 'dual_gate',
          suggested_time_minutes: 5,
          is_boss: false,
          ai_judged: true,
          leaderboard_eligible: true,
        },
      }),
    });
  });

  await page.route('**/api/challenge/submit', async (route) => {
    submitCount += 1;
    const body = route.request().postDataJSON() as { attemptToken?: string; primaryText?: string };
    seenBodies.push(body);
    seenIdempotencyKeys.push(route.request().headers()['idempotency-key'] ?? '');

    expect(body.attemptToken).toBe('attempt-token-same-retry');

    const unlocked = submitCount === 2;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        submissionId: `submission-agentic-retry-${submitCount}`,
        challengeId: 'l1-agentic-retry',
        level: 1,
        structureScore: unlocked ? 35 : 30,
        coverageScore: unlocked ? 24 : 8,
        qualityScore: unlocked ? 24 : 6,
        totalScore: unlocked ? 83 : 44,
        fieldScores: [
          {
            field: 'translation',
            score: unlocked ? 20 : 5,
            reason: unlocked ? 'Translation is usable.' : 'Translation misses the requested locale.',
          },
        ],
        qualitySubscores: { toneFit: 8, clarity: 8, usefulness: 8, businessFit: 8 },
        unlocked,
        failReason: unlocked ? null : 'QUALITY_FLOOR',
        colorBand: unlocked ? 'GREEN' : 'ORANGE',
        qualityLabel: unlocked ? 'Strong' : 'Needs work',
        summary: unlocked
          ? 'L1 passed after same-attempt retry.'
          : 'Revise the translation for Mexican Spanish and resubmit with the same attempt token.',
        solveTimeSeconds: 31,
        fetchToSubmitSeconds: 31,
        efficiencyBadge: false,
        aiJudged: true,
        leaderboardEligible: true,
        levelUnlocked: unlocked ? 2 : 1,
        flags: [],
      }),
    });
  });

  return {
    fetchCount: () => fetchCount,
    submitCount: () => submitCount,
    seenBodies: () => seenBodies,
    seenIdempotencyKeys: () => seenIdempotencyKeys,
  };
}

test.describe('agentic URL surfaces', () => {
  test.describe.configure({ timeout: 60_000 });

  test('static automation manifest and compatibility alias return the same contract', async ({ request }) => {
    const canonicalResponse = await request.get('/ai-action-manifest.json');
    const canonical = await parseJsonResponse(canonicalResponse);
    const aliasResponse = await request.get('/api/agent-entrypoint');
    const alias = await parseJsonResponse(aliasResponse);

    expect(alias).toEqual(canonical);
    expect(canonicalResponse.headers()['cache-control']).toContain('s-maxage=3600');
    expect(aliasResponse.headers()['cache-control']).toContain('s-maxage=3600');
    expect(canonical.schemaVersion).toBe('kolk-automation-manifest.v1');
    expect(canonical.entrypoints.manifest).toBe('https://www.kolkarena.com/ai-action-manifest.json');
    expect(canonical.entrypoints.compatibilityManifest).toBe('https://www.kolkarena.com/api/agent-entrypoint');
    expect(canonical.entrypoints.play).toBe('https://www.kolkarena.com/play');
    expect(canonical.entrypoints.browserStart).toBe('https://www.kolkarena.com/challenge/0');
    expect(canonical.entrypoints.apiStart).toBe('https://www.kolkarena.com/api/challenge/0');
    expect(canonical.entrypoints.submit).toBe('https://www.kolkarena.com/api/challenge/submit');
    expect(canonical.entrypoints.status).toBe('https://www.kolkarena.com/api/status');
    expect(canonical.entrypoints.sessionStatus).toBe('https://www.kolkarena.com/api/session/status');
    expect(canonical.entrypoints.sessionAttempts).toBe('https://www.kolkarena.com/api/session/attempts');
    expect(canonical.entrypoints.sessionQuota).toBe('https://www.kolkarena.com/api/session/quota');
    expect(canonical.entrypoints.catalog).toBe('https://www.kolkarena.com/api/challenges/catalog');
    expect(canonical.docs.submissionApi).toBe('https://www.kolkarena.com/docs/SUBMISSION_API.md');
    expect(canonical.docs.integrationGuide).toBe('https://www.kolkarena.com/docs/INTEGRATION_GUIDE.md');
    expect(canonical.auth.supportedModes).toEqual(['anonymous_cookie', 'bearer_token']);
    expect(canonical.auth.recommendedAutomationMode).toBe('bearer_token');
    expect(canonical.auth.anonymousCookie.sameSessionRequired).toBe(true);
    expect(canonical.fetch.responsePaths).toMatchObject({
      attemptToken: '$.challenge.attemptToken',
      promptMd: '$.challenge.promptMd',
      taskJson: '$.challenge.taskJson',
      structuredBrief: '$.challenge.taskJson.structured_brief',
    });
    expect(canonical.submit.headers).toContain('Idempotency-Key: <uuid>');
    expect(canonical.submit.primaryTextMaxChars).toBe(50000);
    expect(canonical.retry.sameAttemptToken).toContain('SCORING_UNAVAILABLE');
    expect(canonical.retry.refetch).toContain('ATTEMPT_TOKEN_EXPIRED');
    expect(canonical.rateLimits).toMatchObject({
      perAttemptMinute: 6,
      perAttemptHour: 40,
      perAttemptTotal: 10,
      perIdentityDay: 99,
    });
    expect(canonical.asyncPolicy).toMatchObject({
      submitMode: 'synchronous',
      jobPolling: false,
      webhooks: false,
    });
  });

  test('browser agent can start at /play, read state, follow selectors, and solve L0', async ({ page }) => {
    await mockAnonymousPlaySession(page, 0);
    const challengeMock = await mockLevelZeroChallenge(page);

    await page.goto('/play');

    const playState = await readJsonScript<{
      schemaVersion: string;
      pageType: string;
      recommended: { level: number; challengeUrl: string; apiUrl: string; action: string };
      selectors: { primaryCta: string; levelCard: string };
      docs: { manifest: string; skill: string; llms: string };
    }>(page, '#kolk-play-state');

    expect(playState.schemaVersion).toBe('kolk-play-state.v1');
    expect(playState.pageType).toBe('play');
    expect(playState.recommended).toMatchObject({
      level: 0,
      challengeUrl: 'https://www.kolkarena.com/challenge/0',
      apiUrl: 'https://www.kolkarena.com/api/challenge/0',
      action: 'open_challenge_url_in_same_browser_session',
    });
    expect(playState.docs).toMatchObject({
      manifest: 'https://www.kolkarena.com/ai-action-manifest.json',
      skill: 'https://www.kolkarena.com/kolk_arena.md',
      llms: 'https://www.kolkarena.com/llms.txt',
    });
    const primaryCta = visibleTarget(page, playState.selectors.primaryCta);
    await expect(primaryCta).toBeVisible();
    await expect(page.locator(playState.selectors.levelCard).first()).toBeVisible();

    await Promise.all([
      page.waitForURL(/\/challenge\/0$/, { timeout: AGENTIC_NAV_TIMEOUT_MS }),
      primaryCta.click(),
    ]);

    const challengeState = await readJsonScript<{
      schemaVersion: string;
      pageType: string;
      challengeUrl: string;
      apiUrl: string;
      level: number;
      levelName: string;
      sameSessionRequired: boolean;
      sourceOfTruth: {
        promptMd: string;
        taskJson: Record<string, unknown>;
        structuredBrief: Record<string, unknown> | null;
      };
      attempt: {
        attemptToken: string;
        sensitive: boolean;
        deadlineUtc: string;
        challengeStartedAt: string;
      };
      output: { field: string; type: string; maxChars: number };
      completionContract: {
        notCompleteUntil: string;
        evidenceFields: string[];
      };
      submit: {
        method: string;
        url: string;
        headers: Record<string, string>;
        body: Record<string, string>;
      };
      selectors: Record<string, string>;
      retryPolicy: {
        sameAttemptToken: string[];
        refetch: string[];
        honorRetryAfter: boolean;
      };
    }>(page, '#kolk-challenge-state');

    expect(challengeState.schemaVersion).toBe('kolk-challenge-state.v1');
    expect(challengeState.pageType).toBe('challenge');
    expect(challengeState.challengeUrl).toBe('https://www.kolkarena.com/challenge/0');
    expect(challengeState.apiUrl).toBe('https://www.kolkarena.com/api/challenge/0');
    expect(challengeState.level).toBe(0);
    expect(challengeState.levelName).toBe('Hello World');
    expect(challengeState.sameSessionRequired).toBe(true);
    expect(challengeState.sourceOfTruth.promptMd).toContain('Kolk Arena Onboarding');
    expect(challengeState.sourceOfTruth.structuredBrief).toEqual({
      pass_condition: 'contains Hello or Kolk',
    });
    expect(challengeState.attempt).toMatchObject({
      attemptToken: 'attempt-token-agentic-url',
      sensitive: true,
      deadlineUtc: '2026-04-18T00:00:00.000Z',
      challengeStartedAt: '2026-04-17T00:00:00.000Z',
    });
    expect(challengeState.output).toMatchObject({
      field: 'primaryText',
      type: 'string',
      maxChars: 50000,
    });
    expect(challengeState.completionContract.notCompleteUntil).toContain('POST /api/challenge/submit');
    expect(challengeState.completionContract.evidenceFields).toContain('submissionId');
    expect(challengeState.completionContract.evidenceFields).toContain('unlocked');
    expect(challengeState.submit).toMatchObject({
      method: 'POST',
      url: 'https://www.kolkarena.com/api/challenge/submit',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': '<uuid>',
        Cookie: '<same anonymous browser session cookie>',
      },
      body: {
        attemptToken: '<from attempt.attemptToken>',
        primaryText: '<final delivery text only>',
      },
    });
    expect(challengeState.retryPolicy.sameAttemptToken).toContain('unlocked_false');
    expect(challengeState.retryPolicy.refetch).toContain('RETRY_LIMIT_EXCEEDED');
    expect(challengeState.retryPolicy.honorRetryAfter).toBe(true);

    await expect(visibleTarget(page, challengeState.selectors.brief)).toBeVisible();
    await expect(visibleTarget(page, challengeState.selectors.structuredBrief)).toBeVisible();
    await expect(visibleTarget(page, challengeState.selectors.primaryText)).toBeVisible();
    await expect(visibleTarget(page, challengeState.selectors.dryRun)).toBeVisible();
    await expect(visibleTarget(page, challengeState.selectors.submit)).toBeVisible();

    await visibleTarget(page, challengeState.selectors.primaryText).fill('Hello, Kolk Arena!');
    await visibleTarget(page, challengeState.selectors.submit).click();

    const result = page.locator(challengeState.selectors.result);
    await expect(result).toBeVisible();
    await expect(result).toHaveAttribute('data-kolk-unlocked', 'true');
    await expect(result).toHaveAttribute('data-kolk-submission-id', 'submission-agentic-url');
    await expect(page.getByText('L0 onboarding check passed from the agentic URL flow.')).toBeVisible();
    expect(challengeMock.submitCount()).toBe(1);
  });

  test('scored miss retries on the same challenge session instead of refetching', async ({ page }) => {
    const challengeMock = await mockLevelOneChallengeWithScoredMiss(page);

    await page.goto('/challenge/1');
    const challengeState = await readJsonScript<{
      selectors: Record<string, string>;
      retryPolicy: { sameAttemptToken: string[]; doNotRefetchAfterUnlockedFalse: boolean };
    }>(page, '#kolk-challenge-state');

    expect(challengeState.retryPolicy.sameAttemptToken).toContain('unlocked_false');
    expect(challengeState.retryPolicy.doNotRefetchAfterUnlockedFalse).toBe(true);

    await visibleTarget(page, challengeState.selectors.primaryText).fill('bad translation');
    await visibleTarget(page, challengeState.selectors.submit).click();

    const firstResult = page.locator(challengeState.selectors.result);
    await expect(firstResult).toBeVisible();
    await expect(firstResult).toHaveAttribute('data-kolk-unlocked', 'false');
    await expect(page.getByText('Revise the translation for Mexican Spanish')).toBeVisible();

    await page.locator('[data-kolk-action="retry-same-attempt"]').click();
    await expect(visibleTarget(page, challengeState.selectors.primaryText)).toBeVisible();
    await visibleTarget(page, challengeState.selectors.primaryText).fill('Bienvenido a Kolk Arena.');
    await visibleTarget(page, challengeState.selectors.submit).click();

    const finalResult = page.locator(challengeState.selectors.result);
    await expect(finalResult).toBeVisible();
    await expect(finalResult).toHaveAttribute('data-kolk-unlocked', 'true');
    await expect(page.getByText('L1 passed after same-attempt retry.')).toBeVisible();

    expect(challengeMock.fetchCount()).toBe(1);
    expect(challengeMock.submitCount()).toBe(2);
    expect(challengeMock.seenBodies()).toEqual([
      { attemptToken: 'attempt-token-same-retry', primaryText: 'bad translation' },
      { attemptToken: 'attempt-token-same-retry', primaryText: 'Bienvenido a Kolk Arena.' },
    ]);
    const [firstKey, secondKey] = challengeMock.seenIdempotencyKeys();
    expect(firstKey).toBeTruthy();
    expect(secondKey).toBeTruthy();
    expect(secondKey).not.toBe(firstKey);
  });
});
