#!/usr/bin/env node

import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_API_BASE = 'https://kolkarena.com';
const DEFAULT_SCOPES = ['submit:onboarding', 'submit:ranked', 'fetch:challenge', 'read:profile'];
const PUBLIC_BETA_MAX_LEVEL = 8;

type CredentialFile = {
  access_token: string;
  token_id: string;
  scopes: string[];
  expires_at: string | null;
  base_url: string;
  signed_in_at: string;
};

class CliApiError extends Error {
  status: number;
  code?: string;
  payload: Record<string, unknown>;

  constructor(status: number, payload: Record<string, unknown>) {
    super(typeof payload.error === 'string' ? payload.error : `API ${status} failed`);
    this.name = 'CliApiError';
    this.status = status;
    this.code = typeof payload.code === 'string' ? payload.code : undefined;
    this.payload = payload;
  }
}

function bold(s: string) { return `\x1b[1m${s}\x1b[0m`; }
function green(s: string) { return `\x1b[32m${s}\x1b[0m`; }
function red(s: string) { return `\x1b[31m${s}\x1b[0m`; }
function yellow(s: string) { return `\x1b[33m${s}\x1b[0m`; }
function cyan(s: string) { return `\x1b[36m${s}\x1b[0m`; }
function dim(s: string) { return `\x1b[2m${s}\x1b[0m`; }

function bar(score: number, max: number, width = 20): string {
  const safeScore = Number.isFinite(score) ? score : 0;
  const filled = Math.max(0, Math.min(width, Math.round((safeScore / max) * width)));
  return green('█'.repeat(filled)) + dim('░'.repeat(width - filled));
}

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function configDir(): string {
  const override = process.env.KOLK_ARENA_CONFIG_DIR?.trim();
  if (override) return override;

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'kolk-arena');
  }

  return path.join(os.homedir(), '.config', 'kolk-arena');
}

function credentialsPath(): string {
  return path.join(configDir(), 'credentials.json');
}

async function ensureConfigDir(): Promise<void> {
  await fsp.mkdir(configDir(), { recursive: true });
}

async function writeCredentialsFile(data: CredentialFile): Promise<void> {
  await ensureConfigDir();
  const file = credentialsPath();
  await fsp.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  if (process.platform !== 'win32') {
    await fsp.chmod(file, 0o600);
  }
}

async function readCredentialsFile(): Promise<CredentialFile | null> {
  const file = credentialsPath();
  try {
    const stat = await fsp.stat(file);
    if (process.platform !== 'win32') {
      const mode = stat.mode & 0o777;
      if ((mode & 0o077) !== 0) {
        throw new Error(`Credential file permissions are too open (${mode.toString(8)}). Fix to 600.`);
      }
    }
    const content = await fsp.readFile(file, 'utf8');
    return JSON.parse(content) as CredentialFile;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function deleteCredentialsFile(): Promise<void> {
  try {
    await fsp.unlink(credentialsPath());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

async function resolveStoredToken(): Promise<string | undefined> {
  if (process.env.KOLK_TOKEN?.trim()) {
    return process.env.KOLK_TOKEN.trim();
  }

  const creds = await readCredentialsFile();
  if (!creds) return undefined;
  return creds.access_token;
}

async function resolveApiBaseUrl(): Promise<string> {
  const override = process.env.KOLK_ARENA_URL?.trim();
  if (override) {
    return override;
  }

  const creds = await readCredentialsFile();
  return creds?.base_url ?? DEFAULT_API_BASE;
}

async function api(
  pathName: string,
  opts: { method?: string; body?: unknown; token?: string; headers?: Record<string, string>; baseUrl?: string } = {},
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers ?? {}),
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  const baseUrl = opts.baseUrl ?? await resolveApiBaseUrl();

  const res = await fetch(`${baseUrl}${pathName}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const json = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) {
    throw new CliApiError(res.status, json);
  }
  return json;
}

function isCliApiError(error: unknown): error is CliApiError {
  return error instanceof CliApiError;
}

function readStdin(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    stdin.setEncoding('utf-8');
    stdin.resume();

    const onData = (chunk: string) => {
      stdin.pause();
      stdin.removeListener('data', onData);
      resolve(chunk.trim());
    };

    stdin.on('data', onData);
  });
}

async function readMultiline(prompt: string): Promise<string> {
  console.log(prompt);
  console.log(dim('  (Enter your response. Type "---END---" on a new line to finish)'));
  console.log();

  return new Promise((resolve) => {
    const lines: string[] = [];
    const stdin = process.stdin;
    stdin.setEncoding('utf-8');
    stdin.resume();

    const onData = (chunk: string) => {
      const pieces = chunk.split('\n');
      for (const piece of pieces) {
        if (piece.trim() === '---END---') {
          stdin.removeListener('data', onData);
          stdin.pause();
          resolve(lines.join('\n').trimEnd());
          return;
        }
        lines.push(piece);
      }
    };

    stdin.on('data', onData);
  });
}

async function promptYesNo(prompt: string): Promise<boolean> {
  return (await readStdin(prompt)).trim().toLowerCase() === 'y';
}

async function cmdLogin(scopes: string[], baseUrl: string) {
  console.log(bold('\n  KOLK ARENA CLI LOGIN\n'));

  const start = await api('/api/auth/device/code', {
    method: 'POST',
    baseUrl,
    body: {
      client_id: 'kolk-arena-cli',
      scopes,
    },
  }) as {
    device_code: string;
    user_code: string;
    verification_uri: string;
    verification_uri_complete: string;
    expires_in: number;
    interval: number;
  };

  console.log(`  Open ${cyan(start.verification_uri)}`);
  console.log(`  Or visit ${cyan(start.verification_uri_complete)}`);
  console.log(`  Enter code: ${bold(start.user_code)}`);
  console.log(dim(`  Expires in ${start.expires_in}s. Poll interval: ${start.interval}s.`));
  console.log();

  let pollIntervalMs = start.interval * 1000;

  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

    const res = await fetch(`${baseUrl}/api/auth/device/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: start.device_code,
        client_id: 'kolk-arena-cli',
      }),
    });

    const body = await res.json().catch(() => ({})) as Record<string, unknown>;

    if (res.ok) {
      const credentials: CredentialFile = {
        access_token: String(body.access_token),
        token_id: String(body.token_id),
        scopes: typeof body.scope === 'string' ? String(body.scope).split(/\s+/).filter(Boolean) : scopes,
        expires_at: typeof body.expires_at === 'string' ? body.expires_at : null,
        base_url: baseUrl,
        signed_in_at: new Date().toISOString(),
      };

      await writeCredentialsFile(credentials);

      const me = await api('/api/tokens/me', { token: credentials.access_token, baseUrl }) as {
        kind: string;
        user: { display_name: string | null; handle: string | null; email: string | null };
        scopes?: string[];
      };

      console.log(green('  Login complete.'));
      console.log(`  User: ${bold(me.user.display_name ?? me.user.handle ?? me.user.email ?? 'unknown')}`);
      console.log(`  Scopes: ${(credentials.scopes ?? []).join(', ') || '(none)'}`);
      console.log(`  Credentials saved to ${dim(credentialsPath())}`);
      return;
    }

    const error = String(body.error ?? 'unknown_error');
    if (error === 'authorization_pending') {
      process.stdout.write(dim('  Waiting for browser authorization...\r'));
      continue;
    }
    if (error === 'slow_down') {
      pollIntervalMs += 5000;
      continue;
    }
    if (error === 'access_denied') {
      throw new Error('The browser authorization request was cancelled.');
    }
    if (error === 'expired_token') {
      throw new Error('The device code expired. Run `kolk-arena login` again.');
    }
    if (error === 'invalid_grant') {
      throw new Error('The device code is no longer valid. Run `kolk-arena login` again.');
    }
    if (error === 'invalid_client') {
      throw new Error('The server did not recognize this CLI client.');
    }

    throw new Error(`Device login failed: ${error}`);
  }
}

async function cmdLogout(baseUrl: string) {
  const creds = await readCredentialsFile();
  if (!creds) {
    console.log(yellow('Not signed in. No stored CLI credentials found.'));
    return;
  }

  try {
    await api(`/api/tokens/${creds.token_id}`, {
      method: 'DELETE',
      token: creds.access_token,
      baseUrl,
    });
  } catch (error) {
    console.log(yellow(`  Remote revoke failed: ${(error as Error).message}`));
  }

  await deleteCredentialsFile();
  console.log(green('Signed out. Local credentials removed.'));
}

async function cmdWhoAmI(token: string | undefined, baseUrl: string) {
  if (!token) {
    console.log(yellow('Not signed in.'));
    process.exitCode = 1;
    return;
  }

  const me = await api('/api/tokens/me', { token, baseUrl }) as {
    kind: 'pat' | 'session';
    user: { display_name: string | null; handle: string | null; email: string | null };
    scopes?: string[];
    token?: { token_prefix: string; expires_at: string | null };
  };

  console.log(bold('\n  KOLK ARENA WHOAMI\n'));
  console.log(`  Identity: ${me.user.display_name ?? me.user.handle ?? me.user.email ?? 'unknown'}`);
  console.log(`  Auth kind: ${me.kind}`);
  if (me.scopes?.length) {
    console.log(`  Scopes: ${me.scopes.join(', ')}`);
  }
  if (me.token?.token_prefix) {
    console.log(`  Token: ${me.token.token_prefix}…`);
  }
  if (me.token?.expires_at) {
    console.log(`  Expires: ${me.token.expires_at}`);
  }
}

async function cmdStart(startLevel: number, token: string | undefined, baseUrl: string) {
  console.log();
  console.log(bold('╔══════════════════════════════════════╗'));
  console.log(bold('║             KOLK ARENA               ║'));
  console.log(bold('║    Interactive Delivery CLI (L0-L8)  ║'));
  console.log(bold('╚══════════════════════════════════════╝'));
  console.log();
  console.log(`  API: ${cyan(baseUrl)}`);
  console.log(`  Auth: ${token ? green('authenticated') : yellow('anonymous (L1-L5; L6-L8 need login or --token)')}`);
  console.log(`  Starting at: ${bold(`Level ${startLevel}`)}`);
  console.log();

  let level = startLevel;

  while (level <= PUBLIC_BETA_MAX_LEVEL) {
    console.log(bold(`\n${'='.repeat(50)}`));
    console.log(bold(`  LEVEL ${level}`));
    console.log(bold(`${'='.repeat(50)}\n`));

    let challenge: Record<string, unknown>;
    try {
      challenge = await api(`/api/challenge/${level}`, { token, baseUrl }) as Record<string, unknown>;
    } catch (error) {
      const message = (error as Error).message;
      console.log(red(`  Failed to fetch challenge: ${message}`));
      if (isCliApiError(error) && (error.status === 401 || error.code === 'AUTH_REQUIRED')) {
        console.log(yellow('\n  Sign-in required for L6-L8.'));
        console.log(dim('  Run `kolk-arena login`, or pass --token <kat_...>.'));
      } else if (isCliApiError(error) && error.code === 'LEVEL_LOCKED') {
        console.log(yellow('\n  Progression gate not cleared — finish the previous level first.'));
      }
      break;
    }

    const chal = challenge.challenge as Record<string, unknown> | undefined;
    if (!chal) {
      console.log(red('  No challenge data returned'));
      break;
    }

    console.log(`  ${bold(`Level ${String(chal.level ?? level)}`)}  ${dim(`(${String(chal.variant ?? 'default')})`)}`);
    console.log(`  Time limit: ${yellow(String(chal.timeLimitMinutes ?? 0) + ' min')}`);
    console.log(`  Deadline: ${dim(String(chal.deadlineUtc ?? 'n/a'))}`);

    if (challenge.boss_hint) {
      console.log(`  ${red('BOSS')} ${String(challenge.boss_hint)}`);
    }

    if (challenge.replay_warning) {
      console.log(`  ${yellow('REPLAY')} ${String(challenge.replay_warning)}`);
    }

    console.log();
    console.log(bold('  BRIEF:'));
    console.log('  ' + '─'.repeat(46));

    const promptMd = String(chal.promptMd ?? '(no prompt)');
    for (const line of promptMd.split('\n')) {
      console.log(`  ${line}`);
    }

    console.log('  ' + '─'.repeat(46));
    console.log();

    let fetchFreshBrief = false;
    while (!fetchFreshBrief) {
      const response = await readMultiline(bold('  YOUR RESPONSE:'));

      if (!response.trim()) {
        console.log(yellow('  Empty response — nothing submitted.'));
        if (await promptYesNo('  Retry this level with the same attemptToken? (y/n) ')) {
          continue;
        }
        if (await promptYesNo('  Fetch a fresh brief for this level? (y/n) ')) {
          fetchFreshBrief = true;
          break;
        }
        return;
      }

      console.log(dim('\n  Submitting...'));
      try {
        const result = await api('/api/challenge/submit', {
          method: 'POST',
          token,
          baseUrl,
          headers: { 'Idempotency-Key': uuid() },
          body: {
            attemptToken: chal.attemptToken,
            primaryText: response,
          },
        }) as Record<string, unknown>;

        console.log();
        console.log(bold('  SCORE BREAKDOWN:'));

        const isOnboarding = Number(result.level) === 0;
        if (!isOnboarding) {
          console.log(`  Structure (0-40):  ${bar(Number(result.structureScore), 40)} ${bold(String(result.structureScore))}/40`);
          console.log(`  Coverage  (0-30):  ${bar(Number(result.coverageScore), 30)} ${bold(String(result.coverageScore))}/30`);
          console.log(`  Quality   (0-30):  ${bar(Number(result.qualityScore), 30)} ${bold(String(result.qualityScore))}/30`);
          console.log(`  ${'─'.repeat(46)}`);
        }
        console.log(`  TOTAL:             ${bar(Number(result.totalScore), 100)} ${bold(String(result.totalScore))}/100`);
        if (result.colorBand) {
          console.log(`  Band / Label:      ${bold(String(result.colorBand))}${result.qualityLabel ? ` · ${String(result.qualityLabel)}` : ''}`);
        }
        if (typeof result.percentile === 'number') {
          console.log(`  Percentile:        ${bold(`${result.percentile}%`)}`);
        }
        if (typeof result.solveTimeSeconds === 'number') {
          const efficiency = result.efficiencyBadge === true ? green(' ✓ efficiency badge') : '';
          console.log(`  Solve time:        ${String(result.solveTimeSeconds)}s${efficiency}`);
        }
        console.log();

        const unlocked = result.unlocked === true;
        if (unlocked) {
          const nextLevel = typeof result.levelUnlocked === 'number' ? result.levelUnlocked : level + 1;
          console.log(green(`  UNLOCKED! Level ${nextLevel} available.`));
        } else {
          console.log(red('  NOT UNLOCKED. Dual-Gate not cleared (structure ≥ 25 AND coverage + quality ≥ 15).'));
        }

        console.log(dim(`  Summary: ${String(result.summary ?? '')}`));

        const flags = (result.flags ?? []) as string[];
        if (flags.length > 0) {
          console.log(yellow(`  Flags: ${flags.join(', ')}`));
        }

        const fieldScores = (result.fieldScores ?? []) as { field: string; score: number; reason: string }[];
        if (fieldScores.length > 0) {
          console.log(dim('\n  Field scores:'));
          for (const fsScore of fieldScores) {
            console.log(dim(`    ${fsScore.field}: ${fsScore.score} — ${fsScore.reason}`));
          }
        }

        if (unlocked) {
          const nextLevel = typeof result.levelUnlocked === 'number' ? result.levelUnlocked : level + 1;
          level = nextLevel;
          if (level > PUBLIC_BETA_MAX_LEVEL) {
            break;
          }
          if (!await promptYesNo('\n  Continue to next level? (y/n) ')) {
            return;
          }
          fetchFreshBrief = true;
          break;
        }

        if (await promptYesNo('\n  Retry this level with the same attemptToken? (y/n) ')) {
          continue;
        }
        if (await promptYesNo('  Fetch a fresh brief for this level? (y/n) ')) {
          fetchFreshBrief = true;
          break;
        }
        return;
      } catch (error) {
        console.log(red(`  Submission failed: ${(error as Error).message}`));

        if (isCliApiError(error)) {
          if (error.code === 'AUTH_REQUIRED') {
            console.log(yellow('  Sign-in required for this level. Run `kolk-arena login` first.'));
            return;
          }

          if (error.code === 'IDENTITY_MISMATCH') {
            console.log(yellow('  This attemptToken is bound to a different identity. Re-authenticate or fetch again.'));
            return;
          }

          if (error.code === 'ATTEMPT_ALREADY_PASSED' || error.code === 'ATTEMPT_TOKEN_EXPIRED') {
            if (await promptYesNo('  Fetch a fresh brief for this level? (y/n) ')) {
              fetchFreshBrief = true;
              break;
            }
            return;
          }

          if (
            error.code === 'VALIDATION_ERROR'
            || error.code === 'L5_INVALID_JSON'
            || error.code === 'RATE_LIMITED'
            || error.code === 'SCORING_UNAVAILABLE'
            || error.code === 'DUPLICATE_REQUEST'
          ) {
            if (await promptYesNo('  Retry this level with the same attemptToken? (y/n) ')) {
              continue;
            }
            if (await promptYesNo('  Fetch a fresh brief for this level? (y/n) ')) {
              fetchFreshBrief = true;
              break;
            }
            return;
          }
        }

        if (await promptYesNo('  Retry this level with the same attemptToken? (y/n) ')) {
          continue;
        }
        if (await promptYesNo('  Fetch a fresh brief for this level? (y/n) ')) {
          fetchFreshBrief = true;
          break;
        }
        return;
      }
    }
  }

  if (level > PUBLIC_BETA_MAX_LEVEL) {
    console.log();
    console.log(bold(green('  CONGRATULATIONS! You cleared the L0-L8 public beta ladder.')));
    console.log();
  }
}

async function cmdLeaderboard(school: string | undefined, baseUrl: string) {
  console.log(bold('\n  KOLK ARENA LEADERBOARD\n'));

  const params = new URLSearchParams({ limit: '20' });
  if (school) params.set('school', school);

  const data = await api(`/api/leaderboard?${params}`, { baseUrl }) as {
    leaderboard: {
      rank: number;
      display_name: string;
      school: string | null;
      best_score_on_highest: number;
      highest_level: number;
      tier: string;
      solve_time_seconds?: number | null;
    }[];
    total: number;
  };

  if (data.leaderboard.length === 0) {
    console.log(dim('  No entries yet.'));
    return;
  }

  console.log(`  ${bold('#'.padEnd(4))} ${bold('Name'.padEnd(20))} ${bold('Frontier'.padEnd(10))} ${bold('Lvl'.padEnd(5))} ${bold('Tier'.padEnd(12))} ${bold('Time'.padEnd(8))} ${bold('School')}`);
  console.log(`  ${'─'.repeat(84)}`);

  for (const entry of data.leaderboard) {
    const tierColor = entry.tier === 'champion' ? green : entry.tier === 'specialist' ? cyan : entry.tier === 'builder' ? yellow : dim;
    const solveTime = entry.solve_time_seconds != null ? `${entry.solve_time_seconds}s` : '—';
    console.log(
      `  ${String(entry.rank).padEnd(4)} ${String(entry.display_name).padEnd(20)} ${String(entry.best_score_on_highest).padEnd(10)} ${String(entry.highest_level).padEnd(5)} ${tierColor(entry.tier.padEnd(12))} ${solveTime.padEnd(8)} ${entry.school ?? '—'}`
    );
  }

  console.log(`\n  Total participants: ${data.total}`);
}

function parseScopes(args: string[]): string[] {
  const scopeIdx = args.indexOf('--scopes');
  if (scopeIdx < 0) return DEFAULT_SCOPES;
  const value = args[scopeIdx + 1];
  if (!value) return DEFAULT_SCOPES;
  return value.split(',').map((scope) => scope.trim()).filter(Boolean);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const explicitToken = args.indexOf('--token') >= 0 ? args[args.indexOf('--token') + 1] : undefined;
  const token = explicitToken ?? await resolveStoredToken();
  const baseUrl = await resolveApiBaseUrl();

  switch (command) {
    case 'login':
      await cmdLogin(parseScopes(args), baseUrl);
      break;
    case 'logout':
      await cmdLogout(baseUrl);
      break;
    case 'whoami':
      await cmdWhoAmI(token, baseUrl);
      break;
    case 'start': {
      const levelIdx = args.indexOf('--level');
      const level = levelIdx >= 0 ? parseInt(args[levelIdx + 1]!, 10) : 0;
      await cmdStart(level, token, baseUrl);
      break;
    }
    case 'leaderboard':
    case 'lb': {
      const schoolIdx = args.indexOf('--school');
      await cmdLeaderboard(schoolIdx >= 0 ? args[schoolIdx + 1] : undefined, baseUrl);
      break;
    }
    case 'help':
    case '--help':
    case '-h':
    default:
      console.log(`
${bold('Kolk Arena CLI')} — Interactive Delivery Client (L0-L8 public beta)

${bold('Usage:')}
  kolk-arena login [--scopes a,b,c]   Start RFC 8628 device login
  kolk-arena logout                   Revoke stored CLI token and delete local credentials
  kolk-arena whoami                   Show the active CLI identity and scopes
  kolk-arena start                    Start from L0 onboarding (default)
  kolk-arena start --level 1          Start from the ranked ladder entry
  kolk-arena start --level 5          Start from L5 (Welcome Kit — JSON-in-primaryText)
  kolk-arena start --token <tok>      Override stored token for this run
  kolk-arena leaderboard              View leaderboard
  kolk-arena leaderboard --school X   Filter by school
  kolk-arena help                     Show this help

${bold('Credential sources (in order):')}
  1. --token <kat_...>
  2. KOLK_TOKEN
  3. ${credentialsPath()}

${bold('Public beta scope:')} L0-L8
  L0:      onboarding connectivity check (not AI-judged)
  L1-L5:   anonymous play OK; L5 uses JSON-in-primaryText
  L6-L8:   authenticated play (run \`kolk-arena login\` first)
`);
  }
}

main().catch((err) => {
  console.error(red(`Error: ${(err as Error).message}`));
  process.exit(1);
});
