import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

// Files where `kolk_workspace.md` references are intentional (the redirect
// rule in next.config.ts and any documentation explaining the rename).
const ALLOWED_REFS = new Set([
  'next.config.ts',
  'CHANGELOG.md',
  'INTERNAL_OFFICIAL_LAUNCH_HISTORY_REWRITE.md', // gitignored, may not exist
  'tests/unit/skill-file-canonical.test.mjs', // this file describes the rule
]);

// Directories to scan. Stay inside surfaces an external integrator would
// see; avoid node_modules / .next / .claude / build artifacts.
const SCAN_DIRECTORIES = ['src', 'public', 'tests', 'docs', '.github'];
const SCAN_ROOT_FILES = [
  'README.md',
  'AGENTS.md',
  'CONTRIBUTING.md',
  'CHANGELOG.md',
  'next.config.ts',
];

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip generated / vendor dirs even if accidentally placed.
      if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') continue;
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

function isTextFile(absPath) {
  // Only scan text-like extensions to avoid binary noise.
  return /\.(ts|tsx|js|jsx|mjs|cjs|md|mdx|txt|json|yml|yaml|sql|css|html)$/i.test(absPath);
}

function relPath(absPath) {
  return path.relative(repoRoot, absPath);
}

test('canonical agent skill file lives at public/kolk_arena.md only', () => {
  const publicSkill = path.join(repoRoot, 'public', 'kolk_arena.md');
  assert.ok(existsSync(publicSkill), 'public/kolk_arena.md (the canonical skill file) must exist');
  assert.ok(statSync(publicSkill).isFile(), 'public/kolk_arena.md must be a file');

  const rootSkill = path.join(repoRoot, 'kolk_arena.md');
  assert.ok(
    !existsSync(rootSkill),
    'Root-level kolk_arena.md is dead drifted weight; canonical lives at public/kolk_arena.md and must not be duplicated at the repo root',
  );

  // Make sure no one accidentally added a public/kolk_workspace.md.
  const workspaceFallback = path.join(repoRoot, 'public', 'kolk_workspace.md');
  assert.ok(
    !existsSync(workspaceFallback),
    'public/kolk_workspace.md should not exist; the URL is a redirect alias only',
  );
});

test('no source / docs / tests reference /kolk_workspace.md outside the redirect rule', () => {
  const violations = [];
  const targets = [];
  for (const dir of SCAN_DIRECTORIES) {
    targets.push(...walk(path.join(repoRoot, dir)));
  }
  for (const file of SCAN_ROOT_FILES) {
    targets.push(path.join(repoRoot, file));
  }

  for (const absPath of targets) {
    if (!isTextFile(absPath)) continue;
    if (!existsSync(absPath)) continue;
    const rel = relPath(absPath);
    if (ALLOWED_REFS.has(rel)) continue;

    const source = readFileSync(absPath, 'utf8');
    if (source.includes('kolk_workspace.md')) {
      // Find lines so the failure points to where to fix.
      const lines = source.split('\n');
      lines.forEach((line, idx) => {
        if (line.includes('kolk_workspace.md')) {
          violations.push(`${rel}:${idx + 1}: ${line.trim()}`);
        }
      });
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Stale /kolk_workspace.md references must point to /kolk_arena.md (canonical):\n  ${violations.join('\n  ')}`,
  );
});

test('next.config.ts redirects /kolk_workspace.md to /kolk_arena.md as a permanent alias', () => {
  const cfg = readFileSync(path.join(repoRoot, 'next.config.ts'), 'utf8');
  // Redirect rule must use 308 (permanent: true) and the canonical destination.
  assert.match(
    cfg,
    /source:\s*'\/kolk_workspace\.md'/,
    'next.config.ts must declare a redirect from /kolk_workspace.md',
  );
  assert.match(
    cfg,
    /destination:\s*'\/kolk_arena\.md'/,
    'redirect destination must be /kolk_arena.md',
  );
  assert.match(
    cfg,
    /permanent:\s*true/,
    'redirect must be permanent (308) so cached agent clients update',
  );
});
