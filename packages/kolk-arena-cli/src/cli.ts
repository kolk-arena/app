#!/usr/bin/env node
/**
 * Kolk Arena CLI — Interactive benchmark runner
 *
 * Usage:
 *   npx kolk-arena start               # Start from Level 1
 *   npx kolk-arena start --level 5     # Start from Level 5
 *   npx kolk-arena start --token <tok> # Authenticated mode
 *   npx kolk-arena leaderboard         # View leaderboard
 *
 * Env:
 *   KOLK_ARENA_URL  — API base URL (default: https://kolkarena.com)
 *   KOLK_TOKEN      — Bearer token for authenticated access
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_BASE = process.env.KOLK_ARENA_URL ?? 'https://kolkarena.com';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bold(s: string) { return `\x1b[1m${s}\x1b[0m`; }
function green(s: string) { return `\x1b[32m${s}\x1b[0m`; }
function red(s: string) { return `\x1b[31m${s}\x1b[0m`; }
function yellow(s: string) { return `\x1b[33m${s}\x1b[0m`; }
function cyan(s: string) { return `\x1b[36m${s}\x1b[0m`; }
function dim(s: string) { return `\x1b[2m${s}\x1b[0m`; }

function bar(score: number, max: number, width = 20): string {
  const filled = Math.round((score / max) * width);
  return green('█'.repeat(filled)) + dim('░'.repeat(width - filled));
}

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

async function api(
  path: string,
  opts: { method?: string; body?: unknown; token?: string; headers?: Record<string, string> } = {},
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers ?? {}),
  };
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const json = await res.json() as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${(json as { error?: string }).error ?? 'Unknown error'}`);
  }
  return json;
}

function readStdin(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.resume();
    process.stdin.on('data', (chunk) => {
      data += chunk;
      if (data.includes('\n')) {
        process.stdin.pause();
        resolve(data.trim());
      }
    });
  });
}

async function readMultiline(prompt: string): Promise<string> {
  console.log(prompt);
  console.log(dim('  (Enter your response. Type "---END---" on a new line to finish)'));
  console.log();

  return new Promise((resolve) => {
    const lines: string[] = [];
    process.stdin.setEncoding('utf-8');
    process.stdin.resume();

    const onData = (chunk: string) => {
      const newLines = chunk.split('\n');
      for (const line of newLines) {
        if (line.trim() === '---END---') {
          process.stdin.removeListener('data', onData);
          process.stdin.pause();
          resolve(lines.join('\n'));
          return;
        }
        lines.push(line);
      }
    };

    process.stdin.on('data', onData);
  });
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdStart(startLevel: number, token?: string) {
  console.log();
  console.log(bold('╔══════════════════════════════════════╗'));
  console.log(bold('║             KOLK ARENA               ║'));
  console.log(bold('║        Interactive Benchmark CLI     ║'));
  console.log(bold('╚══════════════════════════════════════╝'));
  console.log();
  console.log(`  API: ${cyan(API_BASE)}`);
  console.log(`  Auth: ${token ? green('authenticated') : yellow('anonymous (L1-L5 only)')}`);
  console.log(`  Starting at: ${bold(`Level ${startLevel}`)}`);
  console.log();

  let level = startLevel;

  while (level <= 20) {
    console.log(bold(`\n${'='.repeat(50)}`));
    console.log(bold(`  LEVEL ${level}`));
    console.log(bold(`${'='.repeat(50)}\n`));

    // Fetch challenge
    let challenge: Record<string, unknown>;
    try {
      challenge = await api(`/api/challenge/${level}`, { token }) as Record<string, unknown>;
    } catch (err) {
      console.log(red(`  Failed to fetch challenge: ${(err as Error).message}`));
      if ((err as Error).message.includes('403')) {
        console.log(yellow('\n  Registration required for this level.'));
        console.log(dim(`  Register: POST ${API_BASE}/api/auth/register`));
        console.log(dim(`  Then pass --token <your_token>`));
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

    // Get agent response
    const response = await readMultiline(bold('  YOUR RESPONSE:'));

    if (!response.trim()) {
      console.log(yellow('  Empty response — skipping this level.'));
      const skip = await readStdin('  Continue to next level? (y/n) ');
      if (skip.toLowerCase() === 'y') { level++; continue; }
      break;
    }

    // Submit
    console.log(dim('\n  Submitting...'));
    try {
      const result = await api('/api/challenge/submit', {
        method: 'POST',
        token,
        headers: { 'Idempotency-Key': uuid() },
        body: {
          fetchToken: chal.fetchToken,
          primaryText: response,
        },
      }) as { result: Record<string, unknown> };

      const r = result.result;
      console.log();
      console.log(bold('  SCORE BREAKDOWN:'));
      console.log(`  Structure (0-40):  ${bar(Number(r.structureScore), 40)} ${bold(String(r.structureScore))}/40`);
      console.log(`  Coverage  (0-30):  ${bar(Number(r.coverageScore), 30)} ${bold(String(r.coverageScore))}/30`);
      console.log(`  Quality   (0-30):  ${bar(Number(r.qualityScore), 30)} ${bold(String(r.qualityScore))}/30`);
      console.log(`  ${'─'.repeat(46)}`);
      console.log(`  TOTAL:             ${bar(Number(r.totalScore), 100)} ${bold(String(r.totalScore))}/100`);
      console.log();

      if (r.passed) {
        console.log(green(`  PASSED! Level ${Number(r.levelUnlocked ?? level + 1)} unlocked.`));
      } else {
        console.log(red(`  NOT PASSED. Score below threshold.`));
      }

      console.log(dim(`  Summary: ${String(r.summary)}`));

      // Show flags
      const flags = (r.flags ?? []) as string[];
      if (flags.length > 0) {
        console.log(yellow(`  Flags: ${flags.join(', ')}`));
      }

      // Field scores
      const fieldScores = (r.fieldScores ?? []) as { field: string; score: number; reason: string }[];
      if (fieldScores.length > 0) {
        console.log(dim('\n  Field scores:'));
        for (const fs of fieldScores) {
          console.log(dim(`    ${fs.field}: ${fs.score} — ${fs.reason}`));
        }
      }

      if (r.passed) {
        level = Number(r.levelUnlocked ?? level + 1);
        const next = await readStdin('\n  Continue to next level? (y/n) ');
        if (next.toLowerCase() !== 'y') break;
      } else {
        const retry = await readStdin('\n  Retry this level? (y/n) ');
        if (retry.toLowerCase() !== 'y') break;
      }
    } catch (err) {
      console.log(red(`  Submission failed: ${(err as Error).message}`));
      const retry = await readStdin('  Retry? (y/n) ');
      if (retry.toLowerCase() !== 'y') break;
    }
  }

  if (level > 20) {
    console.log();
    console.log(bold(green('  CONGRATULATIONS! You completed all 20 levels!')));
    console.log(bold('  You are a Kolk Arena Champion! 🏆'));
    console.log();
  }
}

async function cmdLeaderboard(school?: string) {
  console.log(bold('\n  KOLK ARENA LEADERBOARD\n'));

  const params = new URLSearchParams({ limit: '20' });
  if (school) params.set('school', school);

  const data = await api(`/api/leaderboard?${params}`) as {
    leaderboard: { rank: number; display_name: string; school: string | null; total_score: number; highest_level: number; tier: string }[];
    total: number;
  };

  if (data.leaderboard.length === 0) {
    console.log(dim('  No entries yet.'));
    return;
  }

  console.log(`  ${bold('#'.padEnd(4))} ${bold('Name'.padEnd(20))} ${bold('Score'.padEnd(8))} ${bold('Lvl'.padEnd(5))} ${bold('Tier'.padEnd(12))} ${bold('School')}`);
  console.log(`  ${'─'.repeat(65)}`);

  for (const e of data.leaderboard) {
    const tierColor = e.tier === 'champion' ? green : e.tier === 'specialist' ? cyan : e.tier === 'builder' ? yellow : dim;
    console.log(
      `  ${String(e.rank).padEnd(4)} ${String(e.display_name).padEnd(20)} ${String(e.total_score).padEnd(8)} ${String(e.highest_level).padEnd(5)} ${tierColor(e.tier.padEnd(12))} ${e.school ?? '—'}`
    );
  }

  console.log(`\n  Total participants: ${data.total}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const token = process.env.KOLK_TOKEN
    ?? (args.indexOf('--token') >= 0 ? args[args.indexOf('--token') + 1] : undefined);

  switch (command) {
    case 'start': {
      const levelIdx = args.indexOf('--level');
      const level = levelIdx >= 0 ? parseInt(args[levelIdx + 1]!, 10) : 1;
      await cmdStart(level, token);
      break;
    }

    case 'leaderboard':
    case 'lb': {
      const schoolIdx = args.indexOf('--school');
      await cmdLeaderboard(schoolIdx >= 0 ? args[schoolIdx + 1] : undefined);
      break;
    }

    case 'help':
    case '--help':
    case '-h':
    default: {
      console.log(`
${bold('Kolk Arena CLI')} — Interactive Benchmark Client

${bold('Usage:')}
  kolk-arena start                    Start from Level 1
  kolk-arena start --level 5          Start from Level 5
  kolk-arena start --token <tok>      Authenticated mode
  kolk-arena leaderboard              View leaderboard
  kolk-arena leaderboard --school X   Filter by school
  kolk-arena help                     Show this help

${bold('Environment:')}
  KOLK_ARENA_URL   API base URL (default: https://kolkarena.com)
  KOLK_TOKEN       Bearer token for auth

${bold('Levels:')} 20 levels across 4 bands (A-D)
  L1-L5:   Band A-B  (30 min, pass: 65)
  L6-L10:  Band B    (25 min, pass: 70)  — Boss at L10
  L11-L15: Band C    (20 min, pass: 75)  — Boss at L15
  L16-L20: Band D    (15 min, pass: 80)  — Final Boss at L20

  Boss levels: L5 (Gateway), L10, L15, L20 (Chaos Contract)
  Anonymous play: L1-L5. Register after L5 to continue.
`);
      break;
    }
  }
}

main().catch((err) => {
  console.error(red(`Error: ${(err as Error).message}`));
  process.exit(1);
});
