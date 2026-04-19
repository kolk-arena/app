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

function loadDryRunValidation() {
  const previousTsLoader = Module._extensions['.ts'];
  const previousResolve = Module._resolveFilename;

  // Transparently transpile .ts files with tsc, same pattern as the contract
  // tests use.
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

  // Resolve `@/*` alias to src/* the way tsconfig does.
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

  // Clear any stale cache entries under src/ so repeat test runs re-transpile.
  for (const cached of Object.keys(require.cache)) {
    if (cached.startsWith(srcRoot)) {
      delete require.cache[cached];
    }
  }

  const mod = require(path.join(srcRoot, 'lib/frontend/agent-handoff.ts'));

  const restore = () => {
    if (previousTsLoader) {
      Module._extensions['.ts'] = previousTsLoader;
    } else {
      delete Module._extensions['.ts'];
    }
    Module._resolveFilename = previousResolve;
  };

  return { dryRunValidation: mod.dryRunValidation, restore };
}

const { dryRunValidation, restore } = loadDryRunValidation();

test.after(() => restore());

// ---------------------------------------------------------------------------
// L2 — server does NOT require "## Google Maps Description" / "## Instagram
// Bio" literal headers, so the dry-run must NOT fail on their absence.
// ---------------------------------------------------------------------------

test('L2 passes for non-empty primaryText without exact literal headers', () => {
  // Includes a fenced JSON block (which the brief mentions) but no literal
  // "## Google Maps Description" or "## Instagram Bio" section titles.
  const input = [
    'Some description text here.',
    '',
    '```json',
    '{"display_name":"Biz","bio_text":"About","category_label":"Cat","cta_button_text":"Visit","link_in_bio_url":"https://example.com"}',
    '```',
  ].join('\n');
  const result = dryRunValidation(2, input);
  assert.equal(result.valid, true, `Expected valid=true, got errors: ${result.errors.join('; ')}`);
});

test('L2 fails on completely empty text', () => {
  const result = dryRunValidation(2, '   ');
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.toLowerCase().includes('empty')));
});

// ---------------------------------------------------------------------------
// L3 — server is deterministic-only; any non-empty markdown should pass.
// ---------------------------------------------------------------------------

test('L3 passes for any non-empty markdown without literal Intro/Services/CTA headers', () => {
  const input = 'Free-form markdown description of the business.\n\nNo section titles required.';
  const result = dryRunValidation(3, input);
  assert.equal(result.valid, true, `Expected valid=true, got errors: ${result.errors.join('; ')}`);
  assert.ok(result.warnings.some((e) => e.includes('## Intro')));
});

// ---------------------------------------------------------------------------
// L5 — JSON with code-point-correct min lengths mirroring server
// submit/route.ts L674-L681.
// ---------------------------------------------------------------------------

test('L5 passes when JSON keys meet server minLengths', () => {
  const payload = {
    whatsapp_message: 'x'.repeat(60),          // > 50
    quick_facts: 'y'.repeat(120),              // > 100
    first_step_checklist: 'z'.repeat(60),      // > 50
  };
  const result = dryRunValidation(5, JSON.stringify(payload));
  assert.equal(result.valid, true, `Expected valid=true, got errors: ${result.errors.join('; ')}`);
});

test('L5 fails when whatsapp_message is shorter than 51 code-points', () => {
  const payload = {
    whatsapp_message: 'short',
    quick_facts: 'y'.repeat(120),
    first_step_checklist: 'z'.repeat(60),
  };
  const result = dryRunValidation(5, JSON.stringify(payload));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('whatsapp_message')));
});

test('L5 fails when quick_facts is shorter than 101 code-points', () => {
  const payload = {
    whatsapp_message: 'x'.repeat(60),
    quick_facts: 'tooShort',
    first_step_checklist: 'z'.repeat(60),
  };
  const result = dryRunValidation(5, JSON.stringify(payload));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('quick_facts')));
});

test('L5 fails when wrapped in Markdown fences', () => {
  const payload = {
    whatsapp_message: 'x'.repeat(60),
    quick_facts: 'y'.repeat(120),
    first_step_checklist: 'z'.repeat(60),
  };
  const fenced = '```json\n' + JSON.stringify(payload) + '\n```';
  const result = dryRunValidation(5, fenced);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.toLowerCase().includes('fence')));
});

test('L5 fails when not an object (array)', () => {
  const result = dryRunValidation(5, JSON.stringify(['not', 'an', 'object']));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.toLowerCase().includes('object')));
});

test('L5 fails when not an object (primitive)', () => {
  const result = dryRunValidation(5, JSON.stringify(42));
  assert.equal(result.valid, false);
});

// ---------------------------------------------------------------------------
// L6 — server is baseline-only; any non-empty text should pass.
// ---------------------------------------------------------------------------

test('L6 passes for any non-empty text without literal Hero/About/Services/CTA headers', () => {
  const input = 'A one-page copy deliverable without explicit section titles.';
  const result = dryRunValidation(6, input);
  assert.equal(result.valid, true, `Expected valid=true, got errors: ${result.errors.join('; ')}`);
  assert.ok(result.warnings.some((e) => e.includes('## Hero')));
});

// ---------------------------------------------------------------------------
// L8 — server's headerKeywordCheck scans ## headers for case-insensitive
// substrings `copy`, `prompt`, `whatsapp`.
// ---------------------------------------------------------------------------

test('L8 passes when ## headers contain copy, prompt, whatsapp substrings', () => {
  const input = [
    '## Copy Brief',
    'Main landing copy here.',
    '',
    '## Prompt Pack',
    '...',
    '',
    '## WhatsApp Onboarding',
    'Welcome message...',
  ].join('\n');
  const result = dryRunValidation(8, input);
  assert.equal(result.valid, true, `Expected valid=true, got errors: ${result.errors.join('; ')}`);
  assert.ok(result.warnings.some((e) => e.includes('### Hero')));
});

test('L8 passes with case-insensitive keyword matches', () => {
  const input = [
    '## my COPY section',
    '...',
    '## PROMPT scaffolding',
    '...',
    '## whatsapp intro',
    '...',
  ].join('\n');
  const result = dryRunValidation(8, input);
  assert.equal(result.valid, true, `Expected valid=true, got errors: ${result.errors.join('; ')}`);
});

test('L8 fails when missing the whatsapp keyword substring', () => {
  const input = [
    '## One-Page Copy',
    '...',
    '## Prompt Pack',
    '...',
  ].join('\n');
  const result = dryRunValidation(8, input);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.toLowerCase().includes('whatsapp')));
});

test('L8 fails when missing the prompt keyword substring', () => {
  const input = [
    '## One-Page Copy',
    '...',
    '## WhatsApp Welcome',
    '...',
  ].join('\n');
  const result = dryRunValidation(8, input);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.toLowerCase().includes('prompt')));
});
