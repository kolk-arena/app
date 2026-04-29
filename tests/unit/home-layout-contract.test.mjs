import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

function read(relPath) {
  return readFileSync(path.join(repoRoot, relPath), 'utf8');
}

test('home page content uses the same horizontal container as the site nav', () => {
  const pageSource = read('src/app/page.tsx');
  const loadingSource = read('src/app/loading.tsx');
  const navSource = read('src/app/nav.tsx');

  const siteContainer = 'max-w-7xl flex-col gap';
  const siteGutters = 'px-4';

  assert.ok(navSource.includes('max-w-7xl'), 'nav should define the site-wide desktop width');
  assert.ok(pageSource.includes(siteContainer), 'home content should align to the nav container width');
  assert.ok(pageSource.includes(siteGutters), 'home content should use the same base horizontal gutter as nav');
  assert.ok(loadingSource.includes('max-w-7xl'), 'loading skeleton should not shift to a narrower container');
  assert.equal(pageSource.includes('max-w-6xl flex-col gap-12 px-6'), false);
});

test('top-level app shells keep consistent site gutters and loading parity', () => {
  const playSource = read('src/app/play/play-client.tsx');
  const profileSource = read('src/app/profile/page.tsx');
  const leaderboardPageSource = read('src/app/leaderboard/page.tsx');
  const leaderboardClientSource = read('src/app/leaderboard/leaderboard-client.tsx');
  const challengeSource = read('src/app/challenge/[level]/challenge-client.tsx');
  const errorSource = read('src/app/error.tsx');
  const notFoundSource = read('src/app/not-found.tsx');

  assert.ok(playSource.includes('mx-auto flex max-w-7xl flex-col gap-8 px-4'));
  assert.equal(playSource.includes('max-w-6xl flex-col'), false);

  assert.ok(profileSource.includes('min-h-screen bg-slate-50 text-slate-950'));
  assert.ok(profileSource.includes('mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12 lg:px-8'));

  const leaderboardShell = 'mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 sm:gap-6 sm:px-6 sm:py-8 lg:px-8';
  assert.ok(leaderboardPageSource.includes(leaderboardShell), 'leaderboard fallback should match the hydrated shell');
  assert.ok(leaderboardClientSource.includes(leaderboardShell), 'leaderboard client shell should stay aligned');
  assert.ok(leaderboardClientSource.includes('2xl:grid-cols-[minmax(52rem,1fr)_minmax(22rem,0.45fr)]'), 'leaderboard detail split should only activate when the standings table has enough width');
  assert.equal(
    leaderboardClientSource.split('xl:grid-cols-[minmax(0,1fr)_minmax(22rem,32rem)]').length - 1,
    2,
    'leaderboard hero summary and filter rail should use the same desktop column width',
  );
  assert.equal(leaderboardClientSource.includes('lg:grid-cols-[minmax(0,1fr)_20rem]'), false);

  assert.ok(challengeSource.includes('mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12 lg:px-8'));
  assert.equal(challengeSource.includes('mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10'), false);

  assert.ok(errorSource.includes('flex min-h-[60vh] items-center bg-slate-50 px-4 py-16 text-slate-950 sm:px-6 lg:px-8'));
  assert.ok(errorSource.includes('mx-auto w-full max-w-3xl'));
  assert.ok(notFoundSource.includes('px-4 py-16 text-slate-950 sm:px-6 lg:px-8'));
});

test('shared visual utility classes used by cards are defined', () => {
  const sourceWithUsage = [
    'src/components/home/brief-showcase-slider.tsx',
    'src/app/profile/api-tokens-panel.tsx',
    'src/app/profile/page.tsx',
  ].map(read).join('\n');
  const globalsSource = read('src/app/globals.css');

  assert.ok(sourceWithUsage.includes('card-hover'), 'expected cards to use the shared hover utility');
  assert.match(globalsSource, /\.card-hover\s*\{/);
});
