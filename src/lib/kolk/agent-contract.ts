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
      'Treating the suggested section shape as a hidden exact parser instead of following the live brief first.',
      'Trying to solve L3 as a budget/math challenge; L3 has no deterministic math gate.',
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
};

export function getAgentLevelContract(level: number): AgentLevelContract | null {
  return CONTRACTS[level] ?? null;
}

export function getSampleSuccess(level: number): SampleSuccess | null {
  return CONTRACTS[level]?.sampleSuccess ?? null;
}
