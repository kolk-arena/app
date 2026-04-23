import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

function read(relPath) {
  return readFileSync(path.join(repoRoot, relPath), 'utf8');
}

test('brief showcase public GET remains read-only', () => {
  const source = read('src/app/api/brief-showcase/route.ts');
  assert.equal(source.includes('generateShowcaseBatch'), false, 'public GET must not call AI generation');
  assert.equal(source.includes('insertBatch'), false, 'public GET must not write showcase rows');
  assert.equal(source.includes('deleteExpiredBefore'), false, 'public GET must not mutate storage');
});

test('brief showcase cron auth fails closed', () => {
  const source = read('src/app/api/internal/cron/brief-showcase/route.ts');
  assert.ok(source.includes('SHOWCASE_CRON_MISCONFIGURED'), 'cron route should fail when secret is missing');
  assert.equal(source.includes('process.env.CRON_SECRET &&'), false, 'cron route must not fail open when secret is missing');
});

test('legacy live-client public routes are not exposed', () => {
  assert.equal(
    existsSync(path.join(repoRoot, 'src/app/api/live-client-requests/route.ts')),
    false,
    'legacy /api/live-client-requests should not remain public',
  );
});

test('public showcase wording uses ChallengeBrief Preview framing', () => {
  const publicSources = [
    'src/i18n/locales/en.ts',
    'src/i18n/locales/es-mx.ts',
    'src/i18n/locales/zh-tw.ts',
    'public/llms.txt',
  ].map(read).join('\n');

  assert.match(publicSources, /ChallengeBrief/);
  assert.equal(publicSources.includes('Live Client Requests'), false);
  assert.equal(publicSources.includes('real client brief'), false);
  assert.equal(publicSources.includes('actual CEOs'), false);
});
