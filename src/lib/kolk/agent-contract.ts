import type { Layer1CheckName } from './types';

export type SampleSuccess = {
  level: number;
  title: string;
  description: string;
  primaryText: string;
};

export type AgentLevelContract = {
  level: number;
  outputContract: string[];
  deterministicChecks: Layer1CheckName[];
  factSourceKeys?: string[];
  commonFailureModes: string[];
  sampleSuccessPath?: string;
  sampleSuccess?: SampleSuccess;
};

export type AgentCompletionContract = {
  notCompleteUntil: string;
  doNotStopAt: string[];
  evidenceFields: string[];
  recoveryEndpoint: string;
  finalReport: string;
};

const AGENT_COMPLETION_CONTRACT: AgentCompletionContract = {
  notCompleteUntil:
    'A run is not complete until POST /api/challenge/submit returns submit evidence, or a terminal API error is reached.',
  doNotStopAt: [
    'challenge_fetched',
    'structured_brief_extracted',
    'primaryText_drafted',
    'payload_prepared',
  ],
  evidenceFields: [
    'submissionId',
    'level',
    'totalScore',
    'unlocked',
    'levelUnlocked',
    'replayUnlocked',
    'failReason',
    'summary',
  ],
  recoveryEndpoint: '/api/session/attempts',
  finalReport:
    'Report the submit response evidence: submissionId, level, totalScore, unlocked, levelUnlocked or replayUnlocked or failReason, and summary.',
};

const L3_SAMPLE_PRIMARY_TEXT = `## Intro
Café Brisa is a neighborhood coffee studio in Roma Norte focused on small-batch Mexican beans, calm service, and work-friendly visits. The profile should reuse every live business fact from the fetched brief in natural prose.

## Services
### Espresso Bar
Seasonal espresso drinks, filter coffee, and signature house beverages prepared for guests who want a quick but polished stop.

### Catering
Small office and event coffee service with clear setup notes, drink guidance, and reliable handoff for the host.

### Retail Beans
Fresh whole-bean bags with simple brew recommendations for customers who want to keep the café experience at home.

## CTA
Visit Café Brisa this week or message the team to plan a coffee setup that fits your group.`;

const L5_SAMPLE_PRIMARY_TEXT = JSON.stringify({
  whatsapp_message:
    'Hi {{customer_name}}, welcome to Café Brisa. We are glad to help you get started with our coffee service. This kit gives you the essentials before your first visit or booking.',
  quick_facts: [
    '- Neighborhood coffee studio in Roma Norte.',
    '- Offers espresso bar service, event catering, and retail beans.',
    '- Best first contact is WhatsApp for visit planning or catering details.',
  ].join('\n'),
  first_step_checklist: [
    '- Confirm the customer name and preferred contact time.',
    '- Ask whether they need a café visit, catering quote, or bean recommendation.',
    '- Send the matching next-step link or booking instruction.',
  ].join('\n'),
}, null, 2);

const CONTRACTS: Record<number, AgentLevelContract> = {
  2: {
    level: 2,
    outputContract: [
      'Follow the live promptMd first; L2 variants may ask for rewrite/localization or for a short-form business bio package.',
      'Use taskJson.structured_brief as the source of truth for facts, tone, audience, language, URLs, and counts.',
      'Preserve all available fact strings from structured_brief.key_facts, structured_brief.facts, or structured_brief.required_mentions when present.',
      'Use the Google Maps + Instagram JSON shape only when the live prompt or structured fields request that package.',
    ],
    deterministicChecks: ['lang_detect', 'item_count', 'fact_xref', 'term_guard'],
    factSourceKeys: ['key_facts', 'facts', 'required_mentions'],
    commonFailureModes: [
      'Reusing an old seed/template instead of the current fetched brief.',
      'Submitting the Google Maps + Instagram package when the live prompt asks for a different L2 variant.',
      'Omitting exact live fact strings or changing numbers, locations, URLs, hours, or names.',
      'Stopping after fetch or draft without submitting to POST /api/challenge/submit.',
    ],
  },
  3: {
    level: 3,
    outputContract: [
      'Return Markdown business-profile text as primaryText.',
      'Use the live brief as the source of truth; ## Intro, ## Services, and ## CTA are the recommended shape.',
      'Include all available fact strings from structured_brief.key_facts, structured_brief.facts, or structured_brief.business_facts when present.',
      'L3 does not run math_verify or item_count; numeric prose is allowed but not part of the deterministic gate.',
    ],
    deterministicChecks: ['fact_xref', 'term_guard'],
    factSourceKeys: ['key_facts', 'facts', 'business_facts'],
    commonFailureModes: [
      'Omitting exact fact strings that appear in the structured brief.',
      'Treating the suggested section shape as an exact parser instead of following the live brief first.',
      'Trying to solve L3 as a budget/math challenge; L3 has no deterministic math gate.',
      'Stopping after fetch or draft without submitting to POST /api/challenge/submit.',
    ],
    sampleSuccessPath: '/api/sample-success/3',
    sampleSuccess: {
      level: 3,
      title: 'Synthetic L3 Business Profile',
      description:
        'Shape-only example. Replace every business detail with the live challenge facts before submitting.',
      primaryText: L3_SAMPLE_PRIMARY_TEXT,
    },
  },
  4: {
    level: 4,
    outputContract: [
      'Return Markdown itinerary text as primaryText.',
      'Read structured_brief.trip_days from the live fetch and produce exactly that many ## Day N sections.',
      'Each day should include Morning, Afternoon, Evening, Budget, and Tip content unless the live prompt says otherwise.',
      'Use only explicit currency values for budget lines; avoid inventing hours, prices, or venue details not in the brief.',
    ],
    deterministicChecks: ['math_verify', 'item_count', 'fact_xref', 'term_guard'],
    factSourceKeys: ['constraints', 'facts', 'key_facts'],
    commonFailureModes: [
      'Using a hard-coded 3-day template when structured_brief.trip_days is 2 or 4.',
      'Leaving out constraints from the live brief.',
      'Adding unsupported restaurant names, ticket prices, or opening hours.',
      'Stopping after fetch or draft without submitting to POST /api/challenge/submit.',
    ],
  },
  5: {
    level: 5,
    outputContract: [
      'primaryText must be raw JSON object text, not Markdown.',
      'Required top-level keys are whatsapp_message, quick_facts, and first_step_checklist.',
      'Every required value must be a string. Do not use arrays or nested objects for quick_facts or first_step_checklist.',
      'Do not wrap the JSON in ```json fences.',
    ],
    deterministicChecks: ['json_string_fields'],
    commonFailureModes: [
      'Returning an object in the outer submit body instead of a string in primaryText.',
      'Wrapping the JSON in Markdown fences.',
      'Using arrays or objects for quick_facts or first_step_checklist instead of newline-delimited strings.',
      'Returning string values that are too short for the L5 minimum-length gate.',
      'Stopping after fetch or draft without submitting to POST /api/challenge/submit.',
    ],
    sampleSuccessPath: '/api/sample-success/5',
    sampleSuccess: {
      level: 5,
      title: 'Synthetic L5 Welcome Kit',
      description:
        'Shape-only example. The endpoint returns primaryText as a JSON object string with required string values.',
      primaryText: L5_SAMPLE_PRIMARY_TEXT,
    },
  },
  6: {
    level: 6,
    outputContract: [
      'Return Markdown one-page copy as primaryText.',
      'Follow the live brief for required sections; the common shape is Hero, About, Services, and CTA.',
      'Use the fetched structured facts for business name, industry, city, service count, CTA, and contact details.',
      'L6+ API/workflow automation must use the same bearer token identity for fetch and submit.',
    ],
    deterministicChecks: ['item_count', 'fact_xref', 'term_guard'],
    factSourceKeys: ['facts', 'key_facts', 'services', 'constraints'],
    commonFailureModes: [
      'Attempting L6 without a signed-in browser session or bearer token.',
      'Inventing services, proof points, contact details, or claims not in the live brief.',
      'Using the wrong number of service items when the live brief provides a count.',
      'Stopping after fetch or draft without submitting to POST /api/challenge/submit.',
    ],
  },
  7: {
    level: 7,
    outputContract: [
      'Return a Markdown prompt pack as primaryText.',
      'Follow the live counts; the public shape is 8 Prompt blocks, 2 Style Rules, and 2 Forbidden Mistakes.',
      'Each prompt block should include a Prompt line and a Negative prompt line.',
      'Use the live brief for topic, audience, style rules, forbidden mistakes, and naming.',
    ],
    deterministicChecks: ['item_count', 'fact_xref', 'term_guard'],
    factSourceKeys: ['facts', 'key_facts', 'style_rules', 'forbidden_mistakes'],
    commonFailureModes: [
      'Returning fewer or more prompt blocks than the live brief requires.',
      'Omitting negative prompts or the style/forbidden-mistake blocks.',
      'Copying generic prompt-pack text that ignores the fetched topic and audience.',
      'Stopping after fetch or draft without submitting to POST /api/challenge/submit.',
    ],
  },
  8: {
    level: 8,
    outputContract: [
      'Return one Markdown package as primaryText.',
      'Include top-level sections for One-Page Copy, Prompt Pack, and WhatsApp Welcome.',
      'Keep L8 as Markdown/plain text; do not use the L5 JSON-in-primaryText format.',
      'Make all three deliverables use the same live business facts, audience, tone, and CTA.',
    ],
    deterministicChecks: ['header_keyword_match'],
    factSourceKeys: ['facts', 'key_facts', 'business_facts', 'constraints'],
    commonFailureModes: [
      'Missing a top-level ## header containing copy, prompt, or whatsapp.',
      'Using raw JSON because L5 used JSON; L8 is a header-structured Markdown package.',
      'Letting the one-page copy, prompt pack, and WhatsApp welcome contradict each other.',
      'Stopping after fetch or draft without submitting to POST /api/challenge/submit.',
    ],
  },
};

export function getAgentCompletionContract(): AgentCompletionContract {
  return AGENT_COMPLETION_CONTRACT;
}

export function getAgentLevelContract(level: number): AgentLevelContract | null {
  return CONTRACTS[level] ?? null;
}

export function getSampleSuccess(level: number): SampleSuccess | null {
  return CONTRACTS[level]?.sampleSuccess ?? null;
}
