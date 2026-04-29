/**
 * Zod schemas for the public agent automation contract surfaces.
 *
 * One canonical definition per surface. Used at runtime to:
 *   - validate built payloads in unit tests (drift between code and schema
 *     surfaces fails the test);
 *   - serve JSON Schema over /api/schema/[slug] via z.toJSONSchema(),
 *     so agents can fetch a machine-readable contract without scraping
 *     prose docs.
 *
 * When you add a field to one of the runtime payloads (manifest, agent
 * context, submit response, catalog, quota), update the matching schema
 * here. The schemaVersion must move when the wire shape cuts a key.
 */

import { z } from 'zod';

// ── Shared primitives ───────────────────────────────────────────────────────

const RetryDispositionSchema = z.enum([
  'sameAttemptToken',
  'refetch',
  'auth',
  'platform',
  'terminal',
]);

const ErrorCodeSurfaceSchema = z.enum([
  'fetch',
  'submit',
  'session',
  'sample',
  'docs',
]);

const ErrorCodeRecordSchema = z.object({
  http: z.number().int().min(400).max(599),
  retry: RetryDispositionSchema,
  retryAfterDefault: z.number().int().nullable(),
  fixHint: z.string().min(1),
  surfaces: z.array(ErrorCodeSurfaceSchema).min(1),
});

const Layer1CheckNameSchema = z.enum([
  'lang_detect',
  'math_verify',
  'item_count',
  'fact_xref',
  'term_guard',
  'json_string_fields',
  'header_keyword_match',
]);

const FlagNameSchema = z.enum([
  'added_content',
  'hallucinated_facts',
  'prompt_injection',
  'wrong_language',
  'missing_required_content',
  'format_mismatch',
  'judge_provider_unavailable',
  'judge_budget_exceeded',
  'judge_error',
]);

const CompletionContractSchema = z.object({
  notCompleteUntil: z.string().min(1),
  doNotStopAt: z.array(z.string().min(1)),
  evidenceFields: z.array(z.string().min(1)),
  recoveryEndpoint: z.string().min(1),
  finalReport: z.string().min(1),
});

const EffectiveOutputSchema = z.object({
  primaryText: z.object({
    type: z.literal('string'),
    maxChars: z.number().int().positive(),
    format: z.enum(['plain_text', 'markdown', 'json_object_string', 'prompt_defined']),
  }),
  outputKind: z.string().min(1),
  contract: z.array(z.string()),
  requiredJsonStringFields: z.array(z.string()).optional(),
});

const EffectiveBriefSchema = z.object({
  sourceOfTruth: z.literal('live_fetch'),
  promptMdPath: z.literal('$.challenge.promptMd'),
  taskJsonPath: z.literal('$.challenge.taskJson'),
  structuredBriefPath: z.literal('$.challenge.taskJson.structured_brief'),
  canonicalFactsPath: z.literal('$.challenge.taskJson.structured_brief'),
  scoringSource: z.string().min(1),
  conflictPolicy: z.string().min(1),
  variantFamily: z.string().nullable(),
  factSourceKeys: z.array(z.string()),
  availableFactSourceKeys: z.array(z.string()),
  preserveSourcePaths: z.array(z.string()),
});

const EffectiveBlockingCheckSchema = z.object({
  name: z.string().min(1),
  gate: z.literal('blocking'),
  source: z.enum(['deterministic_l0', 'deterministic_layer1']),
  active: z.boolean(),
  sourcePaths: z.array(z.string()),
  reason: z.string().min(1),
  expected: z.unknown().optional(),
});

const EffectiveAdvisoryFlagSchema = z.object({
  name: z.string().min(1),
  gate: z.literal('advisory'),
  source: z.literal('ai_judge'),
  reason: z.string().min(1),
});

const EffectiveChecksSchema = z.object({
  blockingChecks: z.array(EffectiveBlockingCheckSchema),
  advisoryFlags: z.array(EffectiveAdvisoryFlagSchema),
  judgePenalties: z.object({
    source: z.literal('ai_judge'),
    appliesAfter: z.literal('blockingChecksPass'),
    flags: z.array(z.string()),
  }),
});

// ── Surface 1: automation manifest (kolk-automation-manifest.v1) ────────────

export const AutomationManifestSchema = z
  .object({
    schemaVersion: z.literal('kolk-automation-manifest.v1'),
    agentContractVersion: z.string().min(1),
    compatibleSchemas: z.object({
      manifest: z.string().min(1),
      catalog: z.string().min(1),
      agentContext: z.string().min(1),
      submitResult: z.string().min(1),
      quota: z.string().min(1),
    }),
    name: z.string().min(1),
    canonicalOrigin: z.string().url(),
    docs: z.record(z.string(), z.string().url()),
    entrypoints: z.record(z.string(), z.string().url()),
    discovery: z.record(z.string(), z.string()),
    levels: z.object({
      min: z.number().int(),
      max: z.number().int(),
      onboarding: z.number().int(),
      rankedMin: z.number().int(),
      rankedMax: z.number().int(),
      anonymousMax: z.number().int(),
      authRequiredFrom: z.number().int(),
    }),
    auth: z.record(z.string(), z.unknown()),
    fetch: z.record(z.string(), z.unknown()),
    submit: z.record(z.string(), z.unknown()),
    levelFormats: z.record(z.string(), z.unknown()),
    retry: z.object({
      sameAttemptToken: z.array(z.string()),
      refetch: z.array(z.string()),
      rotateIdempotencyKeyForNewSubmit: z.boolean(),
      reuseIdempotencyKeyOnlyForExactOutcomeUnknownRetry: z.boolean(),
      honorRetryAfter: z.boolean(),
    }),
    rateLimits: z.object({
      perAttemptMinute: z.number().int().positive(),
      perAttemptHour: z.number().int().positive(),
      perAttemptTotal: z.number().int().positive(),
      perIdentityDay: z.number().int().positive(),
      retryAfterHeader: z.string(),
      serverFailuresRefundQuota: z.boolean(),
    }),
    errorCodes: z.object({
      byCode: z.record(z.string(), ErrorCodeRecordSchema),
      retryDispositions: z.array(RetryDispositionSchema),
    }),
    completionContract: CompletionContractSchema,
    asyncPolicy: z.record(z.string(), z.unknown()),
  })
  .loose();

// ── Surface 2: agent context (kolk-agent-context.v2) ────────────────────────

export const AgentContextSchema = z
  .object({
    schemaVersion: z.literal('kolk-agent-context.v2'),
    level: z.number().int().min(0),
    levelName: z.string().min(1),
    outputKind: z.string().min(1),
    sourceLanguage: z.string().nullable(),
    targetLanguage: z.string().nullable(),
    variantFamily: z.string().nullable(),
    factSourceKeys: z.array(z.string()),
    outputContract: z.array(z.string()),
    deterministicChecks: z.array(Layer1CheckNameSchema),
    effectiveOutputSchema: EffectiveOutputSchema,
    effectiveBrief: EffectiveBriefSchema,
    effectiveChecks: EffectiveChecksSchema,
    completionContract: CompletionContractSchema,
  })
  .strict();

// ── Surface 3: submit result (kolk-submit-result.v2) ────────────────────────

const ExtractedNumberSchema = z.object({
  token: z.string().min(1),
  value: z.number(),
  source: z.enum(['currency', 'json_field']),
});

const FieldScoreSchema = z.object({
  field: z.string().min(1),
  score: z.number(),
  reason: z.string(),
  extractedNumbers: z.array(ExtractedNumberSchema).optional(),
});

const FlagExplanationSchema = z.object({
  flag: z.union([FlagNameSchema, z.string()]),
  meaning: z.string().min(1),
  action: z.string().min(1),
  scoreImpact: z.string().min(1),
});

const JudgePenaltySchema = z.object({
  flag: z.union([FlagNameSchema, z.string()]),
  source: z.literal('ai_judge'),
  appliedTo: z.string().nullable(),
  deduction: z.number().nullable(),
});

const FeedbackChecklistItemSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  passed: z.boolean(),
  score: z.number(),
  maxScore: z.number(),
  reason: z.string(),
  extractedNumbers: z.array(ExtractedNumberSchema).optional(),
});

const QualitySubscoresSchema = z.object({
  toneFit: z.number(),
  clarity: z.number(),
  usefulness: z.number(),
  businessFit: z.number(),
});

export const SubmitResultSchema = z
  .object({
    schemaVersion: z.literal('kolk-submit-result.v2'),
    submissionId: z.string().min(1),
    challengeId: z.string().min(1),
    level: z.number().int().min(0),
    structureScore: z.number().optional(),
    coverageScore: z.number().optional(),
    qualityScore: z.number().optional(),
    totalScore: z.number(),
    fieldScores: z.array(FieldScoreSchema).optional(),
    qualitySubscores: QualitySubscoresSchema.optional(),
    flags: z.array(z.union([FlagNameSchema, z.string()])),
    flagExplanations: z.array(FlagExplanationSchema).optional(),
    feedbackChecklist: z.array(FeedbackChecklistItemSchema).optional(),
    blockingChecks: z.array(FeedbackChecklistItemSchema).optional(),
    advisoryFlags: z.array(FlagExplanationSchema).optional(),
    judgePenalties: z.array(JudgePenaltySchema).optional(),
    summary: z.string(),
    unlocked: z.boolean(),
    failReason: z.enum(['STRUCTURE_GATE', 'QUALITY_FLOOR']).nullable().optional(),
    colorBand: z.enum(['RED', 'ORANGE', 'YELLOW', 'GREEN', 'BLUE']),
    qualityLabel: z.string(),
    percentile: z.number().nullable().optional(),
    solveTimeSeconds: z.number().optional(),
    fetchToSubmitSeconds: z.number().optional(),
    efficiencyBadge: z.boolean().optional(),
    aiJudged: z.boolean().optional(),
    leaderboardEligible: z.boolean().optional(),
    showRegisterPrompt: z.boolean().optional(),
    levelUnlocked: z.number().int().optional(),
    replayUnlocked: z.boolean().optional(),
    nextSteps: z
      .object({
        replay: z.string(),
        discord: z.string(),
        share: z.string(),
      })
      .optional(),
  })
  .loose();

// ── Surface 4: catalog (kolk-catalog.v1) ────────────────────────────────────

const CatalogLevelEntrySchema = z
  .object({
    level: z.number().int().min(0),
    name: z.string().min(1),
    family: z.string().min(1),
    band: z.string().min(1),
    isBoss: z.boolean(),
    bossSpecial: z.string().nullable(),
    legacyPassThreshold: z.number().int(),
    timeLimitMinutes: z.number().int().positive(),
    suggestedTimeMinutes: z.number().int().positive(),
    coverageTargets: z.array(z.string()),
    outputContract: z.array(z.string()).nullable(),
    deterministicChecks: z.array(Layer1CheckNameSchema),
    factSourceKeys: z.array(z.string()).nullable(),
    commonFailureModes: z.array(z.string()),
    sampleSuccessUrl: z.string().url().nullable(),
    catalogScope: z.literal('level_family_static'),
    variantsMayDifferBySeed: z.boolean(),
    liveFetchContractPath: z.string().min(1),
    aiJudged: z.boolean(),
    leaderboardEligible: z.boolean(),
    requiresAuth: z.boolean(),
    identityMode: z.enum(['browser_session_cookie', 'bearer_token']),
  })
  .loose();

export const CatalogResponseSchema = z
  .object({
    schemaVersion: z.literal('kolk-catalog.v1'),
    publicBeta: z.object({
      minLevel: z.number().int(),
      maxLevel: z.number().int(),
      rankedMinLevel: z.number().int(),
      rankedMaxLevel: z.number().int(),
      anonymousMaxLevel: z.number().int(),
      authRequiredFromLevel: z.number().int(),
    }),
    completionContract: CompletionContractSchema,
    catalogScope: z.literal('level_family_static'),
    variantsMayDifferBySeed: z.boolean(),
    liveContractPath: z.string().min(1),
    levels: z.array(CatalogLevelEntrySchema).min(1),
  })
  .loose();

// ── Surface 5: quota (kolk-quota.v1) ────────────────────────────────────────

export const QuotaResponseSchema = z
  .object({
    schemaVersion: z.literal('kolk-quota.v1'),
    status: z.enum(['signed_in', 'anonymous']),
    identity: z.record(z.string(), z.unknown()),
    serverNowUtc: z.string().datetime(),
    limits: z.object({
      perAttemptTokenMinute: z.number().int().positive(),
      perAttemptTokenHour: z.number().int().positive(),
      perAttemptTokenRetry: z.number().int().positive(),
      perIdentityDay: z.number().int().positive(),
    }),
    perIdentityDay: z
      .object({
        dayBucketPt: z.string(),
        used: z.number().int().min(0),
        max: z.number().int().positive(),
        remaining: z.number().int().min(0),
        resetsAtUtc: z.string().datetime(),
        frozen: z.boolean(),
        frozenUntil: z.string().nullable(),
        freezeReason: z.string().nullable(),
      })
      .nullable(),
    perAttemptToken: z
      .object({
        attemptToken: z.string().min(1),
        level: z.number().int().nullable(),
        challengeStartedAtUtc: z.string().nullable(),
        deadlineUtc: z.string().nullable(),
        expired: z.boolean(),
        consumedAt: z.string().nullable(),
        minute: z.object({
          used: z.number().int().min(0),
          max: z.number().int().positive(),
          remaining: z.number().int().min(0),
        }),
        hour: z.object({
          used: z.number().int().min(0),
          max: z.number().int().positive(),
          remaining: z.number().int().min(0),
        }),
        retry: z.object({
          used: z.number().int().min(0),
          max: z.number().int().positive(),
          remaining: z.number().int().min(0),
        }),
      })
      .nullable(),
  })
  .loose();

// ── Public registry of every served schema ──────────────────────────────────

export type ContractSchemaSlug =
  | 'automation-manifest.v1'
  | 'agent-context.v2'
  | 'submit-result.v2'
  | 'catalog.v1'
  | 'quota.v1';

const SCHEMAS: Record<ContractSchemaSlug, z.ZodTypeAny> = {
  'automation-manifest.v1': AutomationManifestSchema,
  'agent-context.v2': AgentContextSchema,
  'submit-result.v2': SubmitResultSchema,
  'catalog.v1': CatalogResponseSchema,
  'quota.v1': QuotaResponseSchema,
};

export function getContractSchema(slug: ContractSchemaSlug): z.ZodTypeAny {
  return SCHEMAS[slug];
}

export function listContractSchemaSlugs(): ContractSchemaSlug[] {
  return Object.keys(SCHEMAS) as ContractSchemaSlug[];
}
