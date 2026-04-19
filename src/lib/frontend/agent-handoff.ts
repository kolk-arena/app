import { copy } from '@/i18n';
import { APP_CONFIG } from '@/lib/frontend/app-config';
import type { BetaPublicLevel } from '@/i18n/types';

type ChallengeHandoffArgs = {
  level: BetaPublicLevel;
  levelName: string;
  promptMd: string;
  taskJson: Record<string, unknown>;
  attemptToken?: string;
};

const CANONICAL_ORIGIN = APP_CONFIG.canonicalOrigin;

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
  const outputTemplate = getLevelOutputTemplate(level, taskJson);
  const rules = getLevelRuleSummary(level);
  const structuredBrief = extractStructuredBrief(taskJson);

  return `You are an expert AI agent helping me solve a Kolk Arena challenge.

### SYSTEM RULES
- Return ONLY the final output payload.
- No pleasantries, no explanations, no markdown formatting unless explicitly requested.
${level === 5 ? '- For L5, return raw JSON object text only. Do not wrap it in Markdown fences.' : '- Do not wrap the answer in Markdown fences unless the brief explicitly requires fenced content.'}

### CHALLENGE INFO
Level: L${level} — ${levelName}

### CONSTRAINTS & FORMATTING
${rules}

### TASK DESCRIPTION
${promptMd}

### DATA CONTEXT — ${structuredBrief ? 'structured_brief JSON' : 'taskJson'}
\`\`\`json
${stringifyJson(structuredBrief ?? taskJson)}
\`\`\`

### EXPECTED OUTPUT TEMPLATE
Please ensure your output structurally matches the following template:
${outputTemplate}`;
}

export function getStructuredBriefCopy(taskJson: JsonRecord) {
  return stringifyJson(extractStructuredBrief(taskJson) ?? taskJson);
}

export function getPythonSubmitSnippet(level: BetaPublicLevel) {
  return `import uuid
import requests

BASE = "${CANONICAL_ORIGIN}"
LEVEL = ${level}

# requests.Session() persists cookies across GET -> POST.
# anon session cookie from fetch must replay on submit, or the server
# returns 403 IDENTITY_MISMATCH.
session = requests.Session()

# 1) Fetch the challenge and read the attemptToken.
r = session.get(f"{BASE}/api/challenge/{LEVEL}", timeout=30)
r.raise_for_status()
ch = r.json()["challenge"]
attempt_token = ch["attemptToken"]

# 2) Replace YOUR_AI_GENERATED_TEXT_HERE with your agent's delivery.
primary_text = "YOUR_AI_GENERATED_TEXT_HERE"

# 3) Submit. Session() replays the anon-session cookie automatically.
r = session.post(
    f"{BASE}/api/challenge/submit",
    headers={
        "Content-Type": "application/json",
        "Idempotency-Key": str(uuid.uuid4()),
    },
    json={"attemptToken": attempt_token, "primaryText": primary_text},
    timeout=60,
)
print(r.status_code, r.json())`;
}

export function getNodeSubmitSnippet(level: BetaPublicLevel) {
  return `// Zero dependencies. Runs on Node 18+, Deno, Bun, Cloudflare Workers.
const BASE = "${CANONICAL_ORIGIN}";
const LEVEL = ${level};

// 1) Fetch — capture the anon-session Set-Cookie header.
// anon session cookie from fetch must replay on submit, or the server
// returns 403 IDENTITY_MISMATCH.
const fetchRes = await fetch(\`\${BASE}/api/challenge/\${LEVEL}\`);
const setCookie = fetchRes.headers.get('set-cookie') ?? '';
// Extract just "name=value" pairs for replay on the submit request.
const cookie = setCookie.split(/,(?=\\s*\\w+=)/)
  .map(c => c.split(';')[0].trim())
  .filter(Boolean)
  .join('; ');
const { challenge } = await fetchRes.json();
const attemptToken = challenge.attemptToken;

// 2) Submit — replay the cookie so the server sees the same anon session.
const submitRes = await fetch(\`\${BASE}/api/challenge/submit\`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Idempotency-Key": crypto.randomUUID(),
    Cookie: cookie,
  },
  body: JSON.stringify({
    attemptToken,
    primaryText: "YOUR_AI_GENERATED_TEXT_HERE",
  }),
});
console.log(submitRes.status, await submitRes.json());`;
}

export function getCursorRules() {
  return `You are an AI Agent solving Kolk Arena challenges.
When writing scripts to fetch or submit:
- Always preserve session cookies if using cURL (use -c and -b).
- Send requests to ${CANONICAL_ORIGIN}
- Always include an 'Idempotency-Key: <uuid>' header in POST /api/challenge/submit.
- Only return final outputs as requested by the challenge brief, no extra markdown unless required.`;
}

/**
 * Local pre-flight check that mirrors the server's enforceable rules in
 * `src/app/api/challenge/submit/route.ts` and
 * `src/lib/kolk/evaluator/layer1.ts`. We deliberately do NOT re-assert
 * literal section titles that the server does not parse (Google Maps
 * Description, Instagram Bio, Intro/Services/CTA, Hero/About, etc.) — those
 * would flag valid submissions as failing locally while the server accepts
 * them.
 *
 * L5 minimum lengths are code-point-correct (`[...str].length`) to match
 * the server JSON field check in `submit/route.ts` L674-L681.
 *
 * L8 mirrors the server's `requiredHeaderKeywords` substring scan in
 * `layer1.ts :: headerKeywordCheck`.
 */
export function dryRunValidation(level: number, text: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const trimmed = text.trim();
  const dr = copy.challenge.dryRun;

  if (trimmed.length === 0) {
    errors.push(dr.primaryTextEmpty);
    return { valid: false, errors };
  }

  if (level === 5) {
    if (/^```/.test(trimmed)) {
      errors.push(dr.l5RemoveFences);
      return { valid: false, errors };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      errors.push(dr.l5InvalidJson);
      return { valid: false, errors };
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      errors.push(dr.l5MustBeObject);
      return { valid: false, errors };
    }
    const obj = parsed as Record<string, unknown>;
    // Mirror server thresholds in submit/route.ts L674-L681:
    //   whatsapp_message min 51 (> 50 code-points)
    //   quick_facts     min 101 (> 100 code-points)
    //   first_step_checklist min 51 (> 50 code-points)
    const minLengths: Record<string, number> = {
      whatsapp_message: 51,
      quick_facts: 101,
      first_step_checklist: 51,
    };
    for (const key of ['whatsapp_message', 'quick_facts', 'first_step_checklist']) {
      const value = obj[key];
      if (typeof value !== 'string') {
        errors.push(dr.l5MissingKey(key));
        continue;
      }
      // Code-point-correct length; matches Layer1 jsonStringFieldsCheck.
      const trimmedValue = value.trim();
      const codePointLength = [...trimmedValue].length;
      if (codePointLength < minLengths[key]) {
        errors.push(dr.l5KeyTooShort(key, minLengths[key], codePointLength));
      }
    }
  } else if (level === 2) {
    // Server does NOT require literal "## Google Maps Description" / "## Instagram Bio"
    // headers. Keep a baseline check so the user gets a nudge if they forgot
    // the JSON fence the brief asks for.
    if (!/```[\s\S]*```/.test(trimmed)) {
      errors.push(dr.l2MissingFence);
    }
  } else if (level === 8) {
    // Server rule (see layer1.ts headerKeywordCheck + submit route L683):
    //   scan Markdown ## headers for case-insensitive substrings
    //   `copy`, `prompt`, `whatsapp` — one header per keyword.
    const headers = Array.from(trimmed.matchAll(/^##\s+(.+)$/gm))
      .map((m) => (m[1] ?? '').trim().toLowerCase());
    for (const keyword of ['copy', 'prompt', 'whatsapp']) {
      if (!headers.some((h) => h.includes(keyword))) {
        errors.push(dr.l8MissingHeader(keyword));
      }
    }
  }
  // L0, L1, L3, L4, L6, L7 — server is baseline / deterministic-only; a
  // non-empty primaryText is all we can assert locally without drifting
  // from the server.

  return { valid: errors.length === 0, errors };
}
