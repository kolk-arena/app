#!/usr/bin/env bash
# Kolk Arena — 2026-04-20 T-0 launch script.
#
# Prerequisites (do these ONCE before running):
#   - gh auth switch --user kolk-arena   (verify: gh auth status)
#   - cd to repo root
#   - working tree clean: git status must be empty
#
# What this script does (in order):
#   1. Final pre-flight: typecheck + lint + build + Playwright smoke
#   2. Flip repo visibility to public
#   3. Apply main-branch protection (requires PR review, status checks, no force-push)
#   4. Create v0.1.0 git tag + GitHub Release
#   5. Final smoke against production
#
# Run it with:   bash scripts/ops/launch-day.sh
# Every step prompts [y/N] before executing, so you can abort anywhere.

set -euo pipefail

REPO="kolk-arena/app"
TAG="v0.1.0"
PROD_ORIGIN="https://www.kolkarena.com"

confirm() {
  read -r -p "$1 [y/N] " ans
  [[ "$ans" == "y" || "$ans" == "Y" ]]
}

echo "════════════════════════════════════════════════════════════"
echo "  Kolk Arena Launch — 2026-04-20 T-0"
echo "  Repo:   $REPO"
echo "  Tag:    $TAG"
echo "  Prod:   $PROD_ORIGIN"
echo "════════════════════════════════════════════════════════════"
echo

# Guard: must be on main, clean tree
[[ "$(git rev-parse --abbrev-ref HEAD)" == "main" ]] || { echo "ERR: not on main"; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo "ERR: working tree dirty"; exit 1; }

# Guard: gh account
GH_ACTIVE=$(gh auth status 2>&1 | grep -A1 "Active account: true" | grep -oE "kolk-arena" | head -1)
[[ "$GH_ACTIVE" == "kolk-arena" ]] || { echo "ERR: active gh account is not 'kolk-arena'. Run: gh auth switch --user kolk-arena"; exit 1; }

echo "───── Step 1 / 5 · Pre-flight validation ─────"
if confirm "Run typecheck + lint + build + Playwright smoke?"; then
  pnpm typecheck
  pnpm lint
  pnpm build
  pnpm exec playwright test tests/e2e/ui-regression.spec.ts
  echo "✓ pre-flight green"
else
  echo "skipped"
fi
echo

echo "───── Step 2 / 5 · Flip repo to PUBLIC ─────"
echo "Current visibility: $(gh repo view $REPO --json visibility --jq .visibility)"
if confirm "Flip $REPO to PUBLIC?"; then
  gh repo edit "$REPO" --visibility public --accept-visibility-change-consequences
  echo "✓ $REPO is now PUBLIC"
else
  echo "skipped — nothing below this will work correctly; aborting"
  exit 0
fi
echo

echo "───── Step 3 / 5 · Branch protection on main ─────"
if confirm "Apply branch protection (require PR, require CI, no force-push)?"; then
  gh api -X PUT "repos/$REPO/branches/main/protection" \
    --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["Lint and Build", "Playwright UI regression"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": true
}
JSON
  echo "✓ main is now protected"
else
  echo "skipped"
fi
echo

echo "───── Step 4 / 5 · Tag v0.1.0 + GitHub Release ─────"
if confirm "Create git tag $TAG + GitHub Release?"; then
  git tag -a "$TAG" -m "Kolk Arena $TAG — public beta launch (2026-04-20 TecMilenio)"
  git push origin "$TAG"
  gh release create "$TAG" \
    --repo "$REPO" \
    --title "Kolk Arena $TAG — public beta launch" \
    --notes "Public launch of the Kolk Arena L0-L8 benchmark. See CHANGELOG.md for the full changelist. Submit agent baselines via \`kolk-arena\` CLI or the /challenge/:level web UI. Docs: https://github.com/$REPO/tree/main/docs"
  echo "✓ $TAG tagged + release published"
else
  echo "skipped"
fi
echo

echo "───── Step 5 / 5 · Final prod smoke ─────"
if confirm "Run final smoke against $PROD_ORIGIN ?"; then
  set +e
  ROOT_STATUS=$(curl -sS -o /dev/null -w "%{http_code}" "$PROD_ORIGIN/")
  L0_STATUS=$(curl -sS -o /dev/null -w "%{http_code}" "$PROD_ORIGIN/api/challenge/0")
  LB_STATUS=$(curl -sS -o /dev/null -w "%{http_code}" "$PROD_ORIGIN/api/leaderboard")
  L9_BODY=$(curl -sS "$PROD_ORIGIN/api/challenge/9")
  APEX_STATUS=$(curl -sS -o /dev/null -w "%{http_code}" -L "https://kolkarena.com/")
  set -e

  echo
  echo "  root               $ROOT_STATUS   (want 200)"
  echo "  /api/challenge/0   $L0_STATUS   (want 200)"
  echo "  /api/leaderboard   $LB_STATUS   (want 200)"
  echo "  /api/challenge/9   $(echo $L9_BODY | head -c 50)...   (want LEVEL_NOT_AVAILABLE)"
  echo "  apex redirect end  $APEX_STATUS   (want 200 after follow)"
  echo
  if [[ "$ROOT_STATUS" = "200" && "$L0_STATUS" = "200" && "$LB_STATUS" = "200" ]]; then
    echo "✓ smoke green"
  else
    echo "⚠ smoke NOT clean — investigate before announcing"
  fi
fi
echo

echo "════════════════════════════════════════════════════════════"
echo "  LAUNCH COMPLETE."
echo "  Public repo:  https://github.com/$REPO"
echo "  Production:   $PROD_ORIGIN"
echo "════════════════════════════════════════════════════════════"
