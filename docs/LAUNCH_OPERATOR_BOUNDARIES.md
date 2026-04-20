# Launch Operator Boundaries

Internal operator note for launch-day execution.

This file is intentionally written to be safe if the repository becomes public: it contains no secrets, account identifiers, mailbox credentials, registrar records, or dashboard screenshots. Do not add those here. Keep sensitive operational data in the password manager, provider dashboards, or private incident notes.

## Purpose

Two rules govern launch day:

1. Public-facing surfaces may describe the product, the public API, and public support contact points.
2. Internal operator checks may confirm readiness, but they must not leak private implementation details, vendor account state, or security posture details that would help attackers.

`scripts/ops/launch-day.sh` assumes every gate in this file is already checked before the repo visibility flip.

## Public vs non-public boundary

| Topic | Safe for public docs / site / README | Keep out of public docs / site / release notes |
| --- | --- | --- |
| WHOIS privacy | State that the domain is launch-ready | Registrar name, registrant identity, private contact data, screenshots, ticket IDs |
| Vercel plan | State launch requires a non-Hobby plan because of timeout/bandwidth constraints | Billing details, card data, account owner data, spend screenshots |
| Support mailbox | Publish `support@kolkarena.com` once it is live | Mailbox provider admin setup, forwarding targets, recovery addresses, inbox screenshots |
| WAF baseline | State the minimum baseline policy and whether launch is blocked without it | Exact firewall rules, rate-limit thresholds, bypass headers, dashboard exports |
| Open-source boundary | Public docs may describe what is open source and what is intentionally withheld | Draft internal runbooks, unpublished challenge ops notes, abuse heuristics, vendor-only procedures |

## Current public release set

The following documentation categories are intentionally public at launch:

- Public landing / repo surfaces: `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `LICENSE`, `AGENTS.md`, `.github/SECURITY.md`
- Canonical agent assets: `kolk_arena.md`, `public/kolk_arena.md`, `public/llms.txt`
- Public beta contract docs: `docs/README.md`, `docs/BETA_DOC_HIERARCHY.md`, `docs/INTEGRATION_GUIDE.md`, `docs/KOLK_ARENA_SPEC.md`, `docs/LEVELS.md`, `docs/SCORING.md`, `docs/SUBMISSION_API.md`, `docs/LEADERBOARD.md`, `docs/PROFILE_API.md`, `docs/API_TOKENS.md`, `docs/AUTH_DEVICE_FLOW.md`, `docs/FRONTEND_BETA_STATES.md`
- Public engineering / example references: `docs/I18N_GUIDE.md`, `examples/README.md`, `examples/curl/**`, `examples/python/**`
- Public-safe operator asset: this file, `docs/LAUNCH_OPERATOR_BOUNDARIES.md`

Everything else is internal by default and should not be tracked for public release unless the release owner explicitly re-classifies it.

## Launch operator gates

All gates below are blocking for launch-day execution unless an explicit exception is signed off by the launch operator.

| Gate | Required outcome | Operator check |
| --- | --- | --- |
| WHOIS privacy | Privacy protection is enabled for `kolkarena.com`; public WHOIS must not expose registrant identity or email | Run a registrar-side or WHOIS lookup check and record pass/fail privately |
| Vercel plan | Production project is upgraded off Hobby before public launch | Confirm plan in the Vercel dashboard; do not proceed on Hobby |
| Support mailbox readiness | `support@kolkarena.com` can receive inbound mail and a human can reply from it | Send a real external test message, verify delivery, reply, and confirm no bounce |
| Minimum WAF baseline | Cloudflare posture is consciously chosen before launch | Preferred: proxied traffic with WAF enabled. If launching grey-cloud / DNS-only, document the exception privately and confirm app-layer rate limits are the accepted fallback |
| Open-source document boundary | Public links only point to intended public docs | Review README, release notes, public docs, and site links to ensure no internal-only ops material is exposed |
| Identity sweep | Public repo / site surface contains no personal names, personal emails, legacy handles, or AI-bylines | Run the final string sweep against README, docs, repo metadata, release text, and any public launch copy |

## Minimum public-doc hygiene

Before flipping the repo or announcing launch:

- Confirm public docs only link to intended public assets such as README, public API docs, public challenge docs, and public skill files.
- Confirm internal notes are not linked from the site footer, homepage CTAs, `llms.txt`, release notes, or launch posts.
- Confirm no launch checklist includes raw secrets, mailbox setup records, registrar screenshots, WAF rules, or provider account metadata.

## Release and announcement guardrails

Public release notes and launch posts may say:

- the repo is public
- the product is in public beta
- the public support address is `support@kolkarena.com`
- the project is open source where applicable

Public release notes and launch posts should not say:

- which provider account owns DNS / mail / Vercel
- whether WHOIS privacy was missing or recently fixed
- exact WAF configuration or known security gaps
- unresolved internal exceptions or temporary launch-day workarounds

## Operator sign-off

Minimum sign-off before running `bash scripts/ops/launch-day.sh`:

- WHOIS privacy: checked
- Vercel non-Hobby plan: checked
- Support mailbox live test: checked
- WAF baseline decision: checked
- Public/non-public doc boundary review: checked
- Identity sweep: checked
