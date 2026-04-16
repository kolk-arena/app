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

async function mockAuthenticatedProfile(page: Page) {
  let profile = {
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

  test('leaderboard preserves detail selection across refresh', async ({ page }) => {
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
    await expect(page.getByText('Detail selection is stored in the URL and survives refresh.')).toBeVisible();

    await page.reload();

    await expect(page).toHaveURL(new RegExp(`\\/leaderboard\\?player=${PLAYER_ID}`));
    await expect(page.getByText('Strong structured delivery with clear coverage.')).toBeVisible();
  });

  test('leaderboard retry recovers detail panel after initial failure', async ({ page }) => {
    await mockLeaderboard(page);

    let detailRequests = 0;
    await page.route(`**/api/leaderboard/${PLAYER_ID}`, async (route) => {
      detailRequests += 1;

      if (detailRequests === 1) {
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
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();

    const secondDetailResponse = page.waitForResponse(`**/api/leaderboard/${PLAYER_ID}`);
    await page.getByRole('button', { name: 'Retry' }).click();
    await secondDetailResponse;

    await expect(page.getByText('Strong structured delivery with clear coverage.')).toBeVisible();
    await expect.poll(() => detailRequests).toBeGreaterThan(1);
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
