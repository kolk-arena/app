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
              rows.filter((row) => String(row.affiliation ?? '').toLowerCase().includes(needle)),
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
        const filterByAgentStack = (pattern) => {
          const needle = String(pattern).replace(/^%|%$/g, '').toLowerCase();
          return userRows.filter((row) => String(row.agent_stack ?? '').toLowerCase().includes(needle));
        };

        const query = {
          select() {
            return query;
          },
          ilike(_column, pattern) {
            return {
              range() {
                return {
                  data: filterByAgentStack(pattern),
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

test('LeaderboardQuerySchema normalizes public agent_stack and affiliation filter fields', () => {
  const restore = installTsLoader();
  try {
    const { LeaderboardQuerySchema } = require(path.join(srcRoot, 'lib/kolk/types/index.ts'));
    const parsed = LeaderboardQuerySchema.parse({ agent_stack: ' stack-alpha ', affiliation: ' team-alpha ' });

    assert.equal(parsed.page, 1);
    assert.equal(parsed.limit, 50);
    assert.equal(parsed.agent_stack, 'stack-alpha');
    assert.equal(parsed.affiliation, 'team-alpha');
  } finally {
    restore();
  }
});

test('fetchRankedLeaderboardRows filters against canonical user agent stacks and keeps tie order deterministic', async () => {
  const restore = installTsLoader({
    dbMock: makeSupabaseMock({
      leaderboardRows: [
        {
          participant_id: '00000000-0000-4000-8000-000000000001',
          display_name: 'Ada Lovelace',
          agent_stack: 'stack-alpha',
          affiliation: 'Independent',
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
          agent_stack: 'stack-beta',
          affiliation: 'Independent',
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
        {
          participant_id: '00000000-0000-4000-8000-000000000003',
          display_name: 'Anonymous abcd',
          agent_stack: null,
          affiliation: null,
          highest_level: 1,
          best_score_on_highest: 88,
          best_color_band: 'GREEN',
          best_quality_label: 'Strong',
          solve_time_seconds: 52,
          efficiency_badge: true,
          total_score: 88,
          levels_completed: 1,
          tier: 'starter',
          pioneer: false,
          is_anon: true,
          last_submission_at: '2026-04-17T00:00:00.000Z',
          country_code: 'MX',
        },
      ],
      userRows: [
        { id: '00000000-0000-4000-8000-000000000001', agent_stack: 'stack-canonical' },
        { id: '00000000-0000-4000-8000-000000000002', agent_stack: 'stack-beta' },
        { id: '00000000-0000-4000-8000-000000000003', agent_stack: null },
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
        null,
      ],
    );
    assert.equal(allRows.rows[0].agent_stack, 'stack-canonical');
    assert.equal(allRows.rows[0].affiliation, 'Independent');
    assert.equal(allRows.rows[2].display_name, 'Anonymous abcd');
    assert.equal(allRows.rows[2].is_anon, true);
    assert.equal(allRows.rows[2].country_code, 'MX');
    assert.equal(allRows.rows[2].player_id, null);
    assert.match(allRows.rows[2].row_key, /^anon_[a-f0-9]{16}$/);
    assert.doesNotMatch(allRows.rows[2].row_key, /00000000-0000-4000-8000-000000000003/);

    const canonicalFilter = await fetchRankedLeaderboardRows({ agentStack: 'canonical' });
    assert.deepEqual(canonicalFilter.rows.map((row) => row.player_id), [
      '00000000-0000-4000-8000-000000000001',
    ]);
    assert.equal(canonicalFilter.total, 1);

    const staleFilter = await fetchRankedLeaderboardRows({ agentStack: 'stack-alpha' });
    assert.equal(staleFilter.total, 0);
    assert.deepEqual(staleFilter.rows, []);

    const affiliationFilter = await fetchRankedLeaderboardRows({ affiliation: 'Inde' });
    assert.equal(affiliationFilter.total, 2);
  } finally {
    restore();
  }
});
