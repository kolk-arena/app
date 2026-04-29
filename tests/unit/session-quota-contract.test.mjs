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
      return {
        supabaseAdmin: dbMock,
        assertRuntimeSchemaReady: async () => undefined,
      };
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

function makeIdentityGuardQuery(row) {
  const query = {
    select() { return query; },
    eq() { return query; },
    async maybeSingle() { return { data: row, error: null }; },
  };
  return query;
}

function makeSessionQuery(row) {
  const query = {
    select() { return query; },
    eq() { return query; },
    async maybeSingle() { return { data: row, error: null }; },
  };
  return query;
}

function makeMock({ identityGuardRow = null, sessionRow = null } = {}) {
  return {
    from(table) {
      if (table === 'ka_identity_submit_guard') return makeIdentityGuardQuery(identityGuardRow);
      if (table === 'ka_challenge_sessions') return makeSessionQuery(sessionRow);
      throw new Error(`Unexpected table in quota mock: ${table}`);
    },
  };
}

function getPacificDayBucket(now) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

test('readIdentitySubmitQuota counts today\'s bucket and exposes remaining + reset', async () => {
  const now = new Date('2026-04-29T12:00:00.000Z');
  const todayBucket = getPacificDayBucket(now);

  const restore = installTsLoader({
    dbMock: makeMock({
      identityGuardRow: {
        day_bucket_pt: todayBucket,
        day_count: 7,
        frozen_until: null,
        freeze_reason: null,
      },
    }),
  });
  try {
    const { readIdentitySubmitQuota, SUBMIT_RATE_LIMIT_PER_IDENTITY_PER_DAY } = require(
      path.join(srcRoot, 'lib/kolk/submission-guards.ts'),
    );

    const snapshot = await readIdentitySubmitQuota({ kind: 'anon', keyHash: 'k', anonSessionToken: 'tok' }, now);
    assert.equal(snapshot.dayBucketPt, todayBucket);
    assert.equal(snapshot.day.used, 7);
    assert.equal(snapshot.day.max, SUBMIT_RATE_LIMIT_PER_IDENTITY_PER_DAY);
    assert.equal(snapshot.day.remaining, SUBMIT_RATE_LIMIT_PER_IDENTITY_PER_DAY - 7);
    assert.equal(snapshot.frozen, false);
    assert.equal(snapshot.frozenUntil, null);
    assert.match(snapshot.resetsAtUtc, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    // Reset is the next Pacific midnight in UTC, must be strictly in the future.
    assert.ok(new Date(snapshot.resetsAtUtc).getTime() > now.getTime());
  } finally {
    restore();
  }
});

test('readIdentitySubmitQuota treats stale bucket row as zero used', async () => {
  const now = new Date('2026-04-29T12:00:00.000Z');
  const restore = installTsLoader({
    dbMock: makeMock({
      identityGuardRow: {
        day_bucket_pt: '2026-04-20', // yesterday-ish
        day_count: 99,
        frozen_until: null,
        freeze_reason: null,
      },
    }),
  });
  try {
    const { readIdentitySubmitQuota, SUBMIT_RATE_LIMIT_PER_IDENTITY_PER_DAY } = require(
      path.join(srcRoot, 'lib/kolk/submission-guards.ts'),
    );
    const snapshot = await readIdentitySubmitQuota({ kind: 'anon', keyHash: 'k', anonSessionToken: 'tok' }, now);
    assert.equal(snapshot.day.used, 0);
    assert.equal(snapshot.day.remaining, SUBMIT_RATE_LIMIT_PER_IDENTITY_PER_DAY);
    assert.equal(snapshot.frozen, false);
  } finally {
    restore();
  }
});

test('readIdentitySubmitQuota reports active freeze when frozen_until is in the future', async () => {
  const now = new Date('2026-04-29T12:00:00.000Z');
  const todayBucket = getPacificDayBucket(now);
  const restore = installTsLoader({
    dbMock: makeMock({
      identityGuardRow: {
        day_bucket_pt: todayBucket,
        day_count: 50,
        frozen_until: '2026-04-29T17:00:00.000Z',
        freeze_reason: 'submit_spike_5min',
      },
    }),
  });
  try {
    const { readIdentitySubmitQuota } = require(path.join(srcRoot, 'lib/kolk/submission-guards.ts'));
    const snapshot = await readIdentitySubmitQuota({ kind: 'anon', keyHash: 'k', anonSessionToken: 'tok' }, now);
    assert.equal(snapshot.frozen, true);
    assert.equal(snapshot.frozenUntil, '2026-04-29T17:00:00.000Z');
    assert.equal(snapshot.freezeReason, 'submit_spike_5min');
  } finally {
    restore();
  }
});

test('readAttemptSubmitQuota counts timestamps in minute and hour windows', async () => {
  const now = new Date('2026-04-29T12:00:00.000Z');
  const nowMs = now.getTime();
  const restore = installTsLoader({
    dbMock: makeMock({
      sessionRow: {
        attempt_token: 'tok-abc',
        retry_count: 3,
        // 3 in last minute, 5 in last hour total, 1 outside hour.
        submit_attempt_timestamps_ms: [
          nowMs - 30 * 1000,
          nowMs - 50 * 1000,
          nowMs - 59 * 1000,
          nowMs - 30 * 60 * 1000,
          nowMs - 55 * 60 * 1000,
          nowMs - 90 * 60 * 1000,
        ],
        started_at: '2026-04-29T11:00:00.000Z',
        deadline_utc: '2026-04-30T11:00:00.000Z',
        consumed_at: null,
        ka_challenges: { level: 4 },
      },
    }),
  });
  try {
    const {
      readAttemptSubmitQuota,
      SUBMIT_RATE_LIMIT_PER_ATTEMPT_TOKEN_PER_HOUR,
      SUBMIT_RATE_LIMIT_PER_ATTEMPT_TOKEN_PER_MINUTE,
      SUBMIT_RETRY_CAP_PER_ATTEMPT_TOKEN,
    } = require(path.join(srcRoot, 'lib/kolk/submission-guards.ts'));

    const snapshot = await readAttemptSubmitQuota('tok-abc', now);
    assert.ok(snapshot, 'snapshot must not be null when token exists');
    assert.equal(snapshot.attemptToken, 'tok-abc');
    assert.equal(snapshot.level, 4);
    assert.equal(snapshot.minute.used, 3);
    assert.equal(snapshot.minute.max, SUBMIT_RATE_LIMIT_PER_ATTEMPT_TOKEN_PER_MINUTE);
    assert.equal(snapshot.minute.remaining, SUBMIT_RATE_LIMIT_PER_ATTEMPT_TOKEN_PER_MINUTE - 3);
    assert.equal(snapshot.hour.used, 5);
    assert.equal(snapshot.hour.max, SUBMIT_RATE_LIMIT_PER_ATTEMPT_TOKEN_PER_HOUR);
    assert.equal(snapshot.hour.remaining, SUBMIT_RATE_LIMIT_PER_ATTEMPT_TOKEN_PER_HOUR - 5);
    assert.equal(snapshot.retry.used, 3);
    assert.equal(snapshot.retry.max, SUBMIT_RETRY_CAP_PER_ATTEMPT_TOKEN);
    assert.equal(snapshot.expired, false);
  } finally {
    restore();
  }
});

test('readAttemptSubmitQuota marks expired when deadline is past', async () => {
  const now = new Date('2026-04-29T12:00:00.000Z');
  const restore = installTsLoader({
    dbMock: makeMock({
      sessionRow: {
        attempt_token: 'tok-stale',
        retry_count: 0,
        submit_attempt_timestamps_ms: [],
        started_at: '2026-04-28T11:00:00.000Z',
        deadline_utc: '2026-04-29T11:00:00.000Z', // 1h ago
        consumed_at: null,
        ka_challenges: { level: 1 },
      },
    }),
  });
  try {
    const { readAttemptSubmitQuota } = require(path.join(srcRoot, 'lib/kolk/submission-guards.ts'));
    const snapshot = await readAttemptSubmitQuota('tok-stale', now);
    assert.ok(snapshot);
    assert.equal(snapshot.expired, true);
  } finally {
    restore();
  }
});

test('readAttemptSubmitQuota returns null for unknown token', async () => {
  const restore = installTsLoader({
    dbMock: makeMock({ sessionRow: null }),
  });
  try {
    const { readAttemptSubmitQuota } = require(path.join(srcRoot, 'lib/kolk/submission-guards.ts'));
    const snapshot = await readAttemptSubmitQuota('does-not-exist');
    assert.equal(snapshot, null);
  } finally {
    restore();
  }
});
