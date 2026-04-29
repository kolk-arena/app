import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const Module = require('module');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const srcRoot = path.join(repoRoot, 'src');

// ---------------------------------------------------------------------------
// Transparent .ts loader (same pattern as dry-run-validation.test.mjs).
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

const enModulePath = path.join(srcRoot, 'i18n/locales/en.ts');
const esMxModulePath = path.join(srcRoot, 'i18n/locales/es-mx.ts');
const zhTwModulePath = path.join(srcRoot, 'i18n/locales/zh-tw.ts');
const enMod = require(enModulePath);
const enCatalog = enMod.en;

// ---------------------------------------------------------------------------
// Walk the catalog and produce a flat key-path list of leaves, ignoring keys
// in IGNORED_PATHS. Treat strings, functions, and primitives as leaves.
// ---------------------------------------------------------------------------

// Some leaves are intentionally non-string. Today the only known shapes are
// numeric `level` / `suggestedTimeMinutes` on the play.levelCards array. The
// `band` enum is a string so it passes the default check. If Agent B
// introduces other non-string shapes, extend NUMERIC_LEAF_KEYS or update the
// detection logic per docs/I18N_GUIDE.md §9.
const NUMERIC_LEAF_KEYS = new Set(['level', 'suggestedTimeMinutes']);

function walk(value, currentPath, leafCallback) {
  if (Array.isArray(value)) {
    value.forEach((item, idx) => {
      walk(item, currentPath.concat(String(idx)), leafCallback);
    });
    return;
  }
  if (value !== null && typeof value === 'object' && !(typeof value === 'function')) {
    for (const key of Object.keys(value)) {
      walk(value[key], currentPath.concat(key), leafCallback);
    }
    return;
  }
  leafCallback(currentPath, value);
}

function collectLeaves(catalog) {
  const leaves = [];
  walk(catalog, [], (pathArr, value) => {
    leaves.push({ path: pathArr.join('.'), key: pathArr[pathArr.length - 1], value });
  });
  return leaves;
}

const enLeaves = collectLeaves(enCatalog);
const enKeySet = new Set(enLeaves.map((l) => l.path));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('en catalog has at least one leaf', () => {
  assert.ok(enLeaves.length > 0, 'expected en catalog to have leaves');
});

test('every en leaf is a string or function (template) — exempting known structural numeric keys', () => {
  // Strings (including the `band` enum 'A'|'B'|'C'|'D') and template-key
  // functions are always allowed. Numbers are only allowed at known
  // structural keys (e.g., level cards' numeric `level`, `suggestedTimeMinutes`).
  const offenders = [];
  for (const leaf of enLeaves) {
    const t = typeof leaf.value;
    if (t === 'string' || t === 'function') continue;
    if (t === 'number' && NUMERIC_LEAF_KEYS.has(leaf.key)) continue;
    offenders.push(`${leaf.path} (typeof=${t})`);
  }
  assert.equal(
    offenders.length,
    0,
    `Found ${offenders.length} non-string/non-function leaves not in the structural allow-list:\n  ${offenders.join('\n  ')}\n` +
      `If these are intentional non-string leaves (e.g., a new numeric shape), add the key to NUMERIC_LEAF_KEYS in this test ` +
      `or update its detection logic per docs/I18N_GUIDE.md §9.`,
  );
});

test('no en leaf is null or undefined', () => {
  const offenders = enLeaves
    .filter((l) => l.value === null || l.value === undefined)
    .map((l) => l.path);
  assert.equal(
    offenders.length,
    0,
    `Found ${offenders.length} null/undefined leaves:\n  ${offenders.join('\n  ')}`,
  );
});

test('no en leaf is an empty string (placeholder forgotten?)', () => {
  const offenders = enLeaves
    .filter((l) => typeof l.value === 'string' && l.value.length === 0)
    .map((l) => l.path);
  assert.equal(
    offenders.length,
    0,
    `Found ${offenders.length} empty-string leaves:\n  ${offenders.join('\n  ')}`,
  );
});

test('no en leaf contains TODO / FIXME / TRANSLATE markers', () => {
  const markerRe = /\b(TODO|FIXME|TRANSLATE)\b/;
  const offenders = enLeaves
    .filter((l) => typeof l.value === 'string' && markerRe.test(l.value))
    .map((l) => `${l.path} → ${JSON.stringify(l.value).slice(0, 80)}`);
  assert.equal(
    offenders.length,
    0,
    `Found ${offenders.length} leaves with TODO/FIXME/TRANSLATE markers:\n  ${offenders.join('\n  ')}`,
  );
});

test('FrontendCopy type from src/i18n/index.ts is structurally consistent with en', () => {
  // Smoke-check the singleton wiring: importing the singleton should yield the
  // same shape as the locale module.
  const indexMod = require(path.join(srcRoot, 'i18n/index.ts'));
  assert.ok(indexMod.copy, 'expected src/i18n/index.ts to export copy');
  assert.equal(
    indexMod.copy,
    enCatalog,
    'expected copy === en (single-locale compile-time singleton; see I18N_GUIDE §1)',
  );
});

// ---------------------------------------------------------------------------
// Forward-compat: if es-mx exists, key set must equal en's. Resilient to the
// file not existing yet — Agent B may add it later.
// ---------------------------------------------------------------------------

test('es-mx (if present) has the same key paths as en', () => {
  if (!existsSync(esMxModulePath)) {
    // Locale not yet shipped — skipping per I18N_GUIDE §3.
    return;
  }
  let esMod;
  try {
    esMod = require(esMxModulePath);
  } catch (err) {
    assert.fail(`es-mx locale file exists but failed to load: ${err.message}`);
    return;
  }
  const esCatalog = esMod['esMx'] ?? esMod['es_mx'] ?? esMod['esMX'] ?? esMod['default'];
  assert.ok(
    esCatalog,
    'expected src/i18n/locales/es-mx.ts to export an es-mx catalog (named export `esMx` or default)',
  );
  const esKeySet = new Set(collectLeaves(esCatalog).map((l) => l.path));

  const missingInEs = [...enKeySet].filter((k) => !esKeySet.has(k));
  const extraInEs = [...esKeySet].filter((k) => !enKeySet.has(k));
  assert.equal(
    missingInEs.length,
    0,
    `es-mx is missing ${missingInEs.length} keys present in en:\n  ${missingInEs.join('\n  ')}`,
  );
  assert.equal(
    extraInEs.length,
    0,
    `es-mx has ${extraInEs.length} keys not present in en:\n  ${extraInEs.join('\n  ')}`,
  );
});

// ---------------------------------------------------------------------------
// Forward-compat: same parity check for zh-tw (Traditional Chinese, Taiwan).
// Resilient to the file not existing yet.
// ---------------------------------------------------------------------------

test('zh-tw (if present) has the same key paths as en', () => {
  if (!existsSync(zhTwModulePath)) {
    return;
  }
  let zhMod;
  try {
    zhMod = require(zhTwModulePath);
  } catch (err) {
    assert.fail(`zh-tw locale file exists but failed to load: ${err.message}`);
    return;
  }
  const zhCatalog = zhMod['zhTw'] ?? zhMod['zh_tw'] ?? zhMod['zhTW'] ?? zhMod['default'];
  assert.ok(
    zhCatalog,
    'expected src/i18n/locales/zh-tw.ts to export a zh-tw catalog (named export `zhTw` or default)',
  );
  const zhKeySet = new Set(collectLeaves(zhCatalog).map((l) => l.path));

  const missingInZh = [...enKeySet].filter((k) => !zhKeySet.has(k));
  const extraInZh = [...zhKeySet].filter((k) => !enKeySet.has(k));
  assert.equal(
    missingInZh.length,
    0,
    `zh-tw is missing ${missingInZh.length} keys present in en:\n  ${missingInZh.join('\n  ')}`,
  );
  assert.equal(
    extraInZh.length,
    0,
    `zh-tw has ${extraInZh.length} keys not present in en:\n  ${extraInZh.join('\n  ')}`,
  );
});

// ---------------------------------------------------------------------------
// Report key count on success.
// ---------------------------------------------------------------------------

test(`en catalog leaf count: ${enLeaves.length}`, () => {
  // No assertion — this test name is the reporting channel for the count.
  assert.ok(enLeaves.length > 0);
});
