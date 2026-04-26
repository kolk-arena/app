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

function renderBriefShowcaseTitle(scenarioTitle, requestContext = 'Need help by Friday.') {
  const request = {
    level: 1,
    scenarioTitle,
    industry: 'Retail',
    requesterName: 'Test Requester',
    requestContext,
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

test('public showcase wording uses gig-board framing', () => {
  const publicSources = [
    'src/i18n/locales/en.ts',
    'src/i18n/locales/es-mx.ts',
    'src/i18n/locales/zh-tw.ts',
    'public/llms.txt',
  ].map(read).join('\n');

  assert.match(publicSources, /Live Gig Board|Active Gig Board/);
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

test('brief showcase renders budget from request context without duplicating title', () => {
  const html = renderBriefShowcaseTitle(
    'Need High-Converting Sales Email Sequence',
    'I am behind schedule and need this sent before tomorrow morning. Budget is $95. Deliver the final email sequence ready to paste.',
  );

  assert.ok(html.includes('Need High-Converting Sales Email Sequence'));
  assert.ok(html.includes('sr-only">Budget </span>$95'), 'context budget should render in the budget pill');
  assert.equal(html.includes('Need High-Converting Sales Email Sequence $95'), false);
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
      budget: 'USD $700',
    },
    {
      scenarioTitle: 'Fix reporting workflow USD 300',
      cleanedTitle: 'Fix reporting workflow',
      budget: 'USD 300',
    },
    {
      scenarioTitle: '急件：整理客服資料 預算是 300 美元',
      cleanedTitle: '急件：整理客服資料',
      budget: '300 美元',
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

test('brief showcase prefers the actual pay amount when context has multiple money values', () => {
  const html = renderBriefShowcaseTitle(
    'Fix my checkout follow-up',
    "This is worth $80 internally, but I'll pay $300 if the final copy is ready before noon.",
  );

  assert.ok(html.includes('Fix my checkout follow-up'));
  assert.ok(html.includes('sr-only">Budget </span>$300'), 'pay amount should win over unrelated first amount');
  assert.equal(html.includes('sr-only">Budget </span>$80'), false);
});

test('brief showcase extracts localized USD budget formats from request context', () => {
  const cases = [
    ['Need API cleanup', 'I need this done today. USD 300 is approved if the endpoint list is clean.', 'USD 300'],
    ['Need report formatting', 'Please turn the notes into a client report. Budget is 300 USD.', '300 USD'],
    ['整理客服訊息', '今天要交付，預算是 300 美元，請直接給可貼上的版本。', '300 美元'],
  ];

  for (const [scenarioTitle, requestContext, budget] of cases) {
    const html = renderBriefShowcaseTitle(scenarioTitle, requestContext);
    assert.ok(html.includes(`sr-only">Budget </span>${budget}`), `expected budget ${budget}`);
  }
});

test('fallback gig titles keep budget out of scenarioTitle', () => {
  const source = read('src/app/api/brief-showcase/route.ts');
  const titleLines = source
    .split('\n')
    .filter((line) => line.includes('scenarioTitle:'));

  assert.ok(titleLines.length > 0);
  assert.equal(titleLines.some((line) => /\$\d/.test(line)), false);
});

test('gig generator prompts keep budget in requestContext only', () => {
  const source = read('src/lib/kolk/brief-showcase/generator.ts');

  assert.match(source, /synthetic Gig postings/);
  assert.match(source, /Do NOT include the budget in the title/);
  assert.match(source, /Put the budget exactly once in requestContext only/);
});

test('brief showcase budget pill has accessible context', () => {
  const html = renderBriefShowcaseTitle('Fix my email flow! Paying $95');

  assert.ok(html.includes('sr-only">Budget </span>$95'), 'budget amount should have an accessible label');
});
