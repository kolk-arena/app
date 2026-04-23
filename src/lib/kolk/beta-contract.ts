export const PUBLIC_BETA_MIN_LEVEL = 0;
export const PUBLIC_BETA_MAX_LEVEL = 8;
export const RANKED_BETA_MIN_LEVEL = 1;
export const RANKED_BETA_MAX_LEVEL = 8;
export const L0_ONBOARDING_LEVEL = 0;
export const ANONYMOUS_BETA_MAX_LEVEL = 5;

export const STRUCTURE_GATE = 25;
export const COVERAGE_QUALITY_GATE = 15;

// Scoring maxima — canonical values live in constants/index.ts (legacy home,
// still used by layer1.ts + judge.ts). Re-exported here so callers needing
// the beta-contract surface don't have to dual-import.
export { STRUCTURE_MAX, COVERAGE_MAX, QUALITY_MAX } from './constants';

// Submit rate-limit numbers live in src/lib/kolk/submission-guards.ts
// (SUBMIT_RATE_LIMIT_PER_ATTEMPT_TOKEN_PER_MINUTE / _PER_HOUR, plus
// SUBMIT_RETRY_CAP_PER_ATTEMPT_TOKEN and SUBMIT_RATE_LIMIT_PER_IDENTITY_PER_DAY).
// A single mirrored knob is kept here for callers that only reach the
// beta-contract surface; the "keep in sync" discipline is documented there.
// Launch-week relaxation (2026-04-20): raised 2 → 6.
export const SUBMIT_RATE_LIMIT_PER_ATTEMPT_TOKEN = 6;

export type ColorBand = 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN' | 'BLUE';

export function isPublicBetaLevel(level: number): boolean {
  return Number.isInteger(level) && level >= PUBLIC_BETA_MIN_LEVEL && level <= PUBLIC_BETA_MAX_LEVEL;
}

export function isRankedBetaLevel(level: number): boolean {
  return Number.isInteger(level) && level >= RANKED_BETA_MIN_LEVEL && level <= RANKED_BETA_MAX_LEVEL;
}

export function isAiJudgedLevel(level: number): boolean {
  return level >= 1;
}

export function getSuggestedTimeMinutes(level: number): number {
  switch (level) {
    case 0:
      return 1;
    case 1:
      return 5;
    case 2:
      return 8;
    case 3:
      return 10;
    case 4:
      return 12;
    case 5:
      return 15;
    case 6:
      return 20;
    case 7:
      return 25;
    case 8:
      return 30;
    default:
      return 5;
  }
}

export function isDualGateUnlock(structureScore: number, coverageScore: number, qualityScore: number): boolean {
  return structureScore >= STRUCTURE_GATE && coverageScore + qualityScore >= COVERAGE_QUALITY_GATE;
}

export function scoreToColorBand(totalScore: number): ColorBand {
  if (totalScore >= 90) return 'BLUE';
  if (totalScore >= 75) return 'GREEN';
  if (totalScore >= 60) return 'YELLOW';
  if (totalScore >= 40) return 'ORANGE';
  return 'RED';
}

export function colorBandToQualityLabel(colorBand: ColorBand): string {
  switch (colorBand) {
    case 'BLUE':
      return 'Exceptional';
    case 'GREEN':
      return 'Business Quality';
    case 'YELLOW':
      return 'Usable';
    case 'ORANGE':
      return 'Needs Improvement';
    case 'RED':
    default:
      return 'Needs Structure Work';
  }
}

export function computeSolveTimeSeconds(
  challengeStartedAt: Date | string,
  submittedAt: Date | string,
): number {
  const startedMs = new Date(challengeStartedAt).getTime();
  const submittedMs = new Date(submittedAt).getTime();

  if (!Number.isFinite(startedMs) || !Number.isFinite(submittedMs)) {
    return 0;
  }

  return Math.max(0, Math.round((submittedMs - startedMs) / 1000));
}

export function hasEfficiencyBadge(level: number, solveTimeSeconds: number): boolean {
  return solveTimeSeconds <= getSuggestedTimeMinutes(level) * 60;
}

/**
 * Leaderboard eligibility.
 *
 * Launch policy (2026-04-23): anonymous L1-L5 runs ARE eligible too —
 * anonymous players that clear the Dual-Gate get a lightweight ka_users
 * row minted in the submit route (see src/lib/kolk/auth/anon-user.ts)
 * so the FK to ka_leaderboard.participant_id holds. The `anonToken`
 * parameter here is the raw kolk_anon_session cookie value; either an
 * authenticated participantId OR an anonymous cookie qualifies.
 */
export function isLeaderboardEligible(
  level: number,
  participantId: string | null,
  anonToken: string | null,
  unlocked: boolean,
): boolean {
  return (
    isRankedBetaLevel(level)
    && unlocked
    && (Boolean(participantId) || Boolean(anonToken))
  );
}

