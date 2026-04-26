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

function makeSupabaseMock({ leaderboardRows, userRows, submissionRows = [] }) {
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

      if (table === 'ka_submissions') {
        const buildSubmissionQuery = (rows) => ({
          select() {
            return buildSubmissionQuery(rows);
          },
          eq(column, value) {
            return buildSubmissionQuery(rows.filter((row) => row[column] === value));
          },
          gte(column, value) {
            return buildSubmissionQuery(rows.filter((row) => Number(row[column] ?? Number.NEGATIVE_INFINITY) >= Number(value)));
          },
          not(column, operator, value) {
            if (operator === 'is' && value === null) {
              return buildSubmissionQuery(rows.filter((row) => row[column] !== null && row[column] !== undefined));
            }
            return buildSubmissionQuery(rows);
          },
          in(column, values) {
            return buildSubmissionQuery(rows.filter((row) => values.includes(row[column])));
          },
          range() {
            return {
              data: rows,
              error: null,
            };
          },
        });

        return buildSubmissionQuery(submissionRows);
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
    const parsed = LeaderboardQuerySchema.parse({
      agent_stack: ' stack-alpha ',
      affiliation: ' team-alpha ',
      identity_type: 'anonymous',
    });

    assert.equal(parsed.page, 1);
    assert.equal(parsed.limit, 50);
    assert.equal(parsed.agent_stack, 'stack-alpha');
    assert.equal(parsed.affiliation, 'team-alpha');
    assert.equal(parsed.identity_type, 'anonymous');
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

test('fetchRankedLeaderboardRows synthesizes missing anonymous leaderboard rows from eligible submissions', async () => {
  const anonymousParticipantId = '00000000-0000-4000-8000-000000000080';
  const restore = installTsLoader({
    dbMock: makeSupabaseMock({
      leaderboardRows: [],
      userRows: [
        {
          id: anonymousParticipantId,
          display_name: 'Anonymous 80a2',
          handle: null,
          agent_stack: null,
          affiliation: null,
          is_anon: true,
        },
      ],
      submissionRows: [
        {
          id: '10000000-0000-4000-8000-000000000004',
          participant_id: anonymousParticipantId,
          level: 4,
          total_score: 83,
          color_band: 'GREEN',
          quality_label: 'Strong',
          solve_time_seconds: 240,
          efficiency_badge: true,
          submitted_at: '2026-04-26T02:29:00.000Z',
          leaderboard_eligible: true,
          unlocked: true,
          country_code: 'FI',
        },
        {
          id: '10000000-0000-4000-8000-000000000005',
          participant_id: anonymousParticipantId,
          level: 5,
          total_score: 91,
          color_band: 'BLUE',
          quality_label: 'Exceptional',
          solve_time_seconds: 180,
          efficiency_badge: true,
          submitted_at: '2026-04-26T02:30:00.000Z',
          leaderboard_eligible: true,
          unlocked: true,
          country_code: 'FI',
        },
      ],
    }),
  });

  try {
    const { fetchRankedLeaderboardRows } = require(path.join(srcRoot, 'lib/kolk/leaderboard/ranking.ts'));

    const rows = await fetchRankedLeaderboardRows();

    assert.equal(rows.total, 1);
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0].player_id, null);
    assert.equal(rows.rows[0].display_name, 'Anonymous 80a2');
    assert.equal(rows.rows[0].is_anon, true);
    assert.equal(rows.rows[0].highest_level, 5);
    assert.equal(rows.rows[0].best_score_on_highest, 91);
    assert.equal(rows.rows[0].total_score, 174);
    assert.equal(rows.rows[0].levels_completed, 2);
    assert.equal(rows.rows[0].country_code, 'FI');
    assert.equal(rows.rows[0].activity_submission_id, '10000000-0000-4000-8000-000000000005');
    assert.match(rows.rows[0].row_key, /^anon_[a-f0-9]{16}$/);
  } finally {
    restore();
  }
});

test('fetchRankedLeaderboardRows replaces stale anonymous materialized rows with canonical submissions', async () => {
  const anonymousParticipantId = '00000000-0000-4000-8000-000000000090';
  const restore = installTsLoader({
    dbMock: makeSupabaseMock({
      leaderboardRows: [
        {
          participant_id: anonymousParticipantId,
          display_name: 'Anonymous 90ff',
          handle: null,
          agent_stack: null,
          affiliation: null,
          highest_level: 1,
          best_score_on_highest: 70,
          best_color_band: 'YELLOW',
          best_quality_label: 'Usable',
          solve_time_seconds: 300,
          efficiency_badge: false,
          total_score: 70,
          levels_completed: 1,
          tier: 'starter',
          pioneer: false,
          is_anon: true,
          last_submission_at: '2026-04-26T01:00:00.000Z',
          country_code: 'US',
        },
      ],
      userRows: [
        {
          id: anonymousParticipantId,
          display_name: 'Anonymous 90ff',
          handle: null,
          agent_stack: null,
          affiliation: null,
          is_anon: true,
        },
      ],
      submissionRows: [
        {
          id: '10000000-0000-4000-8000-000000000091',
          participant_id: anonymousParticipantId,
          level: 1,
          total_score: 70,
          color_band: 'YELLOW',
          quality_label: 'Usable',
          solve_time_seconds: 300,
          efficiency_badge: false,
          submitted_at: '2026-04-26T01:00:00.000Z',
          leaderboard_eligible: true,
          unlocked: true,
          country_code: 'US',
        },
        {
          id: '10000000-0000-4000-8000-000000000092',
          participant_id: anonymousParticipantId,
          level: 2,
          total_score: 92,
          color_band: 'BLUE',
          quality_label: 'Exceptional',
          solve_time_seconds: 120,
          efficiency_badge: true,
          submitted_at: '2026-04-26T01:05:00.000Z',
          leaderboard_eligible: true,
          unlocked: true,
          country_code: 'US',
        },
      ],
    }),
  });

  try {
    const { fetchRankedLeaderboardRows } = require(path.join(srcRoot, 'lib/kolk/leaderboard/ranking.ts'));

    const rows = await fetchRankedLeaderboardRows();

    assert.equal(rows.total, 1);
    assert.equal(rows.rows[0].is_anon, true);
    assert.equal(rows.rows[0].player_id, null);
    assert.equal(rows.rows[0].highest_level, 2);
    assert.equal(rows.rows[0].best_score_on_highest, 92);
    assert.equal(rows.rows[0].total_score, 162);
    assert.equal(rows.rows[0].levels_completed, 2);
    assert.equal(rows.rows[0].activity_submission_id, '10000000-0000-4000-8000-000000000092');

    const anonymousOnly = await fetchRankedLeaderboardRows({ identityType: 'anonymous' });
    assert.equal(anonymousOnly.total, 1);

    const registeredOnly = await fetchRankedLeaderboardRows({ identityType: 'registered' });
    assert.equal(registeredOnly.total, 0);
  } finally {
    restore();
  }
});

test('anonymous submit path materializes participant before public submission insert', () => {
  const source = readFileSync(path.join(srcRoot, 'app/api/challenge/submit/route.ts'), 'utf8');
  const materializeIndex = source.indexOf('let effectiveParticipantId = participantId;');
  const insertIndex = source.indexOf(".from('ka_submissions')", materializeIndex);

  assert.ok(materializeIndex > 0, 'submit route should define effective participant before insert');
  assert.ok(insertIndex > materializeIndex, 'ka_submissions insert should happen after anonymous participant materialization');
  assert.ok(
    source.includes('participant_id: effectiveParticipantId'),
    'anonymous eligible submissions must be inserted with the materialized participant id',
  );
  assert.equal(
    source.includes('.update({ participant_id: effectiveParticipantId })'),
    false,
    'anonymous leaderboard runs should not rely on post-insert participant_id backfill',
  );
});

test('submit route refreshes leaderboard from canonical SQL rollup with app fallback', () => {
  const routeSource = readFileSync(path.join(srcRoot, 'app/api/challenge/submit/route.ts'), 'utf8');
  const migrationSource = readFileSync(
    path.join(repoRoot, 'supabase/migrations/00023_refresh_leaderboard_rollup.sql'),
    'utf8',
  );

  assert.ok(routeSource.includes("rpc('refresh_ka_leaderboard_participant'"));
  assert.ok(routeSource.includes('updateLeaderboardFallback'));
  assert.ok(migrationSource.includes('CREATE OR REPLACE FUNCTION public.refresh_ka_leaderboard_participant'));
  assert.ok(migrationSource.includes('pg_advisory_xact_lock'));
  assert.ok(migrationSource.includes('activity_submission_id'));
});

test('anonymous leaderboard backfill migration creates leaderboard pioneer column before writing it', () => {
  const source = readFileSync(
    path.join(repoRoot, 'supabase/migrations/00022_backfill_anonymous_leaderboard.sql'),
    'utf8',
  );
  const addColumnIndex = source.indexOf('ADD COLUMN IF NOT EXISTS pioneer');
  const insertColumnIndex = source.indexOf('  pioneer,');

  assert.ok(addColumnIndex > 0, '00022 must add ka_leaderboard.pioneer for older databases');
  assert.ok(insertColumnIndex > addColumnIndex, '00022 must add pioneer before INSERT references it');
});
