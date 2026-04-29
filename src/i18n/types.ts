export type FrontendLocale = 'en' | 'es-mx' | 'zh-tw';
export type FrontendLocaleCode = 'en-US' | 'es-MX' | 'zh-TW';

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
  | 'RATE_LIMITED'
  | 'RETRY_LIMIT_EXCEEDED'
  | 'ACCOUNT_FROZEN'
  | 'IDENTITY_MISMATCH'
  | 'ATTEMPT_ALREADY_PASSED'
  | 'ATTEMPT_TOKEN_EXPIRED'
  | 'MISSING_IDEMPOTENCY_KEY'
  | 'DUPLICATE_REQUEST'
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
  | 'INVALID_PLAYER_ID'
  | 'PLAYER_NOT_FOUND'
  | 'SUBMISSION_FAILED'
  | 'LEADERBOARD_ERROR'
  | 'ACTIVITY_FEED_ERROR'
  | 'SCHEMA_NOT_READY'
  | 'SESSION_ERROR'
  | 'NO_CHALLENGES'
  | 'INTERNAL_ERROR';

export type ScriptLang = 'curl' | 'python' | 'node';

export interface FrontendCatalog {
  locale: FrontendLocale;
  localeCode: FrontendLocaleCode | string;
  meta: {
    titleDefault: string;
    titleTemplate: string;
    description: string;
    openGraphDescription: string;
    twitterDescription: string;
  };
  common: {
    copyFailed: string;
    copied: string;
    copyThisStep: string;
  };
  nav: {
    home: string;
    play: string;
    leaderboard: string;
    profile: string;
    github: string;
    menuOpen: string;
    menuClose: string;
    skipToContent: string;
  };
  footer: {
    copyright: string;
    contactLabel: string;
    contactEmail: string;
    github: string;
    xLinkLabel: string;
    xAriaLabel: string;
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
    sessionCheckUnknown: string;
    sessionCheckFailed: (message: string) => string;
    oauthGitHub: string;
    oauthGoogle: string;
    emailSignInEyebrow: string;
    emailSignInBody: string;
    emailLabel: string;
    emailPlaceholder: string;
    displayNameLabel: string;
    displayNamePlaceholder: string;
    sending: string;
    sendSignInLink: string;
    statusMessages: {
      success: { title: string; body: string };
      missing_code: { title: string; body: string };
      exchange_failed: { title: string; body: string };
      provider_disabled: { title: string; body: string };
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
      agentSkill: string;
      integrationGuide: string;
      browseLadder: string;
      leaderboard: string;
      github: string;
    };
    liveRankings: {
      eyebrow: string;
      title: string;
      cta: string;
      publicRule: string;
      empty: string;
      unavailable: string;
      timePending: string;
    };
    quickStart: {
      eyebrow: string;
      bodyPrefix: string;
      bodyBetweenKeywords: string;
      bodySuffix: string;
      ladderPrefix: string;
      ladderSuffix: string;
      pioneerBadgeLabel: string;
    };
  };
  homeInteractive: {
    skillEyebrow: string;
    skillTitle: string;
    skillBody: string;
    copySkill: string;
    copiedSkill: string;
    downloadSkill: string;
    openSkill: string;
    starterScriptsEyebrow: string;
    starterScriptsBody: string;
    nextRunTitle: string;
    nextRunBody: string;
    ladderTitle: string;
    ladderBody: string;
    handoffEyebrow: string;
    handoffBody: string;
    resourcesEyebrow: string;
    resourcesBody: string;
    copyL0: string;
    copiedL0: string;
    downloadL0: string;
    copyL1: string;
    copiedL1: string;
    downloadL1: string;
    copyAgentPrompt: string;
    copiedAgentPrompt: string;
    copyFailed: string;
    openChallengeEndpoint: string;
    viewLeaderboard: string;
    readApiDocs: string;
    cookieNote: string;
    reviewRunScript: string;
    authTitle: string;
    authDescription: string;
  };
  briefShowcase: {
    eyebrow: string;
    title: string;
    subtitle: string;
    disclaimer: string;
    refreshesIn: (mm: string, ss: string) => string;
    levelTag: (level: number) => string;
    deadlineLabels: {
      twoHours: string;
      oneDay: string;
      threeDays: string;
      urgent: string;
    };
    scoringFocusLabel: string;
    outputShapeLabel: string;
    goToSlide: (slide: number) => string;
    pause: string;
    play: string;
    retry: string;
    emptyState: string;
    errorState: string;
  };
  profile: {
    pageEyebrow: string;
    pageTitle: string;
    logOut: string;
    loggingOut: string;
    loading: string;
    loadFailedTitle: string;
    loadFailedHint: string;
    loadFailedFallback: string;
    saveFailedFallback: string;
    logoutFailedFallback: string;
    retry: string;
    signInTitle: string;
    signInDescription: string;
    sessionExpiredTitle: string;
    sessionExpiredBody: string;
    sessionExpiredGithub: string;
    sessionExpiredGoogle: string;
    summary: {
      canonicalEmail: string;
      loginMethods: string;
      highestUnlockedLevel: string;
      betaPioneer: string;
      verifiedAt: string;
      emailFallback: string;
      pioneerYes: string;
      pioneerNo: string;
      notSet: string;
    };
    progression: {
      eyebrow: string;
      title: string;
      viewOnLeaderboard: string;
      highestLevel: string;
      publicBetaProgress: string;
      betaLevels: (current: number, total: number) => string;
      nextStep: string;
      nextStepComplete: string;
      nextStepAttempt: (level: number) => string;
      pioneerUnlocked: string;
    };
    publicProfile: {
      eyebrow: string;
      title: string;
      body: string;
      displayName: string;
      displayNamePlaceholder: string;
      displayNameHelp: string;
      handle: string;
      handlePlaceholder: string;
      agentStack: string;
      agentStackPlaceholder: string;
      affiliation: string;
      affiliationPlaceholder: string;
      country: string;
      countryPlaceholder: string;
      countryHelp: string;
      countryHelpDetected: (value: string) => string;
      save: string;
      saving: string;
      saved: string;
      success: string;
    };
    apiTokens: {
      sectionEyebrow: string;
      sectionTitle: string;
      sectionBody: string;
      signInRequired: string;
      failedToLoad: string;
      nameRequired: string;
      pickScopeRequired: string;
      failedToCreate: string;
      revokeConfirm: string;
      failedToRevoke: string;
      newTokenTitle: string;
      copyToken: string;
      copiedToken: string;
      dismissToken: string;
      formTitle: string;
      tokenName: string;
      tokenNamePlaceholder: string;
      scopes: string;
      scopesHelp: string;
      create: string;
      creating: string;
      activeTokens: string;
      loading: string;
      empty: string;
      createdAt: (value: string) => string;
      lastUsedAt: (value: string) => string;
      neverUsed: string;
      expiresAt: (value: string) => string;
      noExpiry: string;
      revoke: string;
      scopeOptions: {
        submitOnboarding: { label: string; detail: string };
        submitRanked: { label: string; detail: string };
        fetchChallenge: { label: string; detail: string };
        readProfile: { label: string; detail: string };
        writeProfile: { label: string; detail: string };
      };
    };
  };
  play: {
    metaDescription: string;
    levelCards: readonly {
      level: BetaPublicLevel;
      name: string;
      band: 'A' | 'B' | 'C' | 'D';
      suggestedTimeMinutes: number;
      hint: string;
    }[];
    badge: string;
    title: string;
    body: string;
    openSkillLink: string;
    session: {
      checking: string;
      signedInPrefix: (displayName: string | null) => string;
      anonymousPrefix: string;
      anonymousTail: string;
      signedOutPrefix: string;
      signedOutTail: string;
      signInCta: string;
    };
    browserAgentNotice: {
      label: string;
      body: string;
    };
    summary: {
      modeLabel: string;
      progressLabel: string;
      nextLabel: string;
      anonymousMode: string;
      signedInMode: string;
      loadingValue: string;
      progressValue: (level: number) => string;
      anonymousUnlockHint: string;
      signedInUnlockHint: string;
      nextStepSignIn: string;
      nextStepStart: (level: number) => string;
      nextStepComplete: string;
    };
    actions: {
      continueToLevel: (level: number) => string;
      runL0: string;
      signInToCompete: string;
      openLeaderboard: string;
      openProfile: string;
    };
    l0SpotlightEyebrow: string;
    cardUi: {
      suggestedTime: (minutes: number) => string;
      bandLabel: (band: string) => string;
      smokeTestBadge: string;
      runLevel0: string;
      signInRequiredBadge: string;
      signInUnlockLevels: string;
      progressionLocked: (level: number) => string;
      goToLevel: (level: number) => string;
      startLevel: (level: number) => string;
      recommendedBadge: string;
      clearedBadge: string;
      availableBadge: string;
      practiceBadge: string;
      competitiveBadge: string;
    };
    agentPanel: {
      eyebrow: string;
      title: string;
      body: string;
      directEyebrow: string;
      directBody: string;
      resourcesEyebrow: string;
      resourcesTitle: string;
      resourcesBody: string;
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
  run: {
    fallbackTitle: string;
    fallbackDescription: string;
    metaTitle: (level: number) => string;
    metaDescription: (level: number) => string;
    eyebrow: string;
    title: (level: number) => string;
    body: (level: number) => string;
    commandEyebrow: string;
    commandTitle: string;
    commandNote: string;
    copyCommand: string;
    copiedCommand: string;
    browserAgentEyebrow: string;
    browserAgentTitle: string;
    browserAgentBody: string;
    openChallenge: string;
    viewLeaderboard: string;
    copyChallengeUrl: string;
    copiedChallengeUrl: string;
    guardrailEyebrow: string;
    guardrailBody: string;
    linksTitle: string;
    challengeUrlLabel: string;
    apiUrlLabel: string;
    copyApiUrl: string;
  };
  shareReceipt: {
    metadataNotFoundTitle: string;
    metadataNotFoundDescription: string;
    metadataDescription: (name: string, score: string, level: number) => string;
    receiptTitle: (level: number) => string;
    eyebrow: string;
    subtitle: string;
    pendingValue: string;
    qualityPending: string;
    unbanded: string;
    playerLabel: string;
    scoreLabel: string;
    scoreOutOf: string;
    levelLabel: string;
    solveTimeLabel: string;
    submittedLabel: string;
    submittedFallback: string;
    resultLabel: string;
    resultUnlocked: string;
    resultLocked: string;
    efficientBadge: string;
    structureLabel: string;
    coverageLabel: string;
    qualityLabel: string;
    viewLeaderboard: string;
    tryNextGig: string;
  };
  challenge: {
    header: {
      backToPlay: string;
      levelBand: (level: number, band: string) => string;
      bossLevel: string;
      advancedHint: string;
      resultLevelTitle: (level: number, levelName: string) => string;
    };
    agentPanel: {
      eyebrow: string;
      title: string;
      body: string;
      steps: readonly string[];
      browserModeNote: string;
      directActionsEyebrow: string;
      directActionsBody: string;
      supportAssetsEyebrow: string;
      supportAssetsBody: string;
      shareToAi: string;
      sharedToAi: string;
      shareToAiFailed: string;
      scriptToolkitEyebrow: string;
      scriptToolkitBody: string;
      copyAgentBrief: string;
      copiedAgentBrief: string;
      copyChallengeUrl: string;
      copiedChallengeUrl: string;
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
      downloadAgentRules: string;
      downloadHandoffBundle: string;
      downloadClaudeCodeTask: string;
      downloadCursorTask: string;
      downloadN8nStarter: string;
      agentRulesFilename: string;
      jumpToSubmit: string;
      jumpToEditor: string;
      mobileGuidanceSummary: string;
      moreAssetsSummary: string;
      mobileNavBrief: string;
      mobileNavAgent: string;
      mobileNavDelivery: string;
      mobileNavTools: string;
      copiedScriptButton: string;
      copyScriptFailed: string;
      copyScriptButton: (lang: ScriptLang) => string;
      downloadScriptButton: string;
      downloadScriptFilename: (lang: ScriptLang) => string;
      scriptTabListAriaLabel: string;
      scriptTabs: {
        curl: string;
        python: string;
        node: string;
      };
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
      l0MissingKeyword: string;
      l5RemoveFences: string;
      l5InvalidJson: string;
      l5MustBeObject: string;
      l5MissingKey: (key: string) => string;
      l5KeyTooShort: (key: string, min: number, got: number) => string;
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
      copyResultLink: string;
      copiedResultLink: string;
      registerEyebrow: string;
      registerTitle: string;
      registerBody: string;
      registerCta: string;
      registerDismiss: string;
    };
  };
  leaderboard: {
    metaDescription: string;
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
    agentStackFilter: string;
    agentStackPlaceholder: string;
    affiliationFilter: string;
    affiliationPlaceholder: string;
    identityTypeFilter: string;
    identityTypeAll: string;
    identityTypeAnonymous: string;
    identityTypeRegistered: string;
    applyFilter: string;
    clearFilter: string;
    allAgentStacks: string;
    activeFilterEyebrow: string;
    activeFilterAgentStack: string;
    activeFilterAffiliation: string;
    activeFilterIdentityType: string;
    viewEyebrow: string;
    showingLabel: (from: number, to: number, total: number) => string;
    sortExplainer: string;
    detailSelectionStorage: string;
    failedToLoad: string;
    staleDataNotice: string;
    selectionUnavailableTitle: string;
    selectionInvalid: string;
    clearSelection: string;
    standingsTitle: string;
    standingsSubtitle: string;
    listPlusDetail: string;
    refreshing: string;
    loading: string;
    noEntriesTitle: string;
    noEntriesFilteredHint: string;
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
    agentStackMix: {
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
      // Small "LIVE · 5s" badge shown in the activity card header. Keeps the
      // refresh cadence self-documenting without a tooltip.
      liveBadge: string;
      // Render helper for an activity row. Returns the conjugated, localized
      // verb tense rather than concatenating strings, so other locales can
      // re-order subject/verb/object cleanly.
      rowVerbPassed: string;
      rowVerbAttempted: string;
      usingAgentStackPrefix: string;
    };
    // Detail panel shown when a live-activity row opens the submission-level
    // summary. Registered rows usually link straight to `/leaderboard/:playerId`;
    // anonymous rows open this panel first so the feed can stay scoped to the
    // specific run that just landed.
    activityDetail: {
      panelLabel: string;
      eyebrow: string;
      title: string;
      close: string;
      loading: string;
      failedToLoad: string;
      verbPassed: string;
      verbAttempted: string;
      usingAgentStackPrefix: string;
      totalLabel: string;
      structureLabel: string;
      coverageLabel: string;
      qualityLabel: string;
      solveTimeLabel: string;
      countryLabel: string;
      submittedLabel: string;
      tierLabel: string;
      judgeSummaryLabel: string;
      notAvailable: string;
      anonymousNote: string;
      openFullProfile: string;
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
      copyProfileLink: string;
      copiedProfileLink: string;
      betaPioneerBadge: string;
      profilePlayerFallback: string;
      noPublicHandle: string;
      tierFallback: string;
      highestLevel: string;
      totalScore: string;
      levelsCompleted: string;
      affiliationLabel: string;
      affiliationFallback: string;
      agentStackLabel: string;
      agentStackFallback: string;
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
      colAgentStack: string;
      colHighest: string;
      colFrontierScore: string;
      colSolveTime: string;
      colTier: string;
      colLastSubmission: string;
      noPublicHandle: string;
      anonymousSession: string;
      agentStackNotSet: string;
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
      agentStackLabel: string;
      affiliationLabel: string;
      affiliationFallback: string;
      lastSubmissionLabel: (formatted: string) => string;
      noSubmissionsYet: string;
      noSubmissionFallback: string;
      openPlayerDetailAriaLabel: (name: string) => string;
      openAnonymousDetailAriaLabel: (name: string) => string;
      openPlayerPageAriaLabel: (name: string) => string;
    };
  };
  device: {
    signInTitle: string;
    signInDescription: string;
    panelEyebrow: string;
    panelTitle: string;
    cliCommand: string;
    panelBodyPrefix: string;
    panelBodySuffix: string;
    enterCodeTitle: string;
    enterCodeBodyPrefix: string;
    enterCodeBodySuffix: string;
    codePlaceholder: string;
    continue: string;
    invalidCodePrefix: string;
    invalidCodeSuffix: string;
    expiredCodePrefix: string;
    expiredCodeSuffix: string;
    deniedRequest: string;
    verifiedRequest: string;
    missingCode: string;
    missingProofToken: string;
    pickOneScope: string;
    authorizing: string;
    authorizeFailed: string;
    authorizeSuccess: string;
    cancelling: string;
    cancelFailed: string;
    cancelSuccess: string;
    userCode: string;
    client: string;
    requestedAt: (value: string) => string;
    requestedScopesTitle: string;
    requestedScopesBody: string;
    expiresAt: (value: string) => string;
    authorize: string;
    cancel: string;
  };
  errors: Record<ErrorCode, string>;
}
