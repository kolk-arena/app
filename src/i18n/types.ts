export type FrontendLocale = 'en';
export type FrontendLocaleCode = 'en-US';

export type BetaPublicLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type CopyStatus = 'idle' | 'copied' | 'failed';

export interface FrontendCatalog {
  locale: FrontendLocale;
  localeCode: FrontendLocaleCode | string;
  app: {
    name: string;
    githubUrl: string;
    canonicalOrigin: string;
  };
  meta: {
    titleDefault: string;
    titleTemplate: string;
    description: string;
    openGraphDescription: string;
    twitterDescription: string;
  };
  nav: {
    home: string;
    play: string;
    leaderboard: string;
    profile: string;
    github: string;
  };
  notFound: {
    code: string;
    title: string;
    body: string;
    goHome: string;
    leaderboard: string;
  };
  auth: {
    signInRequiredEyebrow: string;
    defaultTitle: string;
    defaultDescription: string;
    checkingSession: string;
    alreadySignedInTitle: string;
    alreadySignedInBody: string;
    continue: string;
    openProfile: string;
    emailRequired: string;
    startEmailSignInFailed: string;
    checkEmail: string;
    statusMessages: {
      success: { title: string; body: string };
      missing_code: { title: string; body: string };
      exchange_failed: { title: string; body: string };
      github_email_required: { title: string; body: string };
      unexpected: { title: string; body: string };
      fallback: { title: string; body: string };
    };
  };
  home: {
    heroBadge: string;
    heroTitle: string;
    heroIntro: string;
    heroBodyPrefix: string;
    heroBodySuffix: string;
    heroActions: {
      runL0: string;
      integrationGuide: string;
      browseLadder: string;
      leaderboard: string;
      github: string;
    };
    benchmark: {
      title: string;
      version: string;
      body: string;
      featureItems: readonly string[];
      challengeBriefEyebrow: string;
      challengeBriefTitle: string;
      challengeBriefBody: string;
      challengeBriefFuture: string;
    };
    statusCard: {
      eyebrow: string;
      title: string;
      howToEnterEyebrow: string;
      howToEnterBody: string;
      publicAddressEyebrow: string;
      githubEyebrow: string;
    };
    liveRankings: {
      eyebrow: string;
      title: string;
      cta: string;
      publicRule: string;
      empty: string;
      timePending: string;
    };
    quickStart: {
      eyebrow: string;
      bodyPrefix: string;
      bodyBetweenKeywords: string;
      bodySuffix: string;
      ladderPrefix: string;
      ladderSuffix: string;
    };
    stack: {
      eyebrow: string;
      title: string;
      body: string;
      items: readonly string[];
    };
  };
  homeInteractive: {
    copyL0: string;
    copiedL0: string;
    copyL1: string;
    copiedL1: string;
    copyAgentPrompt: string;
    copiedAgentPrompt: string;
    copyFailed: string;
    openChallengeEndpoint: string;
    viewLeaderboard: string;
    readApiDocs: string;
    cookieNote: string;
    authTitle: string;
    authDescription: string;
  };
  play: {
    levelCards: readonly {
      level: BetaPublicLevel;
      name: string;
      band: 'A' | 'B' | 'C' | 'D';
      suggestedTimeMinutes: number;
      hint: string;
    }[];
    badge: string;
    title: string;
    bodyPrefix: string;
    bodySuffix: string;
    session: {
      checking: string;
      signedInPrefix: (displayName: string | null) => string;
      anonymousPrefix: string;
      anonymousTail: string;
      signedOutPrefix: string;
      signedOutTail: string;
    };
    agentPanel: {
      eyebrow: string;
      title: string;
      body: string;
      copyAgentPrompt: string;
      copiedAgentPrompt: string;
      copySubmitContract: string;
      copiedSubmitContract: string;
      guideCta: string;
    };
    contract: {
      eyebrow: string;
      bullets: readonly string[];
    };
  };
  challenge: {
    agentPanel: {
      eyebrow: string;
      title: string;
      body: string;
      steps: readonly string[];
      copyAgentBrief: string;
      copiedAgentBrief: string;
      copyOutputTemplate: string;
      copiedOutputTemplate: string;
      copyStructuredBrief: string;
      copiedStructuredBrief: string;
      copyTaskJson: string;
      copiedTaskJson: string;
      copySubmitContract: string;
      copiedSubmitContract: string;
      copyFailed: string;
      copyBriefText: string;
      copiedBriefText: string;
      structuredBriefTitle: string;
      taskJsonTitle: string;
      challengeBriefEyebrow: string;
      challengeBriefBody: string;
    };
    cards: {
      brief: string;
      yourDelivery: string;
      suggestedTime: string;
      sessionDeadline: string;
      attemptTokenFingerprint: string;
      challengeId: string;
    };
    time: {
      suggestedPastDue: string;
      suggestedBadge: (minutes: number) => string;
      expiresAt: (value: string) => string;
    };
    deliveryRules: {
      default: string;
      level0: string;
      level1: string;
      level5: string;
      chars: (count: string) => string;
      placeholderDefault: string;
      placeholderLevel0: string;
      placeholderLevel5: string;
      localJsonInvalid: (message: string) => string;
      localJsonValid: string;
      submit: string;
      scoring: string;
      refetch: string;
      backToPlay: string;
    };
  };
}
