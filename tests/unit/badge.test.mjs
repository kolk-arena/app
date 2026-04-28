import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const Module = require('module');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const srcRoot = path.join(repoRoot, 'src');

// ---------------------------------------------------------------------------
// Transparent .ts loader (mirrors dry-run-validation.test.mjs and
// i18n-contract.test.mjs).
// ---------------------------------------------------------------------------
function installTsLoader() {
  const previousTsLoader = Module._extensions['.ts'];
  const previousResolve = Module._resolveFilename;

  Module._extensions['.ts'] = (module, filename) => {
    const source = readFileSync(filename, 'utf8');
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
      fileName: filename,
    });
    module._compile(transpiled.outputText, filename);
  };

  Module._resolveFilename = function patchedResolve(request, parent, ...rest) {
    if (request.startsWith('@/')) {
      const rel = request.slice(2);
      const candidates = [
        path.join(srcRoot, rel),
        path.join(srcRoot, rel + '.ts'),
        path.join(srcRoot, rel + '.tsx'),
        path.join(srcRoot, rel, 'index.ts'),
      ];
      for (const candidate of candidates) {
        try {
          return previousResolve.call(this, candidate, parent, ...rest);
        } catch {
          // try next
        }
      }
    }
    return previousResolve.call(this, request, parent, ...rest);
  };

  for (const cached of Object.keys(require.cache)) {
    if (cached.startsWith(srcRoot)) {
      delete require.cache[cached];
    }
  }

  return () => {
    if (previousTsLoader) {
      Module._extensions['.ts'] = previousTsLoader;
    } else {
      delete Module._extensions['.ts'];
    }
    Module._resolveFilename = previousResolve;
  };
}

const restore = installTsLoader();
test.after(() => restore());

const badgeMod = require(path.join(srcRoot, 'lib/frontend/badge.ts'));
const appConfigMod = require(path.join(srcRoot, 'lib/frontend/app-config.ts'));
const { buildPlayerBadge } = badgeMod;
const { APP_CONFIG } = appConfigMod;

const PLAYER_ID = '00000000-0000-4000-8000-000000000001';

// ---------------------------------------------------------------------------
// Color / label rules (badge spec).
// ---------------------------------------------------------------------------

test('pioneer=true returns Spark Amber Beta Pioneer badge regardless of level', () => {
  for (const level of [-0, 0, 1, 2, 3, 5, 7, 8]) {
    const out = buildPlayerBadge({ playerId: PLAYER_ID, highestLevel: level, pioneer: true });
    assert.ok(out, `expected non-null for level=${level}`);
    assert.equal(out.color, 'D97706', `level=${level} should use Spark Amber`);
    assert.equal(out.displayLabel, 'Kolk Arena — Beta Pioneer');
    // shields URL must encode "Beta Pioneer" with `_` for the space.
    assert.ok(
      out.shieldsUrl.includes('Beta_Pioneer-D97706'),
      `shieldsUrl should encode 'Beta Pioneer' with underscore and Spark Amber color: ${out.shieldsUrl}`,
    );
  }
});

test('level 8 with pioneer=false returns emerald Advanced Clear', () => {
  const out = buildPlayerBadge({ playerId: PLAYER_ID, highestLevel: 8, pioneer: false });
  assert.ok(out);
  assert.equal(out.color, 'emerald');
  assert.equal(out.displayLabel, 'Kolk Arena — Advanced Clear');
  assert.ok(out.shieldsUrl.endsWith('-emerald'));
});

test('level 7 with pioneer=false returns emerald L7 Clear', () => {
  const out = buildPlayerBadge({ playerId: PLAYER_ID, highestLevel: 7, pioneer: false });
  assert.ok(out);
  assert.equal(out.color, 'emerald');
  assert.equal(out.displayLabel, 'Kolk Arena — L7 Clear');
});

test('level 6 with pioneer=false returns emerald L6 Clear (boundary into emerald tier)', () => {
  const out = buildPlayerBadge({ playerId: PLAYER_ID, highestLevel: 6, pioneer: false });
  assert.ok(out);
  assert.equal(out.color, 'emerald');
  assert.equal(out.displayLabel, 'Kolk Arena — L6 Clear');
});

test('level 4 with pioneer=false returns green L4 Clear', () => {
  const out = buildPlayerBadge({ playerId: PLAYER_ID, highestLevel: 4, pioneer: false });
  assert.ok(out);
  assert.equal(out.color, 'green');
  assert.equal(out.displayLabel, 'Kolk Arena — L4 Clear');
});

test('level 3 with pioneer=false returns green L3 Clear (boundary into green tier)', () => {
  const out = buildPlayerBadge({ playerId: PLAYER_ID, highestLevel: 3, pioneer: false });
  assert.ok(out);
  assert.equal(out.color, 'green');
});

test('level 2 with pioneer=false returns blue L2 Clear', () => {
  const out = buildPlayerBadge({ playerId: PLAYER_ID, highestLevel: 2, pioneer: false });
  assert.ok(out);
  assert.equal(out.color, 'blue');
  assert.equal(out.displayLabel, 'Kolk Arena — L2 Clear');
});

test('level 1 with pioneer=false returns blue L1 Clear (boundary into blue tier)', () => {
  const out = buildPlayerBadge({ playerId: PLAYER_ID, highestLevel: 1, pioneer: false });
  assert.ok(out);
  assert.equal(out.color, 'blue');
});

test('level 0 with pioneer=false returns gray L0 Smoke', () => {
  const out = buildPlayerBadge({ playerId: PLAYER_ID, highestLevel: 0, pioneer: false });
  assert.ok(out);
  assert.equal(out.color, 'gray');
  assert.equal(out.displayLabel, 'Kolk Arena — L0 Smoke');
});

// ---------------------------------------------------------------------------
// Null-return guards.
// ---------------------------------------------------------------------------

test('level -1 returns null (no submissions sentinel)', () => {
  const out = buildPlayerBadge({ playerId: PLAYER_ID, highestLevel: -1, pioneer: false });
  assert.equal(out, null);
});

test('level NaN returns null', () => {
  const out = buildPlayerBadge({ playerId: PLAYER_ID, highestLevel: Number.NaN, pioneer: false });
  assert.equal(out, null);
});

test('level -Infinity returns null', () => {
  const out = buildPlayerBadge({
    playerId: PLAYER_ID,
    highestLevel: Number.NEGATIVE_INFINITY,
    pioneer: false,
  });
  assert.equal(out, null);
});

test('level +Infinity returns null (not finite)', () => {
  const out = buildPlayerBadge({
    playerId: PLAYER_ID,
    highestLevel: Number.POSITIVE_INFINITY,
    pioneer: false,
  });
  assert.equal(out, null);
});

// ---------------------------------------------------------------------------
// Markdown / HTML / shields URL shape.
// ---------------------------------------------------------------------------

test('markdown contains both shields URL and profile URL with image-link syntax', () => {
  const out = buildPlayerBadge({ playerId: PLAYER_ID, highestLevel: 5, pioneer: false });
  assert.ok(out);
  // Must look like `[![label](shieldsUrl)](profileUrl)`.
  assert.ok(out.markdown.startsWith('[!['), `markdown should start with image-link prefix: ${out.markdown}`);
  assert.ok(out.markdown.includes(out.shieldsUrl), 'markdown should embed shieldsUrl');
  assert.ok(out.markdown.includes(out.profileUrl), 'markdown should embed profileUrl');
  // Bracket structure: [![label](shieldsUrl)](profileUrl)
  assert.match(out.markdown, /^\[!\[.+\]\(.+\)\]\(.+\)$/);
});

test('html contains <a> wrapping <img> with both URLs as attributes', () => {
  const out = buildPlayerBadge({ playerId: PLAYER_ID, highestLevel: 5, pioneer: false });
  assert.ok(out);
  assert.ok(out.html.includes('<a href='), `html missing <a>: ${out.html}`);
  assert.ok(out.html.includes('<img'), 'html missing <img>');
  assert.ok(out.html.includes(out.shieldsUrl));
  assert.ok(out.html.includes(out.profileUrl));
});

test('shields URL uses https://img.shields.io/badge/ origin', () => {
  const out = buildPlayerBadge({ playerId: PLAYER_ID, highestLevel: 3, pioneer: false });
  assert.ok(out);
  assert.ok(
    out.shieldsUrl.startsWith('https://img.shields.io/badge/'),
    `unexpected shieldsUrl prefix: ${out.shieldsUrl}`,
  );
});

test('profile URL is built from APP_CONFIG.canonicalOrigin and embeds the playerId', () => {
  const out = buildPlayerBadge({ playerId: PLAYER_ID, highestLevel: 3, pioneer: false });
  assert.ok(out);
  assert.equal(out.profileUrl, `${APP_CONFIG.canonicalOrigin}/leaderboard/${PLAYER_ID}`);
});

test('shields URL ends with the matching color slug', () => {
  // pioneer beats level
  assert.ok(
    buildPlayerBadge({ playerId: PLAYER_ID, highestLevel: 0, pioneer: true }).shieldsUrl.endsWith('-D97706'),
  );
  // level-only colors
  assert.ok(
    buildPlayerBadge({ playerId: PLAYER_ID, highestLevel: 7, pioneer: false }).shieldsUrl.endsWith('-emerald'),
  );
  assert.ok(
    buildPlayerBadge({ playerId: PLAYER_ID, highestLevel: 4, pioneer: false }).shieldsUrl.endsWith('-green'),
  );
  assert.ok(
    buildPlayerBadge({ playerId: PLAYER_ID, highestLevel: 1, pioneer: false }).shieldsUrl.endsWith('-blue'),
  );
  assert.ok(
    buildPlayerBadge({ playerId: PLAYER_ID, highestLevel: 0, pioneer: false }).shieldsUrl.endsWith('-gray'),
  );
});

test('shields URL encodes spaces as underscore (shields.io segment escape)', () => {
  const out = buildPlayerBadge({ playerId: PLAYER_ID, highestLevel: 2, pioneer: false });
  assert.ok(out);
  // "Kolk Arena" → "Kolk_Arena", "L2 Clear" → "L2_Clear"
  assert.ok(out.shieldsUrl.includes('Kolk_Arena-L2_Clear-blue'), `unexpected encoding: ${out.shieldsUrl}`);
});
