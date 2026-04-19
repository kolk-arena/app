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

// ---------------------------------------------------------------------------
// Same transparent .ts loader pattern used by the other unit tests in this
// folder (see dry-run-validation.test.mjs, i18n-contract.test.mjs).
// ---------------------------------------------------------------------------
function loadAgentHandoff() {
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

  const mod = require(path.join(srcRoot, 'lib/frontend/agent-handoff.ts'));

  const restore = () => {
    if (previousTsLoader) {
      Module._extensions['.ts'] = previousTsLoader;
    } else {
      delete Module._extensions['.ts'];
    }
    Module._resolveFilename = previousResolve;
  };

  return {
    buildAiDeepLink: mod.buildAiDeepLink,
    AI_DEEPLINK_LIMITS: mod.AI_DEEPLINK_LIMITS,
    restore,
  };
}

const { buildAiDeepLink, AI_DEEPLINK_LIMITS, restore } = loadAgentHandoff();

test.after(() => restore());

// ---------------------------------------------------------------------------
// Bases (kept in sync with src/lib/frontend/agent-handoff.ts::buildAiDeepLink)
// ---------------------------------------------------------------------------
const BASES = {
  claude: 'https://claude.ai/new?q=',
  chatgpt: 'https://chatgpt.com/?q=',
  gemini: 'https://gemini.google.com/app?q=',
  perplexity: 'https://www.perplexity.ai/?q=',
};

// ---------------------------------------------------------------------------
// 1) Short prompt: returns non-null, truncated:false, correct base for each.
// ---------------------------------------------------------------------------
for (const service of ['claude', 'chatgpt', 'gemini', 'perplexity']) {
  test(`short prompt: ${service} returns non-null + truncated:false + correct base`, () => {
    const prompt = 'Hello, agent. Please solve this small challenge.';
    const result = buildAiDeepLink(service, prompt);
    assert.ok(result, 'expected non-null result for short prompt');
    assert.equal(result.truncated, false, 'short prompt should not be truncated');
    assert.ok(result.url.startsWith(BASES[service]), `URL should start with ${BASES[service]}`);
    // Round-trip — encoded q decodes to the original prompt.
    const q = result.url.slice(BASES[service].length);
    assert.equal(decodeURIComponent(q), prompt, 'round-trip decode should equal the original prompt');
  });
}

// ---------------------------------------------------------------------------
// 2) ChatGPT 3KB+ prompt: returns truncated:true with valid URL under 2KB.
// ---------------------------------------------------------------------------
test('chatgpt: 3KB+ prompt returns truncated:true with URL under 2KB', () => {
  const big = 'A'.repeat(3000) + 'TAILMARKER'; // > 2KB even before encoding
  const result = buildAiDeepLink('chatgpt', big);
  assert.ok(result, 'expected non-null result');
  assert.equal(result.truncated, true, 'expected truncated:true for 3KB chatgpt prompt');
  assert.ok(result.url.length <= AI_DEEPLINK_LIMITS.chatgpt, `URL length ${result.url.length} must be <= ${AI_DEEPLINK_LIMITS.chatgpt}`);
  assert.ok(result.url.startsWith(BASES.chatgpt));
  // The truncation marker should appear in the decoded q.
  const q = result.url.slice(BASES.chatgpt.length);
  const decoded = decodeURIComponent(q);
  assert.ok(decoded.includes('[Truncated'), 'decoded q should contain the [Truncated …] marker');
  // The TAIL marker should NOT survive (we trim from the tail).
  assert.ok(!decoded.includes('TAILMARKER'), 'tail marker should have been trimmed');
});

// ---------------------------------------------------------------------------
// 3) Claude 10KB prompt: returns truncated:true with valid URL under 8KB.
// ---------------------------------------------------------------------------
test('claude: 10KB prompt returns truncated:true with URL under 8KB', () => {
  const big = 'B'.repeat(10000) + 'TAILMARKER';
  const result = buildAiDeepLink('claude', big);
  assert.ok(result, 'expected non-null result');
  assert.equal(result.truncated, true, 'expected truncated:true for 10KB claude prompt');
  assert.ok(result.url.length <= AI_DEEPLINK_LIMITS.claude, `URL length ${result.url.length} must be <= ${AI_DEEPLINK_LIMITS.claude}`);
  assert.ok(result.url.startsWith(BASES.claude));
  const q = result.url.slice(BASES.claude.length);
  const decoded = decodeURIComponent(q);
  assert.ok(decoded.includes('[Truncated'), 'decoded q should contain the [Truncated …] marker');
  assert.ok(!decoded.includes('TAILMARKER'), 'tail marker should have been trimmed');
});

// ---------------------------------------------------------------------------
// 4) Empty prompt: returns a valid URL with empty q.
// ---------------------------------------------------------------------------
for (const service of ['claude', 'chatgpt', 'gemini', 'perplexity']) {
  test(`empty prompt: ${service} returns valid URL with empty q`, () => {
    const result = buildAiDeepLink(service, '');
    assert.ok(result, 'expected non-null result for empty prompt');
    assert.equal(result.truncated, false, 'empty prompt should not be truncated');
    assert.equal(result.url, BASES[service], 'URL should equal the base with empty q');
    const q = result.url.slice(BASES[service].length);
    assert.equal(decodeURIComponent(q), '', 'decoded q should be empty');
  });
}

// ---------------------------------------------------------------------------
// 5) Round-trip decode preserves the (possibly truncated) prompt.
// ---------------------------------------------------------------------------
test('round-trip decode of q yields the (possibly truncated) prompt', () => {
  const prompt = 'Solve this:\n\n## Step 1\nDo X.\n\n## Step 2\nDo Y.\n\n📦 Some emoji & special chars: < > & " \' / ?';
  for (const service of ['claude', 'chatgpt', 'gemini', 'perplexity']) {
    const result = buildAiDeepLink(service, prompt);
    assert.ok(result, `expected non-null result for ${service}`);
    const q = result.url.slice(BASES[service].length);
    const decoded = decodeURIComponent(q);
    if (result.truncated) {
      // Truncated path: decoded should be a prefix of the original prompt
      // followed by the tail marker.
      assert.ok(decoded.endsWith('[Truncated — open the full brief on kolkarena.com]'));
      const head = decoded.replace('\n\n[Truncated — open the full brief on kolkarena.com]', '');
      assert.ok(prompt.startsWith(head), 'truncated head should be a prefix of the original');
    } else {
      assert.equal(decoded, prompt, 'non-truncated decode should equal the original');
    }
  }
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

// 20KB is comfortably handled by all four services (claude/gemini/perplexity
// truncate; chatgpt truncates harder). The function should never return null
// for normal-shaped briefs in the tens-of-KB range.
test('20KB prompt: all four services return non-null and respect their limit', () => {
  const big = 'X'.repeat(20000);
  for (const service of ['claude', 'chatgpt', 'gemini', 'perplexity']) {
    const result = buildAiDeepLink(service, big);
    assert.ok(result, `expected non-null result for ${service} on 20KB prompt`);
    assert.equal(result.truncated, true, `expected truncation for ${service} on 20KB prompt`);
    assert.ok(
      result.url.length <= AI_DEEPLINK_LIMITS[service],
      `URL length ${result.url.length} must be <= ${AI_DEEPLINK_LIMITS[service]} for ${service}`,
    );
  }
});
