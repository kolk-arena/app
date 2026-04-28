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

  const layer1 = require(path.join(srcRoot, 'lib/kolk/evaluator/layer1.ts'));
  const levels = require(path.join(srcRoot, 'lib/kolk/levels/index.ts'));
  const agentContract = require(path.join(srcRoot, 'lib/kolk/agent-contract.ts'));

  const restore = () => {
    if (previousTsLoader) {
      Module._extensions['.ts'] = previousTsLoader;
    } else {
      delete Module._extensions['.ts'];
    }
    Module._resolveFilename = previousResolve;
  };

  return { layer1, levels, agentContract, restore };
}

const { layer1, levels, agentContract, restore } = loadTsModules();
test.after(() => restore());

test('math_verify ignores bare natural-language numbers', () => {
  const result = layer1.mathVerify(
    'Founded in 2019 with 3 staff. Call 555-1234 for the Roma Norte branch.',
    2022,
    40,
  );

  assert.equal(result.passed, false);
  assert.equal(result.reason, 'No currency values found in output');
  assert.deepEqual(result.extractedNumbers, []);
});

test('math_verify sums explicit currency tokens and returns diagnostics', () => {
  const result = layer1.mathVerify(
    'Service A: 300 MXN\nFounded in 2019.\nService B: $700\nPhone: 555-1234.',
    1000,
    40,
  );

  assert.equal(result.passed, true);
  assert.deepEqual(result.extractedNumbers, [
    { token: '300 MXN', value: 300, source: 'currency' },
    { token: '$700', value: 700, source: 'currency' },
  ]);
});

test('math_verify JSON mode reports only repeated cost fields', () => {
  const result = layer1.mathVerify(
    JSON.stringify({
      founded_year: 2019,
      services: [
        { name: 'Audit', cost_mxn: 300 },
        { name: 'Setup', cost_mxn: 700 },
      ],
    }),
    1000,
    40,
  );

  assert.equal(result.passed, true);
  assert.deepEqual(result.extractedNumbers, [
    { token: '$.services[0].cost_mxn', value: 300, source: 'json_field' },
    { token: '$.services[1].cost_mxn', value: 700, source: 'json_field' },
  ]);
});

test('level metadata prevents accidental L3 math and item checks', () => {
  assert.equal(levels.levelUsesLayer1Check(3, 'math_verify'), false);
  assert.equal(levels.levelUsesLayer1Check(3, 'item_count'), false);
  assert.equal(levels.levelUsesLayer1Check(3, 'fact_xref'), true);
  assert.equal(levels.levelUsesLayer1Check(4, 'math_verify'), true);
  assert.equal(levels.levelUsesLayer1Check(4, 'item_count'), true);
  assert.equal(levels.levelUsesLayer1Check(5, 'json_string_fields'), true);
});

test('agent contract publishes L3 runtime hints without math or item count', () => {
  const contract = agentContract.getAgentLevelContract(3);

  assert.ok(contract);
  assert.deepEqual(contract.deterministicChecks, ['fact_xref', 'term_guard']);
  assert.equal(contract.outputContract.some((line) => line.includes('math_verify')), true);
  assert.equal(contract.sampleSuccessPath, '/api/sample-success/3');
});

test('L5 sample success keeps required values as strings', () => {
  const sample = agentContract.getSampleSuccess(5);
  assert.ok(sample);

  const parsed = JSON.parse(sample.primaryText);
  assert.equal(typeof parsed.whatsapp_message, 'string');
  assert.equal(typeof parsed.quick_facts, 'string');
  assert.equal(typeof parsed.first_step_checklist, 'string');
  assert.equal(Array.isArray(parsed.quick_facts), false);
  assert.equal(Array.isArray(parsed.first_step_checklist), false);
});
