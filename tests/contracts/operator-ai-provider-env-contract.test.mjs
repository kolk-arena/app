import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const Module = require('module');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const DOCUMENTED_PROVIDER_KEYS = [
  'KOLK_SCORING_P1_API_KEY',
  'KOLK_SCORING_P2_API_KEY',
  'KOLK_SCORING_P3_API_KEY',
];
const MANAGED_ENV_KEYS = [
  'KOLK_SCORING_P1_API_KEY',
  'KOLK_SCORING_P1_BASE_URL',
  'KOLK_SCORING_G1_MODEL',
  'KOLK_SCORING_P2_API_KEY',
  'KOLK_SCORING_P2_BASE_URL',
  'KOLK_SCORING_G2_MODEL',
  'KOLK_SCORING_G2_FALLBACK_MODEL',
  'KOLK_SCORING_P3_API_KEY',
  'KOLK_SCORING_P3_BASE_URL',
  'KOLK_SCORING_G2_SECONDARY_MODEL',
  'KOLK_SCORING_G3_MODEL',
];

function readRepoFile(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function parseSourceFile(relativePath) {
  const text = readRepoFile(relativePath);
  return ts.createSourceFile(relativePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function visit(node, visitor) {
  visitor(node);
  ts.forEachChild(node, (child) => visit(child, visitor));
}

function isIdentifierNamed(node, text) {
  return ts.isIdentifier(node) && node.text === text;
}

function findFirstNode(root, predicate) {
  let match = null;

  visit(root, (node) => {
    if (!match && predicate(node)) {
      match = node;
    }
  });

  return match;
}

function propertyByName(objectLiteral, name) {
  return objectLiteral.properties.find(
    (property) =>
      ts.isPropertyAssignment(property)
      && ((ts.isIdentifier(property.name) && property.name.text === name)
        || (ts.isStringLiteral(property.name) && property.name.text === name)),
  );
}

function documentedProviderKeysFromEnv() {
  const envExample = readRepoFile('.env.example');
  return Array.from(
    envExample.matchAll(/^(KOLK_SCORING_P[123]_API_KEY)=/gm),
    (match) => match[1],
  );
}

function documentedProviderKeysFromReadme() {
  const readme = readRepoFile('README.md');
  return Array.from(
    readme.matchAll(/\|\s*`(KOLK_SCORING_P[123]_API_KEY)`\s*\|/g),
    (match) => match[1],
  );
}

const P1_ENV = {
  KOLK_SCORING_P1_API_KEY: 'p1-key',
  KOLK_SCORING_P1_BASE_URL: 'https://p1.example/v1',
  KOLK_SCORING_G1_MODEL: 'p1-model',
};

const P2_ENV = {
  KOLK_SCORING_P2_API_KEY: 'p2-key',
  KOLK_SCORING_P2_BASE_URL: 'https://p2.example/v1',
  KOLK_SCORING_G2_MODEL: 'p2-primary',
  KOLK_SCORING_G2_FALLBACK_MODEL: 'p2-fallback',
};

const P3_ENV = {
  KOLK_SCORING_P3_API_KEY: 'p3-key',
  KOLK_SCORING_P3_BASE_URL: 'https://p3.example/v1',
  KOLK_SCORING_G2_SECONDARY_MODEL: 'p3-secondary',
  KOLK_SCORING_G3_MODEL: 'p3-primary',
};

function withEnv(overrides, fn) {
  const previous = new Map(MANAGED_ENV_KEYS.map((key) => [key, process.env[key]]));

  for (const key of MANAGED_ENV_KEYS) {
    delete process.env[key];
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return fn();
  } finally {
    for (const key of MANAGED_ENV_KEYS) {
      const value = previous.get(key);
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function loadRuntimeModule() {
  return loadTypeScriptModule('src/lib/kolk/ai/runtime.ts');
}

function clearRepoModuleCache() {
  for (const modulePath of Object.keys(require.cache)) {
    if (modulePath.startsWith(path.join(repoRoot, 'src'))) {
      delete require.cache[modulePath];
    }
  }
}

function loadTypeScriptModule(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const previousLoader = Module._extensions['.ts'];

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

  clearRepoModuleCache();

  try {
    return require(absolutePath);
  } finally {
    if (previousLoader) {
      Module._extensions['.ts'] = previousLoader;
    } else {
      delete Module._extensions['.ts'];
    }
  }
}

test('provider docs list the API key baseline consistently', () => {
  assert.deepEqual(documentedProviderKeysFromEnv(), DOCUMENTED_PROVIDER_KEYS);
  assert.deepEqual(documentedProviderKeysFromReadme(), DOCUMENTED_PROVIDER_KEYS);
});

test('runtime readiness tracks the documented provider baseline and two-group scoring readiness', () => {
  withEnv({}, () => {
    const runtime = loadRuntimeModule();
    const summary = runtime.getAiReadinessSummary();

    assert.equal(summary.fullyConfigured, false);
    assert.equal(summary.operatorStackReady, false);
    assert.equal(summary.activeJudgeProvider, null);
    assert.equal(summary.activeJudgeReady, false);
    assert.deepEqual(summary.activeJudgeProviders, []);
    assert.deepEqual(summary.activeJudgeMissingEnvKeys, [
      'KOLK_SCORING_P1_API_KEY',
      'KOLK_SCORING_P1_BASE_URL',
      'KOLK_SCORING_G1_MODEL',
      'KOLK_SCORING_P2_API_KEY',
      'KOLK_SCORING_P2_BASE_URL',
      'KOLK_SCORING_G2_MODEL',
    ]);
    assert.deepEqual(summary.missingEnvKeys, MANAGED_ENV_KEYS);
    assert.equal(summary.scoringReady, false);
    assert.deepEqual(summary.availableScoringGroups, []);
    assert.deepEqual(summary.availableScoringCombos, []);
    assert.equal(summary.preferredScoringCombo, null);
    assert.deepEqual(summary.scoringMissingEnvKeys, MANAGED_ENV_KEYS);
  });

  withEnv(P1_ENV, () => {
    const runtime = loadRuntimeModule();
    const summary = runtime.getAiReadinessSummary();
    const activeJudge = runtime.getActiveJudgeRuntime();

    assert.equal(summary.fullyConfigured, false);
    assert.equal(summary.operatorStackReady, false);
    assert.equal(summary.activeJudgeProvider, 'p1');
    assert.equal(summary.activeJudgeReady, true);
    assert.deepEqual(summary.activeJudgeProviders, ['p1']);
    assert.deepEqual(summary.activeJudgeMissingEnvKeys, [
      'KOLK_SCORING_P2_API_KEY',
      'KOLK_SCORING_P2_BASE_URL',
      'KOLK_SCORING_G2_MODEL',
    ]);
    assert.deepEqual(summary.missingEnvKeys, [
      'KOLK_SCORING_P2_API_KEY',
      'KOLK_SCORING_P2_BASE_URL',
      'KOLK_SCORING_G2_MODEL',
      'KOLK_SCORING_G2_FALLBACK_MODEL',
      'KOLK_SCORING_P3_API_KEY',
      'KOLK_SCORING_P3_BASE_URL',
      'KOLK_SCORING_G2_SECONDARY_MODEL',
      'KOLK_SCORING_G3_MODEL',
    ]);
    assert.equal(activeJudge?.provider, 'p1');
    assert.equal(activeJudge?.model, 'p1-model');
    assert.equal(summary.scoringReady, false);
    assert.deepEqual(summary.availableScoringGroups, ['G1']);
    assert.deepEqual(summary.availableScoringCombos, []);
    assert.deepEqual(summary.scoringMissingEnvKeys, [
      'KOLK_SCORING_P2_API_KEY',
      'KOLK_SCORING_P2_BASE_URL',
      'KOLK_SCORING_G2_MODEL',
      'KOLK_SCORING_G2_FALLBACK_MODEL',
      'KOLK_SCORING_P3_API_KEY',
      'KOLK_SCORING_P3_BASE_URL',
      'KOLK_SCORING_G2_SECONDARY_MODEL',
      'KOLK_SCORING_G3_MODEL',
    ]);
  });

  withEnv(P2_ENV, () => {
    const runtime = loadRuntimeModule();
    const summary = runtime.getAiReadinessSummary();
    const activeJudge = runtime.getActiveJudgeRuntime();

    assert.equal(summary.fullyConfigured, false);
    assert.equal(summary.operatorStackReady, false);
    assert.equal(summary.activeJudgeProvider, 'p2');
    assert.equal(summary.activeJudgeReady, true);
    assert.deepEqual(summary.activeJudgeProviders, ['p2']);
    assert.deepEqual(summary.activeJudgeMissingEnvKeys, [
      'KOLK_SCORING_P1_API_KEY',
      'KOLK_SCORING_P1_BASE_URL',
      'KOLK_SCORING_G1_MODEL',
    ]);
    assert.deepEqual(summary.missingEnvKeys, [
      'KOLK_SCORING_P1_API_KEY',
      'KOLK_SCORING_P1_BASE_URL',
      'KOLK_SCORING_G1_MODEL',
      'KOLK_SCORING_P3_API_KEY',
      'KOLK_SCORING_P3_BASE_URL',
      'KOLK_SCORING_G2_SECONDARY_MODEL',
      'KOLK_SCORING_G3_MODEL',
    ]);
    assert.equal(activeJudge?.provider, 'p2');
    assert.equal(activeJudge?.model, 'p2-primary');
    assert.equal(summary.scoringReady, false);
    assert.deepEqual(summary.availableScoringGroups, []);
    assert.deepEqual(summary.availableScoringCombos, []);
  });

  withEnv({ ...P2_ENV, ...P3_ENV }, () => {
    const runtime = loadRuntimeModule();
    const summary = runtime.getAiReadinessSummary();

    assert.equal(summary.fullyConfigured, false);
    assert.equal(summary.operatorStackReady, false);
    assert.equal(summary.scoringReady, true);
    assert.deepEqual(summary.availableScoringGroups, ['G2', 'G3']);
    assert.deepEqual(summary.availableScoringCombos, ['B']);
    assert.equal(summary.preferredScoringCombo, 'B');
    assert.deepEqual(summary.scoringMissingEnvKeys, []);
  });

  withEnv(
    {
      ...P1_ENV,
      ...P2_ENV,
      ...P3_ENV,
      KOLK_SCORING_G2_MODEL: 'custom-p2-model',
    },
    () => {
      const runtime = loadRuntimeModule();
      const stack = runtime.getAiStackStatus();
      const summary = runtime.getAiReadinessSummary();
      const activeJudge = runtime.getActiveJudgeRuntime();

      assert.equal(stack.fullyConfigured, true);
      assert.deepEqual(stack.configuredProviders, ['p1', 'p2', 'p3']);
      assert.deepEqual(stack.missingProviders, []);
      assert.equal(summary.fullyConfigured, true);
      assert.equal(summary.operatorStackReady, true);
      assert.equal(summary.activeJudgeProvider, 'p1');
      assert.equal(summary.activeJudgeReady, true);
      assert.deepEqual(summary.activeJudgeProviders, ['p1', 'p2']);
      assert.deepEqual(summary.activeJudgeMissingEnvKeys, []);
      assert.deepEqual(summary.missingEnvKeys, []);
      assert.equal(summary.scoringReady, true);
      assert.deepEqual(summary.availableScoringGroups, ['G1', 'G2', 'G3']);
      assert.deepEqual(summary.availableScoringCombos, ['A', 'B', 'C']);
      assert.equal(summary.preferredScoringCombo, 'A');
      assert.equal(activeJudge?.provider, 'p1');
      assert.equal(activeJudge?.model, 'p1-model');
      assert.equal(runtime.getProviderRuntimeConfig('p2').model, 'custom-p2-model');
      assert.equal(runtime.getProviderRuntimeConfig('p3').judgeCompatible, true);
      assert.equal(runtime.getContentRuntime()?.model, 'p3-primary');
    },
  );
});

test('judge exports deterministic combo helpers for the beta scoring path', () => {
  const judge = loadTypeScriptModule('src/lib/kolk/evaluator/judge.ts');

  assert.equal(judge.calculateRelativeCoverageGap(30, 10), 2 / 3);
  assert.equal(judge.calculateRelativeCoverageGap(0, 0), 0);
  assert.equal(judge.selectScoringCombo('attempt-a', ['B']), 'B');
  assert.equal(judge.selectScoringCombo('attempt-a', []), null);

  const combos = new Set([
    judge.selectScoringCombo('attempt-a', ['A', 'B', 'C']),
    judge.selectScoringCombo('attempt-b', ['A', 'B', 'C']),
    judge.selectScoringCombo('attempt-c', ['A', 'B', 'C']),
    judge.selectScoringCombo('attempt-d', ['A', 'B', 'C']),
  ]);
  assert([...combos].every((combo) => combo === 'A' || combo === 'B' || combo === 'C'));
});

test('judge and submit route stay wired to combo-scoring readiness gating', () => {
  const judgeSource = parseSourceFile('src/lib/kolk/evaluator/judge.ts');
  const submitRoute = parseSourceFile('src/app/api/challenge/submit/route.ts');
  const adminRoute = parseSourceFile('src/app/api/admin/budget/route.ts');

  const runtimeImport = findFirstNode(
    judgeSource,
    (node) => ts.isImportDeclaration(node)
      && ts.isStringLiteral(node.moduleSpecifier)
      && node.moduleSpecifier.text === '../ai',
  );
  assert(runtimeImport, 'Expected judge runtime import');

  const comboSelectorCall = findFirstNode(
    judgeSource,
    (node) => ts.isCallExpression(node) && isIdentifierNamed(node.expression, 'selectScoringCombo'),
  );
  assert(comboSelectorCall, 'Expected judge.ts to choose a deterministic scoring combo');

  const gapCheckCall = findFirstNode(
    judgeSource,
    (node) => ts.isCallExpression(node) && isIdentifierNamed(node.expression, 'calculateRelativeCoverageGap'),
  );
  assert(gapCheckCall, 'Expected judge.ts to enforce the G2 relative-gap check');

  const providerSpecificJudgeEnvRead = findFirstNode(
    judgeSource,
    (node) => (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
      && node.getText().includes('process.env'),
  );
  assert.equal(providerSpecificJudgeEnvRead, null);

  const readinessCall = findFirstNode(
    submitRoute,
    (node) => ts.isCallExpression(node) && isIdentifierNamed(node.expression, 'getAiReadinessSummary'),
  );
  assert(readinessCall, 'Expected submit route to read AI readiness summary');

  const readinessGuard = findFirstNode(
    submitRoute,
    (node) => ts.isIfStatement(node)
      && node.expression.getText().includes('!aiReadiness.scoringReady'),
  );
  assert(readinessGuard, 'Expected submit route to gate scoring on readiness summary');

  const errorReturn = findFirstNode(
    readinessGuard.thenStatement,
    (node) => ts.isReturnStatement(node)
      && node.expression
      && ts.isCallExpression(node.expression)
      && isIdentifierNamed(node.expression.expression, 'errorResponse'),
  );
  assert(errorReturn, 'Expected readiness guard to return errorResponse()');
  assert(errorReturn.expression.arguments?.length === 1);
  assert(ts.isObjectLiteralExpression(errorReturn.expression.arguments[0]));

  const messageProperty = propertyByName(errorReturn.expression.arguments[0], 'message');
  assert(messageProperty && ts.isPropertyAssignment(messageProperty));
  assert(messageProperty.initializer.getText().includes('aiReadiness.scoringMissingEnvKeys'));

  const runJudgeCall = findFirstNode(
    submitRoute,
    (node) => ts.isCallExpression(node) && isIdentifierNamed(node.expression, 'runJudge'),
  );
  assert(runJudgeCall, 'Expected submit route to call runJudge()');
  assert(readinessGuard.pos < runJudgeCall.pos, 'Expected readiness guard to execute before runJudge()');
  assert(runJudgeCall.arguments.some((argument) => argument.getText() === 'attemptToken'));

  const directProviderEnvGuard = findFirstNode(
    submitRoute,
    (node) => (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
      && node.getText().includes('process.env.XAI_API_KEY'),
  );
  assert.equal(directProviderEnvGuard, null);

  const adminScoringReadiness = findFirstNode(
    adminRoute,
    (node) => ts.isPropertyAssignment(node)
      && isIdentifierNamed(node.name, 'scoringReady'),
  );
  assert(adminScoringReadiness, 'Expected admin budget route to expose scoring readiness');
});
