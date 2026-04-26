import { expect, test, type Page } from '@playwright/test';

const PLAYER_ID = '11111111-1111-4111-8111-111111111111';

async function mockClipboard(page: Page) {
  await page.addInitScript(() => {
    let clipboardValue = '';
    Object.defineProperty(window, '__mockClipboard', {
      configurable: true,
      writable: true,
      value: '',
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          clipboardValue = value;
          (window as { __mockClipboard?: string }).__mockClipboard = clipboardValue;
        },
      },
    });
  });
}

async function readClipboard(page: Page) {
  return page.evaluate(() => (window as { __mockClipboard?: string }).__mockClipboard ?? '');
}

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
    agent_stack: string | null;
    affiliation: string | null;
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
    agent_stack: 'OpenAI Agents',
    affiliation: 'Independent',
    country: 'GB',
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
        agentStack?: string | null;
        affiliation?: string | null;
        country?: string | null;
      };

      profile = {
        ...profile,
        display_name: body.displayName ?? profile.display_name,
        handle: body.handle ?? null,
        agent_stack: body.agentStack ?? null,
        affiliation: body.affiliation ?? null,
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
  let sessionExpired = false;
  const profile: {
    id: string;
    email: string;
    display_name: string;
    handle: string | null;
    agent_stack: string | null;
    affiliation: string | null;
    country: string | null;
    auth_methods: string[];
    max_level: number;
    verified_at: string;
  } = {
    id: PLAYER_ID,
    email: 'ada@example.com',
    display_name: 'Ada Lovelace',
    handle: 'ada',
    agent_stack: 'OpenAI Agents',
    affiliation: 'Independent',
    country: 'GB',
    auth_methods: ['email'],
    max_level: 7,
    verified_at: '2026-04-16T00:00:00.000Z',
  };

  await page.route('**/api/profile', async (route) => {
    const method = route.request().method();

    if (method === 'GET') {
      if (sessionExpired) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Authentication required', code: 'UNAUTHORIZED' }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ profile }),
      });
      return;
    }

    if (method === 'PATCH') {
      sessionExpired = true;
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
    const entries = [
      {
        row_key: `player_${PLAYER_ID}`,
        player_id: PLAYER_ID,
        rank: 1,
        display_name: 'Ada Lovelace',
        handle: 'ada',
        agent_stack: 'OpenAI Agents',
        affiliation: 'Independent',
        highest_level: 7,
        best_score_on_highest: 96.5,
        best_color_band: 'BLUE',
        best_quality_label: 'Exceptional',
        solve_time_seconds: 214,
        efficiency_badge: true,
        total_score: 320.5,
        levels_completed: 7,
        tier: 'champion',
        pioneer: false,
        is_anon: false,
        last_submission_at: '2026-04-16T00:00:00.000Z',
        country_code: 'GB',
      },
      {
        row_key: 'player_22222222-2222-4222-8222-222222222222',
        player_id: '22222222-2222-4222-8222-222222222222',
        rank: 2,
        display_name: 'Grace Hopper',
        handle: 'grace',
        agent_stack: 'test-stack',
        affiliation: 'Independent',
        highest_level: 6,
        best_score_on_highest: 90,
        best_color_band: 'GREEN',
        best_quality_label: 'Strong',
        solve_time_seconds: 301,
        efficiency_badge: false,
        total_score: 280,
        levels_completed: 6,
        tier: 'specialist',
        pioneer: false,
        is_anon: false,
        last_submission_at: '2026-04-15T00:00:00.000Z',
        country_code: 'US',
      },
      {
        row_key: 'anon_abcd1234abcd1234',
        player_id: null,
        rank: 3,
        display_name: 'Anonymous abcd',
        handle: null,
        agent_stack: null,
        affiliation: null,
        highest_level: 1,
        best_score_on_highest: 88,
        best_color_band: 'GREEN',
        best_quality_label: 'Strong',
        solve_time_seconds: 52,
        efficiency_badge: true,
        total_score: 88,
        levels_completed: 1,
        tier: 'starter',
        pioneer: false,
        is_anon: true,
        last_submission_at: '2026-04-17T00:00:00.000Z',
        country_code: 'MX',
      },
    ];
    const url = new URL(route.request().url());
    const agentStack = (url.searchParams.get('agent_stack') ?? '').toLowerCase();
    const affiliation = (url.searchParams.get('affiliation') ?? '').toLowerCase();
    const filteredEntries = entries.filter((entry) => {
      const matchesAgentStack = !agentStack || (entry.agent_stack ?? '').toLowerCase().includes(agentStack);
      const matchesAffiliation = !affiliation || (entry.affiliation ?? '').toLowerCase().includes(affiliation);
      return matchesAgentStack && matchesAffiliation;
    });
    const agentStackCounts = new Map<string, number>();
    for (const entry of filteredEntries) {
      const name = entry.agent_stack;
      if (!name) continue;
      agentStackCounts.set(name, (agentStackCounts.get(name) ?? 0) + 1);
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        leaderboard: filteredEntries,
        total: filteredEntries.length,
        page: 1,
        limit: 25,
        agent_stack_stats: Array.from(agentStackCounts.entries()).map(([name, count]) => ({
          agent_stack: name,
          count,
          percentage: Math.round((count / Math.max(filteredEntries.length, 1)) * 100),
        })),
      }),
    });
  });

  await page.route('**/api/activity-feed', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        feed: [
          {
            id: 'feed-1',
            player_id: PLAYER_ID,
            level: 7,
            display_name: 'Ada Lovelace',
            agent_stack: 'OpenAI Agents',
            total_score: 96.5,
            color_band: 'BLUE',
            quality_label: 'Exceptional',
            solve_time_seconds: 214,
            submitted_at: '2026-04-16T00:00:00.000Z',
            unlocked: true,
          },
          {
            id: 'feed-2',
            player_id: '22222222-2222-4222-8222-222222222222',
            level: 6,
            display_name: 'Grace Hopper',
            agent_stack: 'test-stack',
            total_score: 90,
            color_band: 'GREEN',
            quality_label: 'Strong',
            solve_time_seconds: 301,
            submitted_at: '2026-04-15T00:00:00.000Z',
            unlocked: false,
          },
        ],
      }),
    });
  });
}

function playerDetailPayload() {
  return {
    leaderboardRow: {
      highest_level: 7,
      best_score_on_highest: 96.5,
      best_color_band: 'BLUE',
      best_quality_label: 'Exceptional',
      solve_time_seconds: 214,
      efficiency_badge: true,
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
      agent_stack: 'OpenAI Agents',
      affiliation: 'Independent',
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

  test('agent workspace surfaces are discoverable (kolk_workspace.md + llms.txt + homepage card)', async ({ page, request }) => {
    // The two canonical static agent surfaces served from `public/`:
    // `/kolk_workspace.md` is the public workspace file; `/llms.txt` is the short
    // LLM-crawler index. Both are served verbatim from the Next.js static
    // handler, so a 200 + canonical marker in the body is proof that the
    // file is live and the content has not drifted.
    const skillResponse = await request.get('/kolk_workspace.md');
    expect(skillResponse.status()).toBe(200);
    const skillBody = await skillResponse.text();
    expect(skillBody).toContain('# Kolk Arena — Agent Skill');
    expect(skillBody).toContain('Dual-Gate');
    expect(skillBody).toContain('Install this file as a skill');

    const llmsResponse = await request.get('/llms.txt');
    expect(llmsResponse.status()).toBe(200);
    const llmsBody = await llmsResponse.text();
    expect(llmsBody).toContain('# Kolk Arena');
    expect(llmsBody).toContain('kolk_workspace.md');

    // Homepage has to surface the skill CTA as the first interactive card
    // the visitor lands on — that is the whole point of promoting it.
    await mockAnonymousSession(page);
    await mockEmailRegister(page);
    await page.goto('/');
    const agentSkill = page.locator('#agent-skill');
    await expect(agentSkill.getByText(/Load kolk_workspace\.md into your agent first/i)).toBeVisible();
    await agentSkill.locator('summary').click();
    // The preview used to live inside a <details><summary>Preview
    // kolk_workspace.md</summary> fold; the latest skill card renders the
    // CodeBlock inline with title="kolk_workspace.md" — assert the filename
    // surfaces on the page rather than the old summary element.
    await expect(agentSkill.getByText('kolk_workspace.md', { exact: true }).first()).toBeVisible();
    await expect(agentSkill.getByRole('button', { name: 'Copy kolk_workspace.md' }).first()).toBeVisible();
    await expect(agentSkill.getByRole('button', { name: 'Download kolk_workspace.md' })).toBeVisible();
    await expect(agentSkill.getByRole('link', { name: 'Open kolk_workspace.md' })).toBeVisible();
  });

  test('home anonymous flow renders sign-in panel and email success state', async ({ page }) => {
    await mockAnonymousSession(page);
    await mockEmailRegister(page);

    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Put Your AI on the Payroll.' })).toBeVisible();
    const emailSignInSection = page.locator('#email-sign-in');
    await expect(emailSignInSection.getByText('Sign in required')).toBeVisible();
    await expect(emailSignInSection.getByRole('link', { name: 'Sign in with GitHub' })).toHaveCount(0);
    await expect(emailSignInSection.getByRole('link', { name: 'Sign in with Google' })).toHaveCount(0);

    const submitButton = emailSignInSection.getByRole('button', { name: 'Send sign-in link' });
    await expect(submitButton).toBeDisabled();

    await emailSignInSection.getByLabel('Email').fill('ada@example.com');
    await emailSignInSection.getByLabel('Display name').fill('Ada Lovelace');
    await expect(submitButton).toBeEnabled();
    await submitButton.click();

    await expect(emailSignInSection.getByText('Check your email for the verification code or sign-in link.')).toBeVisible();
  });

  test('home exposes copyable quick-start and skill-first onboarding controls', async ({ page }) => {
    await mockAnonymousSession(page);
    await mockEmailRegister(page);
    await mockClipboard(page);

    await page.goto('/');

    await expect(page.getByText(/Pass condition: your submission contains the word Hello or Kolk\./)).toBeVisible();
    await expect(page.getByText(/Clearing L8 awards the permanent Beta Pioneer badge\./)).toBeVisible();

    await page.getByRole('button', { name: 'Copy L0 smoke test' }).first().click();
    await expect(page.getByRole('button', { name: 'Copied L0 smoke test' }).first()).toBeVisible();
    await expect.poll(() => readClipboard(page)).toContain('https://www.kolkarena.com/api/challenge/0');
    await expect(page.getByText('#1 · Fetch L0 and preserve the anonymous session cookie')).toBeVisible();
    await expect(page.getByText('#2 · Submit with the same cookie jar and attemptToken')).toBeVisible();
    await page.getByRole('button', { name: 'Copy this step #1' }).first().click();
    await expect.poll(() => readClipboard(page)).toContain('ATTEMPT="$(jq -r \'.challenge.attemptToken\' /tmp/kolk_l0.json)"');

    const agentSkill = page.locator('#agent-skill');
    await agentSkill.locator('summary').click();
    await expect(agentSkill.getByText('kolk_workspace.md', { exact: true }).first()).toBeVisible();
    await agentSkill.getByRole('button', { name: 'Copy kolk_workspace.md' }).first().click();
    await expect.poll(() => readClipboard(page)).toContain('# Kolk Arena');
  });

  test('device auth page preserves the pending code through sign-in', async ({ page }) => {
    await mockAnonymousSession(page);
    await mockEmailRegister(page);

    await page.goto('/device?code=ABCD-1234');

    await expect(page).toHaveURL(/\/device\?code=ABCD-1234$/);
    await expect(page.getByRole('heading', { name: 'Sign in to authorize your CLI' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in with GitHub' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Sign in with Google' })).toHaveCount(0);

    await page.getByLabel('Email').fill('ada@example.com');
    await page.getByLabel('Display name').fill('Ada Lovelace');
    await page.getByRole('button', { name: 'Send sign-in link' }).click();

    await expect(page.getByText('Check your email for the verification code or sign-in link.')).toBeVisible();
  });

  test('profile handles authenticated load, save, and logout', async ({ page }) => {
    await mockAuthenticatedProfile(page);
    await mockLogout(page);

    await page.goto('/profile');

    await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible();
    await expect(page.getByText('ada@example.com')).toBeVisible();
    await expect(page.getByLabel('Display name')).toHaveValue('Ada Lovelace');
    await expect(page.getByRole('heading', { name: 'Optional public profile' })).toBeVisible();
    await expect(page.getByLabel('Country / region')).toHaveValue('GB');
    await expect(page.locator('select').locator('option:checked')).toHaveText('United Kingdom (GB)');

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
    await expect(
      page.getByText(
        'Your session has expired. Sign in again to save your changes. Your edits are preserved below.',
        { exact: true },
      ),
    ).toBeVisible();
    const profileForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Save profile' }) });
    await expect(profileForm.getByLabel('Display name')).toHaveValue('Ada Byron');
    await expect(page.getByRole('main').getByRole('button', { name: 'Send sign-in link' })).toBeVisible();
    await expect(page.getByRole('main').getByRole('link', { name: 'Sign in with GitHub' })).toHaveCount(0);
  });

  test('play hub restores anonymous progression from browser-session state', async ({ page }) => {
    await mockAnonymousSession(page);
    await mockPlayState(page, 3);

    await page.goto('/play');

    await expect(page.getByText('Anonymous browser-session progress detected up to')).toBeVisible();
    await expect(page.getByText('Highest cleared: L3').filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Continue to L4' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Start L4 →' })).toBeVisible();
    await expect(page.getByText('Locked · clear L4 first')).toBeVisible();
  });

  test('challenge L0 completes onboarding flow', async ({ page }) => {
    test.slow();

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

    await page.goto('/challenge/0', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('textbox').first()).toHaveValue('Hello, Kolk Arena!', { timeout: 60_000 });
    await page.getByRole('button', { name: 'Submit delivery' }).click();

    await expect(page.getByText('L0 onboarding check passed. Your integration is connected.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Try L1 →' })).toBeVisible();
  });

  test('challenge re-fetch gets a fresh brief without relying on same-url remounts', async ({ page }) => {
    test.slow();

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

    await page.goto('/challenge/1', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('pre:visible').filter({ hasText: '# Order Brief A' })).toBeVisible({
      timeout: 60_000,
    });
    await page.getByRole('button', { name: 'Re-fetch a fresh brief' }).filter({ visible: true }).first().click();
    await expect(page.locator('pre:visible').filter({ hasText: '# Order Brief B' })).toBeVisible({
      timeout: 60_000,
    });
    await expect.poll(() => fetchCount).toBe(2);
  });

  test('challenge page exposes agent handoff copy tools', async ({ page }) => {
    test.slow();

    await mockClipboard(page);

    await page.route('**/api/challenge/1*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          challenge: {
            challengeId: 'challenge-copy-tools',
            level: 1,
            seed: 1,
            variant: 'v1',
            attemptToken: 'attempt-token-copy-tools',
            fetchToken: 'attempt-token-copy-tools',
            taskJson: { structured_brief: { source_lang: 'en', target_lang: 'es-MX' } },
            promptMd: '# Translate this text\n\nMake it natural in es-MX.',
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

    await page.goto('/challenge/1', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('button', { name: 'Copy challenge brief for agent' }).filter({ visible: true }).first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByRole('button', { name: 'Copy challenge URL' }).filter({ visible: true }).first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.locator('summary:visible').filter({ hasText: 'View structured brief JSON' })).toBeVisible({
      timeout: 60_000,
    });

    await page.getByRole('button', { name: 'Copy challenge brief for agent' }).filter({ visible: true }).first().click();
    await expect.poll(() => readClipboard(page)).toContain('Level: L1 — Quick Translate');
    await expect.poll(() => readClipboard(page)).toContain('structured_brief JSON');

    // UI split the old "Advanced tools" fold into two `<details>`:
    // - "View structured brief JSON" now wraps the structured_brief
    //   CodeBlock + its "Copy structured brief JSON" button.
    // - "Advanced tools" now holds the handoff-bundle / claude-code-task
    //   / n8n-starter download buttons + the submit-contract copy tool.
    // Click the structured-brief fold FIRST so its copy button is in
    // the visible subtree before we assert on it.
    await page.locator('summary:visible').filter({ hasText: 'View structured brief JSON' }).click();
    await expect(page.getByRole('button', { name: 'Copy structured brief JSON' }).filter({ visible: true }).first()).toBeVisible();
    await page.locator('summary:visible').filter({ hasText: 'Advanced tools' }).click();
    await page.getByRole('button', { name: 'Copy submit contract' }).filter({ visible: true }).first().click();
    await expect.poll(() => readClipboard(page)).toContain('"attemptToken": "attempt-token-copy-tools"');

    await expect(page.getByRole('link', { name: 'Open kolk_workspace.md' }).filter({ visible: true }).first()).toBeVisible();

    await page.locator('summary:visible').filter({ hasText: 'Local scripts' }).click();
    await page.getByRole('tab', { name: 'Python' }).filter({ visible: true }).first().click();
    await expect(
      page.locator('p:visible', { hasText: '#1 · Fetch the challenge with a persistent requests session' }).first(),
    ).toBeVisible();
    await expect(
      page.locator('p:visible', { hasText: '#3 · Submit with the same session so the cookie replays automatically' }).first(),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Copy python snippet' }).filter({ visible: true }).first().click();
    await expect.poll(() => readClipboard(page)).toContain('requests.Session()');
    await page.locator('button:visible', { hasText: 'Copy this step #1' }).first().click();
    await expect.poll(() => readClipboard(page)).toContain('challenge = response.json()["challenge"]');
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
    await expect(page.getByRole('button', { name: 'Copy profile link' })).toBeVisible();
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
    await page.route(`**/api/leaderboard/${PLAYER_ID}*`, async (route) => {
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

    await expect(page.getByRole('button', { name: 'Open player detail for Ada Lovelace' })).toBeVisible();
    await Promise.all([
      page.waitForResponse((response) => response.url().includes(`/api/leaderboard/${PLAYER_ID}`), { timeout: 20_000 }),
      page.getByRole('button', { name: 'Open player detail for Ada Lovelace' }).click(),
    ]);
    await expect(page.getByText('Failed to load player detail')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();

    await Promise.all([
      page.waitForResponse((response) => response.url().includes(`/api/leaderboard/${PLAYER_ID}`), { timeout: 20_000 }),
      page.getByRole('button', { name: 'Retry' }).click(),
    ]);

    await expect(page.getByText('Strong structured delivery with clear coverage.')).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => detailRequests).toBeGreaterThan(2);
  });

  test('leaderboard filter preserves selected player and marks detail as outside the current filtered view', async ({ page }) => {
    await mockLeaderboard(page);
    await page.route(`**/api/leaderboard/${PLAYER_ID}*`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(playerDetailPayload()),
      });
    });

    await page.goto('/leaderboard');

    await expect(page.getByRole('button', { name: 'Open player detail for Ada Lovelace' })).toBeVisible();
    await Promise.all([
      page.waitForResponse(`**/api/leaderboard/${PLAYER_ID}*`),
      page.getByRole('button', { name: 'Open player detail for Ada Lovelace' }).click(),
    ]);

    await expect(page).toHaveURL(new RegExp(`\\/leaderboard\\?player=${PLAYER_ID}`));
    await expect(page.getByText('Strong structured delivery with clear coverage.')).toBeVisible();

    await page.getByLabel('AI Agent / Model / Tool').fill('test-stack');
    await page.getByRole('button', { name: 'Apply' }).click();

    await expect(page).toHaveURL(new RegExp(`\\/leaderboard\\?.*player=${PLAYER_ID}.*agent_stack=test-stack|\\/leaderboard\\?.*agent_stack=test-stack.*player=${PLAYER_ID}`));
    await expect(page.getByText('Selected player is outside the current list view.')).toBeVisible();
    await expect(page.getByText('Strong structured delivery with clear coverage.')).toBeVisible();
  });

  test('leaderboard renders anonymous ranked rows without exposing a player detail link', async ({ page }) => {
    await mockLeaderboard(page);

    await page.goto('/leaderboard');

    await expect(page.locator('tbody').getByText('Anonymous abcd')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open player detail for Anonymous abcd' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Open player page for Anonymous abcd' })).toHaveCount(0);
  });

  test('mobile leaderboard cards keep navigation semantics instead of expand semantics', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockLeaderboard(page);

    await page.goto('/leaderboard');

    const mobileCard = page.getByRole('link', { name: 'Open player page for Ada Lovelace' });
    await expect(mobileCard).toBeVisible();
    await expect(mobileCard).not.toHaveAttribute('aria-controls', /.+/);
    await expect(mobileCard).not.toHaveAttribute('aria-expanded', /.+/);
    await expect(page.locator('article[aria-label="Anonymous abcd"]')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open player page for Anonymous abcd' })).toHaveCount(0);
  });
});
