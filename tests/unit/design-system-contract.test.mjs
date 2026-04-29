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

test('global design-system primitives are defined in one place', () => {
  const globals = read('src/app/globals.css');

  for (const className of [
    'action-button',
    'action-button-accent',
    'action-button-slate',
    'action-button-secondary',
    'action-button-danger',
    'action-button-dark',
    'form-control',
    'status-message',
    'status-success',
    'status-error',
    'status-warning',
    'status-info',
    'status-neutral',
  ]) {
    assert.match(globals, new RegExp(`\\.${className}\\s*\\{`), `${className} should be defined globally`);
  }
});

test('shared button helpers use design-system button primitives', () => {
  const quickActionButton = read('src/components/ui/quick-action-button.tsx');
  const copyButton = read('src/components/ui/copy-button.tsx');
  const codeBlock = read('src/components/ui/code-block.tsx');

  assert.ok(quickActionButton.includes('action-button'));
  assert.ok(quickActionButton.includes('action-button-accent'));
  assert.ok(copyButton.includes('action-button-secondary'));
  assert.ok(codeBlock.includes('action-button-dark'));
  assert.equal(copyButton.includes('rounded-xl border border-slate-300 bg-white'), false);
});

test('high-traffic surfaces use semantic status and form primitives', () => {
  const sources = [
    'src/app/auth-sign-in-panel.tsx',
    'src/app/profile/page.tsx',
    'src/app/profile/api-tokens-panel.tsx',
    'src/app/device/device-flow-panel.tsx',
    'src/app/leaderboard/leaderboard-client.tsx',
  ].map(read).join('\n');

  assert.ok(sources.includes('status-message'));
  assert.ok(sources.includes('status-success'));
  assert.ok(sources.includes('status-error'));
  assert.ok(sources.includes('form-control'));
  assert.equal(sources.includes('min-h-12 w-full rounded-xl border border-slate-300 bg-white'), false);
});
