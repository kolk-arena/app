#!/usr/bin/env npx tsx
/**
 * L1-L5 Template Generator
 *
 * For Band A-B levels, generates challenge templates with parameter slots.
 * Each template is stored with a seed number and variant.
 * At challenge-fetch time, the server picks a random template.
 *
 * Usage:
 *   XAI_API_KEY=xai-... npx tsx scripts/kolk/generate-templates.ts
 *   XAI_API_KEY=xai-... npx tsx scripts/kolk/generate-templates.ts --level 3 --count 5
 *   XAI_API_KEY=xai-... npx tsx scripts/kolk/generate-templates.ts --dry-run
 *
 * Env:
 *   XAI_API_KEY             — required
 *   KOLK_SUPABASE_URL       — required (unless --dry-run)
 *   KOLK_SUPABASE_SERVICE_ROLE_KEY — required (unless --dry-run)
 */

import OpenAI from 'openai';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const LEVELS_TO_GENERATE = [1, 2, 3, 4, 5];
const DEFAULT_COUNT_PER_LEVEL = 10; // LAUNCH_SEEDS_PER_LEVEL
const MODEL = process.env.XAI_MODEL ?? 'grok-4-1-fast-non-reasoning';
const BASE_URL = process.env.XAI_BASE_URL ?? 'https://api.x.ai/v1';

// ---------------------------------------------------------------------------
// Level metadata (inline to avoid import path issues in scripts)
// ---------------------------------------------------------------------------

interface LevelMeta {
  level: number;
  name: string;
  family: string;
  generatorPrompt: string;
  coverageTargets: string[];
  timeLimitMinutes: number;
  isBoss: boolean;
  bossSpecial?: string;
}

const LEVELS: LevelMeta[] = [
  {
    level: 1, name: 'Quick Translate', family: 'txt_translation',
    timeLimitMinutes: 30, isBoss: false,
    coverageTargets: ['language_match', 'completeness', 'key_terms'],
    generatorPrompt: 'Generate a 1-page article (300-500 words) in {{source_lang}} about a {{industry}} in {{city}}. Include key terms: {{key_terms}}. The agent must translate it to {{target_lang}}.',
  },
  {
    level: 2, name: 'Rewrite & Localize', family: 'txt_translation',
    timeLimitMinutes: 30, isBoss: false,
    coverageTargets: ['tone_match', 'key_facts_preserved', 'language_match', 'audience_fit', 'naturalness'],
    generatorPrompt: 'Generate a {{source_tone}} text (200-400 words) about a {{industry}} in {{city}}. Include key_facts that MUST be preserved. The agent must rewrite it in {{target_tone}} for {{target_audience}}.',
  },
  {
    level: 3, name: 'Trip Planner', family: 'structured_plan',
    timeLimitMinutes: 30, isBoss: false,
    coverageTargets: ['destination', 'days', 'budget', 'activities', 'accommodation'],
    generatorPrompt: 'Generate a {{days}}-day travel brief for {{destination}}. Budget: ${{budget_total}} MXN. Traveler: {{traveler_type}}. Interests: {{interests}}. The agent must produce a structured itinerary where daily costs sum to budget_total.',
  },
  {
    level: 4, name: 'Prompt Pack', family: 'prompt_pack',
    timeLimitMinutes: 30, isBoss: false,
    coverageTargets: ['theme', 'style', 'prompt_count', 'variety', 'usability'],
    generatorPrompt: 'Generate a brief requesting {{prompt_count}} AI image prompts for {{brand_name}} ({{industry}}). Style: {{style}}. Palette: {{color_palette}}. Usage: {{usage_context}}. We score prompt TEXT quality, not generated images.',
  },
  {
    level: 5, name: 'Welcome Kit', family: 'multi_asset_text_bundle',
    timeLimitMinutes: 30, isBoss: true,
    bossSpecial: 'Gateway Boss — registration wall after passing. Price math trap.',
    coverageTargets: ['whatsapp_welcome', 'catalog_items', 'price_math', 'brand_tone', 'format_compliance'],
    generatorPrompt: 'Generate a multi-format brief for {{business_name}} ({{industry}} in {{city}}). Deliverables: (1) WhatsApp welcome message, (2) product/service catalog with {{item_count}} items and prices. Include a price math trap where items must sum to {{total_price}}.',
  },
];

// ---------------------------------------------------------------------------
// Parameter pools for randomization
// ---------------------------------------------------------------------------

const PARAM_POOLS: Record<string, string[]> = {
  source_lang: ['es-MX', 'en-US', 'pt-BR'],
  target_lang: ['en-US', 'es-MX', 'zh-TW'],
  industry: [
    'bakery', 'dental clinic', 'yoga studio', 'taco truck', 'auto repair shop',
    'hair salon', 'flower shop', 'gym', 'pet grooming', 'coffee roaster',
    'mezcal bar', 'co-working space', 'food truck', 'bookstore', 'tattoo parlor',
  ],
  city: [
    'Oaxaca', 'Mexico City', 'Guadalajara', 'Monterrey', 'Puebla',
    'Merida', 'Cancun', 'San Miguel de Allende', 'Queretaro', 'Playa del Carmen',
  ],
  key_terms: [
    'artesanal, local, tradicion', 'orgánico, fresco, natural',
    'premium, exclusivo, personalizado', 'familiar, confiable, profesional',
    'innovador, moderno, sustentable',
  ],
  source_tone: ['formal corporate', 'casual friendly', 'academic', 'promotional'],
  target_tone: ['warm conversational', 'professional but approachable', 'enthusiastic sales', 'formal business'],
  target_audience: ['young professionals 25-35', 'families with kids', 'senior citizens', 'college students', 'tourists'],
  days: ['3', '5', '7'],
  destination: ['Oaxaca', 'Mexico City', 'Guanajuato', 'Tulum', 'San Cristobal de las Casas'],
  budget_total: ['5000', '8000', '12000', '15000', '20000'],
  traveler_type: ['solo backpacker', 'couple celebrating anniversary', 'family of 4', 'group of friends'],
  interests: [
    'gastronomy and street food', 'history and architecture',
    'nature and adventure', 'art and culture', 'nightlife and entertainment',
  ],
  prompt_count: ['5', '8', '10'],
  brand_name: ['CasaBella', 'TierraVerde', 'SolNuevo', 'AguaFresca', 'LunaNova'],
  style: ['minimalist', 'vibrant Mexican folk', 'modern corporate', 'rustic artisanal', 'neon cyberpunk'],
  color_palette: ['earth tones', 'bright primaries', 'pastel', 'monochrome', 'warm sunset'],
  usage_context: ['Instagram feed', 'website hero banners', 'product packaging', 'menu design', 'business cards'],
  business_name: [
    'Panaderia La Abuela', 'Clinica Dental Sonrisa', 'Taqueria El Rey',
    'Salon Belleza Total', 'Cafe Oaxaqueno', 'Gym FitMx',
    'Floreria Primavera', 'Mezcaleria Luna', 'Cowork Centro',
  ],
  item_count: ['5', '6', '8', '10'],
  total_price: ['2500', '3500', '5000', '7500', '10000'],
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function fillTemplate(template: string): Record<string, string> {
  const params: Record<string, string> = {};
  const matches = template.match(/\{\{(\w+)\}\}/g) ?? [];
  for (const match of matches) {
    const key = match.replace(/\{\{|\}\}/g, '');
    if (!params[key]) {
      const pool = PARAM_POOLS[key];
      params[key] = pool ? pickRandom(pool) : `[${key}]`;
    }
  }
  return params;
}

// ---------------------------------------------------------------------------
// Template generation
// ---------------------------------------------------------------------------

async function generateChallenge(
  openai: OpenAI,
  levelMeta: LevelMeta,
  seed: number,
): Promise<{
  taskJson: Record<string, unknown>;
  promptMd: string;
  rubricJson: Record<string, unknown>;
  metadataYaml: string;
}> {
  const params = fillTemplate(levelMeta.generatorPrompt);

  // Build the filled prompt
  let filledPrompt = levelMeta.generatorPrompt;
  for (const [key, val] of Object.entries(params)) {
    filledPrompt = filledPrompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val);
  }

  const systemPrompt = `You are a challenge generator for Kolk Arena, an AI agent benchmark.
Your job: produce a realistic buyer brief that an AI agent must fulfill, PLUS a hidden scoring rubric.

IMPORTANT RULES:
1. The brief must feel like a real Mexico SMB buyer request — natural, sometimes imperfect.
2. Include ALL required structured fields for automated scoring.
3. The rubric must have concrete scoring criteria for each coverage target.
4. For math-related challenges, ensure the numbers are internally consistent.
5. Output ONLY the JSON schema below. No commentary.

{
  "task_json": {
    "title": "<brief title>",
    "brief_summary": "<1-sentence summary for judge context>",
    "seller_locale": "<es-MX or en-US>",
    "structured_brief": {
      <all fields relevant to this level's family>
    },
    "buyer_request_text": "<the natural-language buyer request, 150-500 words>"
  },
  "prompt_md": "<markdown-formatted challenge prompt shown to the agent, 200-600 words>",
  "rubric": {
    "coverage_field_weights": {
      <field: points for each of: ${levelMeta.coverageTargets.join(', ')}>
      // total must = 30
    },
    "quality_anchors": {
      "tone_fit": "<what good tone looks like>",
      "clarity": "<what good clarity looks like>",
      "usefulness": "<what useful output looks like>",
      "business_fit": "<what good business fit looks like>"
    },
    "ideal_excerpt": "<200-400 word excerpt of what a perfect submission looks like>",
    "active_penalties": [<list of penalty names if applicable, e.g. "prompt_injection", "hallucinated_facts">],
    "penalty_config": {
      <penalty_name: { "deduction": <negative number>, "applied_to": "coverage"|"quality" }>
    }
  }
}`;

  const userPrompt = `Generate a Level ${levelMeta.level} ("${levelMeta.name}") challenge.
Family: ${levelMeta.family}
Parameters: ${JSON.stringify(params)}
Filled brief direction: ${filledPrompt}
${levelMeta.isBoss ? `BOSS LEVEL: ${levelMeta.bossSpecial}` : ''}
Coverage targets: ${levelMeta.coverageTargets.join(', ')}

Generate a unique, realistic challenge. Seed: ${seed}`;

  const response = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.8,  // diversity across seeds
    max_tokens: 3000,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('Empty response from generator');

  const parsed = JSON.parse(content) as {
    task_json: Record<string, unknown>;
    prompt_md: string;
    rubric: Record<string, unknown>;
  };

  // Build metadata YAML
  const metadataYaml = [
    `level: ${levelMeta.level}`,
    `name: "${levelMeta.name}"`,
    `family: ${levelMeta.family}`,
    `band: ${levelMeta.level <= 5 ? 'A' : 'B'}`,
    `seed: ${seed}`,
    `generated_at: "${new Date().toISOString()}"`,
    `generator_model: "${MODEL}"`,
    `time_limit_minutes: ${levelMeta.timeLimitMinutes}`,
    `is_boss: ${levelMeta.isBoss}`,
    `parameters: ${JSON.stringify(params)}`,
  ].join('\n');

  return {
    taskJson: parsed.task_json,
    promptMd: parsed.prompt_md,
    rubricJson: parsed.rubric,
    metadataYaml,
  };
}

// ---------------------------------------------------------------------------
// Supabase insert (lazy import to avoid crashes in --dry-run)
// ---------------------------------------------------------------------------

async function insertToSupabase(
  level: number,
  seed: number,
  variant: string,
  taskJson: Record<string, unknown>,
  promptMd: string,
  rubricJson: Record<string, unknown>,
  metadataYaml: string,
  timeLimitMinutes: number,
) {
  // Dynamic import to avoid crashing if env vars missing in --dry-run
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.KOLK_SUPABASE_URL!,
    process.env.KOLK_SUPABASE_SERVICE_ROLE_KEY!,
  );

  const rubricHash = crypto.createHash('sha256').update(JSON.stringify(rubricJson)).digest('hex');

  // 1. Upsert rubric
  const { error: rubricError } = await supabase
    .from('ka_variant_rubrics')
    .upsert({
      level,
      variant,
      rubric_json: rubricJson,
      rubric_hash: rubricHash,
    }, { onConflict: 'level,variant' });

  if (rubricError) {
    console.error(`  [!] Rubric upsert failed for L${level} seed=${seed}:`, rubricError.message);
    return false;
  }

  // 2. Upsert challenge
  const { error: chalError } = await supabase
    .from('ka_challenges')
    .upsert({
      level,
      seed,
      variant,
      variant_rubric_hash: rubricHash,
      task_json: taskJson,
      prompt_md: promptMd,
      metadata_yaml: metadataYaml,
      time_limit_minutes: timeLimitMinutes,
      generator_model: MODEL,
      active: true,
      generated_at: new Date().toISOString(),
    }, { onConflict: 'level,seed,variant' });

  if (chalError) {
    console.error(`  [!] Challenge upsert failed for L${level} seed=${seed}:`, chalError.message);
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const levelArg = args.indexOf('--level');
  const countArg = args.indexOf('--count');

  const targetLevels = levelArg >= 0
    ? [parseInt(args[levelArg + 1]!, 10)]
    : LEVELS_TO_GENERATE;

  const count = countArg >= 0
    ? parseInt(args[countArg + 1]!, 10)
    : DEFAULT_COUNT_PER_LEVEL;

  if (!process.env.XAI_API_KEY) {
    console.error('XAI_API_KEY is required');
    process.exit(1);
  }

  if (!dryRun && (!process.env.KOLK_SUPABASE_URL || !process.env.KOLK_SUPABASE_SERVICE_ROLE_KEY)) {
    console.error('KOLK_SUPABASE_URL and KOLK_SUPABASE_SERVICE_ROLE_KEY required (use --dry-run to skip DB)');
    process.exit(1);
  }

  const openai = new OpenAI({ apiKey: process.env.XAI_API_KEY, baseURL: BASE_URL });

  console.log(`\n=== Kolk Arena L1-L5 Template Generator ===`);
  console.log(`Levels: ${targetLevels.join(', ')}`);
  console.log(`Seeds per level: ${count}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (no DB writes)' : 'LIVE (writing to Supabase)'}`);
  console.log(`Model: ${MODEL}\n`);

  let totalGenerated = 0;
  let totalErrors = 0;

  for (const levelNum of targetLevels) {
    const levelMeta = LEVELS.find(l => l.level === levelNum);
    if (!levelMeta) {
      console.error(`Level ${levelNum} not found in L1-L5 definitions, skipping`);
      continue;
    }

    console.log(`\n--- Level ${levelNum}: ${levelMeta.name} ---`);

    for (let seed = 1; seed <= count; seed++) {
      const variant = `v1-s${seed}`;
      process.stdout.write(`  Seed ${seed}/${count} (${variant})... `);

      try {
        const result = await generateChallenge(openai, levelMeta, seed);

        if (dryRun) {
          console.log('OK (dry run)');
          console.log(`    Title: ${(result.taskJson.title as string) ?? 'untitled'}`);
          console.log(`    Brief: ${(result.taskJson.brief_summary as string)?.slice(0, 80) ?? ''}...`);
        } else {
          const ok = await insertToSupabase(
            levelNum, seed, variant,
            result.taskJson, result.promptMd,
            result.rubricJson, result.metadataYaml,
            levelMeta.timeLimitMinutes,
          );
          console.log(ok ? 'OK (saved)' : 'FAILED');
          if (!ok) totalErrors++;
        }

        totalGenerated++;
      } catch (err) {
        console.log(`ERROR: ${(err as Error).message}`);
        totalErrors++;
      }

      // Small delay between calls to avoid provider-side throttling
      await new Promise(r => setTimeout(r, 200));
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`Generated: ${totalGenerated} | Errors: ${totalErrors}`);
  if (dryRun) console.log('(Dry run — nothing written to DB)');
}

main().catch(console.error);
