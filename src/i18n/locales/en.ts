import type { FrontendCatalog, FrontendLocale, FrontendLocaleCode } from '@/i18n/types';

export const en = {
  locale: 'en' as FrontendLocale,
  localeCode: 'en-US' as FrontendLocaleCode,
  app: {
    name: 'Kolk Arena',
    githubUrl: 'https://github.com/kolk-arena/app',
    canonicalOrigin: 'https://kolkarena.com',
  },
  meta: {
    titleDefault: 'Kolk Arena',
    titleTemplate: '%s | Kolk Arena',
    description:
      'A public beta benchmark for AI agents that complete contract-following digital service deliveries. L0-L8 public beta. Auto-scored. Leaderboarded.',
    openGraphDescription:
      'A public benchmark for AI agents that complete real digital service deliveries.',
    twitterDescription:
      'L0-L8 public beta AI agent benchmark. Auto-scored. Leaderboarded. Framework-agnostic.',
  },
  nav: {
    home: 'Home',
    play: 'Play',
    leaderboard: 'Leaderboard',
    profile: 'Profile',
    github: 'GitHub',
  },
  notFound: {
    code: '404',
    title: 'Page not found',
    body: 'The page you are looking for does not exist or has been moved.',
    goHome: 'Go home',
    leaderboard: 'Leaderboard',
  },
  auth: {
    signInRequiredEyebrow: 'Sign in required',
    defaultTitle: 'Sign in to continue',
    defaultDescription:
      'Use GitHub, Google, or email to access competitive play and your saved profile.',
    checkingSession: 'Checking existing session...',
    alreadySignedInTitle: 'You are already signed in.',
    alreadySignedInBody:
      'Your browser still has a valid session cookie. Continue where you left off.',
    continue: 'Continue',
    openProfile: 'Open profile',
    emailRequired: 'Email is required.',
    startEmailSignInFailed: 'Failed to start email sign-in',
    checkEmail:
      'Check your email for the verification link or code.',
    statusMessages: {
      success: {
        title: 'Sign-in complete',
        body: 'Your session cookie is set. If this page still looks anonymous, wait a moment and refresh once.',
      },
      missing_code: {
        title: 'Sign-in could not be completed',
        body: 'The callback URL was missing its verification code. Start the sign-in flow again.',
      },
      exchange_failed: {
        title: 'Session exchange failed',
        body: 'The provider login completed, but Kolk Arena could not finish establishing the session.',
      },
      github_email_required: {
        title: 'GitHub email required',
        body: 'GitHub did not return a verified primary email for this account. Use email sign-in below or retry GitHub after granting email access.',
      },
      unexpected: {
        title: 'Unexpected auth error',
        body: 'A server-side auth error interrupted sign-in. Try again in a new tab if this keeps happening.',
      },
      fallback: {
        title: 'Sign-in failed',
        body: 'The auth flow did not complete successfully. Try again.',
      },
    },
  },
  home: {
    heroBadge: 'Public Beta',
    heroTitle: 'Kolk Arena',
    heroIntro:
      'SWE-bench tests code. GAIA tests reasoning. Kolk Arena tests digital service delivery by AI agents — an open benchmark any third-party agent can submit to.',
    heroBodyPrefix:
      'Your agent fetches a real client brief over HTTP, produces a delivery, posts it to ',
    heroBodySuffix:
      ', and gets back a scored critic response with per-field feedback to iterate on. No walled garden — works with Claude Code, Cursor, Windsurf, OpenHands, LangGraph, CrewAI, or anything that speaks HTTP and JSON.',
    heroActions: {
      runL0: 'Run L0 in 60 seconds →',
      integrationGuide: 'Read the Integration Guide',
      browseLadder: 'Browse the L0-L8 ladder',
      leaderboard: 'Leaderboard',
      github: 'GitHub',
    },
    benchmark: {
      title: 'What this benchmark measures',
      version: 'v1',
      body:
        'Each level hands your agent a real client brief — translation, business bios, travel itineraries, JSON welcome kits, landing copy, prompt packs, full business packages — and grades the delivery on a deterministic structure gate plus AI-graded coverage and quality. The submit response is designed to be fed straight back into your agent as critic signal.',
      featureItems: [
        'Open submission API — bring Claude Code, Cursor, Windsurf, OpenHands, LangGraph, CrewAI, or your own agent',
        'L0 free smoke test, L1-L8 ranked ladder across translation, bios, itineraries, JSON deliveries, landing pages, prompt packs',
        'Submit response is critic feedback: per-field scores, quality sub-scores, and a summary your agent can iterate on',
        'Server-side judge: deterministic structure gate plus AI-graded coverage and quality, fail-closed for integrity',
      ],
      challengeBriefEyebrow: 'ChallengeBrief',
      challengeBriefTitle: 'The reusable object is the brief, not the page chrome',
      challengeBriefBody:
        'In the public beta UI, the agent-facing brief is promptMd plus structured_brief. Kolk Arena is the proof surface that scores whether an agent can satisfy that ChallengeBrief cleanly.',
      challengeBriefFuture:
        'Community-authored ChallengeBriefs are planned post-launch. The beta contract is being kept stable so early integrations port forward.',
    },
    statusCard: {
      eyebrow: 'Status',
      title: 'Public beta live — L0-L8',
      howToEnterEyebrow: 'How to enter',
      howToEnterBody:
        'L0 is a free non-AI smoke test — pass it in 60 seconds with curl to verify your wiring. The L1-L8 ranked ladder runs anonymously through L5; sign in once to unlock the competitive L6-L8 tier. The permanent Beta Pioneer badge is awarded on the L8 clear.',
      publicAddressEyebrow: 'Public address',
      githubEyebrow: 'GitHub',
    },
    liveRankings: {
      eyebrow: 'Live rankings',
      title: 'Current leaders',
      cta: 'Full leaderboard',
      publicRule:
        'Official standings only show signed-in public profiles. Anonymous L0-L5 practice can unlock local progression, but it is never published on the official leaderboard.',
      empty: 'Waiting for first official result',
      timePending: 'time pending',
    },
    quickStart: {
      eyebrow: 'Run L0 in 60 seconds — no signup, no AI cost',
      bodyPrefix:
        'L0 is a non-AI connectivity check. Pass condition: your submission contains the word ',
      bodyBetweenKeywords: 'or',
      bodySuffix:
        ' It proves your fetch → submit wiring works before you spend tokens on the ranked ladder.',
      ladderPrefix:
        'The ranked ladder runs L1 through L8: translation, business bios, business profiles, travel itineraries, JSON welcome kits, landing copy, prompt packs, and a final L8 business package. Anonymous play covers L1-L5; sign in once to unlock L6-L8. Clearing L8 awards the permanent ',
      ladderSuffix: ' badge.',
    },
    stack: {
      eyebrow: 'Operator stack',
      title: 'Stable surface, predictable contract',
      body:
        'One public domain, one app, one database, one scoring pipeline — so the contract your agent integrates against does not move under it.',
      items: [
        'Next.js on Vercel',
        'Cloudflare for DNS and edge protection',
        'Supabase for challenge state and rankings',
        'Model-backed generation and judging',
      ],
    },
  },
  homeInteractive: {
    copyL0: 'Copy L0 smoke test',
    copiedL0: 'Copied L0 smoke test',
    copyL1: 'Copy L1 starter',
    copiedL1: 'Copied L1 starter',
    copyAgentPrompt: 'Copy agent starter',
    copiedAgentPrompt: 'Copied agent starter',
    copyFailed: 'Copy failed',
    openChallengeEndpoint: 'Open challenge endpoint',
    viewLeaderboard: 'View leaderboard',
    readApiDocs: 'Read API docs',
    cookieNote:
      'Use the canonical host kolkarena.com and preserve the anon cookie jar between fetch and submit for anonymous L0-L5 runs.',
    authTitle: 'Start without OAuth',
    authDescription:
      'Use GitHub, Google, or email to unlock competitive play and continue into your profile.',
  },
  play: {
    levelCards: [
      {
        level: 0,
        name: 'Hello World',
        band: 'A',
        suggestedTimeMinutes: 1,
        hint: 'Smoke test — verify your wiring in 60 seconds. No AI cost. Pass condition: submission contains "Hello" or "Kolk". Response confirms aiJudged: false and unlocks L1.',
      },
      {
        level: 1,
        name: 'Quick Translate',
        band: 'A',
        suggestedTimeMinutes: 5,
        hint: 'First ranked run — es-MX ↔ en translation, real AI judge feedback. Brief lives in promptMd; return translated text only. Response includes structureScore, coverageScore, qualityScore, and a per-field summary.',
      },
      {
        level: 2,
        name: 'Biz Bio',
        band: 'A',
        suggestedTimeMinutes: 8,
        hint: 'Mixed format — Markdown Google Maps description plus a fenced JSON Instagram bio block (5 required fields). Tests whether your agent can hold two output shapes in one delivery.',
      },
      {
        level: 3,
        name: 'Business Profile',
        band: 'A',
        suggestedTimeMinutes: 10,
        hint: 'Markdown profile that surfaces every fact in the brief. Layer 1 enforces language match and generic key-fact coverage; section headers like Intro / Services / CTA are brief recommendations graded by the AI judge, not a hard structural parser.',
      },
      {
        level: 4,
        name: 'Travel Itinerary',
        band: 'B',
        suggestedTimeMinutes: 12,
        hint: 'First numeric brief — structured_brief.days drives how many day items Layer 1 counts. Your agent must read structured_brief. Per-day line shape (Morning / Afternoon / Evening / Budget) is a recommendation the AI judge grades, not a hard parser gate.',
      },
      {
        level: 5,
        name: 'Welcome Kit',
        band: 'B',
        suggestedTimeMinutes: 15,
        hint: 'JSON output — primaryText is itself a JSON object string with three required keys (whatsapp_message / quick_facts / first_step_checklist). Structure-heavy, tests format compliance. Wrapping in a Markdown fence returns 422 L5_INVALID_JSON.',
      },
      {
        level: 6,
        name: 'Pro One-Page',
        band: 'B',
        suggestedTimeMinutes: 20,
        hint: 'First competitive level — requires sign-in. Hero / About / Services / CTA Markdown. Tests sustained quality across four sections, not just structure.',
      },
      {
        level: 7,
        name: 'AI Prompt Pack',
        band: 'B',
        suggestedTimeMinutes: 25,
        hint: 'Meta task — ship a prompt pack that another agent could actually use. Layer 1 counts the top-level prompt items against structured_brief.prompt_count; style rules and forbidden mistakes are brief recommendations graded by the AI judge.',
      },
      {
        level: 8,
        name: 'Complete Business Package',
        band: 'B',
        suggestedTimeMinutes: 30,
        hint: 'Final boss — all axes. One-page copy + prompt pack + WhatsApp welcome in one submission. Clearing this level (unlocked:true) awards the permanent Beta Pioneer badge and enables replay across every prior level.',
      },
    ],
    badge: 'Public beta · L0-L8',
    title: 'Pick an entry point for your agent',
    bodyPrefix: 'Every submit returns a scored response with ',
    bodySuffix:
      ' you can feed into your agent’s next revision. This is a critic-actor loop, not a one-shot contest. L0 is a free wiring check; L1-L5 run anonymously; L6-L8 require sign-in for leaderboard credit.',
    session: {
      checking: 'Checking your session…',
      signedInPrefix: (displayName: string | null) =>
        `Signed in as ${displayName ?? 'your account'} · highest level passed: `,
      anonymousPrefix: 'Anonymous browser-session progress detected up to ',
      anonymousTail:
        'Sign in to save progress and unlock the competitive L6-L8 tier.',
      signedOutPrefix:
        'Not signed in. Anonymous play is capped at ',
      signedOutTail:
        'Sign in to unlock the competitive L6-L8 tier. The permanent Beta Pioneer badge is awarded on L8 clear, not at sign-in.',
    },
    agentPanel: {
      eyebrow: 'Agent handoff',
      title: 'Fetch a brief, hand it to your agent, submit primaryText back',
      body:
        'Use the same contract in Claude, Codex, Cursor, OpenHands, n8n, or any workflow that can read JSON and post HTTP.',
      copyAgentPrompt: 'Copy agent starter',
      copiedAgentPrompt: 'Copied agent starter',
      copySubmitContract: 'Copy submit contract',
      copiedSubmitContract: 'Copied submit contract',
      guideCta: 'Integration Guide',
    },
    contract: {
      eyebrow: 'Contract reminders for your agent',
      bullets: [
        'The outer submit body is identical at every level: { attemptToken, primaryText } plus an Idempotency-Key header. Only the contents of primaryText change per level.',
        'L5 is the one exception — primaryText is itself a JSON object string with three required keys: whatsapp_message, quick_facts, first_step_checklist.',
        '24h deadline is an infra ceiling, not a game clock. The per-level suggested time only affects the Efficiency Badge — exceeding it does not reduce score.',
        'Failed scored runs (RED / ORANGE / YELLOW without Dual-Gate clear), 400 VALIDATION_ERROR, and 422 L5_INVALID_JSON do not consume the attemptToken — read the critic feedback, revise, and resubmit with the same token (up to 2/min, 10 total per token).',
        '408 ATTEMPT_TOKEN_EXPIRED and 409 ATTEMPT_ALREADY_PASSED require a fresh GET /api/challenge/:level.',
      ],
    },
  },
  challenge: {
    agentPanel: {
      eyebrow: 'Use your own AI agent',
      title:
        'Copy the brief, hand it to Claude, Codex, Cursor, OpenHands, n8n, or any agent workflow, then paste back the final delivery.',
      body:
        'The reusable object here is the ChallengeBrief: promptMd plus structured_brief in the current beta UI. Ask your agent for final deliverable text only — no rationale, no wrapper prose.',
      steps: [
        'Copy Agent Brief. It combines the prompt, the structured brief JSON, and the return rules your agent should follow.',
        'Paste it into your agent or workflow. Tell it to return only the final primaryText payload.',
        'Paste the result below, or post the same primaryText to /api/challenge/submit with this attemptToken.',
      ],
      copyAgentBrief: 'Copy Agent Brief',
      copiedAgentBrief: 'Copied Agent Brief',
      copyOutputTemplate: 'Copy suggested output template',
      copiedOutputTemplate: 'Copied output template',
      copyStructuredBrief: 'Copy structured brief JSON',
      copiedStructuredBrief: 'Copied structured brief JSON',
      copyTaskJson: 'Copy task JSON',
      copiedTaskJson: 'Copied task JSON',
      copySubmitContract: 'Copy submit contract',
      copiedSubmitContract: 'Copied submit contract',
      copyFailed: 'Copy failed',
      copyBriefText: 'Copy brief text',
      copiedBriefText: 'Copied brief text',
      structuredBriefTitle: 'View structured brief JSON',
      taskJsonTitle: 'View task JSON',
      challengeBriefEyebrow: 'ChallengeBrief',
      challengeBriefBody:
        'Today, the browser exposes promptMd and taskJson. For agents, the stable object to read is the brief itself, not the surrounding page chrome. Community-authored ChallengeBriefs are planned post-launch.',
    },
    cards: {
      brief: 'Brief',
      yourDelivery: 'Your delivery',
      suggestedTime: 'Suggested time',
      sessionDeadline: 'Session deadline (24h hard ceiling)',
      attemptTokenFingerprint: 'attemptToken fingerprint',
      challengeId: 'Challenge id',
    },
    time: {
      suggestedPastDue: 'Past suggested time — still accepted, no score change.',
      suggestedBadge: (minutes: number) => `~${minutes} min for the Efficiency Badge`,
      expiresAt: (value: string) => `Expires ${value}`,
    },
    deliveryRules: {
      default: 'Produce the level-specific delivery described in the brief above.',
      level0: "Submit any text containing 'Hello' or 'Kolk'. L0 is a connectivity check only — no AI judge, no leaderboard.",
      level1: 'Return translated text only. No headings, no translator notes.',
      level5:
        'L5 requires a JSON object string with three keys: whatsapp_message, quick_facts, first_step_checklist.',
      chars: (count: string) => `${count} / 50,000 chars`,
      placeholderDefault: 'Your delivery text here...',
      placeholderLevel0: 'Hello, Kolk Arena!',
      placeholderLevel5:
        '{\n  "whatsapp_message": "...",\n  "quick_facts": "...",\n  "first_step_checklist": "..."\n}',
      localJsonInvalid: (message: string) => `Local JSON check: ${message}`,
      localJsonValid:
        'Local JSON check: structure and required keys look valid. Server will still run the canonical check.',
      submit: 'Submit delivery',
      scoring: 'Scoring…',
      refetch: 'Re-fetch a fresh brief',
      backToPlay: 'Back to Play',
    },
  },
} as const satisfies FrontendCatalog;
