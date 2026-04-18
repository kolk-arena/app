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

const MANAGED_ENV_KEYS = [
  'XAI_API_KEY',
  'XAI_BASE_URL',
  'XAI_MODEL',
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
];

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

function loadJudgeModule({ openaiResponses, geminiResponses }) {
  const previousTsLoader = Module._extensions['.ts'];
  const previousLoad = Module._load;
  const previousFetch = global.fetch;

  class MockOpenAI {
    constructor() {
      this.chat = {
        completions: {
          create: async ({ model }) => {
            const queue = openaiResponses[model];
            if (!queue || queue.length === 0) {
              throw new Error(`No mock OpenAI response queued for ${model}`);
            }

            const payload = queue.shift();
            if (payload instanceof Error) {
              throw payload;
            }

            return {
              choices: [
                {
                  message: {
                    content: JSON.stringify(payload),
                  },
                },
              ],
            };
          },
        },
      };
    }
  }

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

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'openai') {
      return {
        __esModule: true,
        default: MockOpenAI,
      };
    }
    return previousLoad.call(this, request, parent, isMain);
  };

  global.fetch = async (url) => {
    const urlString = String(url);
    const modelMatch = /\/models\/([^:]+):generateContent/.exec(urlString);
    const model = modelMatch ? decodeURIComponent(modelMatch[1]) : null;
    const queue = model ? geminiResponses[model] : null;

    if (!model || !queue || queue.length === 0) {
      throw new Error(`No mock Gemini response queued for ${model ?? 'unknown model'}`);
    }

    const payload = queue.shift();
    if (payload instanceof Error) {
      throw payload;
    }

    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify(payload) }],
            },
          },
        ],
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  };

  clearRepoModuleCache();

  return {
    judge: require(path.join(repoRoot, 'src/lib/kolk/evaluator/judge.ts')),
    restore: () => {
      if (previousTsLoader) {
        Module._extensions['.ts'] = previousTsLoader;
      } else {
        delete Module._extensions['.ts'];
      }

      Module._load = previousLoad;
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

test('runJudge executes combo B with G2 averaging when OpenAI + Gemini are available', async () => {
  await withEnv(
    {
      OPENAI_API_KEY: 'openai-key',
      GEMINI_API_KEY: 'gemini-key',
    },
    async () => {
      const loaded = loadJudgeModule({
        openaiResponses: {
          'gpt-5-nano': [makeScores({ coverage: 20, quality: 18 })],
          'gpt-5-mini': [],
        },
        geminiResponses: {
          'gemini-2.5-flash-lite': [makeScores({ coverage: 20, quality: 22 })],
          'gemini-2.5-flash': [makeScores({ coverage: 24, quality: 26 })],
        },
      });

      try {
        const result = await loaded.judge.runJudge('Submission text', RUBRIC, 'Brief summary', 'Pro One-Page', 6, 'attempt-openai-gemini');

        assert.equal(result.error, false);
        assert.equal(result.combo, 'B');
        assert.deepEqual(result.groups, ['G2', 'G3']);
        assert.equal(result.coverageScore, 22);
        assert.equal(result.qualityScore, 23);
        assert.match(result.model, /combo:B/);
        assert.match(result.model, /G2=openai:gpt-5-nano\+gemini:gemini-2\.5-flash-lite/);
        assert.match(result.model, /G3=gemini:gemini-2\.5-flash/);
      } finally {
        loaded.restore();
      }
    },
  );
});

test('runJudge executes G2 fallback to GPT-5 Mini when Nano and Flash-Lite diverge too much', async () => {
  await withEnv(
    {
      XAI_API_KEY: 'xai-key',
      OPENAI_API_KEY: 'openai-key',
      GEMINI_API_KEY: 'gemini-key',
    },
    async () => {
      const loaded = loadJudgeModule({
        openaiResponses: {
          'grok-4-1-fast-non-reasoning': [makeScores({ coverage: 18, quality: 18 })],
          'gpt-5-nano': [makeScores({ coverage: 30, quality: 25 })],
          'gpt-5-mini': [makeScores({ coverage: 12, quality: 14 })],
        },
        geminiResponses: {
          'gemini-2.5-flash-lite': [makeScores({ coverage: 5, quality: 8 })],
          'gemini-2.5-flash': [makeScores({ coverage: 24, quality: 26 })],
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
        assert.match(result.model, /G2=openai:gpt-5-mini/);
        assert.match(result.summary, /Combo A/);
      } finally {
        loaded.restore();
      }
    },
  );
});
