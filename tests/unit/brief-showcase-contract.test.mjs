import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const Module = require('module');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const srcRoot = path.join(repoRoot, 'src');

function read(relPath) {
  return readFileSync(path.join(repoRoot, relPath), 'utf8');
}

function installTsxLoader() {
  const previousTsLoader = Module._extensions['.ts'];
  const previousTsxLoader = Module._extensions['.tsx'];
  const previousResolve = Module._resolveFilename;

  for (const ext of ['.ts', '.tsx']) {
    Module._extensions[ext] = (module, filename) => {
      const source = readFileSync(filename, 'utf8');
      const transpiled = ts.transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2020,
          jsx: ts.JsxEmit.ReactJSX,
          esModuleInterop: true,
        },
        fileName: filename,
      });
      module._compile(transpiled.outputText, filename);
    };
  }

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

    if (previousTsxLoader) {
      Module._extensions['.tsx'] = previousTsxLoader;
    } else {
      delete Module._extensions['.tsx'];
    }

    Module._resolveFilename = previousResolve;
  };
}

const restore = installTsxLoader();
test.after(() => restore());

const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { BriefShowcaseSlider } = require(path.join(srcRoot, 'components/home/brief-showcase-slider.tsx'));

function renderBriefShowcaseTitle(scenarioTitle) {
  const request = {
    level: 1,
    scenarioTitle,
    industry: 'Retail',
    requesterName: 'Test Requester',
    requestContext: 'Need help by Friday.',
    scoringFocus: ['Match the client ask'],
    outputShape: ['A concise deliverable'],
  };

  return renderToStaticMarkup(React.createElement(BriefShowcaseSlider, { requests: [request] }));
}

function countOccurrences(value, needle) {
  return value.split(needle).length - 1;
}

test('brief showcase public GET remains read-only', () => {
  const source = read('src/app/api/brief-showcase/route.ts');
  assert.equal(source.includes('generateShowcaseBatch'), false, 'public GET must not call AI generation');
  assert.equal(source.includes('insertBatch'), false, 'public GET must not write showcase rows');
  assert.equal(source.includes('deleteExpiredBefore'), false, 'public GET must not mutate storage');
});

test('brief showcase cron auth fails closed', () => {
  const source = read('src/app/api/internal/cron/brief-showcase/route.ts');
  assert.ok(source.includes('SHOWCASE_CRON_MISCONFIGURED'), 'cron route should fail when secret is missing');
  assert.equal(source.includes('process.env.CRON_SECRET &&'), false, 'cron route must not fail open when secret is missing');
});

test('legacy live-client public routes are not exposed', () => {
  assert.equal(
    existsSync(path.join(repoRoot, 'src/app/api/live-client-requests/route.ts')),
    false,
    'legacy /api/live-client-requests should not remain public',
  );
});

test('public showcase wording uses ChallengeBrief Preview framing', () => {
  const publicSources = [
    'src/i18n/locales/en.ts',
    'src/i18n/locales/es-mx.ts',
    'src/i18n/locales/zh-tw.ts',
    'public/llms.txt',
  ].map(read).join('\n');

  assert.match(publicSources, /ChallengeBrief/);
  assert.equal(publicSources.includes('Live Client Requests'), false);
  assert.equal(publicSources.includes('real client brief'), false);
  assert.equal(publicSources.includes('actual CEOs'), false);
  assert.equal(publicSources.includes('Real clients, real budgets'), false);
  assert.equal(publicSources.includes('Clientes reales, presupuestos reales'), false);
  assert.equal(publicSources.includes('真實客戶、真實預算'), false);
});

test('brief showcase i18n schema does not keep removed hierarchy labels', () => {
  const source = read('src/i18n/types.ts');
  const locales = [
    'src/i18n/locales/en.ts',
    'src/i18n/locales/es-mx.ts',
    'src/i18n/locales/zh-tw.ts',
  ].map(read).join('\n');

  assert.equal(source.includes('scenarioLabel'), false);
  assert.equal(source.includes('requesterLabel'), false);
  assert.equal(locales.includes('scenarioLabel'), false);
  assert.equal(locales.includes('requesterLabel'), false);
});

test('brief showcase renders extracted budget only once', () => {
  const html = renderBriefShowcaseTitle('Fix my email flow! Paying $95');

  assert.ok(html.includes('Fix my email flow!'), 'expected cleaned scenario title to remain visible');
  assert.equal(html.includes('Fix my email flow! Paying $95'), false, 'heading should not repeat the budget text');
  assert.equal(countOccurrences(html, '$95'), 1, 'budget should render once in the budget pill');
});

test('brief showcase cleans common budget separators from displayed title', () => {
  const cases = [
    {
      scenarioTitle: 'Build admin dashboard - $1,200',
      cleanedTitle: 'Build admin dashboard',
      budget: '$1,200',
    },
    {
      scenarioTitle: 'Audit Zapier setup: $150.50',
      cleanedTitle: 'Audit Zapier setup',
      budget: '$150.50',
    },
    {
      scenarioTitle: 'Build system! Need $650. Deadline: 3 weeks',
      cleanedTitle: 'Build system! Deadline: 3 weeks',
      budget: '$650',
    },
    {
      scenarioTitle: 'Fix my email flow! Paying $95',
      cleanedTitle: 'Fix my email flow!',
      budget: '$95',
    },
    {
      scenarioTitle: 'Localize onboarding copy for US$300',
      cleanedTitle: 'Localize onboarding copy',
      budget: 'US$300',
    },
    {
      scenarioTitle: 'Check compliance notes USD $700',
      cleanedTitle: 'Check compliance notes',
      budget: '$700',
    },
  ];

  for (const { scenarioTitle, cleanedTitle, budget } of cases) {
    const html = renderBriefShowcaseTitle(scenarioTitle);

    assert.ok(html.includes(cleanedTitle), `expected cleaned title for ${scenarioTitle}`);
    assert.equal(html.includes(scenarioTitle), false, `heading should not include original budget-bearing title for ${scenarioTitle}`);
    assert.equal(countOccurrences(html, budget), 1, `budget should render once for ${scenarioTitle}`);
  }
});

test('brief showcase leaves titles without USD budgets unchanged', () => {
  const html = renderBriefShowcaseTitle('Translate a customer update');

  assert.ok(html.includes('Translate a customer update'));
  assert.equal(html.includes('rounded-full bg-green-50'), false, 'budget pill should not render without a USD budget');
});

test('brief showcase budget pill has accessible context', () => {
  const html = renderBriefShowcaseTitle('Fix my email flow! Paying $95');

  assert.ok(html.includes('sr-only">Budget </span>$95'), 'budget amount should have an accessible label');
});
