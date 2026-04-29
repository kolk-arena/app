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

function loadTsModules() {
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
          // try next candidate
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

// Public agent-automation surfaces: error codes emitted from these route
// handlers must be registered in src/lib/kolk/error-codes.ts. Other API
// routes (auth, profile, admin, showcase, internal cron) are out of scope
// because they are not part of the documented agent contract.
const AGENT_SURFACE_ROUTES = [
  'app/api/challenge/[level]/route.ts',
  'app/api/challenge/submit/route.ts',
  'app/api/challenges/catalog/route.ts',
  'app/api/session/status/route.ts',
  'app/api/session/attempts/route.ts',
  'app/api/session/quota/route.ts',
  'app/api/sample-success/[level]/route.ts',
  'app/api/agent-entrypoint/route.ts',
  'app/api/status/route.ts',
  'app/docs/[slug]/route.ts',
];

// Pseudo-codes that appear in manifest.retry but are not real error codes
// (they describe the SHAPE of a non-error response, e.g. a scored-but-
// unlocked-false submit). Allowed in the manifest, never in the registry.
const RETRY_PSEUDO_CODES = new Set(['unlocked_false']);

// Foreign error codes from upstream services (Postgres, Supabase) that
// route handlers inspect for fallback decisions. These are NOT part of
// the public agent contract and must not pollute the registry-vs-route
// drift check.
const FOREIGN_CODES = new Set([
  'PGRST202', // PostgREST: function not found in schema cache
]);

// Match quoted SCREAMING_SNAKE_CASE strings that appear in a `code:` or
// `code ===` / `code =` position. Catches both literal emits like
// `code: 'INVALID_JSON'` AND dynamic emits where the code is computed
// (`const code = attemptGuard.code`) but compared against a literal
// elsewhere in the same file (`code === 'RATE_LIMIT_HOUR'`). Limited to
// the `code` identifier so successful-submit constants like
// `failReason: 'STRUCTURE_GATE'` are not misclassified as error codes.
function extractEmittedCodes(filePath) {
  const source = readFileSync(filePath, 'utf8');
  const codes = new Set();
  // Operator alternatives: object key `:` OR assignment `=` / `==` / `===`.
  const pattern = /\bcode\s*(?::|={1,3})\s*['"]([A-Z][A-Z0-9_]{5,})['"]/g;
  let match;
  while ((match = pattern.exec(source)) != null) {
    if (FOREIGN_CODES.has(match[1])) continue;
    codes.add(match[1]);
  }
  return codes;
}

test('every error code emitted on a public agent surface is registered', () => {
  const restore = loadTsModules();
  try {
    const { ERROR_CODE_REGISTRY } = require(
      path.join(srcRoot, 'lib/kolk/error-codes.ts'),
    );
    const registeredCodes = new Set(
      ERROR_CODE_REGISTRY.map((record) => record.code),
    );

    const violations = [];
    for (const relPath of AGENT_SURFACE_ROUTES) {
      const absPath = path.join(srcRoot, relPath);
      const emitted = extractEmittedCodes(absPath);
      for (const code of emitted) {
        if (!registeredCodes.has(code)) {
          violations.push(`${relPath} emits code '${code}' which is not in ERROR_CODE_REGISTRY`);
        }
      }
    }

    assert.deepEqual(
      violations,
      [],
      `Unregistered error codes on agent surfaces:\n  ${violations.join('\n  ')}`,
    );
  } finally {
    restore();
  }
});

test('every registered error code is reachable from at least one declared surface', () => {
  const restore = loadTsModules();
  try {
    const { ERROR_CODE_REGISTRY } = require(
      path.join(srcRoot, 'lib/kolk/error-codes.ts'),
    );

    // Include direct helper libs whose code literals are produced for
    // a route surface. Example: submission-guards is the rate-limit
    // engine; the submit route forwards its `code` field via shorthand,
    // so the literal lives in the helper, not the route.
    const surfaceToFiles = {
      fetch: ['app/api/challenge/[level]/route.ts'],
      submit: [
        'app/api/challenge/submit/route.ts',
        'lib/kolk/submission-guards.ts',
      ],
      session: [
        'app/api/session/status/route.ts',
        'app/api/session/attempts/route.ts',
        'app/api/session/quota/route.ts',
      ],
      sample: ['app/api/sample-success/[level]/route.ts'],
      docs: ['app/docs/[slug]/route.ts'],
    };

    const fileCodeCache = new Map();
    function getCodes(relPath) {
      if (!fileCodeCache.has(relPath)) {
        fileCodeCache.set(relPath, extractEmittedCodes(path.join(srcRoot, relPath)));
      }
      return fileCodeCache.get(relPath);
    }

    const violations = [];
    for (const record of ERROR_CODE_REGISTRY) {
      let reached = false;
      for (const surface of record.surfaces) {
        const files = surfaceToFiles[surface] ?? [];
        for (const file of files) {
          if (getCodes(file).has(record.code)) {
            reached = true;
            break;
          }
        }
        if (reached) break;
      }
      if (!reached) {
        violations.push(`Code '${record.code}' is registered with surfaces ${JSON.stringify(record.surfaces)} but no surface file emits it`);
      }
    }

    assert.deepEqual(
      violations,
      [],
      `Dead registry entries:\n  ${violations.join('\n  ')}`,
    );
  } finally {
    restore();
  }
});

test('manifest retry arrays match the registry exactly', () => {
  const restore = loadTsModules();
  try {
    const { buildAutomationManifest } = require(
      path.join(srcRoot, 'lib/kolk/agentic-url/automation-manifest.ts'),
    );
    const { sameAttemptTokenCodes, refetchCodes } = require(
      path.join(srcRoot, 'lib/kolk/error-codes.ts'),
    );

    const manifest = buildAutomationManifest();

    const expectedSameToken = sameAttemptTokenCodes();
    const expectedRefetch = refetchCodes();

    assert.deepEqual(
      [...manifest.retry.sameAttemptToken].sort(),
      [...expectedSameToken].sort(),
      'manifest.retry.sameAttemptToken does not match sameAttemptTokenCodes() from the registry',
    );
    assert.deepEqual(
      [...manifest.retry.refetch].sort(),
      [...expectedRefetch].sort(),
      'manifest.retry.refetch does not match refetchCodes() from the registry',
    );

    // unlocked_false is a documented pseudo-code retry hint; it must stay
    // in sameAttemptToken but must NOT be smuggled into the registry.
    assert.ok(
      manifest.retry.sameAttemptToken.includes('unlocked_false'),
      'manifest.retry.sameAttemptToken must include the unlocked_false pseudo-code',
    );
    for (const pseudo of RETRY_PSEUDO_CODES) {
      const inRegistry = expectedSameToken.includes(pseudo) || expectedRefetch.includes(pseudo);
      // Pseudo-codes are appended in sameAttemptTokenCodes() but should not
      // appear as proper records.
      const { ERROR_CODE_REGISTRY } = require(
        path.join(srcRoot, 'lib/kolk/error-codes.ts'),
      );
      const realCodes = new Set(ERROR_CODE_REGISTRY.map((r) => r.code));
      assert.ok(
        !realCodes.has(pseudo),
        `Pseudo-code '${pseudo}' must not be a registered ErrorCodeRecord`,
      );
      assert.ok(
        inRegistry,
        `Pseudo-code '${pseudo}' should still be exposed via sameAttemptTokenCodes()`,
      );
    }
  } finally {
    restore();
  }
});

test('manifest errorCodes.byCode is fully populated from the registry', () => {
  const restore = loadTsModules();
  try {
    const { buildAutomationManifest } = require(
      path.join(srcRoot, 'lib/kolk/agentic-url/automation-manifest.ts'),
    );
    const { ERROR_CODE_REGISTRY } = require(
      path.join(srcRoot, 'lib/kolk/error-codes.ts'),
    );

    const manifest = buildAutomationManifest();
    const byCode = manifest.errorCodes.byCode;

    assert.equal(
      Object.keys(byCode).length,
      ERROR_CODE_REGISTRY.length,
      'manifest.errorCodes.byCode entry count must equal ERROR_CODE_REGISTRY length',
    );

    for (const record of ERROR_CODE_REGISTRY) {
      const entry = byCode[record.code];
      assert.ok(entry, `Registry code '${record.code}' missing from manifest.errorCodes.byCode`);
      assert.equal(entry.http, record.http, `http mismatch for '${record.code}'`);
      assert.equal(entry.retry, record.retry, `retry mismatch for '${record.code}'`);
      assert.equal(entry.retryAfterDefault, record.retryAfterDefault, `retryAfterDefault mismatch for '${record.code}'`);
      assert.equal(entry.fixHint, record.fixHint, `fixHint mismatch for '${record.code}'`);
      assert.deepEqual(entry.surfaces, record.surfaces, `surfaces mismatch for '${record.code}'`);
    }

    assert.deepEqual(
      manifest.errorCodes.retryDispositions,
      ['sameAttemptToken', 'refetch', 'auth', 'platform', 'terminal'],
      'manifest.errorCodes.retryDispositions must enumerate the five canonical retry buckets',
    );
  } finally {
    restore();
  }
});

test('every registry code carries an actionable fixHint and a sane HTTP status', () => {
  const restore = loadTsModules();
  try {
    const { ERROR_CODE_REGISTRY } = require(
      path.join(srcRoot, 'lib/kolk/error-codes.ts'),
    );

    for (const record of ERROR_CODE_REGISTRY) {
      assert.ok(
        record.fixHint && record.fixHint.length >= 20,
        `Code '${record.code}' must have a fixHint of at least 20 chars; got '${record.fixHint}'`,
      );
      assert.ok(
        record.http >= 400 && record.http < 600,
        `Code '${record.code}' http=${record.http} is not a 4xx/5xx status`,
      );
      assert.ok(
        Array.isArray(record.surfaces) && record.surfaces.length > 0,
        `Code '${record.code}' must declare at least one surface`,
      );
    }
  } finally {
    restore();
  }
});
