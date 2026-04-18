import { expect, test, type Page } from '@playwright/test';

const PLAYER_ID = '11111111-1111-4111-8111-111111111111';

function mockAnonymousSession(page: Page) {
  return page.route('**/api/profile', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Authentication required', code: 'UNAUTHORIZED' }),
      });
      return;
    }

    await route.continue();
  });
}

async function mockPlayState(page: Page, maxLevel: number) {
  await page.route('**/api/play-state', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'anonymous',
        max_level: maxLevel,
      }),
    });
  });
}

async function mockAuthenticatedProfile(page: Page) {
  type MockProfile = {
    id: string;
    email: string;
    display_name: string;
    handle: string | null;
    framework: string | null;
    school: string | null;
    country: string | null;
    auth_methods: string[];
    max_level: number;
    verified_at: string;
  };

  let profile: MockProfile = {
    id: PLAYER_ID,
    email: 'ada@example.com',
    display_name: 'Ada Lovelace',
    handle: 'ada',
    framework: 'OpenAI Agents',
    school: 'Independent',
    country: 'UK',
    auth_methods: ['github'],
    max_level: 7,
    verified_at: '2026-04-16T00:00:00.000Z',
  };

  await page.route('**/api/profile', async (route) => {
    const method = route.request().method();

    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ profile }),
      });
      return;
    }

    if (method === 'PATCH') {
      const body = route.request().postDataJSON() as {
        displayName?: string;
        handle?: string | null;
        framework?: string | null;
        school?: string | null;
        country?: string | null;
      };

      profile = {
        ...profile,
        display_name: body.displayName ?? profile.display_name,
        handle: body.handle ?? null,
        framework: body.framework ?? null,
        school: body.school ?? null,
        country: body.country ?? null,
      };

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ profile }),
      });
      return;
    }

    await route.continue();
  });
}

async function mockProfileSessionExpiresOnSave(page: Page) {
  const profile: {
    id: string;
    email: string;
    display_name: string;
    handle: string | null;
    framework: string | null;
    school: string | null;
    country: string | null;
    auth_methods: string[];
    max_level: number;
    verified_at: string;
  } = {
    id: PLAYER_ID,
    email: 'ada@example.com',
    display_name: 'Ada Lovelace',
    handle: 'ada',
    framework: 'OpenAI Agents',
    school: 'Independent',
    country: 'UK',
    auth_methods: ['github'],
    max_level: 7,
    verified_at: '2026-04-16T00:00:00.000Z',
  };

  await page.route('**/api/profile', async (route) => {
    const method = route.request().method();

    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ profile }),
      });
      return;
    }

    if (method === 'PATCH') {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Authentication required', code: 'UNAUTHORIZED' }),
      });
      return;
    }

    await route.continue();
  });
}

async function mockLogout(page: Page) {
  await page.route('**/api/auth/logout', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    });
  });
}

async function mockEmailRegister(page: Page) {
  await page.route('**/api/auth/register', async (route) => {
    const body = route.request().postDataJSON() as {
      email?: string;
      displayName?: string;
      nextPath?: string;
    };

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'verification_pending',
        email: body.email,
        display_name: body.displayName ?? 'ada',
        next_path: body.nextPath,
        message: 'Check your email for the verification code or sign-in link.',
      }),
    });
  });
}

async function mockLeaderboard(page: Page) {
  await page.route('**/api/leaderboard?*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        leaderboard: [
          {
            player_id: PLAYER_ID,
            rank: 1,
            display_name: 'Ada Lovelace',
            handle: 'ada',
            school: 'Independent',
            highest_level: 7,
            best_score_on_highest: 96.5,
            total_score: 320.5,
            levels_completed: 7,
            tier: 'champion',
            last_submission_at: '2026-04-16T00:00:00.000Z',
          },
          {
            player_id: '22222222-2222-4222-8222-222222222222',
            rank: 2,
            display_name: 'Grace Hopper',
            handle: 'grace',
            school: 'Independent',
            highest_level: 6,
            best_score_on_highest: 90,
            total_score: 280,
            levels_completed: 6,
            tier: 'specialist',
            last_submission_at: '2026-04-15T00:00:00.000Z',
          },
        ],
        total: 2,
        page: 1,
        limit: 25,
      }),
    });
  });
}

function playerDetailPayload() {
  return {
    leaderboardRow: {
      highest_level: 7,
      total_score: 320.5,
      levels_completed: 7,
      tier: 'champion',
      last_submission_at: '2026-04-16T00:00:00.000Z',
      best_scores: {
        '7': 96.5,
        '6': 92,
      },
    },
    userRow: {
      id: PLAYER_ID,
      display_name: 'Ada Lovelace',
      handle: 'ada',
      framework: 'OpenAI Agents',
      school: 'Independent',
      country: 'UK',
      max_level: 7,
      verified_at: '2026-04-16T00:00:00.000Z',
    },
    submissions: [
      {
        id: 'submission-1',
        level: 7,
        total_score: 96.5,
        structure_score: 32,
        coverage_score: 32,
        quality_score: 32.5,
        submitted_at: '2026-04-16T00:00:00.000Z',
        judge_summary: 'Strong structured delivery with clear coverage.',
        repo_url: 'https://github.com/example/repo',
        commit_hash: 'abc1234',
        flags: [],
      },
    ],
  };
}

test.describe('frontend UI regression', () => {
  test.describe.configure({ timeout: 60_000 });

  test('home anonymous flow renders sign-in panel and email success state', async ({ page }) => {
    await mockAnonymousSession(page);
    await mockEmailRegister(page);

    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Kolk Arena' })).toBeVisible();
    const emailSignInSection = page.locator('#email-sign-in');
    await expect(emailSignInSection.getByText('Sign in required')).toBeVisible();
    await expect(emailSignInSection.getByRole('link', { name: 'Sign in with GitHub' })).toBeVisible();

    const submitButton = emailSignInSection.getByRole('button', { name: 'Send sign-in link' });
    await expect(submitButton).toBeDisabled();

    await emailSignInSection.getByLabel('Email').fill('ada@example.com');
    await emailSignInSection.getByLabel('Display name').fill('Ada Lovelace');
    await expect(submitButton).toBeEnabled();
    await submitButton.click();

    await expect(emailSignInSection.getByText('Check your email for the verification code or sign-in link.')).toBeVisible();
  });

  test('device auth page preserves the pending code through sign-in', async ({ page }) => {
    await mockAnonymousSession(page);
    await mockEmailRegister(page);

    await page.goto('/device?code=ABCD-1234');

    await expect(page.getByRole('heading', { name: 'Sign in to authorize your CLI' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in with GitHub' })).toHaveAttribute('href', /next=%2Fdevice%3Fcode%3DABCD-1234/);
    await expect(page.getByRole('link', { name: 'Sign in with Google' })).toHaveAttribute('href', /next=%2Fdevice%3Fcode%3DABCD-1234/);

    await page.getByLabel('Email').fill('ada@example.com');
    await page.getByLabel('Display name').fill('Ada Lovelace');
    await page.getByRole('button', { name: 'Send sign-in link' }).click();

    await expect(page.getByText('Check your email for the verification code or sign-in link.')).toBeVisible();
  });

  test('profile handles authenticated load, save, and logout', async ({ page }) => {
    await mockAuthenticatedProfile(page);
    await mockLogout(page);

    await page.goto('/profile');

    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
    await expect(page.getByText('ada@example.com')).toBeVisible();
    await expect(page.getByLabel('Display name')).toHaveValue('Ada Lovelace');

    await page.getByLabel('Display name').fill('Ada Byron');
    await page.getByRole('button', { name: 'Save profile' }).click();

    await expect(page.getByLabel('Display name')).toHaveValue('Ada Byron');

    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL('/');
  });

  test('profile falls back to sign-in when session expires during save', async ({ page }) => {
    await mockProfileSessionExpiresOnSave(page);

    await page.goto('/profile');

    await expect(page.getByLabel('Display name')).toHaveValue('Ada Lovelace');
    await page.getByLabel('Display name').fill('Ada Byron');
    await page.getByRole('button', { name: 'Save profile' }).click();

    await expect(page.getByText('Session expired')).toBeVisible();
    await expect(page.getByText('Your session has expired. Sign in again to save your changes.', { exact: true })).toBeVisible();
    await expect(page.getByRole('main').getByRole('link', { name: 'GitHub' })).toBeVisible();
  });

  test('play hub restores anonymous progression from browser-session state', async ({ page }) => {
    await mockAnonymousSession(page);
    await mockPlayState(page, 3);

    await page.goto('/play');

    await expect(page.getByText('Anonymous browser-session progress detected up to')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Start L4 →' })).toBeVisible();
    await expect(page.getByText('Locked · clear L4 first')).toBeVisible();
  });

  test('challenge L0 completes onboarding flow', async ({ page }) => {
    await page.route('**/api/challenge/0*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          challenge: {
            challengeId: 'l0-onboarding',
            level: 0,
            seed: 0,
            variant: 'onboarding',
            attemptToken: 'attempt-token-l0',
            fetchToken: 'attempt-token-l0',
            taskJson: { mode: 'onboarding' },
            promptMd: "# Kolk Arena Onboarding\n\nReply with any text that contains `Hello` or `Kolk` (case-insensitive).",
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
      const body = route.request().postDataJSON() as { attemptToken: string; primaryText: string };
      expect(body.attemptToken).toBe('attempt-token-l0');
      expect(body.primaryText).toContain('Hello');

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          submissionId: 'submission-l0',
          challengeId: 'l0-onboarding',
          level: 0,
          totalScore: 100,
          unlocked: true,
          colorBand: 'BLUE',
          qualityLabel: 'Exceptional',
          summary: 'L0 onboarding check passed. Your integration is connected.',
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

    const fetchResponse = page.waitForResponse('**/api/challenge/0*');
    await page.goto('/challenge/0', { waitUntil: 'domcontentloaded' });
    await fetchResponse;

    await expect(page.locator('textarea')).toHaveValue('Hello, Kolk Arena!');
    await page.getByRole('button', { name: 'Submit delivery' }).click();

    await expect(page.getByText('L0 onboarding check passed. Your integration is connected.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Try L1 →' })).toBeVisible();
  });

  test('challenge re-fetch gets a fresh brief without relying on same-url remounts', async ({ page }) => {
    let fetchCount = 0;

    await page.route('**/api/challenge/1*', async (route) => {
      fetchCount += 1;

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          challenge: {
            challengeId: `challenge-${fetchCount}`,
            level: 1,
            seed: fetchCount,
            variant: 'v1',
            attemptToken: `attempt-token-${fetchCount}`,
            fetchToken: `attempt-token-${fetchCount}`,
            taskJson: { structured_brief: { source_lang: 'en', target_lang: 'es-MX' } },
            promptMd: fetchCount === 1 ? '# Order Brief A' : '# Order Brief B',
            suggestedTimeMinutes: 5,
            timeLimitMinutes: 1440,
            deadlineUtc: '2026-04-18T00:00:00.000Z',
            challengeStartedAt: '2026-04-17T00:00:00.000Z',
          },
          level_info: {
            name: 'Quick Translate',
            family: 'txt_translation',
            band: 'A',
            unlock_rule: 'dual_gate',
            suggested_time_minutes: 5,
            is_boss: false,
            ai_judged: true,
            leaderboard_eligible: false,
          },
        }),
      });
    });

    const firstFetch = page.waitForResponse('**/api/challenge/1*');
    await page.goto('/challenge/1', { waitUntil: 'domcontentloaded' });
    await firstFetch;

    await expect(page.getByText('# Order Brief A')).toBeVisible();
    const secondFetch = page.waitForResponse('**/api/challenge/1*');
    await page.getByRole('button', { name: 'Re-fetch a fresh brief' }).click();
    await secondFetch;
    await expect(page.getByText('# Order Brief B')).toBeVisible();
    await expect.poll(() => fetchCount).toBe(2);
  });

  test('leaderboard preserves detail selection across refresh', async ({ page }) => {
    await mockLeaderboard(page);
    await page.route(`**/api/leaderboard/${PLAYER_ID}*`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(playerDetailPayload()),
      });
    });

    await page.goto('/leaderboard');

    await Promise.all([
      page.waitForResponse(`**/api/leaderboard/${PLAYER_ID}*`),
      page.getByRole('button', { name: 'Open player detail for Ada Lovelace' }).click(),
    ]);
    await expect(page).toHaveURL(new RegExp(`\\/leaderboard\\?player=${PLAYER_ID}`));
    await expect(page.getByText('Strong structured delivery with clear coverage.')).toBeVisible();
    await expect(page.getByText('Detail selection is stored in the URL and survives refresh.')).toBeVisible();

    await Promise.all([
      page.waitForResponse('**/api/leaderboard?*'),
      page.waitForResponse(`**/api/leaderboard/${PLAYER_ID}*`),
      page.reload({ waitUntil: 'domcontentloaded' }),
    ]);

    await expect(page).toHaveURL(new RegExp(`\\/leaderboard\\?player=${PLAYER_ID}`));
    await expect(page.getByText('Strong structured delivery with clear coverage.')).toBeVisible();
  });

  test('leaderboard retry recovers detail panel after initial failure', async ({ page }) => {
    await mockLeaderboard(page);

    let detailRequests = 0;
    await page.route(`**/api/leaderboard/${PLAYER_ID}`, async (route) => {
      detailRequests += 1;

      if (detailRequests <= 2) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Temporary upstream failure' }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(playerDetailPayload()),
      });
    });

    await page.goto('/leaderboard');

    const firstDetailResponse = page.waitForResponse(`**/api/leaderboard/${PLAYER_ID}`);
    await page.getByRole('button', { name: 'Open player detail for Ada Lovelace' }).click();
    await firstDetailResponse;
    await expect.poll(() => detailRequests).toBeGreaterThanOrEqual(1);
    await expect(page.getByText('Failed to load player detail')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();

    const secondDetailResponse = page.waitForResponse(`**/api/leaderboard/${PLAYER_ID}`);
    await page.getByRole('button', { name: 'Retry' }).click();
    await secondDetailResponse;

    await expect(page.getByText('Strong structured delivery with clear coverage.')).toBeVisible();
    await expect.poll(() => detailRequests).toBeGreaterThan(1);
  });

  test('leaderboard filter clears selected player and returns to list-only state', async ({ page }) => {
    await mockLeaderboard(page);
    await page.route(`**/api/leaderboard/${PLAYER_ID}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(playerDetailPayload()),
      });
    });

    await page.goto('/leaderboard');

    const detailResponse = page.waitForResponse(`**/api/leaderboard/${PLAYER_ID}`);
    await page.getByRole('button', { name: 'Open player detail for Ada Lovelace' }).click();
    await detailResponse;

    await expect(page).toHaveURL(new RegExp(`\\/leaderboard\\?player=${PLAYER_ID}`));
    await expect(page.getByText('Strong structured delivery with clear coverage.')).toBeVisible();

    await page.getByLabel('Framework Filter').fill('Cursor');
    await page.getByRole('button', { name: 'Apply' }).click();

    await expect(page).toHaveURL(/\/leaderboard\?page=1&limit=25&framework=Cursor|\/leaderboard\?framework=Cursor&page=1&limit=25|\/leaderboard\?framework=Cursor&page=1|\/leaderboard\?page=1&framework=Cursor|\/leaderboard\?framework=Cursor/);
    await expect(page).not.toHaveURL(new RegExp(`player=${PLAYER_ID}`));
    await expect(page.getByRole('heading', { name: 'Select a player' })).toBeVisible();
  });

  test('mobile leaderboard cards keep navigation semantics instead of expand semantics', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockLeaderboard(page);

    await page.goto('/leaderboard');

    const mobileCard = page.getByRole('button', { name: 'Open player page for Ada Lovelace' });
    await expect(mobileCard).toBeVisible();
    await expect(mobileCard).not.toHaveAttribute('aria-controls', /.+/);
    await expect(mobileCard).not.toHaveAttribute('aria-expanded', /.+/);
  });
});
