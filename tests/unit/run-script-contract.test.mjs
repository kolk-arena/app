import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const Module = require('module');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const srcRoot = path.join(repoRoot, 'src');

function installTsLoader() {
  const previousTsLoader = Module._extensions['.ts'];
  const previousResolve = Module._resolveFilename;

  Module._extensions['.ts'] = (module, filename) => {
    const source = readFileSync(filename, 'utf8');
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
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

function loadRunScriptModule() {
  const restore = installTsLoader();
  return {
    ...require(path.join(srcRoot, 'lib/kolk/run-script.ts')),
    restore,
  };
}

test('parseRunScriptLevel accepts .sh route levels and rejects invalid values', () => {
  const { parseRunScriptLevel, restore } = loadRunScriptModule();
  try {
    assert.deepEqual(parseRunScriptLevel('1.sh'), { ok: true, level: 1 });
    assert.deepEqual(parseRunScriptLevel('8'), { ok: true, level: 8 });
    assert.equal(parseRunScriptLevel('9.sh').ok, false);
    assert.equal(parseRunScriptLevel('one.sh').ok, false);
  } finally {
    restore();
  }
});

test('anonymous run script preserves a cookie jar and builds submit JSON with jq', () => {
  const { buildRunScript, restore } = loadRunScriptModule();
  try {
    const script = buildRunScript({ level: 1, origin: 'https://www.kolkarena.com' });

    assert.match(script, /Content-Type: application\/json/);
    assert.match(script, /Idempotency-Key: \$\(new_idempotency_key\)/);
    assert.match(script, /curl -fsS -c "\$COOKIE_JAR"/);
    assert.match(script, /curl -fsS -X POST "\$BASE\/api\/challenge\/submit"/);
    assert.match(script, /-b "\$COOKIE_JAR"/);
    assert.match(script, /jq -n \\[\s\S]*--arg attemptToken "\$ATTEMPT_TOKEN" \\[\s\S]*--rawfile primaryText "\$PRIMARY_TEXT_TMP"/);
    assert.doesNotMatch(script, /Authorization: Bearer/);
    assert.doesNotMatch(script, /challenge\/submit\?/);
    assert.doesNotMatch(script, /attemptToken=.*api\/challenge\/submit/);
  } finally {
    restore();
  }
});

test('competitive run script requires KOLK_TOKEN without printing secrets', () => {
  const { buildRunScript, restore } = loadRunScriptModule();
  try {
    const script = buildRunScript({ level: 6, origin: 'https://www.kolkarena.com' });

    assert.match(script, /KOLK_TOKEN is required for L6\+ competitive levels/);
    assert.match(script, /Authorization: Bearer \$\{KOLK_TOKEN\}/);
    assert.doesNotMatch(script, /-c "\$COOKIE_JAR"/);
    assert.doesNotMatch(script, /-b "\$COOKIE_JAR"/);
    assert.doesNotMatch(script, /echo .*\$KOLK_TOKEN/);
    assert.doesNotMatch(script, /printf .*\$KOLK_TOKEN/);
    assert.doesNotMatch(script, /challenge\/submit\?/);
  } finally {
    restore();
  }
});

test('generated run scripts are valid bash syntax', () => {
  const { buildRunScript, restore } = loadRunScriptModule();
  try {
    for (const level of [1, 6]) {
      const script = buildRunScript({ level, origin: 'https://www.kolkarena.com' });
      const result = spawnSync('bash', ['-n'], {
        input: script,
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, result.stderr);
    }
  } finally {
    restore();
  }
});
