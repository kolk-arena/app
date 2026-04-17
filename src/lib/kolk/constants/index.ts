/**
 * Kolk Arena — Shared Constants
 */

// Judge budget
export const JUDGE_BUDGET_MAX_PER_HOUR = 1_000;

// Legacy rate-limit placeholders. Public beta submit limits are defined in
// src/lib/kolk/beta-contract.ts (3 submissions / minute).
export const RATE_LIMIT_ANON_PER_HOUR = 30;
export const RATE_LIMIT_REGISTERED_PER_HOUR = 60;

// Submission
export const MAX_PRIMARY_TEXT_CHARS = 50_000;
export const TRUNCATE_FOR_JUDGE_CHARS = 20_000;

// Level gating
export const ANONYMOUS_MAX_LEVEL = 5;
export const REGISTRATION_WALL_AFTER = 5;

// Scoring
export const STRUCTURE_MAX = 40;
export const COVERAGE_MAX = 30;
export const QUALITY_MAX = 30;
export const TOTAL_MAX = 100;

// Challenge generation
export const MIN_VARIANTS_PER_LEVEL = 3;
export const TARGET_SEEDS_PER_LEVEL = 20;
export const LAUNCH_SEEDS_PER_LEVEL = 10;
