import { copy } from '@/i18n';
import { APP_CONFIG } from '@/lib/frontend/app-config';
import type { BetaPublicLevel, ScriptLang } from '@/i18n/types';
import type { CodeBlockLanguage } from '@/components/ui/code-block';
import {
  ANONYMOUS_BETA_MAX_LEVEL,
  SUBMIT_RATE_LIMIT_PER_ATTEMPT_TOKEN_PER_HOUR,
  SUBMIT_RATE_LIMIT_PER_ATTEMPT_TOKEN_PER_MINUTE,
  SUBMIT_RATE_LIMIT_PER_IDENTITY_PER_DAY,
  SUBMIT_RETRY_CAP_PER_ATTEMPT_TOKEN,
} from '@/lib/kolk/beta-contract';

type ChallengeHandoffArgs = {
  level: BetaPublicLevel;
  levelName: string;
  promptMd: string;
  taskJson: Record<string, unknown>;
  attemptToken?: string;
};

const CANONICAL_ORIGIN = APP_CONFIG.canonicalOrigin;

type JsonRecord = Record<string, unknown>;

export type ScriptStep = {
  title: string;
  code: string;
};

export type ScriptBundle = {
  filename: string;
  code: string;
  steps: readonly ScriptStep[];
};

export const CHALLENGE_SCRIPT_LANGS: readonly ScriptLang[] = ['curl', 'python', 'node'] as const;

export function getScriptCodeLanguage(lang: ScriptLang): CodeBlockLanguage {
  switch (lang) {
    case 'curl':
      return 'bash';
    case 'python':
      return 'python';
    case 'node':
      return 'javascript';
  }
}

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

function buildShellBundle(filename: string, steps: readonly ScriptStep[]): ScriptBundle {
  const code = steps
    .map((step, index) => `# ${index + 1}. ${step.title}\n${step.code}`)
    .join('\n\n');

  return { filename, code, steps };
}

export function getL0SmokeTestBundle(): ScriptBundle {
  const steps: readonly ScriptStep[] = [
    {
      title: 'Fetch L0 and preserve the anonymous session cookie',
      code: `curl -sc /tmp/kolk.jar ${CANONICAL_ORIGIN}/api/challenge/0 > /tmp/kolk_l0.json
ATTEMPT="$(jq -r '.challenge.attemptToken' /tmp/kolk_l0.json)"`,
    },
    {
      title: 'Submit with the same cookie jar and attemptToken',
      code: `curl -sb /tmp/kolk.jar -X POST ${CANONICAL_ORIGIN}/api/challenge/submit \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d "{\\"attemptToken\\":\\"$ATTEMPT\\",\\"primaryText\\":\\"Hello Kolk Arena\\"}" \\
  > /tmp/kolk_l0_result.json`,
    },
    {
      title: 'Check the unlock response shape',
      code: `jq '{ unlocked, aiJudged, levelUnlocked }' /tmp/kolk_l0_result.json`,
    },
  ];

  return buildShellBundle('kolk-l0-smoke-test.sh', steps);
}

export function getAgentStarterPrompt() {
  return `You are helping me submit to Kolk Arena.

I will paste one fetched challenge JSON object from the Kolk Arena API.

Return contract:
1. Read challenge.promptMd carefully.
2. Read challenge.taskJson.structured_brief if it exists; otherwise use challenge.taskJson.
3. Produce only the final primaryText I should submit.

Return rules:
- Return only the final delivery text.
- Do not explain your reasoning.
- Do not add prefaces, notes, or trailing commentary.
- Do not ask follow-up questions.
- Do not wrap the answer in Markdown fences unless the brief explicitly requires fenced content.
- For L5, return raw JSON object text only with these string keys:
  whatsapp_message, quick_facts, first_step_checklist.`;
}

function isCompetitiveLevel(level: BetaPublicLevel) {
  return level > ANONYMOUS_BETA_MAX_LEVEL;
}

function getIdentityMode(level: BetaPublicLevel) {
  return isCompetitiveLevel(level) ? 'bearer_token' : 'browser_session_cookie';
}

export function getSubmitContractSnippet(
  attemptToken = '<attemptToken>',
  level?: BetaPublicLevel,
) {
  const authLines =
    level == null
      ? `  Cookie: <same cookie jar from fetch>   # anonymous L0-L5
  Authorization: Bearer <token>    # signed-in L6+`
      : isCompetitiveLevel(level)
      ? '  Authorization: Bearer <token>'
      : '  Cookie: <same cookie jar from fetch>';

  return `POST ${CANONICAL_ORIGIN}/api/challenge/submit
Headers:
  Content-Type: application/json
  Idempotency-Key: <uuid>
${authLines}
Body:
{
  "attemptToken": "${attemptToken}",
  "primaryText": "<final delivery text>"
}`;
}

export function getChallengeScriptBundle(lang: ScriptLang, level: BetaPublicLevel): ScriptBundle {
  const competitive = isCompetitiveLevel(level);

  if (lang === 'curl') {
    const steps: readonly ScriptStep[] = competitive
      ? [
          {
            title: 'Set your bearer token and fetch the challenge',
            code: `#!/usr/bin/env bash
set -euo pipefail

BASE="${CANONICAL_ORIGIN}"
LEVEL=${level}
CHALLENGE_JSON="$(mktemp)"
KOLK_TOKEN="\${KOLK_TOKEN:-YOUR_PAT_HERE}"

curl -sS "$BASE/api/challenge/$LEVEL" \
  -H "Authorization: Bearer $KOLK_TOKEN" \
  > "$CHALLENGE_JSON"`,
          },
          {
            title: 'Inspect the brief, then prepare the payload your agent will fill',
            code: `jq '.challenge | { attemptToken, promptMd, taskJson }' "$CHALLENGE_JSON"
ATTEMPT_TOKEN="$(jq -r '.challenge.attemptToken' "$CHALLENGE_JSON")"

cat > payload.json <<JSON
{
  "attemptToken": "$ATTEMPT_TOKEN",
  "primaryText": "YOUR_AI_GENERATED_TEXT_HERE"
}
JSON`,
          },
          {
            title: 'Submit the final delivery with the same bearer token',
            code: `curl -sS -X POST "$BASE/api/challenge/submit" \\
  -H "Authorization: Bearer $KOLK_TOKEN" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d @payload.json`,
          },
        ]
      : [
          {
            title: 'Fetch the challenge and preserve the anonymous session cookie',
            code: `#!/usr/bin/env bash
set -euo pipefail

BASE="${CANONICAL_ORIGIN}"
LEVEL=${level}
COOKIE_JAR="$(mktemp)"
CHALLENGE_JSON="$(mktemp)"

curl -sc "$COOKIE_JAR" "$BASE/api/challenge/$LEVEL" > "$CHALLENGE_JSON"`,
          },
          {
            title: 'Inspect the brief, then prepare the payload your agent will fill',
            code: `jq '.challenge | { attemptToken, promptMd, taskJson }' "$CHALLENGE_JSON"
ATTEMPT_TOKEN="$(jq -r '.challenge.attemptToken' "$CHALLENGE_JSON")"

cat > payload.json <<JSON
{
  "attemptToken": "$ATTEMPT_TOKEN",
  "primaryText": "YOUR_AI_GENERATED_TEXT_HERE"
}
JSON`,
          },
          {
            title: 'Submit the final delivery with the same cookie jar',
            code: `curl -sb "$COOKIE_JAR" -X POST "$BASE/api/challenge/submit" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d @payload.json`,
          },
        ];

    return buildShellBundle('solve.sh', steps);
  }

  if (lang === 'python') {
    const steps: readonly ScriptStep[] = competitive
      ? [
          {
            title: 'Fetch the challenge with a bearer token',
            code: `import os
import uuid
import requests

BASE = "${CANONICAL_ORIGIN}"
LEVEL = ${level}
TOKEN = os.environ["KOLK_TOKEN"]

session = requests.Session()
response = session.get(
    f"{BASE}/api/challenge/{LEVEL}",
    headers={"Authorization": f"Bearer {TOKEN}"},
    timeout=30,
)
response.raise_for_status()
challenge = response.json()["challenge"]
attempt_token = challenge["attemptToken"]

print({
    "attemptToken": attempt_token,
    "promptMd": challenge["promptMd"],
    "taskJson": challenge["taskJson"],
})`,
          },
          {
            title: 'Insert the final primaryText from your agent',
            code: `primary_text = "YOUR_AI_GENERATED_TEXT_HERE"
payload = {
    "attemptToken": attempt_token,
    "primaryText": primary_text,
}`,
          },
          {
            title: 'Submit with the same bearer token',
            code: `submit_response = session.post(
    f"{BASE}/api/challenge/submit",
    headers={
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json",
        "Idempotency-Key": str(uuid.uuid4()),
    },
    json=payload,
    timeout=60,
)
print(submit_response.status_code, submit_response.json())`,
          },
        ]
      : [
          {
            title: 'Fetch the challenge with a persistent requests session',
            code: `import uuid
import requests

BASE = "${CANONICAL_ORIGIN}"
LEVEL = ${level}

session = requests.Session()
response = session.get(f"{BASE}/api/challenge/{LEVEL}", timeout=30)
response.raise_for_status()
challenge = response.json()["challenge"]
attempt_token = challenge["attemptToken"]

print({
    "attemptToken": attempt_token,
    "promptMd": challenge["promptMd"],
    "taskJson": challenge["taskJson"],
})`,
          },
          {
            title: 'Insert the final primaryText from your agent',
            code: `primary_text = "YOUR_AI_GENERATED_TEXT_HERE"
payload = {
    "attemptToken": attempt_token,
    "primaryText": primary_text,
}`,
          },
          {
            title: 'Submit with the same session so the cookie replays automatically',
            code: `submit_response = session.post(
    f"{BASE}/api/challenge/submit",
    headers={
        "Content-Type": "application/json",
        "Idempotency-Key": str(uuid.uuid4()),
    },
    json=payload,
    timeout=60,
)
print(submit_response.status_code, submit_response.json())`,
          },
        ];

    return {
      filename: 'solve.py',
      code: steps.map((step, index) => `# ${index + 1}. ${step.title}\n${step.code}`).join('\n\n'),
      steps,
    };
  }

  const steps: readonly ScriptStep[] = competitive
    ? [
        {
          title: 'Fetch the challenge with a bearer token',
          code: `const BASE = "${CANONICAL_ORIGIN}";
const LEVEL = ${level};
const TOKEN = process.env.KOLK_TOKEN ?? "YOUR_PAT_HERE";

const fetchRes = await fetch(\`\${BASE}/api/challenge/\${LEVEL}\`, {
  headers: {
    Authorization: \`Bearer \${TOKEN}\`,
  },
});

const { challenge } = await fetchRes.json();
const attemptToken = challenge.attemptToken;

console.log({
  attemptToken,
  promptMd: challenge.promptMd,
  taskJson: challenge.taskJson,
});`,
        },
        {
          title: 'Insert the final primaryText from your agent',
          code: `const payload = {
  attemptToken,
  primaryText: "YOUR_AI_GENERATED_TEXT_HERE",
};`,
        },
        {
          title: 'Submit with the same bearer token',
          code: `const submitRes = await fetch(\`\${BASE}/api/challenge/submit\`, {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${TOKEN}\`,
    "Content-Type": "application/json",
    "Idempotency-Key": crypto.randomUUID(),
  },
  body: JSON.stringify(payload),
});

console.log(submitRes.status, await submitRes.json());`,
        },
      ]
    : [
        {
          title: 'Fetch the challenge and replay the anonymous session cookie manually',
          code: `const BASE = "${CANONICAL_ORIGIN}";
const LEVEL = ${level};

const fetchRes = await fetch(\`\${BASE}/api/challenge/\${LEVEL}\`);
const setCookie = fetchRes.headers.get("set-cookie") ?? "";
const cookie = setCookie.split(/,(?=\\s*\\w+=)/)
  .map((chunk) => chunk.split(";")[0].trim())
  .filter(Boolean)
  .join("; ");

const { challenge } = await fetchRes.json();
const attemptToken = challenge.attemptToken;

console.log({
  attemptToken,
  promptMd: challenge.promptMd,
  taskJson: challenge.taskJson,
});`,
        },
        {
          title: 'Insert the final primaryText from your agent',
          code: `const payload = {
  attemptToken,
  primaryText: "YOUR_AI_GENERATED_TEXT_HERE",
};`,
        },
        {
          title: 'Submit with the replayed cookie and a fresh Idempotency-Key',
          code: `const submitRes = await fetch(\`\${BASE}/api/challenge/submit\`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Idempotency-Key": crypto.randomUUID(),
    Cookie: cookie,
  },
  body: JSON.stringify(payload),
});

console.log(submitRes.status, await submitRes.json());`,
        },
      ];

  return {
    filename: 'solve.js',
    code: steps.map((step, index) => `// ${index + 1}. ${step.title}\n${step.code}`).join('\n\n'),
    steps,
  };
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
        'Follow the live brief first. A common high-quality shape is ## Intro, ## Services, ## CTA.',
        'Make the services section concrete and grounded in the business facts from the brief.',
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
        'A common high-quality shape is ## Hero, ## About, ## Services, ## CTA.',
      ];
    case 7:
      return [
        'Follow the live brief counts and headings for the prompt pack.',
        'A high-quality response usually includes prompt blocks, style rules, and forbidden mistakes in a clean reusable format.',
      ];
    case 8:
      return [
        'Follow the live brief for the required top-level package sections.',
        'A high-quality response usually separates the one-page copy, prompt pack, and WhatsApp welcome surfaces clearly.',
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
      return 'Follow the live brief and business facts closely. A common high-quality shape is ## Intro / ## Services / ## CTA.';
    case 4:
      return 'Read structured_brief.trip_days and return exactly that many ## Day N sections, each with Morning, Afternoon, Evening, Budget, and Tip lines.';
    case 5:
      return 'L5 requires a raw JSON object string with three keys: whatsapp_message, quick_facts, first_step_checklist.';
    case 6:
      return 'Return one-page copy that cleanly covers Hero, About, Services, and CTA.';
    case 7:
      return 'Return a reusable prompt pack that follows the live brief counts and names.';
    case 8:
      return 'Return a complete package that clearly separates the one-page copy, prompt pack, and WhatsApp welcome surfaces.';
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
  const exactShapeLevels = new Set<BetaPublicLevel>([0, 1, 4, 5]);
  const outputShapeLead = exactShapeLevels.has(level)
    ? 'Use this exact shape when producing primaryText:'
    : 'Use this as a strong starting shape. The live brief remains the source of truth if it is more specific:';

  return `You are producing a Kolk Arena submission.

### OUTPUT CONTRACT
- Return ONLY the final primaryText payload.
- No pleasantries, no explanations, no commentary, no analysis.
- Do not ask clarifying questions. Solve from the provided brief in one pass.
- No markdown formatting unless explicitly requested.
${level === 5 ? '- For L5, return raw JSON object text only. Do not wrap it in Markdown fences.' : '- Do not wrap the answer in Markdown fences unless the brief explicitly requires fenced content.'}

### CHALLENGE
Level: L${level} — ${levelName}

### SOURCE OF TRUTH
- Follow the task description exactly.
- Use the ${structuredBrief ? 'structured_brief JSON' : 'taskJson'} block as the machine-readable source of facts and fields.
- If the brief contains both prose and structured fields, satisfy the hard requirements first and use the suggested output shape to improve quality.

### REQUIRED FORMAT
${rules}

### TASK DESCRIPTION
${promptMd}

### DATA CONTEXT — ${structuredBrief ? 'structured_brief JSON' : 'taskJson'}
\`\`\`json
${stringifyJson(structuredBrief ?? taskJson)}
\`\`\`

### OUTPUT SHAPE
${outputShapeLead}
${outputTemplate}

### FINAL CHECK
- Make sure every hard requirement from the live brief is present.
- Make sure the output is complete and directly usable as primaryText.
- Remove any draft notes, rationale, or extra wrapper text before returning the final answer.`;
}

export function getChallengeHandoffBundle({
  level,
  levelName,
  promptMd,
  taskJson,
  attemptToken,
}: ChallengeHandoffArgs) {
  const challengeUrl = `${CANONICAL_ORIGIN}/challenge/${level}`;
  const structuredBrief = extractStructuredBrief(taskJson);
  const identityMode = getIdentityMode(level);

  return stringifyJson({
    arena: 'Kolk Arena',
    version: 'beta-v1',
    challenge: {
      level,
      levelName,
      challengeUrl,
      attemptToken: attemptToken ?? '<attemptToken>',
      promptMd,
      taskJson,
      structuredBrief: structuredBrief ?? null,
      outputTemplate: getLevelOutputTemplate(level, taskJson),
    },
    submit: {
      url: `${CANONICAL_ORIGIN}/api/challenge/submit`,
      method: 'POST',
      identityMode,
      headers:
        identityMode === 'bearer_token'
          ? {
              'Content-Type': 'application/json',
              'Idempotency-Key': '<uuid>',
              Authorization: 'Bearer <token>',
            }
          : {
              'Content-Type': 'application/json',
              'Idempotency-Key': '<uuid>',
              Cookie: '<same browser session or cookie jar used for fetch>',
            },
      body: {
        attemptToken: attemptToken ?? '<attemptToken>',
        primaryText: '<final delivery text only>',
      },
    },
    retryPolicy: {
      attemptTokenTtlHours: 24,
      maxRetriesPerAttemptToken: SUBMIT_RETRY_CAP_PER_ATTEMPT_TOKEN,
      perMinuteLimit: SUBMIT_RATE_LIMIT_PER_ATTEMPT_TOKEN_PER_MINUTE,
      perHourLimit: SUBMIT_RATE_LIMIT_PER_ATTEMPT_TOKEN_PER_HOUR,
      consumeOn: ['unlock_pass', '24h_expiry'],
    },
    rules: {
      returnOnlyFinalPrimaryText: true,
      noReasoningOrWrapperText: true,
      preserveSameIdentityBetweenFetchAndSubmit: true,
      l5JsonOnly:
        level === 5
          ? ['whatsapp_message', 'quick_facts', 'first_step_checklist']
          : null,
    },
  });
}

// The Claude Code bash bundle only needs level + levelName — it
// instructs the CLI to fetch promptMd/taskJson/attemptToken at runtime
// via curl + jq, so we don't bake them into the static text. Narrow
// the type here to make that contract explicit and stop callers from
// believing they need to supply fields the template will ignore.
//
// L0-L5 are anonymous: the submit route treats the caller as anonymous
// via the `kolk_anon_session` cookie. `curl -c`/`-b` keeps that cookie
// between GET and POST. L6+ browser pages can use a signed-in browser
// session, but copied CLI/API snippets should use `Authorization: Bearer
// <PAT>` on both GET and POST. The bash template branches on that so
// L6+ users don't hit AUTH_REQUIRED when they run it outside the browser.
export function getClaudeCodeTaskBundle({
  level,
  levelName,
}: Pick<ChallengeHandoffArgs, 'level' | 'levelName'>) {
  const isL5 = level === 5;
  const needsBearer = isCompetitiveLevel(level);

  const fetchCmd = needsBearer
    ? `curl -s -H "Authorization: Bearer $KOLK_TOKEN" ${CANONICAL_ORIGIN}/api/challenge/${level} > /tmp/kolk.json`
    : `curl -sc /tmp/kolk.jar ${CANONICAL_ORIGIN}/api/challenge/${level} > /tmp/kolk.json`;

  const submitCmd = needsBearer
    ? `jq -n --arg attempt "$ATTEMPT" --rawfile primary /tmp/kolk_output.txt \\
  '{attemptToken: $attempt, primaryText: $primary}' > /tmp/kolk_submit.json

curl -s -X POST ${CANONICAL_ORIGIN}/api/challenge/submit \\
  -H "Authorization: Bearer $KOLK_TOKEN" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  --data-binary @/tmp/kolk_submit.json`
    : `jq -n --arg attempt "$ATTEMPT" --rawfile primary /tmp/kolk_output.txt \\
  '{attemptToken: $attempt, primaryText: $primary}' > /tmp/kolk_submit.json

curl -sb /tmp/kolk.jar -X POST ${CANONICAL_ORIGIN}/api/challenge/submit \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  --data-binary @/tmp/kolk_submit.json`;

  const preamble = needsBearer
    ? `Prerequisite: L${level} is a signed-in level. Create a personal access token at ${CANONICAL_ORIGIN}/profile and export it once before running the block:

\`\`\`bash
export KOLK_TOKEN="kat_your_token_here"
\`\`\`

Then:`
    : `Copy this entire block into Claude Code to solve Kolk Arena L${level} — ${levelName}:`;

  return `# Kolk Arena task for Claude Code — L${level} ${levelName}

${preamble}

\`\`\`bash
# 1. Fetch challenge
${fetchCmd}

# 2. Extract context
ATTEMPT=$(jq -r '.challenge.attemptToken' /tmp/kolk.json)
PROMPT=$(jq -r '.challenge.promptMd' /tmp/kolk.json)
TASK=$(jq '.challenge.taskJson' /tmp/kolk.json)

# Now solve the challenge using the $PROMPT and $TASK variables.
# ${isL5 ? 'Return raw JSON object text only with string keys: whatsapp_message, quick_facts, first_step_checklist.' : 'Produce ONLY the final primaryText.'}

# 3. Submit
# Write ONLY your final primaryText to /tmp/kolk_output.txt first.
# This file-based body avoids broken JSON when the answer has quotes or newlines.
${submitCmd}
\`\`\`
`;
}

export function getCursorTaskBundle({
  level,
  levelName,
  promptMd,
  taskJson,
  attemptToken,
}: ChallengeHandoffArgs) {
  const structuredBrief = extractStructuredBrief(taskJson);

  return `# Kolk Arena task for Cursor

Use this as a one-run Cursor task file or paste it into Cursor chat.
Do not save it as workspace-wide .cursorrules because it contains challenge-specific state.

You are solving Kolk Arena L${level} — ${levelName}.

### GOAL
Read the brief below and produce the final primaryText.
Return ONLY the final primaryText. No reasoning, no wrapper prose.
${level === 5 ? 'L5 must be raw JSON object text with string keys: whatsapp_message, quick_facts, first_step_checklist.' : ''}

### BRIEF
${promptMd}

### DATA CONTEXT
\`\`\`json
${stringifyJson(structuredBrief ?? taskJson)}
\`\`\`

### SUGGESTED OUTPUT SHAPE
${getLevelOutputTemplate(level, taskJson)}

### SUBMIT CONTRACT
${getSubmitContractSnippet(attemptToken ?? '<attemptToken>', level)}

### RULES
- Anonymous L0-L5 runs must preserve the same cookie jar between fetch and submit. If Cursor did not fetch the challenge itself, generate the answer here and paste it back into the original Kolk Arena page.
- Signed-in L6+ runs must use \`Authorization: Bearer <token>\`.
- Regenerate \`Idempotency-Key\` for each new submit attempt.
- If the server returns \`fix_hint\`, repair the payload and retry with the same attemptToken.`;
}

export function getN8nStarterBundle({
  level,
  levelName,
}: ChallengeHandoffArgs) {
  const identityMode = isCompetitiveLevel(level) ? 'bearer_token' : 'anonymous_cookie';
  const isAnonymousCookieFlow = identityMode === 'anonymous_cookie';
  const fetchNodeName = 'Fetch Challenge';
  const aiNodeName = 'Generate PrimaryText';
  const fetchNodeChallenge = `$node["${fetchNodeName}"].json.challenge`;

  return stringifyJson({
    kind: 'kolk_n8n_blueprint',
    name: `Kolk Arena L${level} blueprint notes - ${levelName}`,
    artifactType: 'blueprint_notes_not_importable_workflow',
    importableWorkflow: false,
    importableWorkflowReason:
      'This is a wiring blueprint, not an n8n workflow export. Create the nodes manually and use the expressions below so all challenge fields come from the same live fetch step.',
    identityMode,
    overview: 'Blueprint for wiring an n8n flow that respects the live Kolk Arena fetch -> solve -> submit contract.',
    fetchStep: {
      nodeName: fetchNodeName,
      nodeType: 'n8n-nodes-base.httpRequest',
      method: 'GET',
      url: `${CANONICAL_ORIGIN}/api/challenge/${level}`,
      headers:
        identityMode === 'bearer_token'
          ? {
              Authorization: 'Bearer <token>',
            }
          : {},
      sessionRequirement: isAnonymousCookieFlow
        ? 'Persist the same cookie jar from this fetch step through the submit step. Without the same cookie/session, anonymous L0-L5 submit will fail.'
        : 'Use the same bearer token for fetch and submit.',
      responsePath: 'challenge',
      outputExpressions: {
        promptMd: '={{ $json.challenge.promptMd }}',
        taskJson: '={{ $json.challenge.taskJson }}',
        structuredBrief: '={{ $json.challenge.taskJson.structured_brief ?? $json.challenge.taskJson }}',
        attemptToken: '={{ $json.challenge.attemptToken }}',
      },
    },
    aiStep: {
      nodeName: aiNodeName,
      input: {
        promptMd: `={{ ${fetchNodeChallenge}.promptMd }}`,
        taskJson: `={{ ${fetchNodeChallenge}.taskJson }}`,
        structuredBrief: `={{ ${fetchNodeChallenge}.taskJson.structured_brief ?? ${fetchNodeChallenge}.taskJson }}`,
      },
      instruction: 'Return ONLY the final primaryText payload. No reasoning, no wrapper prose.',
      outputTemplate:
        'Use the fetched promptMd and taskJson as source of truth. Do not paste seed-specific fields from this page into the workflow.',
    },
    submitStep: {
      nodeType: 'n8n-nodes-base.httpRequest',
      method: 'POST',
      url: `${CANONICAL_ORIGIN}/api/challenge/submit`,
      headers:
        identityMode === 'bearer_token'
          ? {
              Authorization: 'Bearer <token>',
              'Content-Type': 'application/json',
              'Idempotency-Key': '<generate a new uuid per submit attempt>',
            }
          : {
              'Content-Type': 'application/json',
              'Idempotency-Key': '<generate a new uuid per submit attempt>',
              Cookie: '<same cookie jar preserved from fetchStep>',
            },
      bodyTemplate: {
        attemptToken: `={{ ${fetchNodeChallenge}.attemptToken }}`,
        primaryText: '<AI step final output>',
      },
    },
    retryPolicy: {
      attemptTokenTtlHours: 24,
      perMinuteLimit: SUBMIT_RATE_LIMIT_PER_ATTEMPT_TOKEN_PER_MINUTE,
      perHourLimit: SUBMIT_RATE_LIMIT_PER_ATTEMPT_TOKEN_PER_HOUR,
      maxRetriesPerAttemptToken: SUBMIT_RETRY_CAP_PER_ATTEMPT_TOKEN,
      note: 'Server-side 5xx failures, including 503 SCORING_UNAVAILABLE, do not spend submit quota. Validation/rate-limit failures do.',
    },
    n8nNotes: isAnonymousCookieFlow
      ? [
          'Anonymous L0-L5 automation is only valid if n8n preserves the same cookie/session between fetch and submit.',
          'If your workflow cannot preserve that cookie jar, use n8n only for generation and paste the final primaryText back into the original Kolk Arena page.',
          'Do not embed the current page structuredBrief in a later workflow run; read promptMd, taskJson, and attemptToken from the fetch node every time.',
        ]
      : [
          'Signed-in L6+ automation must reuse the same bearer token on both HTTP nodes.',
          'Generate a fresh Idempotency-Key on every new submit attempt.',
          'Do not embed the current page structuredBrief in a later workflow run; read promptMd, taskJson, and attemptToken from the fetch node every time.',
        ],
  });
}

export function getStructuredBriefCopy(taskJson: JsonRecord) {
  return stringifyJson(extractStructuredBrief(taskJson) ?? taskJson);
}

export function getAgentRules() {
  return `You are an AI Agent solving Kolk Arena challenges.
When writing scripts to fetch or submit:
- Always preserve session cookies if using cURL (use -c and -b).
- For L6+ terminal/API runs, use Authorization: Bearer <token> on fetch and submit instead of relying on a browser cookie.
- Send requests to ${CANONICAL_ORIGIN}
- Always include an 'Idempotency-Key: <uuid>' header in POST /api/challenge/submit.
- attemptToken stays reusable for up to 24 hours until either the run passes or the 24-hour ceiling expires.
- Submission rate limits: ${SUBMIT_RATE_LIMIT_PER_ATTEMPT_TOKEN_PER_MINUTE} per minute per attemptToken, ${SUBMIT_RATE_LIMIT_PER_ATTEMPT_TOKEN_PER_HOUR} per hour per attemptToken, ${SUBMIT_RETRY_CAP_PER_ATTEMPT_TOKEN} total non-refunded submits per attemptToken, and ${SUBMIT_RATE_LIMIT_PER_IDENTITY_PER_DAY} per identity per day. Server-side 5xx (judge/DB failures) do not count against any of these — retry freely.
- If the API returns 400/422 with fix_hint, revise the payload and resubmit.
- L5 primaryText must be raw JSON with string keys whatsapp_message, quick_facts, and first_step_checklist.
- Only return final outputs as requested by the challenge brief, no extra markdown unless required.`;
}

/**
 * Local pre-flight check that mirrors the server's enforceable rules in
 * `src/app/api/challenge/submit/route.ts` and
 * `src/lib/kolk/evaluator/layer1.ts`.
 *
 * This local validator has two jobs:
 * 1. hard errors for server-enforced constraints we can safely mirror
 * 2. advisory warnings for brief-shape expectations that are not parsed
 *    server-side but are still useful guardrails for agent output
 *
 * L5 minimum lengths are code-point-correct (`[...str].length`) to match
 * the server JSON field check in `submit/route.ts` L674-L681.
 *
 * L8 mirrors the server's `requiredHeaderKeywords` substring scan in
 * `layer1.ts :: headerKeywordCheck`.
 */
export function dryRunValidation(level: number, text: string): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const trimmed = text.trim();
  const dr = copy.challenge.dryRun;

  const h2Headers = Array.from(trimmed.matchAll(/^##\s+(.+)$/gm)).map((match) => (match[1] ?? '').trim().toLowerCase());
  const h3Headers = Array.from(trimmed.matchAll(/^###\s+(.+)$/gm)).map((match) => (match[1] ?? '').trim().toLowerCase());

  const hasHeader = (headers: string[], keyword: string) => headers.some((header) => header === keyword.toLowerCase());
  const hasKeywordHeader = (headers: string[], keyword: string) =>
    headers.some((header) => header.includes(keyword.toLowerCase()));

  if (trimmed.length === 0) {
    errors.push(dr.primaryTextEmpty);
    return { valid: false, errors, warnings };
  }

  if (level === 0) {
    if (!/(hello|kolk)/i.test(trimmed)) {
      errors.push(dr.l0MissingKeyword);
    }
  } else if (level === 5) {
    if (/^```/.test(trimmed)) {
      errors.push(dr.l5RemoveFences);
      return { valid: false, errors, warnings };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      errors.push(dr.l5InvalidJson);
      return { valid: false, errors, warnings };
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      errors.push(dr.l5MustBeObject);
      return { valid: false, errors, warnings };
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
    if (!/```[\s\S]*```/.test(trimmed)) {
      errors.push(dr.l2MissingFence);
    }
    if (!hasHeader(h2Headers, 'google maps description')) {
      warnings.push(dr.l2MissingHeader('Google Maps Description'));
    }
    if (!hasHeader(h2Headers, 'instagram bio')) {
      warnings.push(dr.l2MissingHeader('Instagram Bio'));
    }
  } else if (level === 3) {
    for (const section of ['Intro', 'Services', 'CTA']) {
      if (!hasHeader(h2Headers, section)) {
        warnings.push(dr.sectionRecommended(section));
      }
    }
  } else if (level === 6) {
    for (const section of ['Hero', 'About', 'Services', 'CTA']) {
      if (!hasHeader(h2Headers, section)) {
        warnings.push(dr.sectionRecommended(section));
      }
    }
  } else if (level === 8) {
    for (const keyword of ['copy', 'prompt', 'whatsapp']) {
      if (!hasKeywordHeader(h2Headers, keyword)) {
        errors.push(dr.l8MissingHeader(keyword));
      }
    }
    for (const section of ['Hero', 'About', 'Services', 'CTA']) {
      if (!hasHeader(h3Headers, section)) {
        warnings.push(dr.l8MissingSubHeader(section));
      }
    }
  }
  // L0, L1, L4, L7 — server is baseline / deterministic-only; a
  // non-empty primaryText is all we can assert locally without drifting
  // from the server.

  return { valid: errors.length === 0, errors, warnings };
}
