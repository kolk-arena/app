/**
 * Kolk Arena — Core TypeScript Types + Zod Schemas
 *
 * All types for challenges, submissions, scoring, leaderboard, and auth.
 * Zod schemas validate API input; TypeScript interfaces type everything else.
 */

import { z } from 'zod';
import { countryNameFromCode } from '@/lib/frontend/countries';

// ============================================================================
// Level & Family enums
// ============================================================================

// Public runtime enum. Non-public level planning must stay outside this tree.
export const LEVELS = Array.from({ length: 9 }, (_, i) => i) as number[];
export const MIN_LEVEL = 0;
export const MAX_LEVEL = 8;
export const PUBLIC_BETA_LEVELS = Array.from({ length: 9 }, (_, i) => i) as number[];
export { PUBLIC_BETA_MIN_LEVEL, PUBLIC_BETA_MAX_LEVEL } from '@/lib/kolk/beta-contract';

export const DELIVERABLE_FAMILIES = [
  'connectivity_check',
  'txt_translation',
  'biz_bio',
  'structured_plan',
  'json_bundle',
  'landing_page_copy',
  'multi_asset_text_bundle',
] as const;

export type DeliverableFamily = typeof DELIVERABLE_FAMILIES[number];

export const DIFFICULTY_BANDS = ['A', 'B'] as const;
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
  layer1Checks: Layer1CheckName[];  // deterministic checks allowed for this level
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
  flagExplanations?: FlagExplanation[];
  /** Compatibility alias for API clients that requested snake_case feedback. */
  flag_explanations?: FlagExplanation[];
  feedbackChecklist?: FeedbackChecklistItem[];
  /** Compact compatibility alias for machine self-check loops. */
  checklist?: FeedbackChecklistItem[];
  summary: string;
  unlocked: boolean;
  failReason?: 'STRUCTURE_GATE' | 'QUALITY_FLOOR' | null;
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
  replayUnlocked?: boolean;
  nextSteps?: {
    replay: string;
    discord: string;
    share: string;
  };
}

export interface FieldScore {
  field: string;
  score: number;
  reason: string;
  extractedNumbers?: ExtractedNumber[];
}

export type Layer1CheckName =
  | 'lang_detect'
  | 'math_verify'
  | 'item_count'
  | 'fact_xref'
  | 'term_guard'
  | 'json_string_fields'
  | 'header_keyword_match';

export type ExtractedNumberSource = 'currency' | 'json_field';

export interface ExtractedNumber {
  token: string;
  value: number;
  source: ExtractedNumberSource;
}

export interface FlagExplanation {
  flag: string;
  meaning: string;
  action: string;
  scoreImpact: string;
}

export interface FeedbackChecklistItem {
  key: string;
  label: string;
  passed: boolean;
  score: number;
  maxScore: number;
  reason: string;
  extractedNumbers?: ExtractedNumber[];
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
  agentStack?: string | null;
  affiliation?: string | null;
  country?: string | null;
}

const nullableTrimmedText = (max: number) => z.string().trim().min(1).max(max).optional().nullable();

export const ProfileInputSchema = z
  .object({
    displayName: z.string().trim().min(1).max(60).optional(),
    handle: z.string().trim().min(1).max(40).optional().nullable(),
    agentStack: nullableTrimmedText(80),
    affiliation: nullableTrimmedText(120),
    country: z
      .string()
      .trim()
      .transform((value) => value.toUpperCase())
      .refine((value) => countryNameFromCode(value) !== null, {
        message: 'Country must be a valid ISO 3166-1 alpha-2 code',
      })
      .optional()
      .nullable(),
  })
  .transform((input) => ({
    displayName: input.displayName,
    handle: input.handle,
    agentStack: input.agentStack,
    affiliation: input.affiliation,
    country: input.country,
  }));

// ============================================================================
// Leaderboard types
// ============================================================================

export interface LeaderboardEntry {
  row_key: string;
  player_id: string | null;
  activity_submission_id: string | null;
  rank: number;
  display_name: string;
  handle: string | null;
  agent_stack: string | null;
  affiliation: string | null;
  best_score_on_highest: number;
  best_color_band: 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN' | 'BLUE' | null;
  best_quality_label: string | null;
  solve_time_seconds: number | null;
  efficiency_badge: boolean;
  total_score: number;
  levels_completed: number;
  highest_level: number;
  tier: LeaderboardTier;
  pioneer?: boolean;
  is_anon: boolean;
  last_submission_at: string | null;
  country_code?: string | null;
}

export const LeaderboardQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    agent_stack: z.string().trim().min(1).optional(),
    affiliation: z.string().trim().min(1).optional(),
    identity_type: z.enum(['anonymous', 'registered']).optional(),
  })
  .transform((input) => ({
    page: input.page,
    limit: input.limit,
    agent_stack: input.agent_stack,
    affiliation: input.affiliation,
    identity_type: input.identity_type,
  }));

export interface AgentStackStat {
  agent_stack: string;
  count: number;
  percentage: number;
}

export interface LeaderboardResponse {
  leaderboard: LeaderboardEntry[];
  total: number;
  page: number;
  limit: number;
  agent_stack_stats?: AgentStackStat[];
}

export interface ActivityFeedEntry {
  id: string;
  player_id: string | null;
  level: number;
  display_name: string;
  agent_stack: string | null;
  total_score: number;
  color_band: 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN' | 'BLUE' | null;
  quality_label: string | null;
  solve_time_seconds: number | null;
  submitted_at: string | null;
  unlocked: boolean;
  /**
   * ISO-3166-1 alpha-2 country code captured at submit time from the Vercel
   * edge `x-vercel-ip-country` header. `null` when the header was absent or
   * when the submission predates migration 00015.
   */
  country_code: string | null;
  /**
   * True when the row belongs to an anonymous participant (ka_users.is_anon = true,
   * migration 00019). Optional so existing serializers that omit it keep type-checking;
   * when absent, the consumer should treat the row as non-anonymous.
   */
  is_anon?: boolean;
}

/**
 * Public-safe shape returned by `/api/activity/submission/[id]` for the
 * anonymous-row detail view. Scores + judge summary are exposed; any
 * identity-bearing fields (anon_token, IP, participant_id, auth user id)
 * are intentionally omitted.
 */
export interface ActivitySubmissionDetail {
  id: string;
  level: number;
  player_id: string | null;
  display_name: string;
  agent_stack: string | null;
  country_code: string | null;
  total_score: number;
  structure_score: number | null;
  coverage_score: number | null;
  quality_score: number | null;
  color_band: 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN' | 'BLUE' | null;
  quality_label: string | null;
  solve_time_seconds: number | null;
  submitted_at: string | null;
  unlocked: boolean;
  judge_summary: string | null;
  efficiency_badge: boolean;
}

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
