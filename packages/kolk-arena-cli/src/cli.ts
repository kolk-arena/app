#!/usr/bin/env node
/**
 * Kolk Arena CLI — Interactive benchmark runner (L0-L8 public beta)
 *
 * Usage:
 *   npx kolk-arena start               # Start from L0 onboarding
 *   npx kolk-arena start --level 1     # Start from ranked entry (L1)
 *   npx kolk-arena start --level 5     # Start from L5
 *   npx kolk-arena start --token <tok> # Authenticated (required for L6-L8)
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

const PUBLIC_BETA_MAX_LEVEL = 8;

async function cmdStart(startLevel: number, token?: string) {
  console.log();
  console.log(bold('╔══════════════════════════════════════╗'));
  console.log(bold('║             KOLK ARENA               ║'));
  console.log(bold('║   Interactive Benchmark CLI (L0-L8)  ║'));
  console.log(bold('╚══════════════════════════════════════╝'));
  console.log();
  console.log(`  API: ${cyan(API_BASE)}`);
  console.log(`  Auth: ${token ? green('authenticated') : yellow('anonymous (L1-L5; L6-L8 need --token)')}`);
  console.log(`  Starting at: ${bold(`Level ${startLevel}`)}`);
  console.log();

  let level = startLevel;

  while (level <= PUBLIC_BETA_MAX_LEVEL) {
    console.log(bold(`\n${'='.repeat(50)}`));
    console.log(bold(`  LEVEL ${level}`));
    console.log(bold(`${'='.repeat(50)}\n`));

    // Fetch challenge
    let challenge: Record<string, unknown>;
    try {
      challenge = await api(`/api/challenge/${level}`, { token }) as Record<string, unknown>;
    } catch (err) {
      const message = (err as Error).message;
      console.log(red(`  Failed to fetch challenge: ${message}`));
      if (message.includes('401') || message.includes('AUTH_REQUIRED')) {
        console.log(yellow('\n  Sign-in required for L6-L8.'));
        console.log(dim(`  Register or sign in at ${API_BASE}/profile, then pass --token <your_token>.`));
      } else if (message.includes('LEVEL_LOCKED')) {
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
      // Submit response is flat top-level (no { result: ... } envelope).
      // See docs/SUBMISSION_API.md for the public contract.
      const r = await api('/api/challenge/submit', {
        method: 'POST',
        token,
        headers: { 'Idempotency-Key': uuid() },
        body: {
          fetchToken: chal.fetchToken,
          primaryText: response,
        },
      });

      console.log();
      console.log(bold('  SCORE BREAKDOWN:'));

      // L0 onboarding skips structure/coverage/quality — it's a binary pass check.
      const isOnboarding = Number(r.level) === 0;
      if (!isOnboarding) {
        console.log(`  Structure (0-40):  ${bar(Number(r.structureScore), 40)} ${bold(String(r.structureScore))}/40`);
        console.log(`  Coverage  (0-30):  ${bar(Number(r.coverageScore), 30)} ${bold(String(r.coverageScore))}/30`);
        console.log(`  Quality   (0-30):  ${bar(Number(r.qualityScore), 30)} ${bold(String(r.qualityScore))}/30`);
        console.log(`  ${'─'.repeat(46)}`);
      }
      console.log(`  TOTAL:             ${bar(Number(r.totalScore), 100)} ${bold(String(r.totalScore))}/100`);
      if (r.colorBand) {
        console.log(`  Band / Label:      ${bold(String(r.colorBand))}${r.qualityLabel ? ` · ${String(r.qualityLabel)}` : ''}`);
      }
      if (typeof r.percentile === 'number') {
        console.log(`  Percentile:        ${bold(`${r.percentile}%`)}`);
      }
      if (typeof r.solveTimeSeconds === 'number') {
        const efficiency = r.efficiencyBadge === true ? green(' ✓ efficiency badge') : '';
        console.log(`  Solve time:        ${String(r.solveTimeSeconds)}s${efficiency}`);
      }
      console.log();

      const unlocked = r.unlocked === true;
      if (unlocked) {
        const nextLevel = typeof r.levelUnlocked === 'number' ? r.levelUnlocked : level + 1;
        console.log(green(`  UNLOCKED! Level ${nextLevel} available.`));
      } else {
        console.log(red(`  NOT UNLOCKED. Dual-Gate not cleared (structure ≥ 25 AND coverage + quality ≥ 15).`));
      }

      console.log(dim(`  Summary: ${String(r.summary ?? '')}`));

      // Show flags
      const flags = (r.flags ?? []) as string[];
      if (flags.length > 0) {
        console.log(yellow(`  Flags: ${flags.join(', ')}`));
      }

      // Field scores (non-L0 only — L0 has no rubric)
      const fieldScores = (r.fieldScores ?? []) as { field: string; score: number; reason: string }[];
      if (fieldScores.length > 0) {
        console.log(dim('\n  Field scores:'));
        for (const fs of fieldScores) {
          console.log(dim(`    ${fs.field}: ${fs.score} — ${fs.reason}`));
        }
      }

      if (unlocked) {
        const nextLevel = typeof r.levelUnlocked === 'number' ? r.levelUnlocked : level + 1;
        level = nextLevel;
        if (level > PUBLIC_BETA_MAX_LEVEL) break;
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

  if (level > PUBLIC_BETA_MAX_LEVEL) {
    console.log();
    console.log(bold(green('  CONGRATULATIONS! You cleared the L0-L8 public beta ladder.')));
    console.log(bold('  Kolk Arena public beta complete 🏆'));
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
      const level = levelIdx >= 0 ? parseInt(args[levelIdx + 1]!, 10) : 0;
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
${bold('Kolk Arena CLI')} — Interactive Benchmark Client (L0-L8 public beta)

${bold('Usage:')}
  kolk-arena start                    Start from L0 onboarding (default)
  kolk-arena start --level 1          Start from the ranked ladder entry
  kolk-arena start --level 5          Start from L5 (Welcome Kit — JSON-in-primaryText)
  kolk-arena start --token <tok>      Authenticated mode (required for L6-L8)
  kolk-arena leaderboard              View leaderboard
  kolk-arena leaderboard --school X   Filter by school
  kolk-arena help                     Show this help

${bold('Environment:')}
  KOLK_ARENA_URL   API base URL (default: https://kolkarena.com)
  KOLK_TOKEN       Bearer token for auth (needed for L6-L8)

${bold('Public beta scope:')} L0-L8 across bands A-B
  L0:      Band A  — onboarding connectivity check (not AI-judged)
  L1-L5:   Band A-B (anonymous play OK; L5 uses JSON-in-primaryText)
  L6-L8:   Band B  (bearer token required)

  Unlock rule: Dual-Gate — structure ≥ 25/40 AND coverage + quality ≥ 15/60.
  Submit response is a flat top-level object (no { result: ... } wrapper).
  See docs/LEVELS.md, docs/SCORING.md, and docs/SUBMISSION_API.md.
`);
      break;
    }
  }
}

main().catch((err) => {
  console.error(red(`Error: ${(err as Error).message}`));
  process.exit(1);
});
