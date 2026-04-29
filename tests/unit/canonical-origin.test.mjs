import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const files = [
  'src/lib/frontend/app-config.ts',
  'packages/kolk-arena-cli/src/cli.ts',
  'examples/curl/hello_world.sh',
  'examples/curl/run_level_1.sh',
  'examples/python/hello_world.py',
  'examples/python/beat_level_1.py',
];

test('canonical public origin stays on www for agent-facing examples', () => {
  for (const relativePath of files) {
    const fullPath = path.join(repoRoot, relativePath);
    const source = readFileSync(fullPath, 'utf8');
    assert.match(
      source,
      /https:\/\/www\.kolkarena\.com/,
      `${relativePath} should point at the canonical www host`,
    );
    assert.doesNotMatch(
      source,
      /https:\/\/kolkarena\.com/,
      `${relativePath} should not fall back to the apex host in agent-facing examples`,
    );
  }
});
