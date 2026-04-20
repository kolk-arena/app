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

function installTsLoader({ dbMock } = {}) {
  const previousTsLoader = Module._extensions['.ts'];
  const previousResolve = Module._resolveFilename;
  const previousLoad = Module._load;

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

  Module._load = function patchedLoad(request, parent, isMain) {
    if (dbMock && request === '@/lib/kolk/db') {
      return { supabaseAdmin: dbMock };
    }
    return previousLoad.call(this, request, parent, isMain);
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
    Module._load = previousLoad;
  };
}

function makeSupabaseMock({ leaderboardRows, userRows }) {
  return {
    from(table) {
      if (table === 'ka_leaderboard') {
        const buildLeaderboardQuery = (rows) => ({
          select() {
            return buildLeaderboardQuery(rows);
          },
          ilike(_column, pattern) {
            const needle = String(pattern).replace(/^%|%$/g, '').toLowerCase();
            return buildLeaderboardQuery(
              rows.filter((row) => String(row.school ?? '').toLowerCase().includes(needle)),
            );
          },
          in(_column, values) {
            return buildLeaderboardQuery(rows.filter((row) => values.includes(row.participant_id)));
          },
          range() {
            return {
              data: rows,
              count: rows.length,
              error: null,
            };
          },
        });

        return buildLeaderboardQuery(leaderboardRows);
      }

      if (table === 'ka_users') {
        const filterByFramework = (pattern) => {
          const needle = String(pattern).replace(/^%|%$/g, '').toLowerCase();
          return userRows.filter((row) => String(row.framework ?? '').toLowerCase().includes(needle));
        };

        const query = {
          select() {
            return query;
          },
          ilike(_column, pattern) {
            return {
              range() {
                return {
                  data: filterByFramework(pattern),
                  error: null,
                };
              },
            };
          },
          in(_column, values) {
            return {
              data: userRows.filter((row) => values.includes(row.id)),
              error: null,
            };
          },
        };
        return query;
      }

      throw new Error(`Unexpected table in test mock: ${table}`);
    },
  };
}

test('SubmissionInputSchema accepts legacy fetchToken but normalizes to attemptToken', () => {
  const restore = installTsLoader();
  try {
    const { SubmissionInputSchema } = require(path.join(srcRoot, 'lib/kolk/types/index.ts'));

    const legacy = SubmissionInputSchema.parse({
      fetchToken: 'legacy-token',
      primaryText: 'Hello Kolk',
    });
    assert.equal(legacy.attemptToken, 'legacy-token');

    const preferred = SubmissionInputSchema.parse({
      attemptToken: 'primary-token',
      fetchToken: 'legacy-token',
      primaryText: 'Hello Kolk',
    });
    assert.equal(preferred.attemptToken, 'primary-token');
  } finally {
    restore();
  }
});

test('LeaderboardQuerySchema normalizes public framework and school filter fields', () => {
  const restore = installTsLoader();
  try {
    const { LeaderboardQuerySchema } = require(path.join(srcRoot, 'lib/kolk/types/index.ts'));
    const parsed = LeaderboardQuerySchema.parse({ framework: ' Cursor ', school: ' Stanford ' });

    assert.equal(parsed.page, 1);
    assert.equal(parsed.limit, 50);
    assert.equal(parsed.framework, 'Cursor');
    assert.equal(parsed.school, 'Stanford');
  } finally {
    restore();
  }
});

test('fetchRankedLeaderboardRows filters against canonical user frameworks and keeps tie order deterministic', async () => {
  const restore = installTsLoader({
    dbMock: makeSupabaseMock({
      leaderboardRows: [
        {
          participant_id: '00000000-0000-4000-8000-000000000001',
          display_name: 'Ada Lovelace',
          framework: 'Cursor',
          school: 'Independent',
          highest_level: 7,
          best_score_on_highest: 96.5,
          best_color_band: 'BLUE',
          best_quality_label: 'Exceptional',
          solve_time_seconds: 214,
          efficiency_badge: true,
          total_score: 320.5,
          levels_completed: 7,
          tier: 'champion',
          pioneer: false,
          last_submission_at: '2026-04-16T00:00:00.000Z',
          country_code: 'GB',
        },
        {
          participant_id: '00000000-0000-4000-8000-000000000002',
          display_name: 'Grace Hopper',
          framework: 'OpenAI Agents',
          school: 'Independent',
          highest_level: 7,
          best_score_on_highest: 96.5,
          best_color_band: 'BLUE',
          best_quality_label: 'Exceptional',
          solve_time_seconds: 214,
          efficiency_badge: true,
          total_score: 319.9,
          levels_completed: 7,
          tier: 'champion',
          pioneer: false,
          last_submission_at: '2026-04-15T00:00:00.000Z',
          country_code: 'US',
        },
      ],
      userRows: [
        { id: '00000000-0000-4000-8000-000000000001', framework: 'Claude Code' },
        { id: '00000000-0000-4000-8000-000000000002', framework: 'OpenAI Agents' },
      ],
    }),
  });

  try {
    const { fetchRankedLeaderboardRows } = require(path.join(srcRoot, 'lib/kolk/leaderboard/ranking.ts'));

    const allRows = await fetchRankedLeaderboardRows();
    assert.deepEqual(
      allRows.rows.map((row) => row.player_id),
      [
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002',
      ],
    );
    assert.equal(allRows.rows[0].framework, 'Claude Code');

    const canonicalFilter = await fetchRankedLeaderboardRows({ framework: 'Claude' });
    assert.deepEqual(canonicalFilter.rows.map((row) => row.player_id), [
      '00000000-0000-4000-8000-000000000001',
    ]);
    assert.equal(canonicalFilter.total, 1);

    const staleFilter = await fetchRankedLeaderboardRows({ framework: 'Cursor' });
    assert.equal(staleFilter.total, 0);
    assert.deepEqual(staleFilter.rows, []);

    const schoolFilter = await fetchRankedLeaderboardRows({ school: 'Inde' });
    assert.equal(schoolFilter.total, 2);
  } finally {
    restore();
  }
});
