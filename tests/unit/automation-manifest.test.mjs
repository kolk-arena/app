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

function loadAutomationManifest() {
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

  const mod = require(path.join(srcRoot, 'lib/kolk/agentic-url/automation-manifest.ts'));

  const restore = () => {
    if (previousTsLoader) {
      Module._extensions['.ts'] = previousTsLoader;
    } else {
      delete Module._extensions['.ts'];
    }
    Module._resolveFilename = previousResolve;
  };

  return { ...mod, restore };
}

test('automation manifest exposes the URL-first agent contract', () => {
  const { buildAutomationManifest, automationManifestHeaders, restore } = loadAutomationManifest();
  try {
    const manifest = buildAutomationManifest();

    assert.equal(manifest.schemaVersion, 'kolk-automation-manifest.v1');
    assert.equal(manifest.canonicalOrigin, 'https://www.kolkarena.com');
    assert.equal(manifest.docs.skill, 'https://www.kolkarena.com/kolk_workspace.md');
    assert.equal(manifest.docs.llms, 'https://www.kolkarena.com/llms.txt');
    assert.equal(manifest.entrypoints.manifest, 'https://www.kolkarena.com/ai-action-manifest.json');
    assert.equal(manifest.entrypoints.compatibilityManifest, 'https://www.kolkarena.com/api/agent-entrypoint');
    assert.equal(manifest.entrypoints.apiStart, 'https://www.kolkarena.com/api/challenge/0');
    assert.equal(manifest.levels.min, 0);
    assert.equal(manifest.levels.max, 8);
    assert.equal(manifest.levels.anonymousMax, 5);
    assert.equal(manifest.levels.authRequiredFrom, 6);
    assert.equal(manifest.auth.anonymousCookie.cookieName, 'kolk_anon_session');
    assert.deepEqual(manifest.auth.bearer.requiredScopes, [
      'fetch:challenge',
      'submit:onboarding',
      'submit:ranked',
    ]);
    assert.equal(manifest.fetch.responsePaths.attemptToken, '$.challenge.attemptToken');
    assert.equal(manifest.submit.primaryTextMaxChars, 50000);
    assert.equal(manifest.rateLimits.perAttemptMinute, 6);
    assert.equal(manifest.rateLimits.perAttemptHour, 40);
    assert.equal(manifest.rateLimits.perAttemptTotal, 10);
    assert.equal(manifest.rateLimits.perIdentityDay, 99);
    assert.equal(manifest.asyncPolicy.submitMode, 'synchronous');
    assert.equal(manifest.asyncPolicy.webhooks, false);
    assert.ok(manifest.retry.sameAttemptToken.includes('SCORING_UNAVAILABLE'));
    assert.ok(manifest.retry.refetch.includes('ATTEMPT_TOKEN_EXPIRED'));
    assert.match(automationManifestHeaders()['Cache-Control'], /s-maxage=3600/);
  } finally {
    restore();
  }
});
