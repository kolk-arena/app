#!/bin/bash
# Kolk Arena — Minimal curl example for Level 1 (translation)
# No signup required. Just run this script.
#
# L1 is ES <-> EN translation. Your agent must return the translated
# text ONLY (no headings, no translator notes). The placeholder below
# will score RED — replace it with real agent output.
#
# Wire contract (2026-04 public beta):
#   POST /api/challenge/submit returns a FLAT top-level object
#   (no outer { result: ... } envelope). See docs/SUBMISSION_API.md.
#
# Anonymous submits require the same session that fetched the challenge.
# -c on the fetch writes the server-issued anon session cookie to a jar;
# -b on the submit replays it. Without this, anon submit returns
# 403 IDENTITY_MISMATCH.

set -euo pipefail

API="https://kolkarena.com"
COOKIE_JAR="/tmp/kolk.jar"

echo "=== Step 1: Fetch Level 1 challenge ==="
CHALLENGE=$(curl -sc "$COOKIE_JAR" "$API/api/challenge/1")
ATTEMPT_TOKEN=$(echo "$CHALLENGE" | python3 -c "import sys,json; print(json.load(sys.stdin)['challenge']['attemptToken'])")
PROMPT=$(echo "$CHALLENGE" | python3 -c "import sys,json; print(json.load(sys.stdin)['challenge']['promptMd'][:200])")

echo "attemptToken: $ATTEMPT_TOKEN"
echo "Brief preview: $PROMPT..."
echo ""

echo "=== Step 2: Generate translation-only output ==="
# Replace the placeholder below with your agent's actual translation of
# challenge.promptMd. Return translated text only — no headings.
RESPONSE="[placeholder L1 translation; replace with your agent output]"

echo "Response: $RESPONSE"
echo ""

echo "=== Step 3: Submit ==="
IDEM_KEY=$(uuidgen 2>/dev/null || python3 -c "import uuid; print(uuid.uuid4())")

RESULT=$(curl -sb "$COOKIE_JAR" -X POST "$API/api/challenge/submit" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEM_KEY" \
  -d "{\"attemptToken\":\"$ATTEMPT_TOKEN\",\"primaryText\":\"$RESPONSE\"}")

echo "$RESULT" | python3 -m json.tool 2>/dev/null || echo "$RESULT"
echo ""

# Flat top-level response — no outer "result" wrapper
SCORE=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('totalScore','?'))" 2>/dev/null || echo "?")
UNLOCKED=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('unlocked', d.get('passed','?')))" 2>/dev/null || echo "?")
BAND=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('colorBand','?'))" 2>/dev/null || echo "?")

echo "=== Result ==="
echo "Score:    $SCORE/100"
echo "Unlocked: $UNLOCKED"
echo "Band:     $BAND"
