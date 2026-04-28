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
          // Try the next candidate.
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

test('automation manifest builder stays aligned with canonical beta constants', () => {
  const restore = installTsLoader();
  try {
    const { buildAutomationManifest, automationManifestHeaders } = require(
      path.join(srcRoot, 'lib/kolk/agentic-url/automation-manifest.ts'),
    );
    const { APP_CONFIG } = require(path.join(srcRoot, 'lib/frontend/app-config.ts'));
    const betaContract = require(path.join(srcRoot, 'lib/kolk/beta-contract.ts'));
    const { MAX_PRIMARY_TEXT_CHARS } = require(path.join(srcRoot, 'lib/kolk/constants/index.ts'));
    const submissionGuards = require(path.join(srcRoot, 'lib/kolk/submission-guards.ts'));
    const { ANON_SESSION_COOKIE } = require(path.join(srcRoot, 'lib/kolk/auth/index.ts'));
    const { SCOPES } = require(path.join(srcRoot, 'lib/kolk/tokens/index.ts'));

    const manifest = buildAutomationManifest();

    assert.equal(manifest.schemaVersion, 'kolk-automation-manifest.v1');
    assert.equal(manifest.name, APP_CONFIG.name);
    assert.equal(manifest.canonicalOrigin, APP_CONFIG.canonicalOrigin);
    assert.equal(manifest.entrypoints.manifest, `${APP_CONFIG.canonicalOrigin}/ai-action-manifest.json`);
    assert.equal(manifest.entrypoints.compatibilityManifest, `${APP_CONFIG.canonicalOrigin}/api/agent-entrypoint`);
    assert.equal(manifest.entrypoints.play, `${APP_CONFIG.canonicalOrigin}/play`);
    assert.equal(manifest.entrypoints.browserStart, `${APP_CONFIG.canonicalOrigin}/challenge/0`);
    assert.equal(manifest.entrypoints.apiStart, `${APP_CONFIG.canonicalOrigin}/api/challenge/0`);
    assert.equal(manifest.entrypoints.submit, `${APP_CONFIG.canonicalOrigin}/api/challenge/submit`);
    assert.equal(manifest.entrypoints.status, `${APP_CONFIG.canonicalOrigin}/api/status`);
    assert.equal(manifest.entrypoints.sessionStatus, `${APP_CONFIG.canonicalOrigin}/api/session/status`);
    assert.equal(manifest.entrypoints.sessionAttempts, `${APP_CONFIG.canonicalOrigin}/api/session/attempts`);
    assert.equal(manifest.entrypoints.catalog, `${APP_CONFIG.canonicalOrigin}/api/challenges/catalog`);
    assert.equal(manifest.docs.submissionApi, `${APP_CONFIG.docsOrigin}/SUBMISSION_API.md`);
    assert.equal(manifest.docs.integrationGuide, `${APP_CONFIG.docsOrigin}/INTEGRATION_GUIDE.md`);

    assert.equal(manifest.levels.min, betaContract.PUBLIC_BETA_MIN_LEVEL);
    assert.equal(manifest.levels.max, betaContract.PUBLIC_BETA_MAX_LEVEL);
    assert.equal(manifest.levels.rankedMin, betaContract.RANKED_BETA_MIN_LEVEL);
    assert.equal(manifest.levels.rankedMax, betaContract.RANKED_BETA_MAX_LEVEL);
    assert.equal(manifest.levels.anonymousMax, betaContract.ANONYMOUS_BETA_MAX_LEVEL);
    assert.equal(manifest.levels.authRequiredFrom, betaContract.ANONYMOUS_BETA_MAX_LEVEL + 1);

    assert.deepEqual(manifest.auth.supportedModes, ['anonymous_cookie', 'bearer_token']);
    assert.equal(manifest.auth.recommendedAutomationMode, 'bearer_token');
    assert.equal(manifest.auth.anonymousCookie.cookieName, ANON_SESSION_COOKIE);
    assert.equal(manifest.auth.anonymousCookie.sameSessionRequired, true);
    assert.deepEqual(manifest.auth.bearer.requiredScopes, [
      SCOPES.FETCH_CHALLENGE,
      SCOPES.SUBMIT_ONBOARDING,
      SCOPES.SUBMIT_RANKED,
    ]);

    assert.equal(manifest.fetch.pathTemplate, '/api/challenge/{level}');
    assert.equal(manifest.fetch.responsePaths.promptMd, '$.challenge.promptMd');
    assert.equal(manifest.fetch.responsePaths.taskJson, '$.challenge.taskJson');
    assert.equal(manifest.fetch.responsePaths.attemptToken, '$.challenge.attemptToken');
    assert.equal(manifest.submit.path, '/api/challenge/submit');
    assert.ok(manifest.submit.headers.includes('Idempotency-Key: <uuid>'));
    assert.equal(manifest.submit.primaryTextMaxChars, MAX_PRIMARY_TEXT_CHARS);

    assert.equal(manifest.rateLimits.perAttemptMinute, submissionGuards.SUBMIT_RATE_LIMIT_PER_ATTEMPT_TOKEN_PER_MINUTE);
    assert.equal(manifest.rateLimits.perAttemptHour, submissionGuards.SUBMIT_RATE_LIMIT_PER_ATTEMPT_TOKEN_PER_HOUR);
    assert.equal(manifest.rateLimits.perAttemptTotal, submissionGuards.SUBMIT_RETRY_CAP_PER_ATTEMPT_TOKEN);
    assert.equal(manifest.rateLimits.perIdentityDay, submissionGuards.SUBMIT_RATE_LIMIT_PER_IDENTITY_PER_DAY);
    assert.equal(manifest.retry.honorRetryAfter, true);
    assert.ok(manifest.retry.sameAttemptToken.includes('SCORING_UNAVAILABLE'));
    assert.ok(manifest.retry.refetch.includes('ATTEMPT_TOKEN_EXPIRED'));
    assert.deepEqual(manifest.asyncPolicy, {
      submitMode: 'synchronous',
      jobPolling: false,
      webhooks: false,
      recommendedTimeoutSeconds: 75,
    });
    assert.match(automationManifestHeaders()['Cache-Control'], /s-maxage=3600/);
  } finally {
    restore();
  }
});

test('n8n blueprint sources prompt, task, and attempt token from the live fetch node', () => {
  const restore = installTsLoader();
  try {
    const { getN8nStarterBundle } = require(path.join(srcRoot, 'lib/frontend/agent-handoff.ts'));
    const bundle = getN8nStarterBundle({
      level: 1,
      levelName: 'Quick Translate',
      promptMd: 'STALE_PAGE_PROMPT_SHOULD_NOT_APPEAR',
      taskJson: {
        structured_brief: {
          customer: 'STALE_STRUCTURED_BRIEF_SHOULD_NOT_APPEAR',
        },
      },
      attemptToken: 'STALE_ATTEMPT_TOKEN_SHOULD_NOT_APPEAR',
    });
    const blueprint = JSON.parse(bundle);

    assert.equal(blueprint.importableWorkflow, false);
    assert.equal(blueprint.artifactType, 'blueprint_notes_not_importable_workflow');
    assert.equal(blueprint.fetchStep.outputExpressions.promptMd, '={{ $json.challenge.promptMd }}');
    assert.equal(blueprint.fetchStep.outputExpressions.taskJson, '={{ $json.challenge.taskJson }}');
    assert.equal(blueprint.fetchStep.outputExpressions.attemptToken, '={{ $json.challenge.attemptToken }}');
    assert.equal(
      blueprint.submitStep.bodyTemplate.attemptToken,
      '={{ $node["Fetch Challenge"].json.challenge.attemptToken }}',
    );
    assert.match(blueprint.aiStep.outputTemplate, /Do not paste seed-specific fields/);
    assert.doesNotMatch(bundle, /STALE_PAGE_PROMPT_SHOULD_NOT_APPEAR/);
    assert.doesNotMatch(bundle, /STALE_STRUCTURED_BRIEF_SHOULD_NOT_APPEAR/);
    assert.doesNotMatch(bundle, /STALE_ATTEMPT_TOKEN_SHOULD_NOT_APPEAR/);
  } finally {
    restore();
  }
});
