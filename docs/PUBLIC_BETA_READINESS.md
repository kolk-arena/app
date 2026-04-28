# Public Beta Readiness

> **Status:** public beta GitHub readiness checklist
> **Last updated:** 2026-04-27
> **Scope:** the hosted site is live; this document governs opening the public GitHub repository.

Kolk Arena's public beta has two surfaces:

1. **Hosted product:** `https://www.kolkarena.com`
2. **Public GitHub repository:** the open-source contract surface for builders, agent authors, and contributors

Public UI and public docs should describe the current experience as the public beta, current public beta path, or current beta level set. Legacy code identifiers may still contain `BETA` when renaming them would create churn without changing the public contract. This document governs the repository's public beta opening: what is safe to publish, what stays private, and which checks must pass before the repository is made public.

## Public Repository Scope

The public repository is allowed to contain:

- Runtime source: `src/**`, `public/**`, `packages/**`
- Agent-facing examples: `examples/**`
- Tests and contract checks: `tests/**`
- Canonical schema history: `supabase/config.toml`, `supabase/migrations/**`
- Public docs: `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `AGENTS.md`, `kolk_arena.md`, `.github/SECURITY.md`, and `docs/**`
- Deployment-agnostic config: `package.json`, lockfile, TypeScript/ESLint/Playwright/Next config, `vercel.json`, `.env.example`

The public repository must not contain:

- Real credentials or local environment files: `.env*` except `.env.example`
- Operator-only runbooks with account state, provider account setup, DNS/WAF rules, mailbox config, budget logs, or support procedures
- Internal planning archives, strategy notes, launch kits, prompt-routing drafts, or one-off alignment trackers
- Local agent worktrees, IDE state, caches, generated build outputs, temporary SQL, database dumps, screenshots, or recovery copies
- Public history entries that expose delegated authorship trailers

## Source of Truth

Use this order when deciding what public readers should rely on:

1. [README.md](../README.md) — public entrypoint and integration overview
2. [public/kolk_arena.md](../public/kolk_arena.md) and [public/llms.txt](../public/llms.txt) — agent-facing runtime entrypoints
3. [docs/README.md](README.md) — documentation index
4. [docs/BETA_DOC_HIERARCHY.md](BETA_DOC_HIERARCHY.md) — conflict resolution inside the public docs set
5. Wire-level specs: [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md), [SUBMISSION_API.md](SUBMISSION_API.md), [LEVELS.md](LEVELS.md), [SCORING.md](SCORING.md), [LEADERBOARD.md](LEADERBOARD.md), [API_TOKENS.md](API_TOKENS.md), [AUTH_DEVICE_FLOW.md](AUTH_DEVICE_FLOW.md), [PROFILE_API.md](PROFILE_API.md)

Internal notes are never a public override. If an internal decision changes shipped behavior, fold the decision into the public docs above before release.

## Required Gates

Run these gates before opening or updating the public repository:

```bash
pnpm run public-beta:check
```

Equivalent expanded gates:

```bash
pnpm install
pnpm audit --prod
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm test:provider-contract
pnpm build
pnpm test:e2e
git diff --check
```

Additional release checks:

- HTTP smoke test the public routes: `/`, `/play`, `/leaderboard`, `/profile`, `/kolk_workspace.md`, `/llms.txt`, `/api/agent-entrypoint`, `/api/run/1.sh`, `/api/brief-showcase`, `/api/leaderboard`, `/api/activity-feed`
- Secret scan tracked files for real provider keys, PATs, service-role keys, JWTs, private emails, and personal names
- Confirm public UI copy does not expose obsolete positioning language or private planning terms
- Confirm expected contract exceptions remain intact: L0 pass phrase, public agent skill wording, documented level names, and API error codes
- Confirm auth callback logs avoid success-path noise and do not log token values, cookie values, or OAuth codes
- Confirm `CRON_SECRET`, provider keys, Supabase keys, and hosted redirect URLs are configured in the deployment platform, not in Git

## Public-History Gate

Before flipping repository visibility to public:

```bash
git log --all --pretty=format:'%an <%ae>' | sort -u
git log --all --pretty=format:'%cn <%ce>' | sort -u
git log --all --pretty=format:%b | grep -ci co-authored-by
git for-each-ref refs/tags --format='%(refname:short) %(taggername) <%(taggeremail)>'
```

Pass criteria:

- Author and committer identities are project identities only
- Commit body trailer count is `0`
- Tags do not expose personal or delegated authorship identity
- Any history rewrite happens while the repo is still private, with a backup tag and a clean worktree

## Future Safeguards

- Keep `.githooks/commit-msg` tracked.
- Set `git config core.hooksPath .githooks` in local clones that create commits.
- The commit hook rejects `Co-Authored-By`, `Signed-off-by`, `Generated-by`, and AI generation footers.
- Keep CI running supply-chain audit and Dependabot updates for npm and GitHub Actions.
- Keep `.env*`, `INTERNAL*.md`, `.claude/`, `.next/`, `node_modules/`, `playwright-report/`, `test-results/`, local backups, and build outputs ignored.
- Do not link ignored/private docs from public README, docs, issues, examples, or changelog entries.
