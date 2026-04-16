/**
 * Kolk Arena — Layer 1 Structural Verification (Deterministic)
 *
 * 5 tools, ~500 LOC, 3 npm packages:
 *   1. lang_detect  — franc-min (language detection)
 *   2. math_verify  — arithmetic check (native JS)
 *   3. item_count   — count items/sections in output
 *   4. fact_xref    — fastest-levenshtein (cross-reference facts)
 *   5. term_guard   — snowball-stemmers (prohibited term scan)
 *
 * Layer 1 produces 0-40 points (STRUCTURE_MAX).
 * Results are deterministic and reproducible.
 */

import { franc } from 'franc-min';
import { distance as levenshtein } from 'fastest-levenshtein';
import { newStemmer } from 'snowball-stemmers';

import { STRUCTURE_MAX } from '../constants';

// ============================================================================
// Types
// ============================================================================

export interface Layer1Check {
  name: string;
  passed: boolean;
  score: number;       // points awarded
  maxPoints: number;   // max possible for this check
  reason: string;
}

export interface Layer1Result {
  totalScore: number;  // 0 - STRUCTURE_MAX (40)
  checks: Layer1Check[];
}

// ============================================================================
// 1. lang_detect — Verify output language matches expected
// ============================================================================

/**
 * Detect the language of the given text and compare to expected.
 * Uses franc-min for lightweight ISO 639-3 detection.
 *
 * @param text - The agent's output text
 * @param expectedLang - Expected language code: "es" | "en" | "es-MX"
 * @param maxPoints - Points for this check (typically 8-10)
 */
export function langDetect(
  text: string,
  expectedLang: string,
  maxPoints: number,
): Layer1Check {
  // Normalize expected lang to ISO 639-3
  const langMap: Record<string, string> = {
    'es': 'spa', 'es-MX': 'spa', 'es-mx': 'spa', 'spanish': 'spa',
    'en': 'eng', 'en-US': 'eng', 'en-us': 'eng', 'english': 'eng',
    'zh': 'cmn', 'zh-TW': 'cmn', 'zh-tw': 'cmn', 'zh-CN': 'cmn', 'zh-cn': 'cmn', 'chinese': 'cmn',
    'pt': 'por', 'pt-BR': 'por', 'fr': 'fra', 'de': 'deu',
    'ja': 'jpn', 'ko': 'kor', 'ru': 'rus', 'ar': 'arb',
  };

  const expected639 = langMap[expectedLang] ?? expectedLang;
  const detected = franc(text);

  if (detected === 'und') {
    return {
      name: 'lang_detect',
      passed: false,
      score: Math.round(maxPoints * 0.5),
      maxPoints,
      reason: 'Language could not be detected (text too short or ambiguous)',
    };
  }

  const passed = detected === expected639;

  return {
    name: 'lang_detect',
    passed,
    score: passed ? maxPoints : 0,
    maxPoints,
    reason: passed
      ? `Output language matches expected (${expectedLang})`
      : `Expected ${expectedLang} (${expected639}), detected ${detected}`,
  };
}

// ============================================================================
// 2. math_verify — Verify arithmetic in output
// ============================================================================

/**
 * Extract numbers from text and verify they sum to expected total.
 * Used for budget checks (L3), price catalogs (L5), etc.
 *
 * @param text - The agent's output text
 * @param expectedTotal - The expected sum
 * @param tolerance - Acceptable difference (default: 0.01 for rounding)
 * @param maxPoints - Points for this check
 */
export function mathVerify(
  text: string,
  expectedTotal: number,
  maxPoints: number,
  tolerance = 0.01,
): Layer1Check {
  // Extract all dollar/peso amounts or plain numbers from the text
  const numberPatterns = [
    /\$[\d,]+(?:\.\d{1,2})?/g,            // $1,234.56
    /[\d,]+(?:\.\d{1,2})?\s*(?:MXN|USD|pesos|dollars)/gi,  // 1234 MXN
    /(?:^|\s)([\d,]+(?:\.\d{1,2})?)(?:\s|$|,)/gm,          // standalone numbers
  ];

  const numbers: number[] = [];
  for (const pattern of numberPatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const raw = match[1] ?? match[0];
      const clean = raw.replace(/[$,\s]|MXN|USD|pesos|dollars/gi, '');
      const num = parseFloat(clean);
      if (!isNaN(num) && num > 0) {
        numbers.push(num);
      }
    }
  }

  if (numbers.length === 0) {
    return {
      name: 'math_verify',
      passed: false,
      score: 0,
      maxPoints,
      reason: 'No numeric values found in output',
    };
  }

  // Try: do line items sum to expectedTotal?
  const sum = numbers.reduce((a, b) => a + b, 0);
  const diff = Math.abs(sum - expectedTotal);
  const passed = diff <= tolerance * expectedTotal;

  // Partial credit: within 10%
  const partialPassed = diff <= 0.1 * expectedTotal;

  return {
    name: 'math_verify',
    passed,
    score: passed ? maxPoints : partialPassed ? Math.round(maxPoints * 0.5) : 0,
    maxPoints,
    reason: passed
      ? `Line items sum to ${sum.toFixed(2)}, matches expected ${expectedTotal}`
      : `Line items sum to ${sum.toFixed(2)}, expected ${expectedTotal} (diff: ${diff.toFixed(2)})`,
  };
}

// ============================================================================
// 3. item_count — Verify count of items/sections/entries
// ============================================================================

/**
 * Count occurrences of a pattern in text and compare to expected.
 * Used for: prompt count, day count, message count, service count, etc.
 *
 * @param text - The agent's output
 * @param expectedCount - Expected number of items
 * @param patterns - Regex patterns that identify items (e.g., /^## Day \d+/gm)
 * @param maxPoints - Points for this check
 * @param label - Human-readable label (e.g., "prompts", "days", "messages")
 */
export function itemCount(
  text: string,
  expectedCount: number,
  patterns: RegExp[],
  maxPoints: number,
  label = 'items',
): Layer1Check {
  let bestCount = 0;

  for (const pattern of patterns) {
    const matches = text.match(pattern);
    const count = matches?.length ?? 0;
    if (count > bestCount) bestCount = count;
  }

  const passed = bestCount === expectedCount;
  const partialPassed = bestCount >= expectedCount * 0.8 && bestCount <= expectedCount * 1.2;

  return {
    name: 'item_count',
    passed,
    score: passed ? maxPoints : partialPassed ? Math.round(maxPoints * 0.7) : 0,
    maxPoints,
    reason: passed
      ? `Found ${bestCount} ${label}, matches expected ${expectedCount}`
      : `Found ${bestCount} ${label}, expected ${expectedCount}`,
  };
}

// ============================================================================
// 4. fact_xref — Cross-reference provided facts against output
// ============================================================================

/**
 * Check that provided facts appear in the agent's output.
 * Uses Levenshtein distance for fuzzy matching (handles minor typos).
 *
 * @param text - The agent's output
 * @param facts - Array of fact strings that should appear
 * @param maxPoints - Points for this check
 * @param threshold - Max Levenshtein distance for a "match" (default: 3)
 */
export function factXref(
  text: string,
  facts: string[],
  maxPoints: number,
  threshold = 3,
): Layer1Check {
  if (facts.length === 0) {
    return {
      name: 'fact_xref',
      passed: true,
      score: maxPoints,
      maxPoints,
      reason: 'No facts to cross-reference',
    };
  }

  const textLower = text.toLowerCase();
  let matched = 0;
  const missing: string[] = [];

  for (const fact of facts) {
    const factLower = fact.toLowerCase().trim();

    // First: exact substring match
    if (textLower.includes(factLower)) {
      matched++;
      continue;
    }

    // Second: fuzzy match using Levenshtein against sliding windows
    const words = textLower.split(/\s+/);
    const factWords = factLower.split(/\s+/);
    let found = false;

    // Slide a window of factWords.length over words
    for (let i = 0; i <= words.length - factWords.length; i++) {
      const window = words.slice(i, i + factWords.length).join(' ');
      if (levenshtein(factLower, window) <= threshold) {
        found = true;
        break;
      }
    }

    if (found) {
      matched++;
    } else {
      missing.push(fact);
    }
  }

  const ratio = matched / facts.length;
  const passed = ratio >= 0.9;  // 90% of facts must be present
  const score = Math.round(maxPoints * ratio);

  return {
    name: 'fact_xref',
    passed,
    score: Math.min(score, maxPoints),
    maxPoints,
    reason: passed
      ? `${matched}/${facts.length} facts found in output`
      : `${matched}/${facts.length} facts found. Missing: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '...' : ''}`,
  };
}

// ============================================================================
// 5. term_guard — Prohibited term scan (stemmed)
// ============================================================================

/**
 * Check that prohibited terms do NOT appear in the agent's output.
 * Uses Snowball stemmer to catch morphological variants.
 *
 * @param text - The agent's output
 * @param prohibitedTerms - Array of terms that must NOT appear
 * @param lang - Language for stemming ("es" | "en")
 * @param maxPoints - Points for this check
 */
export function termGuard(
  text: string,
  prohibitedTerms: string[],
  lang: 'es' | 'en',
  maxPoints: number,
): Layer1Check {
  if (prohibitedTerms.length === 0) {
    return {
      name: 'term_guard',
      passed: true,
      score: maxPoints,
      maxPoints,
      reason: 'No prohibited terms to check',
    };
  }

  const stemmerLang = lang === 'es' ? 'spanish' : 'english';
  const stemmer = newStemmer(stemmerLang);

  // Stem the prohibited terms
  const prohibitedStems = new Set(
    prohibitedTerms.map((t) => stemmer.stem(t.toLowerCase()))
  );

  // Stem the output words and check for violations
  const words = text.toLowerCase().split(/\s+/);
  const violations: string[] = [];

  for (const word of words) {
    const cleaned = word.replace(/[^a-záéíóúñü\w]/gi, '');
    if (!cleaned) continue;
    const stem = stemmer.stem(cleaned);
    if (prohibitedStems.has(stem)) {
      if (!violations.includes(cleaned)) {
        violations.push(cleaned);
      }
    }
  }

  const passed = violations.length === 0;

  return {
    name: 'term_guard',
    passed,
    score: passed ? maxPoints : Math.max(0, maxPoints - violations.length * 2),
    maxPoints,
    reason: passed
      ? `No prohibited terms found in output`
      : `Found ${violations.length} prohibited term(s): ${violations.slice(0, 5).join(', ')}`,
  };
}

// ============================================================================
// Orchestrator: Run all applicable Layer 1 checks for a level
// ============================================================================

export interface Layer1Config {
  /** Expected output language */
  expectedLang?: string;
  /** Expected total for math verification */
  mathTotal?: number;
  /** Expected item count + patterns + label */
  itemExpected?: { count: number; patterns: RegExp[]; label: string };
  /** Facts that must appear in output */
  facts?: string[];
  /** Prohibited terms + language */
  prohibitedTerms?: { terms: string[]; lang: 'es' | 'en' };
}

/**
 * Run all configured Layer 1 checks and return total structure score (0-40).
 *
 * Points are distributed evenly across configured checks.
 * If only 3 checks apply, each gets ~13 points (total = 40).
 */
export function runLayer1(
  text: string,
  config: Layer1Config,
): Layer1Result {
  const checks: Layer1Check[] = [];

  // Count active checks to distribute points
  const activeChecks = [
    config.expectedLang != null,
    config.mathTotal != null,
    config.itemExpected != null,
    config.facts != null && config.facts.length > 0,
    config.prohibitedTerms != null && config.prohibitedTerms.terms.length > 0,
  ].filter(Boolean).length;

  if (activeChecks === 0) {
    // No deterministic checks configured — give baseline structural score
    // so the submission isn't blocked by the structural gate (25)
    return {
      totalScore: STRUCTURE_MAX,
      checks: [{
        name: 'baseline',
        passed: true,
        score: STRUCTURE_MAX,
        maxPoints: STRUCTURE_MAX,
        reason: 'No deterministic checks configured for this level — baseline pass',
      }],
    };
  }

  const pointsPer = Math.floor(STRUCTURE_MAX / activeChecks);
  const remainder = STRUCTURE_MAX - pointsPer * activeChecks;

  let checkIndex = 0;
  const getPoints = () => {
    checkIndex++;
    return pointsPer + (checkIndex === 1 ? remainder : 0);  // first check gets remainder
  };

  // Run configured checks
  if (config.expectedLang != null) {
    checks.push(langDetect(text, config.expectedLang, getPoints()));
  }
  if (config.mathTotal != null) {
    checks.push(mathVerify(text, config.mathTotal, getPoints()));
  }
  if (config.itemExpected != null) {
    const { count, patterns, label } = config.itemExpected;
    checks.push(itemCount(text, count, patterns, getPoints(), label));
  }
  if (config.facts != null && config.facts.length > 0) {
    checks.push(factXref(text, config.facts, getPoints()));
  }
  if (config.prohibitedTerms != null && config.prohibitedTerms.terms.length > 0) {
    const { terms, lang } = config.prohibitedTerms;
    checks.push(termGuard(text, terms, lang, getPoints()));
  }

  const totalScore = checks.reduce((sum, c) => sum + c.score, 0);

  return {
    totalScore: Math.min(totalScore, STRUCTURE_MAX),
    checks,
  };
}
