/**
 * Gig posting preview — AI generation + translation
 *
 * Hardening note (2026-04-23): LLM output goes through two Zod schemas
 * before anything is cast to a typed object. The prior `as GeneratedBrief[]`
 * cast made `[1,2,3]` or `{...}` (scalar) or a shape-drift response from
 * the model compile but crash at first field access. Now we validate
 * shape + field types + array lengths at the JSON boundary so any drift
 * surfaces as a clean "Expected 8 briefs, got …" or per-field error
 * that the cron route's outer QC can log and the retry loop can handle.
 */

import { z } from 'zod';
import {
  createChatCompletion,
  createContentGeneration,
  getChatRuntime,
  getContentRuntime,
  type ContentRuntime,
} from '@/lib/kolk/ai/runtime';
import type { FrontendLocale } from '@/i18n/types';
import { BRIEF_SHOWCASE_CONFIG } from './config';

const GeneratedBriefSchema = z.object({
  level: z.number().int().min(2).max(8),
  scenarioTitle: z.string().min(1),
  industry: z.string(),
  fictionalRequesterName: z.string(),
  requesterRole: z.string(),
  requestContext: z.string().min(1),
  scoringFocus: z.array(z.string()).min(1),
  outputShape: z.array(z.string()).min(1),
});

const GeneratedBriefsSchema = z.array(GeneratedBriefSchema).length(8);

const TranslationItemSchema = z.object({
  scenarioTitle: z.string().min(1),
  industry: z.string().min(1),
  requesterRole: z.string().min(1),
  requestContext: z.string().min(1),
  scoringFocus: z.array(z.string()).min(1),
  outputShape: z.array(z.string()).min(1),
});

const TranslationsSchema = z.array(TranslationItemSchema);

export type GeneratedBrief = z.infer<typeof GeneratedBriefSchema>;
type TranslatedBrief = Pick<GeneratedBrief, 'scenarioTitle' | 'industry' | 'requesterRole' | 'requestContext' | 'scoringFocus' | 'outputShape'>;

const LEVELS = [2, 3, 4, 5, 6, 7, 8] as const;

// Service types and typical market budget ranges (USD)
// AI chooses budget based on service complexity, not LEVEL alone
const SERVICE_BUDGET_RANGES = `
Service types and typical USD market ranges:
- Email/Copywriting: $50–150 (urgent communication, brand voice matching)
- API/Integration: $250–600 (technical setup, webhook coordination)
- System/Automation: $400–900 (complex logic, multi-step scripts)
- Compliance/Audit: $300–700 (regulatory checks, formatting)
- Translation/Localization: $200–500 (context-aware translation)
- Data Analysis/Reporting: $300–650 (data extraction, visualization, insights)
` as const;

function pickLevels(count: number): number[] {
  const pool = [...LEVELS];
  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    result.push(pool[idx]);
    pool.splice(idx, 1);
    if (pool.length === 0) pool.push(...LEVELS);
  }
  return result;
}

const SYSTEM_PROMPT = `You generate synthetic Gig postings for the Kolk AI Workspace.
Kolk is an AI gig economy platform where AI agents build a commercial track record by taking on real-world business tasks, shipping code/assets via API, and getting paid.
These gigs must perfectly mimic job postings on platforms like Upwork or Fiverr: what the client urgently needs, strict acceptance criteria, and exact deliverables.

${SERVICE_BUDGET_RANGES}

Each gig must follow these rules:
1. scenarioTitle: Write it like a catchy freelancer job board title. Focus on the ACTION and URGENCY. Examples: "URGENT: Python Script for Web Scraping" or "Need High-Converting Sales Email Sequence". Do NOT include the budget in the title.
2. requestContext: Write in the voice of a stressed, busy business client. Lead with their pain point, tight schedule, and explicitly state what they expect to be shipped. Include exactly one USD budget in this field as a natural client sentence, e.g. "Budget is $300." or "I can pay $300 for this."
3. budget: Choose a realistic USD amount based on the SERVICE TYPE complexity, not the level alone. Since the JSON shape has no budget key, the chosen budget must appear in requestContext and must not appear in scenarioTitle.
4. scoringFocus (maps to "Acceptance Criteria" in UI): Provide 2–3 strict, measurable business requirements. Examples: "Zero syntax errors", "Must pass CAN-SPAM compliance", "Load time under 200ms".
5. outputShape (maps to "Deliverables" in UI): Provide 2–4 concrete assets the AI must return. Examples: "1x fully commented .py file", "JSON object with extracted fields", "HTML email template".

Output STRICTLY as a JSON array of 8 objects with this shape:
[{
  "level": number (2-8),
  "scenarioTitle": string,
  "industry": string,
  "fictionalRequesterName": string,
  "requesterRole": string,
  "requestContext": string,
  "scoringFocus": string[],
  "outputShape": string[]
}]

Rules:
- Match the requested level list exactly.
- Always use USD for currency in all gigs, written with a dollar sign in requestContext, e.g. "$300".
- Budget should reflect service complexity and scope.
- Do not include budget, price, "USD", "$", or payment language in scenarioTitle.
- No markdown fences or commentary outside the JSON.
- Vary industries, startup vs enterprise contexts, and client tones (frustrated, precise, hurried).
- scenarioTitle should sound like a real marketplace gig title with urgency or deadline (be direct and specific).
- Do not include active challenge IDs, attempt tokens, scoring rubrics, benchmark language, testing language, or implementation details.`;

async function generateEnglishBriefs(levels: number[]): Promise<GeneratedBrief[]> {
  const provider = BRIEF_SHOWCASE_CONFIG.provider;

  if (provider === 'p3') {
    const runtime = getContentRuntime(BRIEF_SHOWCASE_CONFIG.model);
    if (!runtime) throw new Error('Content provider not configured');
    return generateWithContentRuntime(levels, runtime);
  }

  const runtime = getChatRuntime(provider, BRIEF_SHOWCASE_CONFIG.model);
  if (!runtime) throw new Error(`Provider ${provider} not configured`);

  const response = await createChatCompletion(runtime, {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Generate 8 live gig postings matching these levels in order: ${JSON.stringify(levels)}.
For each gig, assign a realistic USD budget based on the SERVICE TYPE (refer to the system prompt ranges).
Make the requestContext sound like a real client who needs this done ASAP.
Put the budget exactly once in requestContext only; do not include the budget in scenarioTitle.
Return ONLY the JSON array.` },
    ],
    maxTokens: 4096,
    temperature: 0.9,
  });

  const raw = response.choices?.[0]?.message?.content ?? '';
  return parseBriefJson(raw);
}

async function generateWithContentRuntime(
  levels: number[],
  runtime: ContentRuntime,
): Promise<GeneratedBrief[]> {
  const raw = await createContentGeneration(runtime, {
    systemPrompt: SYSTEM_PROMPT,
    userContent: `Generate 8 live gig postings matching these levels in order: ${JSON.stringify(levels)}.
For each gig, assign a realistic USD budget based on the SERVICE TYPE (refer to the system prompt ranges).
Make the requestContext sound like a real client who needs this done ASAP.
Put the budget exactly once in requestContext only; do not include the budget in scenarioTitle.
Return ONLY the JSON array.`,
    maxTokens: 4096,
    temperature: 0.9,
  });

  return parseBriefJson(raw);
}

function parseBriefJson(raw: string): GeneratedBrief[] {
  const cleaned = raw.replace(/^\s*```json?\s*/, '').replace(/\s*```\s*$/, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Model returned invalid JSON: ${err instanceof Error ? err.message : 'parse failed'}`);
  }
  const result = GeneratedBriefsSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    const location = issue?.path?.length ? issue.path.join('.') : '<root>';
    throw new Error(`Generated briefs failed shape validation at ${location}: ${issue?.message ?? 'unknown'}`);
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// Translation
// ---------------------------------------------------------------------------

const TRANSLATION_PROMPT = `Translate the following synthetic gig posting previews into the target locale.
Maintain a professional, natural tone appropriate for the service industry.
Preserve fictional names, URLs, Kolk AI Workspace, Kolk, level labels, API, JSON, HTTP, attemptToken, and primaryText as-is.
Preserve the rule that scenarioTitle contains no budget while requestContext contains the USD budget.

Translate scenarioTitle, industry, requesterRole, requestContext, scoringFocus, and outputShape.
Preserve fictionalRequesterName exactly if it appears in the input.

Output STRICTLY as a JSON array with the same order:
[{ "scenarioTitle": "...", "industry": "...", "requesterRole": "...", "requestContext": "...", "scoringFocus": ["..."], "outputShape": ["..."] }, ...]

No markdown fences, no commentary.`;

async function translateBriefs(
  briefs: GeneratedBrief[],
  locale: FrontendLocale,
): Promise<TranslatedBrief[]> {
  const provider = BRIEF_SHOWCASE_CONFIG.provider;
  const items = briefs.map((b) => ({
    scenarioTitle: b.scenarioTitle,
    industry: b.industry,
    fictionalRequesterName: b.fictionalRequesterName,
    requesterRole: b.requesterRole,
    requestContext: b.requestContext,
    scoringFocus: b.scoringFocus,
    outputShape: b.outputShape,
  }));

  if (provider === 'p3') {
    const runtime = getContentRuntime(BRIEF_SHOWCASE_CONFIG.model);
    if (!runtime) throw new Error('Content provider not configured');
    return translateWithContentRuntime(items, locale, runtime);
  }

  const runtime = getChatRuntime(provider, BRIEF_SHOWCASE_CONFIG.model);
  if (!runtime) throw new Error(`Provider ${provider} not configured`);

  const localeName =
    locale === 'zh-tw' ? 'Traditional Chinese (Taiwan)' :
    locale === 'es-mx' ? 'Mexican Spanish' : 'English';

  const response = await createChatCompletion(runtime, {
    messages: [
      { role: 'system', content: TRANSLATION_PROMPT },
      { role: 'user', content: `Target locale: ${localeName}\n\n${JSON.stringify(items, null, 2)}` },
    ],
    maxTokens: 4096,
    temperature: 0.4,
  });

  const raw = response.choices?.[0]?.message?.content ?? '';
  return parseTranslationJson(raw);
}

async function translateWithContentRuntime(
  items: Pick<GeneratedBrief, 'scenarioTitle' | 'industry' | 'fictionalRequesterName' | 'requesterRole' | 'requestContext' | 'scoringFocus' | 'outputShape'>[],
  locale: FrontendLocale,
  runtime: ContentRuntime,
): Promise<TranslatedBrief[]> {
  const localeName =
    locale === 'zh-tw' ? 'Traditional Chinese (Taiwan)' :
    locale === 'es-mx' ? 'Mexican Spanish' : 'English';

  const raw = await createContentGeneration(runtime, {
    systemPrompt: TRANSLATION_PROMPT,
    userContent: `Target locale: ${localeName}\n\n${JSON.stringify(items, null, 2)}`,
    maxTokens: 4096,
    temperature: 0.4,
  });
  return parseTranslationJson(raw);
}

function parseTranslationJson(raw: string): TranslatedBrief[] {
  const cleaned = raw.replace(/^\s*```json?\s*/, '').replace(/\s*```\s*$/, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Translator returned invalid JSON: ${err instanceof Error ? err.message : 'parse failed'}`);
  }
  const result = TranslationsSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    const location = issue?.path?.length ? issue.path.join('.') : '<root>';
    throw new Error(`Translated briefs failed shape validation at ${location}: ${issue?.message ?? 'unknown'}`);
  }
  return result.data;
}

function flattenTranslationText(item: TranslatedBrief): string {
  return [
    item.scenarioTitle,
    item.industry,
    item.requesterRole,
    item.requestContext,
    ...item.scoringFocus,
    ...item.outputShape,
  ].join(' ');
}

function normalizeForTranslationComparison(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{Letter}\p{Number}$]+/gu, ' ')
    .trim();
}

const traditionalChineseTextPattern = /[\u3400-\u9fff]/;
const mexicanSpanishSignalPattern =
  /[¿¡áéíóúñü]|\b(?:el|la|los|las|un|una|para|que|necesit[ao]|presupuesto|entrega|cliente|clientes|debe|antes|hoy|mañana)\b/i;

function assertTranslationQuality(source: GeneratedBrief[], translated: TranslatedBrief[], locale: FrontendLocale): void {
  if (locale === 'en') return;

  if (translated.length !== source.length) {
    throw new Error(`expected ${source.length} ${locale} translations, got ${translated.length}`);
  }

  let spanishSignalCount = 0;

  translated.forEach((item, index) => {
    const sourceItem = source[index];
    const translatedText = flattenTranslationText(item);
    const sourceText = flattenTranslationText(sourceItem);
    const sameTitle = normalizeForTranslationComparison(item.scenarioTitle) === normalizeForTranslationComparison(sourceItem.scenarioTitle);
    const sameContext = normalizeForTranslationComparison(item.requestContext) === normalizeForTranslationComparison(sourceItem.requestContext);

    if (sameTitle && sameContext) {
      throw new Error(`${locale} translation ${index} kept the English title and request context`);
    }

    if (normalizeForTranslationComparison(translatedText) === normalizeForTranslationComparison(sourceText)) {
      throw new Error(`${locale} translation ${index} is identical to the English source`);
    }

    if (locale === 'zh-tw' && !traditionalChineseTextPattern.test(translatedText)) {
      throw new Error(`zh-tw translation ${index} has no CJK text`);
    }

    if (locale === 'es-mx' && mexicanSpanishSignalPattern.test(translatedText)) {
      spanishSignalCount += 1;
    }
  });

  if (locale === 'es-mx' && spanishSignalCount < Math.ceil(translated.length * 0.75)) {
    throw new Error(`es-mx translations failed Spanish signal check: ${spanishSignalCount}/${translated.length}`);
  }
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

export interface ShowcaseGenerationResult {
  briefs: GeneratedBrief[];
  translations: Record<string, { title: string; industry: string; ceo_title: string; request_context: string; scoring_focus: string[]; output_shape: string[] }[]>;
}

export async function generateShowcaseBatch(): Promise<ShowcaseGenerationResult> {
  const levels = pickLevels(8);
  const englishBriefs = await generateEnglishBriefs(levels);

  const translations: Record<string, { title: string; industry: string; ceo_title: string; request_context: string; scoring_focus: string[]; output_shape: string[] }[]> = {};

  const targetLocales = BRIEF_SHOWCASE_CONFIG.locales.filter((l) => l !== 'en');
  for (const locale of targetLocales) {
    try {
      const translated = await translateBriefs(englishBriefs, locale);
      assertTranslationQuality(englishBriefs, translated, locale);
      translations[locale] = translated.map((t) => ({
        title: t.scenarioTitle,
        industry: t.industry,
        ceo_title: t.requesterRole,
        request_context: t.requestContext,
        scoring_focus: t.scoringFocus,
        output_shape: t.outputShape,
      }));
    } catch (err) {
      console.error(`[brief-showcase] Translation failed for ${locale}:`, err);
      throw new Error(`Translation failed for ${locale}: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  return { briefs: englishBriefs, translations };
}
