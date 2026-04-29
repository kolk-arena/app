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

function byIsoDesc(column) {
  return (a, b) => new Date(b[column] ?? 0).getTime() - new Date(a[column] ?? 0).getTime();
}

function makeQuery(rows, { limitReturnsResult = false } = {}) {
  const query = {
    get data() {
      return rows;
    },
    get error() {
      return null;
    },
    select() {
      return query;
    },
    eq(column, value) {
      rows = rows.filter((row) => row[column] === value);
      return query;
    },
    in(column, values) {
      rows = rows.filter((row) => values.includes(row[column]));
      return query;
    },
    order(column, options = {}) {
      const ascending = options.ascending === true;
      rows = [...rows].sort((a, b) => {
        const delta = new Date(a[column] ?? 0).getTime() - new Date(b[column] ?? 0).getTime();
        return ascending ? delta : -delta;
      });
      return limitReturnsResult ? query : { data: rows, error: null };
    },
    limit(count) {
      rows = rows.slice(0, count);
      return { data: rows, error: null };
    },
  };
  return query;
}

function makeSupabaseMock({ sessions = [], challenges = [], submissions = [] }) {
  return {
    from(table) {
      if (table === 'ka_challenge_sessions') {
        return makeQuery([...sessions].sort(byIsoDesc('started_at')), { limitReturnsResult: true });
      }
      if (table === 'ka_challenges') {
        return makeQuery(challenges);
      }
      if (table === 'ka_submissions') {
        return makeQuery(submissions);
      }
      throw new Error(`Unexpected table in test mock: ${table}`);
    },
  };
}

test('fetchSessionAttemptsForIdentity returns signed-in attempts with compact latest submission', async () => {
  const restore = installTsLoader({
    dbMock: makeSupabaseMock({
      sessions: [
        {
          id: 'session-old',
          participant_id: 'user-1',
          anon_token: null,
          attempt_token: 'attempt-old',
          challenge_id: 'challenge-old',
          started_at: '2026-04-26T00:00:00.000Z',
          deadline_utc: '2026-04-27T00:00:00.000Z',
          consumed_at: null,
        },
        {
          id: 'session-new',
          participant_id: 'user-1',
          anon_token: null,
          attempt_token: 'attempt-new',
          challenge_id: 'challenge-new',
          started_at: '2026-04-28T01:00:00.000Z',
          deadline_utc: '2026-04-29T01:00:00.000Z',
          consumed_at: '2026-04-28T01:09:00.000Z',
        },
        {
          id: 'session-consumed-failed',
          participant_id: 'user-1',
          anon_token: null,
          attempt_token: 'attempt-consumed-failed',
          challenge_id: 'challenge-consumed-failed',
          started_at: '2026-04-27T01:00:00.000Z',
          deadline_utc: '2026-04-28T01:00:00.000Z',
          consumed_at: '2026-04-27T01:06:00.000Z',
        },
        {
          id: 'session-other',
          participant_id: 'user-2',
          anon_token: null,
          attempt_token: 'attempt-other',
          challenge_id: 'challenge-other',
          started_at: '2026-04-28T02:00:00.000Z',
          deadline_utc: '2026-04-29T02:00:00.000Z',
          consumed_at: null,
        },
      ],
      challenges: [
        { id: 'challenge-new', level: 3, seed: 7, variant: 'mx-v1' },
        { id: 'challenge-consumed-failed', level: 3, seed: 8, variant: 'mx-v2' },
        { id: 'challenge-old', level: 2, seed: 4, variant: 'mx-v0' },
      ],
      submissions: [
        {
          id: 'submission-older',
          challenge_session_id: 'session-new',
          level: 3,
          total_score: 72,
          unlocked: false,
          submitted_at: '2026-04-28T01:05:00.000Z',
          judge_summary: 'First try needed fixes.',
          quality_label: 'Usable',
          primary_text: 'must not leak',
        },
        {
          id: 'submission-consumed-failed',
          challenge_session_id: 'session-consumed-failed',
          level: 3,
          total_score: 64,
          unlocked: false,
          submitted_at: '2026-04-27T01:06:00.000Z',
          judge_summary: 'Budget math needs revision.',
          quality_label: 'Developing',
        },
        {
          id: 'submission-latest',
          challenge_session_id: 'session-new',
          level: 3,
          total_score: 91.5,
          unlocked: true,
          submitted_at: '2026-04-28T01:09:00.000Z',
          judge_summary: 'Clear, useful delivery.',
          quality_label: 'Exceptional',
          anon_token: 'must-not-leak',
        },
      ],
    }),
  });

  try {
    const { fetchSessionAttemptsForIdentity } = require(path.join(srcRoot, 'lib/kolk/session-attempts.ts'));
    const attempts = await fetchSessionAttemptsForIdentity(
      { participantId: 'user-1' },
      { now: new Date('2026-04-28T12:00:00.000Z') },
    );

    assert.equal(attempts.length, 3);
    assert.equal(attempts[0].attemptToken, 'attempt-new');
    assert.equal(attempts[0].level, 3);
    assert.equal(attempts[0].seed, 7);
    assert.equal(attempts[0].variant, 'mx-v1');
    assert.equal(attempts[0].expired, false);
    assert.equal(attempts[0].passed, true);
    assert.equal(attempts[0].submittedCount, 2);
    assert.deepEqual(attempts[0].latestSubmission, {
      submissionId: 'submission-latest',
      level: 3,
      totalScore: 91.5,
      unlocked: true,
      submittedAt: '2026-04-28T01:09:00.000Z',
      summary: 'Clear, useful delivery.',
      qualityLabel: 'Exceptional',
    });
    assert.equal(attempts[1].attemptToken, 'attempt-consumed-failed');
    assert.equal(attempts[1].consumedAt, '2026-04-27T01:06:00.000Z');
    assert.equal(attempts[1].passed, false);
    assert.equal(attempts[1].latestSubmission.unlocked, false);
    assert.equal(attempts[2].attemptToken, 'attempt-old');
    assert.equal(attempts[2].expired, true);
    assert.equal(JSON.stringify(attempts).includes('must-not-leak'), false);
    assert.equal(JSON.stringify(attempts).includes('primary_text'), false);
  } finally {
    restore();
  }
});

test('fetchSessionAttemptsForIdentity scopes anonymous attempts to the current cookie token', async () => {
  const restore = installTsLoader({
    dbMock: makeSupabaseMock({
      sessions: [
        {
          id: 'session-anon',
          participant_id: null,
          anon_token: 'anon-current',
          attempt_token: 'attempt-anon',
          challenge_id: 'challenge-anon',
          started_at: '2026-04-28T03:00:00.000Z',
          deadline_utc: '2026-04-29T03:00:00.000Z',
          consumed_at: null,
        },
        {
          id: 'session-other-anon',
          participant_id: null,
          anon_token: 'anon-other',
          attempt_token: 'attempt-other-anon',
          challenge_id: 'challenge-other-anon',
          started_at: '2026-04-28T04:00:00.000Z',
          deadline_utc: '2026-04-29T04:00:00.000Z',
          consumed_at: null,
        },
      ],
      challenges: [
        { id: 'challenge-anon', level: 1, seed: 2, variant: 'anon-v1' },
      ],
      submissions: [],
    }),
  });

  try {
    const { fetchSessionAttemptsForIdentity } = require(path.join(srcRoot, 'lib/kolk/session-attempts.ts'));
    const attempts = await fetchSessionAttemptsForIdentity(
      { anonToken: 'anon-current' },
      { now: new Date('2026-04-28T12:00:00.000Z') },
    );

    assert.equal(attempts.length, 1);
    assert.equal(attempts[0].attemptToken, 'attempt-anon');
    assert.equal(attempts[0].level, 1);
    assert.equal(attempts[0].submittedCount, 0);
    assert.equal(attempts[0].latestSubmission, null);
    assert.equal(JSON.stringify(attempts).includes('anon-current'), false);
    assert.equal(JSON.stringify(attempts).includes('anon-other'), false);
  } finally {
    restore();
  }
});

test('session attempts route exposes a simple recovery surface only', () => {
  const source = readFileSync(path.join(srcRoot, 'app/api/session/attempts/route.ts'), 'utf8');

  assert.ok(source.includes("from '@/lib/kolk/session-attempts'"));
  assert.ok(source.includes("status: 'signed_in'"));
  assert.ok(source.includes("status: 'anonymous'"));
  assert.equal(source.includes('docs/'), false);
  assert.equal(source.includes('manifest'), false);
});
