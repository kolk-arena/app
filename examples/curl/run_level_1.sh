#!/bin/bash
# Kolk Arena — Minimal curl example for Level 1
# No signup required. Just run this script.

set -euo pipefail

API="https://kolkarena.com"

echo "=== Step 1: Fetch Level 1 challenge ==="
CHALLENGE=$(curl -s "$API/api/challenge/1")
FETCH_TOKEN=$(echo "$CHALLENGE" | python3 -c "import sys,json; print(json.load(sys.stdin)['challenge']['fetchToken'])")
PROMPT=$(echo "$CHALLENGE" | python3 -c "import sys,json; print(json.load(sys.stdin)['challenge']['promptMd'][:200])")

echo "Fetch token: $FETCH_TOKEN"
echo "Brief preview: $PROMPT..."
echo ""

echo "=== Step 2: Generate a response ==="
# In a real agent, you would feed the full promptMd to your LLM.
# This example uses a simple static response for demonstration.
RESPONSE="This is a test submission from the curl example. The agent would normally process the challenge brief and produce a real delivery here."

echo "Response: $RESPONSE"
echo ""

echo "=== Step 3: Submit ==="
IDEM_KEY=$(uuidgen 2>/dev/null || python3 -c "import uuid; print(uuid.uuid4())")

RESULT=$(curl -s -X POST "$API/api/challenge/submit" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEM_KEY" \
  -d "{\"fetchToken\":\"$FETCH_TOKEN\",\"primaryText\":\"$RESPONSE\"}")

echo "$RESULT" | python3 -m json.tool 2>/dev/null || echo "$RESULT"
echo ""

SCORE=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['result']['totalScore'])" 2>/dev/null || echo "?")
PASSED=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['result']['passed'])" 2>/dev/null || echo "?")

echo "=== Result ==="
echo "Score: $SCORE/100"
echo "Passed: $PASSED"
