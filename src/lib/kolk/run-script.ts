import {
  ANONYMOUS_BETA_MAX_LEVEL,
  isPublicBetaLevel,
} from '@/lib/kolk/beta-contract';

export type RunScriptLevelParseResult =
  | { ok: true; level: number }
  | { ok: false; message: string };

export function parseRunScriptLevel(rawLevel: string): RunScriptLevelParseResult {
  const match = /^(\d+)(?:\.sh)?$/.exec(rawLevel.trim());
  if (!match) {
    return { ok: false, message: 'Run script URL must end with a level like /api/run/1.sh.' };
  }

  const level = Number.parseInt(match[1] ?? '', 10);
  if (!isPublicBetaLevel(level)) {
    return { ok: false, message: 'Requested level is not published yet.' };
  }

  return { ok: true, level };
}

export function buildRunScript(input: { level: number; origin: string }): string {
  const competitive = input.level > ANONYMOUS_BETA_MAX_LEVEL;
  const authFetch = competitive
    ? `curl -fsS \\
  -H "Authorization: Bearer \${KOLK_TOKEN}" \\
  "$BASE/api/challenge/$LEVEL" \\
  > "$CHALLENGE_JSON"`
    : `curl -fsS -c "$COOKIE_JAR" \\
  "$BASE/api/challenge/$LEVEL" \\
  > "$CHALLENGE_JSON"`;
  const authSubmitHeaders = competitive
    ? `  -H "Authorization: Bearer \${KOLK_TOKEN}" \\
`
    : '';
  const submitIdentity = competitive ? '' : '  -b "$COOKIE_JAR" \\\n';
  const tokenGuard = competitive
    ? `
if [ -z "\${KOLK_TOKEN:-}" ]; then
  printf '%s\\n' 'KOLK_TOKEN is required for L6+ competitive levels. Create a Personal Access Token in your Kolk profile, then rerun with KOLK_TOKEN set.' >&2
  exit 2
fi
`
    : '';
  const l0Default = input.level === 0
    ? `
if [ -z "\${PRIMARY_TEXT:-}" ] && [ -z "\${PRIMARY_TEXT_FILE:-}" ]; then
  PRIMARY_TEXT='Hello Kolk Arena'
fi
`
    : '';

  return `#!/usr/bin/env bash
set -euo pipefail

# Kolk Arena one-line runner for L${input.level}.
# Usage:
#   curl -fsSL ${input.origin}/api/run/${input.level}.sh | PRIMARY_TEXT_FILE=answer.txt bash
#   curl -fsSL ${input.origin}/api/run/${input.level}.sh | PRIMARY_TEXT='final delivery' bash
#
# L0 defaults PRIMARY_TEXT to "Hello Kolk Arena". Ranked levels require PRIMARY_TEXT
# or PRIMARY_TEXT_FILE. For L5, put the raw JSON object text in the file; jq
# will encode it safely as the primaryText string in the outer submit body.

BASE=${shellQuote(input.origin)}
LEVEL=${input.level}
WORK_DIR="$(mktemp -d)"
CHALLENGE_JSON="$WORK_DIR/challenge.json"
PRIMARY_TEXT_TMP="$WORK_DIR/primaryText.txt"
PAYLOAD_JSON="$WORK_DIR/payload.json"
SUBMIT_JSON="$WORK_DIR/submit.json"
COOKIE_JAR="$WORK_DIR/cookies.jar"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Missing required command: %s\\n' "$1" >&2
    exit 127
  fi
}

new_idempotency_key() {
  if command -v uuidgen >/dev/null 2>&1; then
    uuidgen
  elif [ -r /proc/sys/kernel/random/uuid ]; then
    cat /proc/sys/kernel/random/uuid
  elif command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 16
  else
    date '+%s-%N'
  fi
}

require_command curl
require_command jq
${tokenGuard}
${authFetch}

ATTEMPT_TOKEN="$(jq -er '.challenge.attemptToken' "$CHALLENGE_JSON")"

printf '%s\\n' '--- Kolk challenge prompt ---' >&2
jq -r '.challenge.promptMd' "$CHALLENGE_JSON" >&2
printf '%s\\n' '--- Structured task JSON ---' >&2
jq '.challenge.taskJson' "$CHALLENGE_JSON" >&2
${l0Default}
if [ -n "\${PRIMARY_TEXT_FILE:-}" ]; then
  if [ ! -f "$PRIMARY_TEXT_FILE" ]; then
    printf 'PRIMARY_TEXT_FILE does not exist: %s\\n' "$PRIMARY_TEXT_FILE" >&2
    exit 2
  fi
  cp "$PRIMARY_TEXT_FILE" "$PRIMARY_TEXT_TMP"
elif [ -n "\${PRIMARY_TEXT:-}" ]; then
  printf '%s' "$PRIMARY_TEXT" > "$PRIMARY_TEXT_TMP"
else
  printf '%s\\n' 'Write your final primaryText to a file, then rerun with PRIMARY_TEXT_FILE=/path/to/file.' >&2
  printf '%s\\n' 'The attemptToken and any cookie jar stay local to this script and are not placed in the URL.' >&2
  exit 2
fi

jq -n \\
  --arg attemptToken "$ATTEMPT_TOKEN" \\
  --rawfile primaryText "$PRIMARY_TEXT_TMP" \\
  '{attemptToken: $attemptToken, primaryText: $primaryText}' \\
  > "$PAYLOAD_JSON"

curl -fsS -X POST "$BASE/api/challenge/submit" \\
${submitIdentity}${authSubmitHeaders}  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(new_idempotency_key)" \\
  --data-binary @"$PAYLOAD_JSON" \\
  > "$SUBMIT_JSON"

jq . "$SUBMIT_JSON"
`;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
