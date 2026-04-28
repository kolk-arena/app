/**
 * Kolk Arena — public level metadata registry.
 *
 * This runtime surface intentionally exposes only the current public beta levels.
 * Future level design and operator planning belong outside the public tree.
 */

import type { DifficultyBand, DeliverableFamily, Layer1CheckName, LevelDefinition } from '../types';

function def(
  level: number,
  name: string,
  family: DeliverableFamily,
  band: DifficultyBand,
  opts: {
    passThreshold: number;
    timeLimitMinutes: number;
    isBoss?: boolean;
    bossSpecial?: string;
    coverageTargets: string[];
    layer1Checks: Layer1CheckName[];
    generatorPrompt: string;
  },
): LevelDefinition {
  return {
    level,
    name,
    family,
    band,
    passThreshold: opts.passThreshold,
    timeLimitMinutes: opts.timeLimitMinutes,
    isBoss: opts.isBoss ?? false,
    bossSpecial: opts.bossSpecial,
    coverageTargets: opts.coverageTargets,
    layer1Checks: opts.layer1Checks,
    generatorPrompt: opts.generatorPrompt,
  };
}

const L0 = def(0, 'Hello World', 'connectivity_check', 'A', {
  passThreshold: 0,
  timeLimitMinutes: 1440,
  coverageTargets: ['contains_hello_or_kolk'],
  layer1Checks: [],
  generatorPrompt: 'Return any text containing Hello or Kolk.',
});

const L1 = def(1, 'Quick Translate', 'txt_translation', 'A', {
  passThreshold: 65,
  timeLimitMinutes: 30,
  coverageTargets: ['language_match', 'completeness', 'key_terms'],
  layer1Checks: ['lang_detect', 'fact_xref', 'term_guard'],
  generatorPrompt:
    'Generate a 1-page article (300-500 words) in {{source_lang}} about a {{industry}} in {{city}}. Include key terms: {{key_terms}}. The agent must translate it to {{target_lang}}.',
});

const L2 = def(2, 'Biz Bio', 'biz_bio', 'A', {
  passThreshold: 65,
  timeLimitMinutes: 30,
  coverageTargets: [
    'google_maps_description',
    'instagram_bio_fields',
    'required_mentions',
    'placeholder_url',
    'format_compliance',
  ],
  layer1Checks: ['lang_detect', 'item_count', 'fact_xref', 'term_guard'],
  generatorPrompt:
    'Generate a business brief for {{business_name}} in {{city}}. The deliverable is a Google Maps description plus an Instagram bio package with required fields and a placeholder URL.',
});

const L3 = def(3, 'Business Profile', 'structured_plan', 'A', {
  passThreshold: 65,
  timeLimitMinutes: 30,
  coverageTargets: [
    'intro_section',
    'services_section',
    'cta_section',
    'business_facts',
    'format_compliance',
  ],
  layer1Checks: ['fact_xref', 'term_guard'],
  generatorPrompt:
    'Generate a one-page business profile brief requiring exact Intro, Services, and CTA sections plus a fixed business-facts list.',
});

const L4 = def(4, 'Travel Itinerary', 'structured_plan', 'B', {
  passThreshold: 65,
  timeLimitMinutes: 30,
  coverageTargets: [
    'trip_days',
    'day_structure',
    'budget_line',
    'tip_line',
    'constraint_handling',
  ],
  layer1Checks: ['math_verify', 'item_count', 'fact_xref', 'term_guard'],
  generatorPrompt:
    'Generate a {{trip_days}}-day travel itinerary brief with Morning, Afternoon, Evening, Budget, and Tip requirements for each day.',
});

const L5 = def(5, 'Welcome Kit', 'json_bundle', 'B', {
  passThreshold: 65,
  timeLimitMinutes: 30,
  coverageTargets: [
    'whatsapp_message',
    'quick_facts',
    'first_step_checklist',
    'cross_bundle_consistency',
    'json_structure',
  ],
  layer1Checks: ['json_string_fields'],
  generatorPrompt:
    'Generate a welcome-kit brief whose entire submission body must be a JSON object string with whatsapp_message, quick_facts, and first_step_checklist.',
});

const L6 = def(6, 'Pro One-Page', 'landing_page_copy', 'B', {
  passThreshold: 70,
  timeLimitMinutes: 25,
  coverageTargets: ['hero_section', 'services', 'cta', 'contact', 'professional_tone'],
  layer1Checks: ['item_count', 'fact_xref', 'term_guard'],
  generatorPrompt:
    'Generate a brief for a one-page professional service site for {{business_name}} ({{industry}} in {{city}}). Must include hero, services ({{service_count}} items), CTA, and contact section. Output: structured markdown.',
});

const L7 = def(7, 'AI Prompt Pack', 'structured_plan', 'B', {
  passThreshold: 70,
  timeLimitMinutes: 25,
  coverageTargets: [
    'prompt_count',
    'style_rules',
    'forbidden_mistakes',
    'negative_prompts',
    'format_compliance',
  ],
  layer1Checks: ['item_count', 'fact_xref', 'term_guard'],
  generatorPrompt:
    'Generate a prompt-pack brief that requires exactly 8 prompts, 2 style rules, 2 forbidden mistakes, and one negative prompt line per prompt.',
});

const L8 = def(8, 'Complete Business Package', 'multi_asset_text_bundle', 'B', {
  passThreshold: 70,
  timeLimitMinutes: 25,
  coverageTargets: [
    'one_page_copy',
    'prompt_pack',
    'whatsapp_welcome',
    'cross_document_consistency',
    'header_structure',
  ],
  layer1Checks: ['header_keyword_match'],
  generatorPrompt:
    'Generate a complete business-package brief requiring One-Page Copy, Prompt Pack, and WhatsApp Welcome in one header-structured text package.',
});

export const LEVEL_DEFINITIONS: readonly LevelDefinition[] = [
  L0,
  L1,
  L2,
  L3,
  L4,
  L5,
  L6,
  L7,
  L8,
] as const;

/** Get a public beta level definition by number (0-8). Throws if not found. */
export function getLevel(level: number): LevelDefinition {
  const definition = LEVEL_DEFINITIONS.find((candidate) => candidate.level === level);
  if (!definition) {
    throw new Error(`Level ${level} is outside the current public beta level set`);
  }
  return definition;
}

/** Whether a level is allowed to activate a deterministic Layer 1 check. */
export function levelUsesLayer1Check(level: number, check: Layer1CheckName): boolean {
  return getLevel(level).layer1Checks.includes(check);
}

/** Get the configured 24h/session-aware time target for a level. */
export function getTimeLimit(level: number): number {
  return getLevel(level).timeLimitMinutes;
}

/** Boss mechanics are not part of the current public beta level set. */
export function isBossLevel(level: number): boolean {
  return getLevel(level).isBoss;
}

/** Legacy metadata only; beta unlock logic uses Dual-Gate scoring. */
export function getPassThreshold(level: number): number {
  return getLevel(level).passThreshold;
}
