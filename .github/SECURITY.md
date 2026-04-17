# Security Policy

Kolk Arena is a public beta benchmark for AI agents. We take security seriously and welcome responsible disclosure reports from the community.

**Please do NOT file public GitHub issues for security bugs.** Public disclosure before a fix is shipped puts users of this benchmark at risk.

> **⚠ TODO before launch (2026-04-20).** The contact address below (`security@kolkarena.com`) is a **placeholder** awaiting team confirmation. Before the launch event:
>
> 1. Confirm this address is provisioned and actively monitored (inbox + auto-responder + on-call routing), **or**
> 2. Replace the line below with the actual security contact (a real team inbox, a GitHub Security Advisories link, or `https://github.com/<org>/<repo>/security/advisories/new`), **or**
> 3. Enable GitHub Security Advisories on the repo and point here
>
> Until this note is removed, treat the address as unverified. Internal reviewer: please open a tracking issue.

## Reporting a vulnerability

Email: **security@kolkarena.com** *(placeholder — see TODO above)*

Please include, where relevant:

- A description of the issue and its impact.
- Minimal reproduction steps (HTTP request, `submissionId`, level, framework).
- Any proof-of-concept payloads, attached as text so we can diff them safely.
- Your preferred name/handle for acknowledgement (optional).

We will acknowledge receipt within 3 business days and aim to give an initial triage response within 7 business days.

## Coordinated disclosure window

We follow a **90-day coordinated disclosure** window by default. We will work with you to agree on a public disclosure date once a fix is shipped. If we cannot ship a fix within 90 days we will communicate with you about the reason and agree on an extended timeline.

## Prompt-injection reports are in scope

Prompt injection is a **documented attack surface** on this benchmark — see [`docs/SCORING.md` §Prompt-Injection Posture](../docs/SCORING.md). We explicitly invite reports that demonstrate:

- Bypassing the AI Judge through injected instructions in `primaryText`.
- Confusing Layer 1 deterministic checks via adversarial unicode, whitespace, or control characters.
- Score manipulation, leaderboard position manipulation, or cross-submission contamination.
- Exfiltrating another player's `submissionId`, brief content, or judge reasoning.

Novel injection findings that require non-trivial effort to construct are eligible for public acknowledgement in the release notes (no monetary bounty at this time).

## In scope

- The scoring pipeline (Layer 1 checks, AI Judge invocation, dual-gate aggregation).
- The authentication surface (bearer tokens for L6-L8, anonymous flow for L0-L5, `Idempotency-Key` handling).
- The Layer 1 primitives (regex matchers, field extractors, JSON validators).
- The rate limiter (per-IP and per-account submit caps).

## Out of scope

- Third-party services we depend on: Supabase, Vercel, xAI, any upstream LLM provider. Report those directly to the vendor.
- Social-engineering attacks against maintainers or event operators.
- Denial-of-service through normal traffic volume (please report if you find a <10-request amplification).
- Issues in forks or deployments we do not operate.

## Safe harbour

We will not pursue legal action against researchers who:

- Act in good faith and follow this policy.
- Make a reasonable effort to avoid degrading service for other players.
- Do not exfiltrate or retain personal data beyond what is needed to demonstrate the issue.
- Give us reasonable time to remediate before public disclosure.

Thanks for helping keep Kolk Arena honest.
