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

const MODEL_DEFAULTS = {
  G1_PRIMARY: 'p1-model',
  G2_PRIMARY: 'p2-primary',
  G2_FALLBACK: 'p2-fallback',
  G2_SECONDARY: 'p3-secondary',
  G3_PRIMARY: 'p3-primary',
};

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

const P1_ENV = {
  KOLK_SCORING_P1_API_KEY: 'p1-key',
  KOLK_SCORING_P1_BASE_URL: 'https://p1.example/v1',
  KOLK_SCORING_G1_MODEL: MODEL_DEFAULTS.G1_PRIMARY,
};

const P2_ENV = {
  KOLK_SCORING_P2_API_KEY: 'p2-key',
  KOLK_SCORING_P2_BASE_URL: 'https://p2.example/v1',
  KOLK_SCORING_G2_MODEL: MODEL_DEFAULTS.G2_PRIMARY,
  KOLK_SCORING_G2_FALLBACK_MODEL: MODEL_DEFAULTS.G2_FALLBACK,
};

const P3_ENV = {
  KOLK_SCORING_P3_API_KEY: 'p3-key',
  KOLK_SCORING_P3_BASE_URL: 'https://p3.example/v1',
  KOLK_SCORING_G2_SECONDARY_MODEL: MODEL_DEFAULTS.G2_SECONDARY,
  KOLK_SCORING_G3_MODEL: MODEL_DEFAULTS.G3_PRIMARY,
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

  const restore = () => {
    for (const key of MANAGED_ENV_KEYS) {
      const value = previous.get(key);
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };

  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.finally(restore);
    }
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

function clearRepoModuleCache() {
  for (const modulePath of Object.keys(require.cache)) {
    if (modulePath.startsWith(path.join(repoRoot, 'src'))) {
      delete require.cache[modulePath];
    }
  }
}

function loadJudgeModule({ chatResponses, contentResponses }) {
  const previousTsLoader = Module._extensions['.ts'];
  const previousFetch = global.fetch;

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

  global.fetch = async (url, init) => {
    const urlString = String(url);
    let model = null;
    let queue = null;

    if (urlString.endsWith('/chat/completions')) {
      const body = JSON.parse(String(init?.body ?? '{}'));
      model = body.model;
      queue = model ? chatResponses[model] : null;
    } else {
      const modelMatch = /\/models\/([^:]+):generateContent/.exec(urlString);
      model = modelMatch ? decodeURIComponent(modelMatch[1]) : null;
      queue = model ? contentResponses[model] : null;
    }

    if (!model || !queue || queue.length === 0) {
      throw new Error(`No mock scoring response queued for ${model ?? 'unknown model'}`);
    }

    const payload = queue.shift();
    if (payload instanceof Error) {
      throw payload;
    }

    if (urlString.endsWith('/chat/completions')) {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify(payload),
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  clearRepoModuleCache();

  return {
    judge: require(path.join(repoRoot, 'src/lib/kolk/evaluator/judge.ts')),
    runtime: require(path.join(repoRoot, 'src/lib/kolk/ai/runtime.ts')),
    restore: () => {
      if (previousTsLoader) {
        Module._extensions['.ts'] = previousTsLoader;
      } else {
        delete Module._extensions['.ts'];
      }

      global.fetch = previousFetch;
    },
  };
}

function makeScores({ coverage, quality, field = 'hero_section' }) {
  return {
    coverage_score: coverage,
    quality_score: quality,
    field_scores: [
      { field, score: coverage / 3, reason: `Coverage rationale for ${field}` },
    ],
    quality_subscores: {
      tone_fit: quality / 4,
      clarity: quality / 4,
      usefulness: quality / 4,
      business_fit: quality / 4,
    },
    flags: [],
    summary: `coverage=${coverage}, quality=${quality}`,
  };
}

const RUBRIC = {
  level: 6,
  variant: 'default',
  rubricHash: 'hash',
  coverageFieldWeights: { hero_section: 10, services: 10, cta: 10 },
  qualityAnchors: {
    tone_fit: 'Fits the client tone',
    clarity: 'Clear and easy to follow',
    usefulness: 'Practical and actionable',
    business_fit: 'Aligned with the business need',
  },
  idealExcerpt: 'Ideal excerpt.',
  activePenalties: ['prompt_injection', 'hallucinated_facts'],
  penaltyConfig: {
    prompt_injection: { deduction: 10, appliedTo: 'coverage' },
    hallucinated_facts: { deduction: 5, appliedTo: 'quality' },
  },
};

test('runJudge executes combo B with G2 averaging when required providers are available', async () => {
  await withEnv(
    {
      ...P2_ENV,
      ...P3_ENV,
    },
    async () => {
      const loaded = loadJudgeModule({
        chatResponses: {
          [MODEL_DEFAULTS.G2_PRIMARY]: [makeScores({ coverage: 20, quality: 18 })],
          [MODEL_DEFAULTS.G2_FALLBACK]: [],
        },
        contentResponses: {
          [MODEL_DEFAULTS.G2_SECONDARY]: [makeScores({ coverage: 20, quality: 22 })],
          [MODEL_DEFAULTS.G3_PRIMARY]: [makeScores({ coverage: 24, quality: 26 })],
        },
      });

      try {
        const result = await loaded.judge.runJudge('Submission text', RUBRIC, 'Brief summary', 'Pro One-Page', 6, 'attempt-p2-p3');

        assert.equal(result.error, false);
        assert.equal(result.combo, 'B');
        assert.deepEqual(result.groups, ['G2', 'G3']);
        assert.equal(result.coverageScore, 22);
        assert.equal(result.qualityScore, 23);
        assert.match(result.model, /combo:B/);
        assert.match(result.model, /G2=/);
        assert.match(result.model, /G3=/);
      } finally {
        loaded.restore();
      }
    },
  );
});

test('runJudge executes G2 fallback when primary scorer pair diverges too much', async () => {
  await withEnv(
    {
      ...P1_ENV,
      ...P2_ENV,
      ...P3_ENV,
    },
    async () => {
      const loaded = loadJudgeModule({
        chatResponses: {
          [MODEL_DEFAULTS.G1_PRIMARY]: [makeScores({ coverage: 18, quality: 18 })],
          [MODEL_DEFAULTS.G2_PRIMARY]: [makeScores({ coverage: 30, quality: 25 })],
          [MODEL_DEFAULTS.G2_FALLBACK]: [makeScores({ coverage: 12, quality: 14 })],
        },
        contentResponses: {
          [MODEL_DEFAULTS.G2_SECONDARY]: [makeScores({ coverage: 5, quality: 8 })],
          [MODEL_DEFAULTS.G3_PRIMARY]: [makeScores({ coverage: 24, quality: 26 })],
        },
      });

      try {
        let routingKey = null;
        for (let index = 0; index < 200; index += 1) {
          const candidate = `attempt-all-${index}`;
          if (loaded.judge.selectScoringCombo(candidate, ['A', 'B', 'C']) === 'A') {
            routingKey = candidate;
            break;
          }
        }

        assert.ok(routingKey, 'Expected to find a routing key for combo A');

        const result = await loaded.judge.runJudge('Submission text', RUBRIC, 'Brief summary', 'Pro One-Page', 6, routingKey);

        assert.equal(result.error, false);
        assert.equal(result.combo, 'A');
        assert.deepEqual(result.groups, ['G1', 'G2']);
        assert.equal(result.coverageScore, 15);
        assert.equal(result.qualityScore, 16);
        assert.match(result.model, /combo:A/);
        assert.match(result.model, /G2=/);
        assert.match(result.summary, /Combo A/);
      } finally {
        loaded.restore();
      }
    },
  );
});
