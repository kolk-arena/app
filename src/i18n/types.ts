export type FrontendLocale = 'en';
export type FrontendLocaleCode = 'en-US';

export type BetaPublicLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type CopyStatus = 'idle' | 'copied' | 'failed';

/**
 * Server-emitted error code → human-readable, locale-aware message.
 *
 * The wire-side English error returned by an API route stays English (server
 * is locale-agnostic); the frontend swaps it for the localized message keyed
 * by `code`. Use as `copy.errors[body.code] ?? body.error` so an unknown code
 * still gracefully falls back to the server's message instead of throwing.
 */
export type ErrorCode =
  | 'RATE_LIMIT_MINUTE'
  | 'RATE_LIMIT_HOUR'
  | 'RATE_LIMIT_DAY'
  | 'RETRY_LIMIT_EXCEEDED'
  | 'ACCOUNT_FROZEN'
  | 'IDENTITY_MISMATCH'
  | 'ATTEMPT_ALREADY_PASSED'
  | 'ATTEMPT_TOKEN_EXPIRED'
  | 'INVALID_JSON'
  | 'VALIDATION_ERROR'
  | 'TEXT_TOO_LONG'
  | 'L5_INVALID_JSON'
  | 'LEVEL_ALREADY_PASSED'
  | 'LEVEL_NOT_AVAILABLE'
  | 'AUTH_REQUIRED'
  | 'INSUFFICIENT_SCOPE'
  | 'SCORING_UNAVAILABLE'
  | 'CHALLENGE_NOT_FOUND'
  | 'INVALID_ATTEMPT_TOKEN'
  | 'SUBMISSION_FAILED'
  | 'LEADERBOARD_ERROR'
  | 'SCHEMA_NOT_READY'
  | 'SESSION_ERROR'
  | 'NO_CHALLENGES'
  | 'INTERNAL_ERROR';

export type ScriptLang = 'curl' | 'python' | 'node';

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
      // Wave-2 additions: agent-handoff panel buttons + script tabs
      downloadCursorRules: string;
      cursorRulesFilename: string;
      copiedScriptButton: string;
      copyScriptFailed: string;
      copyScriptButton: (lang: ScriptLang) => string;
      downloadScriptButton: string;
      downloadScriptFilename: (lang: ScriptLang) => string;
      scriptTabs: {
        curl: string;
        python: string;
        node: string;
      };
      // Pre-launch additions: one-click "Open in <AI service>" deep links
      // alongside the manual-paste 🤖 Copy System Prompt button. See
      // src/lib/frontend/agent-handoff.ts::buildAiDeepLink.
      openInIcon: {
        claude: string;
        chatgpt: string;
        gemini: string;
        perplexity: string;
      };
      openInLabel: {
        claude: string;
        chatgpt: string;
        gemini: string;
        perplexity: string;
      };
      openInTruncatedHint: string;
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
    // Wave-2 additions: dry-run validation UI + plain strings emitted by
    // src/lib/frontend/agent-handoff.ts::dryRunValidation. Callers route the
    // raw error string through this map so the validator stays English on the
    // wire side and the UI swaps in the localized version.
    dryRun: {
      validateButton: string;
      failedHeading: string;
      passedMessage: string;
      // Pre-defined validator messages (mirrors the strings in
      // dryRunValidation). Templates take the dynamic bits and return the
      // final message.
      primaryTextEmpty: string;
      l5RemoveFences: string;
      l5InvalidJson: string;
      l5MustBeObject: string;
      l5MissingKey: (key: string) => string;
      l5KeyTooShort: (key: string, min: number, got: number) => string;
      l2MissingFence: string;
      l2MissingHeader: (section: string) => string;
      sectionRecommended: (section: string) => string;
      l8MissingHeader: (keyword: string) => string;
      l8MissingSubHeader: (section: string) => string;
      warningHeading: string;
    };
    // Wave-2 additions: ErrorShell `title` prop strings + shared shell
    // primary/secondary CTA labels.
    errorStates: {
      authRequired: string;
      signInLabel: string;
      backToPlayLabel: string;
      retryLabel: string;
      levelLockedTitle: (level: number) => string;
      tryNextLevel: (next: number) => string;
      levelAlreadyPassed: string;
      levelNotAvailable: string;
      levelsCta: string;
      noChallenges: string;
      schemaNotReady: string;
      couldNotLoad: string;
      fetchingChallenge: (level: number) => string;
    };
    // Wave-2 additions: SubmitErrorBanner banner + AccountFrozenScreen +
    // ResultCard surface strings.
    submitBanner: {
      retryAfter: (seconds: number) => string;
      hourFreezeWarning: string;
      fetchNewChallenge: string;
      signIn: string;
      duplicateRequest: string;
      submitFailed: string;
      validationTitleStandard: string;
      validationTitleL5Json: string;
      authRequiredTitle: string;
      identityMismatchTitle: string;
      sessionExpiredTitle: string;
      sessionAlreadySubmittedTitle: string;
      rateLimitMinuteTitle: string;
      rateLimitHourTitle: string;
      rateLimitDayTitle: string;
      retryLimitExceededTitle: string;
      scoringUnavailableTitle: string;
      submissionFailedTitle: string;
      l5ReminderHeading: string;
      l5ReminderNoFences: string;
      l5ReminderRequiredKeys: string;
      l5ReminderNoProse: string;
      l5ReminderParserHint: (position: string) => string;
      // Limit-counter labels (per-window).
      counterMinute: string;
      counterHour: string;
      counterDay: string;
      counterRetry: string;
      counterMinuteBurst: string;
      counterFiveMinuteBurst: string;
    };
    accountFrozen: {
      title: string;
      body: string;
      unpauseAt: (localTime: string) => string;
      reasonPrefix: string;
    };
    result: {
      eyebrow: string;
      scoreOutOf: (value: number) => string;
      unlocked: string;
      locked: string;
      structureLabel: string;
      coverageLabel: string;
      qualityLabel: string;
      onboardingEyebrow: string;
      onboardingBody: string;
      percentile: (level: number, percent: number) => string;
      structureGateFailed: string;
      qualityFloorFailed: string;
      unlockBlockedPrefix: string;
      solveTime: (seconds: number) => string;
      efficiencyEarned: string;
      judgeFlagsHeading: string;
      fieldFeedbackHeading: string;
      pointsSuffix: string;
      tryNextLevel: (level: number) => string;
      retryLevel: (level: number) => string;
      backToPlay: string;
      leaderboard: string;
      replayEyebrow: string;
      replayTitle: string;
      joinDiscord: string;
      shareResult: string;
      registerEyebrow: string;
      registerTitle: string;
      registerBody: string;
      registerCta: string;
      registerDismiss: string;
    };
  };
  leaderboard: {
    heroEyebrow: string;
    heroTitle: string;
    heroDescription: string;
    entriesEyebrow: string;
    currentLeaderEyebrow: string;
    currentLeaderTimePending: string;
    currentLeaderEmpty: string;
    currentLeaderSummary: (level: number, score: string, solveTime: string) => string;
    leaderboardRuleEyebrow: string;
    leaderboardRuleBody: string;
    topTierLabel: (tier: string) => string;
    frameworkFilter: string;
    frameworkPlaceholder: string;
    applyFilter: string;
    clearFilter: string;
    allFrameworks: string;
    activeFilterEyebrow: string;
    viewEyebrow: string;
    showingLabel: (from: number, to: number, total: number) => string;
    sortExplainer: string;
    detailSelectionStorage: string;
    failedToLoad: string;
    selectionUnavailableTitle: string;
    selectionInvalid: string;
    clearSelection: string;
    standingsTitle: string;
    standingsSubtitle: string;
    listPlusDetail: string;
    refreshing: string;
    loading: string;
    noEntriesTitle: string;
    noEntriesFrameworkHint: string;
    noEntriesDefaultHint: string;
    previousPage: string;
    nextPage: string;
    pageLabel: (page: number, total: number) => string;
    leaderUpdatedPrefix: (formatted: string) => string;
    noLeaderYet: string;
    detailOutsideViewTitle: string;
    detailOutsideViewBody: string;
    noRecentSubmissionData: string;
    timePending: string;
    frameworkWars: {
      title: string;
      collectingData: string;
      ofTop100: string;
      legendCount: (count: number) => string;
      legendPercent: (percent: number) => string;
    };
    activityFeed: {
      title: string;
      filterAllTiers: string;
      listeningSubmissions: string;
      // Render helper for an activity row. Returns the conjugated, localized
      // verb tense rather than concatenating strings, so other locales can
      // re-order subject/verb/object cleanly.
      rowVerbPassed: string;
      rowVerbAttempted: string;
      usingFrameworkPrefix: string;
    };
    // Wave-2 additions: detail panel + dedicated /leaderboard/[playerId] page.
    playerDetail: {
      eyebrow: string;
      selectAPlayerTitle: string;
      selectAPlayerBody: string;
      loading: string;
      failedToLoadTitle: string;
      failedToLoadFallback: string;
      retry: string;
      clearSelection: string;
      clearShort: string;
      betaPioneerBadge: string;
      profilePlayerFallback: string;
      noPublicHandle: string;
      tierFallback: string;
      highestLevel: string;
      totalScore: string;
      levelsCompleted: string;
      schoolLabel: string;
      schoolFallback: string;
      frameworkLabel: string;
      frameworkFallback: string;
      countryLabel: string;
      countryFallback: string;
      lastSubmissionLabel: string;
      lastSubmissionFallback: string;
      bestScoresHeading: string;
      bestScoresSubtitle: string;
      noLevelHistory: string;
      openPage: string;
      recentSubmissionsHeading: string;
      recentSubmissionsSubtitle: string;
      recentSubmissionsSubtitleAlt: string;
      noPublicHistory: string;
      levelLabel: (level: number) => string;
      totalSuffix: string;
      noSummary: string;
      structureLabel: string;
      coverageLabel: string;
      qualityLabel: string;
      viewRepo: string;
      backToLeaderboard: string;
      pageHeroSubtitle: string;
      playerNotFoundTitle: string;
    };
    // Wave-3 viral-loop addition: README badge UI shown on the dedicated
    // player page (full section) and inside the leaderboard sidebar panel
    // (compact). Powered by `src/lib/frontend/badge.ts`. See I18N_GUIDE §9
    // for naming conventions.
    badge: {
      sectionEyebrow: string;
      sectionTitle: string;
      sectionBody: string;
      markdownLabel: string;
      copyMarkdown: string;
      copiedMarkdown: string;
      copyHtml: string;
      copiedHtml: string;
      copyFailed: string;
      sidebarEyebrow: string;
      sidebarCopyButton: string;
      sidebarCopiedButton: string;
    };
    table: {
      colRank: string;
      colPlayer: string;
      colFramework: string;
      colHighest: string;
      colFrontierScore: string;
      colSolveTime: string;
      colTier: string;
      colLastSubmission: string;
      noPublicHandle: string;
      frameworkNotSet: string;
      globalCountryTooltip: string;
      frontierFallback: string;
      efficiencyBadge: string;
      timeTieBreak: string;
      selectedLabel: string;
      viewLabel: string;
      pioneerBadge: string;
      solveTimeLabel: string;
      highestLabel: string;
      frontierLabel: string;
      frameworkLabel: string;
      lastSubmissionLabel: (formatted: string) => string;
      noSubmissionsYet: string;
      noSubmissionFallback: string;
      openPlayerDetailAriaLabel: (name: string) => string;
      openPlayerPageAriaLabel: (name: string) => string;
    };
  };
  errors: Record<ErrorCode, string>;
}
