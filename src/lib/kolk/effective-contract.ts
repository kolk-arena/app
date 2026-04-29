import { MAX_PRIMARY_TEXT_CHARS } from './constants';
import { getAgentLevelContract } from './agent-contract';
import type { DeliverableFamily, Layer1CheckName } from './types';

const DEFAULT_FACT_SOURCE_KEYS = ['key_facts', 'facts', 'business_facts', 'required_mentions'];
const PROHIBITED_TERM_KEYS = ['prohibited_terms'];

type StructuredBrief = Record<string, unknown>;

export type EffectiveOutputSchema = {
  primaryText: {
    type: 'string';
    maxChars: number;
    format: 'plain_text' | 'markdown' | 'json_object_string' | 'prompt_defined';
  };
  outputKind: DeliverableFamily;
  contract: string[];
  requiredJsonStringFields?: string[];
};

export type EffectiveBrief = {
  sourceOfTruth: 'live_fetch';
  promptMdPath: '$.challenge.promptMd';
  taskJsonPath: '$.challenge.taskJson';
  structuredBriefPath: '$.challenge.taskJson.structured_brief';
  canonicalFactsPath: '$.challenge.taskJson.structured_brief';
  scoringSource: string;
  conflictPolicy: string;
  variantFamily: string | null;
  factSourceKeys: string[];
  availableFactSourceKeys: string[];
  preserveSourcePaths: string[];
};

export type EffectiveBlockingCheck = {
  name: string;
  gate: 'blocking';
  source: 'deterministic_l0' | 'deterministic_layer1';
  active: boolean;
  sourcePaths: string[];
  reason: string;
  expected?: unknown;
};

export type EffectiveAdvisoryFlag = {
  name: string;
  gate: 'advisory';
  source: 'ai_judge';
  reason: string;
};

export type EffectiveChecks = {
  blockingChecks: EffectiveBlockingCheck[];
  advisoryFlags: EffectiveAdvisoryFlag[];
  judgePenalties: {
    source: 'ai_judge';
    appliesAfter: 'blockingChecksPass';
    flags: string[];
  };
};

export type EffectiveAgentContract = {
  effectiveOutputSchema: EffectiveOutputSchema;
  effectiveBrief: EffectiveBrief;
  effectiveChecks: EffectiveChecks;
};

export type CollectedFactSources = {
  facts: string[];
  availableFactSourceKeys: string[];
  preserveSourcePaths: string[];
};

export function asStructuredBrief(value: unknown): StructuredBrief {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as StructuredBrief
    : {};
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function firstFiniteNumber(...values: Array<{ path: string; value: unknown }>) {
  for (const entry of values) {
    const parsed = typeof entry.value === 'number' ? entry.value : Number(entry.value);
    if (Number.isFinite(parsed)) {
      return { path: entry.path, value: parsed };
    }
  }
  return null;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

export function getFactSourceKeysForLevel(level: number): string[] {
  if (level === 0) return [];
  return getAgentLevelContract(level)?.factSourceKeys ?? DEFAULT_FACT_SOURCE_KEYS;
}

export function collectFactSources(
  structuredBrief: StructuredBrief,
  factSourceKeys: string[],
): CollectedFactSources {
  const facts: string[] = [];
  const availableFactSourceKeys: string[] = [];
  const preserveSourcePaths: string[] = [];

  for (const key of factSourceKeys) {
    const value = structuredBrief[key];
    if (!Array.isArray(value)) continue;
    const strings = uniqueStrings(value.filter((entry): entry is string => typeof entry === 'string'));
    if (strings.length === 0) continue;
    availableFactSourceKeys.push(key);
    preserveSourcePaths.push(`$.challenge.taskJson.structured_brief.${key}`);
    facts.push(...strings);
  }

  return {
    facts: uniqueStrings(facts),
    availableFactSourceKeys,
    preserveSourcePaths,
  };
}

export function getTargetLanguage(structuredBrief: StructuredBrief): string | null {
  return firstString(
    structuredBrief.target_lang,
    structuredBrief.target_language,
    structuredBrief.locale,
  );
}

function getPrimaryTextFormat(level: number): EffectiveOutputSchema['primaryText']['format'] {
  if (level === 5) return 'json_object_string';
  if ([3, 4, 6, 7, 8].includes(level)) return 'markdown';
  if (level === 2) return 'prompt_defined';
  return 'plain_text';
}

export function buildEffectiveOutputSchema({
  level,
  outputKind,
  outputContract,
}: {
  level: number;
  outputKind: DeliverableFamily;
  outputContract: string[];
}): EffectiveOutputSchema {
  return {
    primaryText: {
      type: 'string',
      maxChars: MAX_PRIMARY_TEXT_CHARS,
      format: getPrimaryTextFormat(level),
    },
    outputKind,
    contract: outputContract,
    ...(level === 5
      ? {
          requiredJsonStringFields: [
            'whatsapp_message',
            'quick_facts',
            'first_step_checklist',
          ],
        }
      : {}),
  };
}

export function buildEffectiveBrief({
  structuredBrief,
  factSourceKeys,
  variantFamily,
}: {
  structuredBrief: StructuredBrief;
  factSourceKeys: string[];
  variantFamily: string | null;
}): EffectiveBrief {
  const factSources = collectFactSources(structuredBrief, factSourceKeys);

  return {
    sourceOfTruth: 'live_fetch',
    promptMdPath: '$.challenge.promptMd',
    taskJsonPath: '$.challenge.taskJson',
    structuredBriefPath: '$.challenge.taskJson.structured_brief',
    canonicalFactsPath: '$.challenge.taskJson.structured_brief',
    scoringSource:
      'Use taskJson.structured_brief for structured facts, counts, target language, URLs, and numeric source values. Use promptMd for the human-facing delivery request when it does not conflict with structured fields.',
    conflictPolicy:
      'If promptMd and taskJson disagree, taskJson.structured_brief wins for facts, counts, target language, URLs, and numeric values; effectiveOutputSchema wins for required primaryText shape.',
    variantFamily,
    factSourceKeys,
    availableFactSourceKeys: factSources.availableFactSourceKeys,
    preserveSourcePaths: factSources.preserveSourcePaths,
  };
}

export function buildEffectiveChecks({
  level,
  layer1Checks,
  structuredBrief,
  factSourceKeys,
}: {
  level: number;
  layer1Checks: Layer1CheckName[];
  structuredBrief: StructuredBrief;
  factSourceKeys: string[];
}): EffectiveChecks {
  const enabled = new Set(layer1Checks);
  const blockingChecks: EffectiveBlockingCheck[] = [];
  const targetLanguage = getTargetLanguage(structuredBrief);
  const budgetTotal = firstFiniteNumber({
    path: '$.challenge.taskJson.structured_brief.budget_total',
    value: structuredBrief.budget_total,
  });
  const itemCount = firstFiniteNumber(
    { path: '$.challenge.taskJson.structured_brief.item_count', value: structuredBrief.item_count },
    { path: '$.challenge.taskJson.structured_brief.prompt_count', value: structuredBrief.prompt_count },
    { path: '$.challenge.taskJson.structured_brief.trip_days', value: structuredBrief.trip_days },
    { path: '$.challenge.taskJson.structured_brief.days', value: structuredBrief.days },
  );
  const factSources = collectFactSources(structuredBrief, factSourceKeys);
  const prohibitedTerms = collectFactSources(structuredBrief, PROHIBITED_TERM_KEYS);

  if (level === 0) {
    blockingChecks.push({
      name: 'contains_hello_or_kolk',
      gate: 'blocking',
      source: 'deterministic_l0',
      active: true,
      sourcePaths: ['$.challenge.promptMd'],
      expected: 'primaryText contains Hello or Kolk, case-insensitive',
      reason: 'L0 connectivity check is deterministic and does not use the AI judge.',
    });
  }

  if (enabled.has('lang_detect')) {
    blockingChecks.push({
      name: 'lang_detect',
      gate: 'blocking',
      source: 'deterministic_layer1',
      active: Boolean(targetLanguage),
      sourcePaths: ['$.challenge.taskJson.structured_brief.target_lang', '$.challenge.taskJson.structured_brief.target_language'],
      expected: targetLanguage,
      reason: targetLanguage
        ? 'Output language must match the live structured brief target language.'
        : 'Inactive because this live brief does not declare a target language.',
    });
  }

  if (enabled.has('math_verify')) {
    blockingChecks.push({
      name: 'math_verify',
      gate: 'blocking',
      source: 'deterministic_layer1',
      active: Boolean(budgetTotal),
      sourcePaths: budgetTotal ? [budgetTotal.path] : ['$.challenge.taskJson.structured_brief.budget_total'],
      expected: budgetTotal?.value,
      reason: budgetTotal
        ? 'Explicit currency / JSON cost fields must add up to the live budget_total.'
        : 'Inactive because this live brief does not declare budget_total.',
    });
  }

  if (enabled.has('item_count')) {
    blockingChecks.push({
      name: 'item_count',
      gate: 'blocking',
      source: 'deterministic_layer1',
      active: Boolean(itemCount),
      sourcePaths: itemCount
        ? [itemCount.path]
        : [
            '$.challenge.taskJson.structured_brief.item_count',
            '$.challenge.taskJson.structured_brief.prompt_count',
            '$.challenge.taskJson.structured_brief.trip_days',
            '$.challenge.taskJson.structured_brief.days',
          ],
      expected: itemCount?.value,
      reason: itemCount
        ? 'The deterministic item counter uses the live structured count field.'
        : 'Inactive because this live brief does not declare an item count field.',
    });
  }

  if (enabled.has('fact_xref')) {
    blockingChecks.push({
      name: 'fact_xref',
      gate: 'blocking',
      source: 'deterministic_layer1',
      active: factSources.facts.length > 0,
      sourcePaths: factSources.preserveSourcePaths,
      expected: factSources.facts.length > 0 ? `${factSources.facts.length} fact string(s)` : undefined,
      reason: factSources.facts.length > 0
        ? 'Submission should preserve the live structured fact strings.'
        : 'Inactive because none of this level’s factSourceKeys are present as string arrays in the live brief.',
    });
  }

  if (enabled.has('term_guard')) {
    blockingChecks.push({
      name: 'term_guard',
      gate: 'blocking',
      source: 'deterministic_layer1',
      active: prohibitedTerms.facts.length > 0,
      sourcePaths: prohibitedTerms.preserveSourcePaths,
      expected: prohibitedTerms.facts.length > 0 ? `${prohibitedTerms.facts.length} prohibited term(s)` : undefined,
      reason: prohibitedTerms.facts.length > 0
        ? 'Submission must avoid the live prohibited terms.'
        : 'Inactive because this live brief does not declare prohibited_terms.',
    });
  }

  if (enabled.has('json_string_fields')) {
    blockingChecks.push({
      name: 'json_string_fields',
      gate: 'blocking',
      source: 'deterministic_layer1',
      active: true,
      sourcePaths: ['$.challenge.taskJson.structured_brief', '$.agentContext.effectiveOutputSchema'],
      expected: ['whatsapp_message', 'quick_facts', 'first_step_checklist'],
      reason: 'primaryText must parse as a JSON object string with required string-valued fields.',
    });
  }

  if (enabled.has('header_keyword_match')) {
    blockingChecks.push({
      name: 'header_keyword_match',
      gate: 'blocking',
      source: 'deterministic_layer1',
      active: true,
      sourcePaths: ['$.agentContext.effectiveOutputSchema'],
      expected: ['copy', 'prompt', 'whatsapp'],
      reason: 'Top-level Markdown headers must include the required package keywords.',
    });
  }

  const advisoryFlags: EffectiveAdvisoryFlag[] = [
    {
      name: 'added_content',
      gate: 'advisory',
      source: 'ai_judge',
      reason: 'Extra prefaces, notes, or unsupported claims may reduce coverage or quality.',
    },
    {
      name: 'hallucinated_facts',
      gate: 'advisory',
      source: 'ai_judge',
      reason: 'Facts not present in promptMd, taskJson, structured_brief, or preserveSourcePaths may reduce quality.',
    },
    {
      name: 'prompt_injection',
      gate: 'advisory',
      source: 'ai_judge',
      reason: 'Judge-facing instructions in primaryText may reduce coverage.',
    },
    {
      name: 'missing_required_content',
      gate: 'advisory',
      source: 'ai_judge',
      reason: 'Missing requested content can reduce coverage and block Dual-Gate unlock.',
    },
  ];

  return {
    blockingChecks,
    advisoryFlags,
    judgePenalties: {
      source: 'ai_judge',
      appliesAfter: 'blockingChecksPass',
      flags: advisoryFlags.map((flag) => flag.name),
    },
  };
}

export function buildEffectiveAgentContract({
  level,
  outputKind,
  outputContract,
  layer1Checks,
  structuredBrief,
  factSourceKeys,
  variantFamily,
}: {
  level: number;
  outputKind: DeliverableFamily;
  outputContract: string[];
  layer1Checks: Layer1CheckName[];
  structuredBrief: StructuredBrief;
  factSourceKeys: string[];
  variantFamily: string | null;
}): EffectiveAgentContract {
  return {
    effectiveOutputSchema: buildEffectiveOutputSchema({ level, outputKind, outputContract }),
    effectiveBrief: buildEffectiveBrief({ structuredBrief, factSourceKeys, variantFamily }),
    effectiveChecks: buildEffectiveChecks({ level, layer1Checks, structuredBrief, factSourceKeys }),
  };
}

export function buildJudgeSourceBrief({
  promptMd,
  taskJson,
  structuredBrief,
  factSourceKeys,
}: {
  promptMd: string;
  taskJson: Record<string, unknown>;
  structuredBrief: StructuredBrief;
  factSourceKeys: string[];
}): string {
  const factSources = collectFactSources(structuredBrief, factSourceKeys);
  return JSON.stringify({
    promptMd,
    taskJson,
    structuredBrief,
    preserveKeyFacts: factSources.facts,
    preserveSourcePaths: factSources.preserveSourcePaths,
    hallucinationPolicy:
      'Do not flag hallucinated_facts for names, addresses, prices, phone numbers, URLs, menu items, counts, or claims that appear anywhere in promptMd, taskJson, structuredBrief, preserveKeyFacts, or preserveSourcePaths.',
  }, null, 2);
}
