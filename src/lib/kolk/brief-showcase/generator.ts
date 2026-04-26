/**
 * ChallengeBrief Preview — AI generation + translation
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
import { getOpenAICompatibleRuntime, getGeminiRuntime } from '@/lib/kolk/ai/runtime';
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

const LEVELS = [2, 3, 4, 5, 6, 7, 8] as const;

// Service types and typical market budget ranges (USD)
// AI chooses budget based on service complexity, not LEVEL alone
const SERVICE_BUDGET_RANGES = `
Service types and typical USD market ranges:
- Email/Brief drafting: $50–150 (simple, structured communication)
- Copy/Marketing content: $150–400 (longer-form, brand voice needed)
- API/Integration: $250–600 (technical setup, multi-system coordination)
- System/Automation: $400–900 (complex logic, multiple workflows)
- Compliance/Audit: $300–700 (regulatory research, cross-jurisdiction)
- Translation (multi-language): $200–500 (per language or multi-lang coordination)
- Data analysis/Reporting: $300–650 (analysis depth, visualization, insights)

Budget should match service scope and complexity, not LEVEL alone.
Example: A simple email draft (L2) = $80. A multi-country compliance system (L4) = $600.
` as const;

function isOpenAiReasoningModel(provider: 'xai' | 'openai', model: string) {
  return provider === 'openai' && /^gpt-5(?:-|$)/i.test(model);
}

function buildOpenAiCompatibleParams(
  runtime: { provider: 'xai' | 'openai'; model: string },
  systemPrompt: string,
  userContent: string,
  temperature: number,
) {
  const baseParams = {
    model: runtime.model,
    messages: [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userContent },
    ],
  };

  if (isOpenAiReasoningModel(runtime.provider, runtime.model)) {
    return {
      ...baseParams,
      max_completion_tokens: 4096,
    };
  }

  return {
    ...baseParams,
    temperature,
    max_tokens: 4096,
  };
}

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

const SYSTEM_PROMPT = `You generate synthetic ChallengeBrief previews for Kolk Arena.
Kolk Arena is a public beta where AI agents demonstrate capability by tackling realistic business problems at L0-L8.
These briefs showcase real-world scenarios: what humans request, what agents must deliver, and what matters for scoring.

${SERVICE_BUDGET_RANGES}

Each brief must:
- Use a "scenarioTitle" in the voice of a requester with a SPECIFIC BUDGET IN USD: \"Fix my X! Paying $Y\" or \"Build my X! Need by Friday\" style (direct, urgent, specific budget or deadline).
- Choose the budget based on the SERVICE TYPE complexity, not the LEVEL alone. A simple email might be $80 even at higher levels; a complex system might be $700 at L4.
- Feature a fictional requester with a real business problem (not a tutorial, not abstract).
- requestContext should:
  * Sound like the requester speaking (first person, conversational).
  * Lead with the business pain or deadline (not the background).
  * Include 1–2 concrete constraints (budget/USD, timeline, tool limits, audience size, compliance requirement).
  * End by specifying exactly what they need delivered.
  * Be 2–4 sentences, punchy and direct.
- scoringFocus (2–3 items): What the requester actually cares about (speed, accuracy, compliance, user satisfaction, ROI—not generic "quality").
- outputShape (2–4 items): Concrete deliverables (\"Email draft in plain text\", \"CSV file with columns X, Y, Z\", \"JSON response with structure {...}\", not vague \"output file\").

Output STRICTLY as a JSON array of 8 objects with this shape:
[{
  "level": number (2-8),
  "scenarioTitle": string (requester's voice with USD budget, e.g. \"Fix my email flow! Paying $95\" or \"Build system! Need $650. Deadline: 3 weeks\"),
  "industry": string,
  "fictionalRequesterName": string,
  "requesterRole": string,
  "requestContext": string (human-sounding, 2-5 sentences, include budget in USD where relevant),
  "scoringFocus": string[],
  "outputShape": string[]
}]

Rules:
- Match the requested level list exactly.
- Always use USD for currency in all briefs (no currency symbol, just the amount, e.g., \"Paying $300\").
- Budget should reflect service complexity and scope, NOT LEVEL. Refer to the service budget ranges above.
- No markdown fences or commentary outside the JSON.
- Vary industries, organization sizes, and tones freely.
- scenarioTitle should sound like a real request with urgency, budget in USD, or deadline (be direct and specific).
- Do not include active challenge IDs, attempt tokens, scoring rubrics, or internal implementation details.`;

async function generateEnglishBriefs(levels: number[]): Promise<GeneratedBrief[]> {
  const provider = BRIEF_SHOWCASE_CONFIG.provider;

  if (provider === 'gemini') {
    const gemini = getGeminiRuntime(BRIEF_SHOWCASE_CONFIG.model);
    if (!gemini) throw new Error('Gemini provider not configured');
    return generateWithGemini(levels, gemini);
  }

  const runtime = getOpenAICompatibleRuntime(provider, BRIEF_SHOWCASE_CONFIG.model);
  if (!runtime) throw new Error(`Provider ${provider} not configured`);

  const response = await runtime.client.chat.completions.create(
    buildOpenAiCompatibleParams(
      runtime,
      SYSTEM_PROMPT,
      `Generate 8 briefs with these levels in order: ${JSON.stringify(levels)}.
For each brief, choose a USD budget based on the SERVICE TYPE (not the LEVEL alone).
Refer to the service budget ranges in the system prompt.
Include the budget in the scenarioTitle and requestContext for each brief.
Return ONLY the JSON array.`,
      0.9,
    ),
  );

  const raw = response.choices[0]?.message?.content ?? '';
  return parseBriefJson(raw);
}

async function generateWithGemini(
  levels: number[],
  gemini: { apiKey: string; model: string; baseURL: string },
): Promise<GeneratedBrief[]> {
  const url = `${gemini.baseURL}/models/${gemini.model}:generateContent?key=${gemini.apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        {
          parts: [
            { text: `Generate 8 briefs with these levels in order: ${JSON.stringify(levels)}.
For each brief, choose a USD budget based on the SERVICE TYPE (not the LEVEL alone).
Refer to the service budget ranges in the system prompt.
Include the budget in the scenarioTitle and requestContext for each brief.
Return ONLY the JSON array.` },
          ],
        },
      ],
      generationConfig: { temperature: 0.9, maxOutputTokens: 4096 },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini generation failed: ${res.status} ${text}`);
  }

  const json = await res.json();
  const raw = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
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

const TRANSLATION_PROMPT = `Translate the following synthetic ChallengeBrief previews into the target locale.
Maintain a professional, natural tone appropriate for the service industry.
Preserve fictional names, URLs, Kolk Arena, ChallengeBrief, L0-L8, API, JSON, HTTP, attemptToken, and primaryText as-is.

Translate scenarioTitle, industry, requesterRole, requestContext, scoringFocus, and outputShape.
Preserve fictionalRequesterName exactly if it appears in the input.

Output STRICTLY as a JSON array with the same order:
[{ "scenarioTitle": "...", "industry": "...", "requesterRole": "...", "requestContext": "...", "scoringFocus": ["..."], "outputShape": ["..."] }, ...]

No markdown fences, no commentary.`;

async function translateBriefs(
  briefs: GeneratedBrief[],
  locale: FrontendLocale,
): Promise<Pick<GeneratedBrief, 'scenarioTitle' | 'industry' | 'requesterRole' | 'requestContext' | 'scoringFocus' | 'outputShape'>[]> {
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

  if (provider === 'gemini') {
    const gemini = getGeminiRuntime(BRIEF_SHOWCASE_CONFIG.model);
    if (!gemini) throw new Error('Gemini not configured');
    return translateWithGemini(items, locale, gemini);
  }

  const runtime = getOpenAICompatibleRuntime(provider, BRIEF_SHOWCASE_CONFIG.model);
  if (!runtime) throw new Error(`Provider ${provider} not configured`);

  const localeName =
    locale === 'zh-tw' ? 'Traditional Chinese (Taiwan)' :
    locale === 'es-mx' ? 'Mexican Spanish' : 'English';

  const response = await runtime.client.chat.completions.create(
    buildOpenAiCompatibleParams(
      runtime,
      TRANSLATION_PROMPT,
      `Target locale: ${localeName}\n\n${JSON.stringify(items, null, 2)}`,
      0.4,
    ),
  );

  const raw = response.choices[0]?.message?.content ?? '';
  return parseTranslationJson(raw);
}

async function translateWithGemini(
  items: Pick<GeneratedBrief, 'scenarioTitle' | 'industry' | 'fictionalRequesterName' | 'requesterRole' | 'requestContext' | 'scoringFocus' | 'outputShape'>[],
  locale: FrontendLocale,
  gemini: { apiKey: string; model: string; baseURL: string },
): Promise<Pick<GeneratedBrief, 'scenarioTitle' | 'industry' | 'requesterRole' | 'requestContext' | 'scoringFocus' | 'outputShape'>[]> {
  const localeName =
    locale === 'zh-tw' ? 'Traditional Chinese (Taiwan)' :
    locale === 'es-mx' ? 'Mexican Spanish' : 'English';
  const url = `${gemini.baseURL}/models/${gemini.model}:generateContent?key=${gemini.apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: TRANSLATION_PROMPT }] },
      contents: [
        {
          parts: [
            { text: `Target locale: ${localeName}\n\n${JSON.stringify(items, null, 2)}` },
          ],
        },
      ],
      generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini translation failed: ${res.status} ${text}`);
  }

  const json = await res.json();
  const raw = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return parseTranslationJson(raw);
}

function parseTranslationJson(raw: string): Pick<GeneratedBrief, 'scenarioTitle' | 'industry' | 'requesterRole' | 'requestContext' | 'scoringFocus' | 'outputShape'>[] {
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
      translations[locale] = englishBriefs.map((b) => ({
        title: b.scenarioTitle,
        industry: b.industry,
        ceo_title: b.requesterRole,
        request_context: b.requestContext,
        scoring_focus: b.scoringFocus,
        output_shape: b.outputShape,
      }));
    }
  }

  return { briefs: englishBriefs, translations };
}
