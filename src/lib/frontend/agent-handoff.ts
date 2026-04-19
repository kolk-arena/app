import { copy } from '@/i18n';
import type { BetaPublicLevel } from '@/i18n/types';

type ChallengeHandoffArgs = {
  level: BetaPublicLevel;
  levelName: string;
  promptMd: string;
  taskJson: Record<string, unknown>;
  attemptToken?: string;
};

const CANONICAL_ORIGIN = copy.app.canonicalOrigin;

type JsonRecord = Record<string, unknown>;

function stringifyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function asObject(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as JsonRecord;
}

export function extractStructuredBrief(taskJson: JsonRecord) {
  return asObject(taskJson.structured_brief) ?? null;
}

export function getL0SmokeTestCommand() {
  return `# 1. Fetch L0. -c saves the anon session cookie the server sets.
curl -sc /tmp/kolk.jar ${CANONICAL_ORIGIN}/api/challenge/0 > /tmp/kolk_l0.json
ATTEMPT=$(jq -r '.challenge.attemptToken' /tmp/kolk_l0.json)

# 2. Submit. -b replays the cookie; the server requires the same anon
#    session that fetched the challenge. Without -c/-b you get 403
#    IDENTITY_MISMATCH on submit.
curl -sb /tmp/kolk.jar -X POST ${CANONICAL_ORIGIN}/api/challenge/submit \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d "{\\"attemptToken\\":\\"$ATTEMPT\\",\\"primaryText\\":\\"Hello Kolk Arena\\"}"

# 3. Expect unlocked:true, aiJudged:false, levelUnlocked:1.
#    Your integration is wired. Move on to L1 ranked translation.`;
}

export function getL1StarterCommand() {
  return `# 1. Fetch L1 and preserve the anon session cookie.
curl -sc /tmp/kolk.jar ${CANONICAL_ORIGIN}/api/challenge/1 > /tmp/kolk_l1.json

# 2. Inspect the agent-facing brief.
jq '.challenge | { attemptToken, promptMd, taskJson }' /tmp/kolk_l1.json

# 3. Hand promptMd + taskJson.structured_brief to your AI agent and ask it
#    to return only the final translated delivery text.

# 4. Submit the final delivery with the same cookie jar and attemptToken.
curl -sb /tmp/kolk.jar -X POST ${CANONICAL_ORIGIN}/api/challenge/submit \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d @payload.json`;
}

export function getAgentStarterPrompt() {
  return `You are helping me submit to Kolk Arena.

I will paste a fetched challenge JSON object from the Kolk Arena API.

Your job:
1. Read challenge.promptMd carefully.
2. Read challenge.taskJson.structured_brief if it exists.
3. Produce only the final primaryText I should submit.

Return rules:
- Return only the final delivery text.
- Do not explain your reasoning.
- Do not add prefaces, notes, or trailing commentary.
- Do not wrap the answer in Markdown fences unless the brief explicitly requires fenced content.
- For L5, return raw JSON object text only with these string keys:
  whatsapp_message, quick_facts, first_step_checklist.`;
}

export function getSubmitContractSnippet(attemptToken = '<attemptToken>') {
  return `POST ${CANONICAL_ORIGIN}/api/challenge/submit
Headers:
  Content-Type: application/json
  Idempotency-Key: <uuid>
Body:
{
  "attemptToken": "${attemptToken}",
  "primaryText": "<final delivery text>"
}`;
}

function levelRuleLines(level: BetaPublicLevel) {
  switch (level) {
    case 0:
      return [
        "Submit any plain text containing 'Hello' or 'Kolk'.",
        'L0 is a non-AI smoke test and does not hit the leaderboard.',
      ];
    case 1:
      return [
        'Return translated text only.',
        'No headings, translator notes, or explanation.',
      ];
    case 2:
      return [
        'Use exact top-level headers in this order: ## Google Maps Description, then ## Instagram Bio.',
        'The Instagram Bio body must be a fenced json block with exactly 5 keys: display_name, bio_text, category_label, cta_button_text, link_in_bio_url.',
      ];
    case 3:
      return [
        'Use exact Markdown headers in this order: ## Intro, ## Services, ## CTA.',
        'Under ## Services, include exactly 3 service descriptions.',
      ];
    case 4:
      return [
        'Read structured_brief.trip_days before drafting.',
        'Produce exactly that many ## Day N sections, each with Morning:, Afternoon:, Evening:, Budget:, and Tip: lines.',
      ];
    case 5:
      return [
        'primaryText must be a raw JSON object string.',
        'Required string keys: whatsapp_message, quick_facts, first_step_checklist.',
        'Do not wrap the JSON in Markdown fences.',
      ];
    case 6:
      return [
        'This is competitive-tier one-page copy.',
        'Use four fixed sections: Hero, About, Services, CTA.',
      ];
    case 7:
      return [
        'Return exactly 8 prompts, 2 style rules, and 2 forbidden mistakes.',
        'Every prompt must include both a **Prompt:** line and a **Negative prompt:** line.',
      ];
    case 8:
      return [
        'Use three top-level sections in this order: ## One-Page Copy, ## Prompt Pack, ## WhatsApp Welcome.',
        'Inside One-Page Copy use ### Hero / ### About / ### Services / ### CTA, and inside Prompt Pack reuse the L7 prompt skeleton.',
      ];
  }
}

export function getLevelRuleSummary(level: BetaPublicLevel) {
  return levelRuleLines(level).map((line) => `- ${line}`).join('\n');
}

export function getLevelDeliveryInstruction(level: BetaPublicLevel) {
  switch (level) {
    case 0:
      return "Submit any text containing 'Hello' or 'Kolk'. L0 is a connectivity check only — no AI judge, no leaderboard.";
    case 1:
      return 'Return translated text only. No headings, no translator notes.';
    case 2:
      return 'Use exact top-level headers for Google Maps Description and Instagram Bio, then embed the Instagram bio as a fenced json block with the exact five required keys.';
    case 3:
      return 'Use exact Markdown headers ## Intro / ## Services / ## CTA, and include exactly 3 service descriptions under ## Services.';
    case 4:
      return 'Read structured_brief.trip_days and return exactly that many ## Day N sections, each with Morning, Afternoon, Evening, Budget, and Tip lines.';
    case 5:
      return 'L5 requires a raw JSON object string with three keys: whatsapp_message, quick_facts, first_step_checklist.';
    case 6:
      return 'Return one-page copy with four fixed sections: Hero, About, Services, CTA.';
    case 7:
      return 'Return the exact prompt-pack skeleton: 8 prompt blocks, 2 style rules, 2 forbidden mistakes, and one Negative prompt line per prompt.';
    case 8:
      return 'Return one header-structured package with ## One-Page Copy, ## Prompt Pack, and ## WhatsApp Welcome; Prompt Pack reuses the L7 skeleton.';
  }
}

export function getLevelOutputTemplate(
  level: BetaPublicLevel,
  taskJson: JsonRecord,
) {
  const structuredBrief = extractStructuredBrief(taskJson);
  const dayCount =
    typeof structuredBrief?.trip_days === 'number' && structuredBrief.trip_days > 0
      ? Math.floor(structuredBrief.trip_days)
      : null;
  const promptCount = 8;
  const placeholderUrl =
    typeof structuredBrief?.placeholder_url === 'string' && structuredBrief.placeholder_url.trim().length > 0
      ? structuredBrief.placeholder_url
      : 'https://example.com';

  switch (level) {
    case 0:
      return 'Hello, Kolk Arena!';
    case 1:
      return '<translated text only>';
    case 2:
      return `## Google Maps Description
<50-100 words of prose grounded in the brief>

## Instagram Bio
\`\`\`json
{
  "display_name": "...",
  "bio_text": "...",
  "category_label": "...",
  "cta_button_text": "...",
  "link_in_bio_url": "${placeholderUrl}"
}
\`\`\``;
    case 3:
      return `## Intro
<who the business is, grounded in the brief>

## Services
### Service 1
...

### Service 2
...

### Service 3
...

## CTA
<clear next step>`;
    case 4:
      return Array.from({ length: dayCount ?? 3 }, (_, index) => {
        const day = index + 1;
        return `## Day ${day}
Morning: ...
Afternoon: ...
Evening: ...
Budget: ...
Tip: ...`;
      }).join('\n\n');
    case 5:
      return `{
  "whatsapp_message": "...",
  "quick_facts": "- ...\\n- ...\\n- ...",
  "first_step_checklist": "1. ...\\n2. ...\\n3. ..."
}`;
    case 6:
      return `## Hero
...

## About
...

## Services
...

## CTA
...`;
    case 7:
      return Array.from({ length: promptCount }, (_, index) => {
        const promptNumber = index + 1;
        return `### Prompt ${promptNumber} — <short descriptive title>
**Prompt:** ...
**Negative prompt:** ...`;
      }).join('\n\n') + `\n\n### Style Rules
1. ...
2. ...

### Forbidden Mistakes
1. ...
2. ...`;
    case 8:
      return `## One-Page Copy
### Hero
...

### About
...

### Services
...

### CTA
...

## Prompt Pack
${Array.from({ length: promptCount }, (_, index) => {
  const promptNumber = index + 1;
  return `### Prompt ${promptNumber} — <short descriptive title>
**Prompt:** ...
**Negative prompt:** ...`;
}).join('\n\n')}

## WhatsApp Welcome
...`;
  }
}

export function buildChallengeAgentBrief({
  level,
  levelName,
  promptMd,
  taskJson,
}: ChallengeHandoffArgs) {
  const structuredBrief = extractStructuredBrief(taskJson);

  return [
    `Kolk Arena challenge`,
    `Level: L${level} — ${levelName}`,
    '',
    'Return rules:',
    '- Return only the final primaryText I should submit.',
    '- Do not explain your reasoning.',
    '- Do not add prefaces, notes, or trailing commentary.',
    level === 5
      ? '- For L5, return raw JSON object text only. Do not wrap it in Markdown fences.'
      : '- Do not wrap the answer in Markdown fences unless the brief explicitly requires fenced content.',
    '',
    'Level-specific rules:',
    getLevelRuleSummary(level),
    '',
    'promptMd:',
    promptMd,
    '',
    structuredBrief ? 'structured_brief JSON:' : 'taskJson:',
    stringifyJson(structuredBrief ?? taskJson),
  ].join('\n');
}

export function getStructuredBriefCopy(taskJson: JsonRecord) {
  return stringifyJson(extractStructuredBrief(taskJson) ?? taskJson);
}
