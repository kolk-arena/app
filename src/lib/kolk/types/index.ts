/**
 * Kolk Arena — Core TypeScript Types + Zod Schemas
 *
 * All types for challenges, submissions, scoring, leaderboard, and auth.
 * Zod schemas validate API input; TypeScript interfaces type everything else.
 */

import { z } from 'zod';

// ============================================================================
// Level & Family enums
// ============================================================================

// Legacy runtime enum. Public beta contract authority lives in docs/BETA_DOC_HIERARCHY.md.
export const LEVELS = Array.from({ length: 21 }, (_, i) => i) as number[];
export const MIN_LEVEL = 0;
export const MAX_LEVEL = 20;
export const PUBLIC_BETA_LEVELS = Array.from({ length: 9 }, (_, i) => i) as number[];
export const PUBLIC_BETA_MIN_LEVEL = 0;
export const PUBLIC_BETA_MAX_LEVEL = 8;

export const DELIVERABLE_FAMILIES = [
  'connectivity_check',
  'txt_translation',
  'biz_bio',
  'structured_plan',
  'json_bundle',
  'prompt_pack',
  'message_bundle',
  'landing_page_copy',
  'structured_html_page',
  'research_memo',
  'legal_memo',
  'multi_asset_text_bundle',
  'adversarial',
] as const;

export type DeliverableFamily = typeof DELIVERABLE_FAMILIES[number];

export const DIFFICULTY_BANDS = ['A', 'B', 'C', 'D'] as const;
export type DifficultyBand = typeof DIFFICULTY_BANDS[number];

export const TIERS = ['starter', 'builder', 'specialist', 'champion'] as const;
export type LeaderboardTier = typeof TIERS[number];

// ============================================================================
// Challenge types
// ============================================================================

export interface LevelDefinition {
  level: number;
  name: string;
  family: DeliverableFamily;
  band: DifficultyBand;
  timeLimitMinutes: number;
  passThreshold: number;           // legacy field; beta unlock logic is Dual-Gate, not fixed total_score
  generatorPrompt: string;         // system prompt for challenge generation
  coverageTargets: string[];       // fields the rubric evaluates
  isBoss: boolean;
  bossSpecial?: string;            // special boss mechanic description
}

export interface ChallengePackage {
  challengeId: string;
  level: number;
  seed: number;
  variant: string;                 // opaque token — never reveals rubric
  /**
   * Retry-capable capability for this fetched session. 24h TTL.
   * Consumed only on a passing submission (Dual-Gate cleared) or when
   * the 24h ceiling elapses. See docs/SUBMISSION_API.md §Why attemptToken exists.
   */
  attemptToken: string;
  /** @deprecated Legacy alias for attemptToken. Remove after one minor release. */
  fetchToken?: string;
  taskJson: Record<string, unknown>;
  promptMd: string;
  suggestedTimeMinutes?: number;
  timeLimitMinutes: number;
  deadlineUtc: string;             // ISO 8601
  challengeStartedAt: string;      // ISO 8601
}

export interface VariantRubric {
  level: number;
  variant: string;
  rubricHash: string;
  coverageFieldWeights: Record<string, number>;
  qualityAnchors: Record<string, string>;
  idealExcerpt: string;
  activePenalties: string[];
  penaltyConfig: Record<string, { deduction: number; appliedTo: 'coverage' | 'quality' }>;
}

// ============================================================================
// Submission types
// ============================================================================

export interface SubmissionInput {
  /** Primary token name per 2026-04-17 contract. */
  attemptToken: string;
  primaryText: string;
  repoUrl?: string;
  commitHash?: string;
}

// Accept both attemptToken (primary) and legacy fetchToken in the request body;
// the server normalizes to attemptToken downstream. See docs/SUBMISSION_API.md.
export const SubmissionInputSchema = z
  .object({
    attemptToken: z.string().min(1).optional(),
    fetchToken: z.string().min(1).optional(),
    primaryText: z.string().min(1).max(50_000, 'primary_text exceeds 50,000 character limit'),
    repoUrl: z.string().url().optional(),
    commitHash: z.string().max(64).optional(),
  })
  .refine((input) => Boolean(input.attemptToken ?? input.fetchToken), {
    message: 'attemptToken is required (from challenge fetch response)',
    path: ['attemptToken'],
  })
  .transform((input) => ({
    attemptToken: (input.attemptToken ?? input.fetchToken) as string,
    primaryText: input.primaryText,
    repoUrl: input.repoUrl,
    commitHash: input.commitHash,
  }));

export interface SubmissionResult {
  submissionId: string;
  challengeId: string;
  level: number;
  structureScore?: number;         // 0-40
  coverageScore?: number;          // 0-30
  qualityScore?: number;           // 0-30
  totalScore: number;              // 0-100
  fieldScores?: FieldScore[];
  qualitySubscores?: QualitySubscores;
  flags: string[];
  summary: string;
  unlocked: boolean;
  colorBand: 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN' | 'BLUE';
  qualityLabel: string;
  percentile?: number | null;
  solveTimeSeconds?: number;
  fetchToSubmitSeconds?: number;
  efficiencyBadge?: boolean;
  aiJudged?: boolean;
  leaderboardEligible?: boolean;
  showRegisterPrompt?: boolean;
  levelUnlocked?: number;          // next level if passed
}

export interface FieldScore {
  field: string;
  score: number;
  reason: string;
}

export interface QualitySubscores {
  toneFit: number;
  clarity: number;
  usefulness: number;
  businessFit: number;
}

// ============================================================================
// Auth types
// ============================================================================

export interface RegisterInput {
  email: string;
  displayName?: string;
  nextPath?: string;
}

export const RegisterInputSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(60).optional(),
  nextPath: z.string().min(1).max(512).optional(),
});

export interface VerifyInput {
  email: string;
  code: string;
}

export const VerifyInputSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6).regex(/^\d{6}$/, 'Code must be 6 digits'),
});

export const OAuthProviderSchema = z.enum(['github', 'google']);
export type OAuthProvider = z.infer<typeof OAuthProviderSchema>;

export interface ProfileInput {
  displayName?: string;
  handle?: string | null;
  framework?: string | null;
  school?: string | null;
  country?: string | null;
}

export const ProfileInputSchema = z.object({
  displayName: z.string().trim().min(1).max(60).optional(),
  handle: z.string().trim().min(1).max(40).optional().nullable(),
  framework: z.string().trim().min(1).max(80).optional().nullable(),
  school: z.string().trim().min(1).max(120).optional().nullable(),
  country: z.string().trim().min(1).max(80).optional().nullable(),
});

// ============================================================================
// Leaderboard types
// ============================================================================

export interface LeaderboardEntry {
  rank: number;
  displayName: string;
  handle: string | null;
  framework: string | null;
  school: string | null;
  bestScoreOnHighest: number;
  bestColorBand: 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN' | 'BLUE' | null;
  bestQualityLabel: string | null;
  solveTimeSeconds: number | null;
  efficiencyBadge: boolean;
  totalScore: number;
  levelsCompleted: number;
  highestLevel: number;
  tier: LeaderboardTier;
  lastSubmissionAt: string | null;
}

export const LeaderboardQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  school: z.string().optional(),
});

// ============================================================================
// API Error types
// ============================================================================

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function badRequest(message: string, code = 'BAD_REQUEST') {
  return new ApiError(400, code, message);
}

export function unauthorized(message = 'Authentication required', code = 'UNAUTHORIZED') {
  return new ApiError(401, code, message);
}

export function forbidden(message: string, code = 'FORBIDDEN') {
  return new ApiError(403, code, message);
}

export function notFound(message: string, code = 'NOT_FOUND') {
  return new ApiError(404, code, message);
}

export function conflict(message: string, code = 'CONFLICT') {
  return new ApiError(409, code, message);
}

export function tooManyRequests(message = 'Rate limit exceeded', code = 'RATE_LIMITED') {
  return new ApiError(429, code, message);
}

export function requestTimeout(message = 'Session expired', code = 'SESSION_EXPIRED') {
  return new ApiError(408, code, message);
}
