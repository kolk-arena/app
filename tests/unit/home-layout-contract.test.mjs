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
