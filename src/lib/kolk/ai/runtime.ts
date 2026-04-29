import OpenAI from 'openai';

export const AI_PROVIDERS = ['xai', 'openai', 'gemini'] as const;
export type AiProvider = typeof AI_PROVIDERS[number];
export type OpenAICompatibleProvider = Extract<AiProvider, 'xai' | 'openai'>;
export const SCORING_GROUPS = ['G1', 'G2', 'G3'] as const;
export type ScoringGroup = typeof SCORING_GROUPS[number];
export const SCORING_COMBOS = ['A', 'B', 'C'] as const;
export type ScoringCombo = typeof SCORING_COMBOS[number];

export const SCORING_MODEL_DEFAULTS = {
  G1_XAI: 'grok-4-1-fast-non-reasoning',
  G2_OPENAI_NANO: 'gpt-5-nano',
  G2_OPENAI_FALLBACK: 'gpt-5-mini',
  G2_GEMINI_FLASH_LITE: 'gemini-2.5-flash-lite',
  G3_GEMINI_FLASH: 'gemini-2.5-flash',
} as const;

const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

type ProviderMetadata = {
  apiKeyEnv: string;
  baseURLEnv?: string;
  defaultBaseURL?: string;
  modelEnv?: string;
  defaultModel?: string;
  judgeCompatible: boolean;
};

const PROVIDER_METADATA: Record<AiProvider, ProviderMetadata> = {
  xai: {
    apiKeyEnv: 'XAI_API_KEY',
    baseURLEnv: 'XAI_BASE_URL',
    defaultBaseURL: 'https://api.x.ai/v1',
    modelEnv: 'XAI_MODEL',
    defaultModel: SCORING_MODEL_DEFAULTS.G1_XAI,
    judgeCompatible: true,
  },
  openai: {
    apiKeyEnv: 'OPENAI_API_KEY',
    modelEnv: 'OPENAI_MODEL',
    defaultModel: SCORING_MODEL_DEFAULTS.G2_OPENAI_FALLBACK,
    judgeCompatible: true,
  },
  gemini: {
    apiKeyEnv: 'GEMINI_API_KEY',
    modelEnv: 'GEMINI_MODEL',
    defaultModel: SCORING_MODEL_DEFAULTS.G3_GEMINI_FLASH,
    judgeCompatible: true,
  },
};

export interface ProviderRuntimeConfig {
  provider: AiProvider;
  apiKeyEnv: string;
  apiKey?: string;
  baseURLEnv?: string;
  baseURL?: string;
  modelEnv?: string;
  model?: string;
  available: boolean;
  judgeCompatible: boolean;
}

export interface ConfiguredProviderRuntimeConfig extends ProviderRuntimeConfig {
  apiKey: string;
  available: true;
}

export interface ConfiguredJudgeProviderRuntimeConfig extends ConfiguredProviderRuntimeConfig {
  provider: OpenAICompatibleProvider;
  model: string;
  judgeCompatible: true;
}

export interface ProviderReadiness {
  provider: AiProvider;
  available: boolean;
  judgeCompatible: boolean;
  activeJudgeCandidate: boolean;
  requiredForOperatorStack: boolean;
}

export interface AiStackStatus {
  providers: Record<AiProvider, ProviderReadiness>;
  configuredProviders: AiProvider[];
  missingProviders: AiProvider[];
  fullyConfigured: boolean;
}

export interface OpenAICompatibleRuntime {
  provider: OpenAICompatibleProvider;
  client: OpenAI;
  model: string;
}

export interface GeminiRuntime {
  provider: 'gemini';
  apiKey: string;
  model: string;
  baseURL: string;
}

export interface ScoringGroupAvailability {
  group: ScoringGroup;
  available: boolean;
  providers: AiProvider[];
  missingEnvKeys: string[];
}

export interface ScoringComboAvailability {
  combo: ScoringCombo;
  groups: readonly ScoringGroup[];
  available: boolean;
}

export interface AiReadinessSummary {
  fullyConfigured: boolean;
  operatorStackReady: boolean;
  activeJudgeProvider: OpenAICompatibleProvider | null;
  activeJudgeReady: boolean;
  activeJudgeProviders: OpenAICompatibleProvider[];
  activeJudgeMissingEnvKeys: string[];
  missingEnvKeys: string[];
  scoringReady: boolean;
  availableScoringGroups: ScoringGroup[];
  availableScoringCombos: ScoringCombo[];
  preferredScoringCombo: ScoringCombo | null;
  scoringMissingEnvKeys: string[];
}

const JUDGE_PROVIDER_ORDER = ['xai', 'openai'] as const satisfies readonly OpenAICompatibleProvider[];
const openAiCompatibleCache = new Map<string, OpenAI>();
const SCORING_GROUP_PROVIDER_REQUIREMENTS: Record<ScoringGroup, readonly AiProvider[]> = {
  G1: ['xai'],
  G2: ['openai', 'gemini'],
  G3: ['gemini'],
};
const SCORING_COMBO_GROUPS: Record<ScoringCombo, readonly ScoringGroup[]> = {
  A: ['G1', 'G2'],
  B: ['G2', 'G3'],
  C: ['G1', 'G3'],
};

function readOptionalEnv(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function getProviderRuntimeConfig(provider: AiProvider): ProviderRuntimeConfig {
  const metadata = PROVIDER_METADATA[provider];
  const apiKey = readOptionalEnv(metadata.apiKeyEnv);

  return {
    provider,
    apiKeyEnv: metadata.apiKeyEnv,
    apiKey,
    baseURLEnv: metadata.baseURLEnv,
    baseURL: readOptionalEnv(metadata.baseURLEnv) ?? metadata.defaultBaseURL,
    modelEnv: metadata.modelEnv,
    model: readOptionalEnv(metadata.modelEnv) ?? metadata.defaultModel,
    available: Boolean(apiKey),
    judgeCompatible: metadata.judgeCompatible,
  };
}

export function getProviderRuntimeConfigs(): Record<AiProvider, ProviderRuntimeConfig> {
  return {
    xai: getProviderRuntimeConfig('xai'),
    openai: getProviderRuntimeConfig('openai'),
    gemini: getProviderRuntimeConfig('gemini'),
  };
}

export function isProviderAvailable(provider: AiProvider): boolean {
  return getProviderRuntimeConfig(provider).available;
}

export function getAvailableProviders(): AiProvider[] {
  return AI_PROVIDERS.filter((provider) => isProviderAvailable(provider));
}

export function getProviderReadiness(): Record<AiProvider, ProviderReadiness> {
  const configs = getProviderRuntimeConfigs();

  return {
    xai: {
      provider: 'xai',
      available: configs.xai.available,
      judgeCompatible: configs.xai.judgeCompatible,
      activeJudgeCandidate: configs.xai.available && configs.xai.judgeCompatible,
      requiredForOperatorStack: true,
    },
    openai: {
      provider: 'openai',
      available: configs.openai.available,
      judgeCompatible: configs.openai.judgeCompatible,
      activeJudgeCandidate: configs.openai.available && configs.openai.judgeCompatible,
      requiredForOperatorStack: true,
    },
    gemini: {
      provider: 'gemini',
      available: configs.gemini.available,
      judgeCompatible: configs.gemini.judgeCompatible,
      activeJudgeCandidate: configs.gemini.available && configs.gemini.judgeCompatible,
      requiredForOperatorStack: true,
    },
  };
}

export function getAiStackStatus(): AiStackStatus {
  const providers = getProviderReadiness();
  const configuredProviders = AI_PROVIDERS.filter((provider) => providers[provider].available);
  const missingProviders = AI_PROVIDERS.filter((provider) => !providers[provider].available);

  return {
    providers,
    configuredProviders,
    missingProviders,
    fullyConfigured: missingProviders.length === 0,
  };
}

export function getMissingAiEnvKeys(): string[] {
  return getAiStackStatus().missingProviders.map((provider) => PROVIDER_METADATA[provider].apiKeyEnv);
}

export function isAiStackReady(): boolean {
  return getAiStackStatus().fullyConfigured;
}

function getConfiguredJudgeProviders(): ConfiguredJudgeProviderRuntimeConfig[] {
  return JUDGE_PROVIDER_ORDER.flatMap((provider) => {
    const config = getProviderRuntimeConfig(provider);
    const apiKey = config.apiKey;

    if (!config.available || !config.judgeCompatible || !config.model || !apiKey) {
      return [];
    }

    return [{
      ...config,
      provider,
      apiKey,
      model: config.model,
      available: true,
      judgeCompatible: true,
    }];
  });
}

export function getOpenAICompatibleRuntime(
  provider: OpenAICompatibleProvider,
  modelOverride?: string,
): OpenAICompatibleRuntime | null {
  const config = getProviderRuntimeConfig(provider);
  const apiKey = config.apiKey;
  const model = modelOverride ?? config.model;

  if (!config.available || !config.judgeCompatible || !apiKey || !model) {
    return null;
  }

  const cacheKey = `${config.provider}:${config.baseURL ?? 'default'}`;
  let client = openAiCompatibleCache.get(cacheKey);

  if (!client) {
    client = new OpenAI({
      apiKey,
      ...(config.baseURL ? { baseURL: config.baseURL } : {}),
    });
    openAiCompatibleCache.set(cacheKey, client);
  }

  return {
    provider,
    client,
    model,
  };
}

export function getGeminiRuntime(modelOverride?: string): GeminiRuntime | null {
  const config = getProviderRuntimeConfig('gemini');
  const apiKey = config.apiKey;
  const model = modelOverride ?? config.model;

  if (!config.available || !apiKey || !model) {
    return null;
  }

  return {
    provider: 'gemini',
    apiKey,
    model,
    baseURL: GEMINI_API_BASE_URL,
  };
}

export function getActiveJudgeProvider(): OpenAICompatibleProvider | null {
  return getConfiguredJudgeProviders()[0]?.provider ?? null;
}

export function getActiveJudgeRuntime(): OpenAICompatibleRuntime | null {
  const config = getConfiguredJudgeProviders()[0];
  return config ? getOpenAICompatibleRuntime(config.provider, config.model) : null;
}

export function getScoringGroupAvailability(): Record<ScoringGroup, ScoringGroupAvailability> {
  const stack = getAiStackStatus();

  return Object.fromEntries(
    SCORING_GROUPS.map((group) => {
      const providers = [...SCORING_GROUP_PROVIDER_REQUIREMENTS[group]];
      const missingEnvKeys = providers
        .filter((provider) => !stack.providers[provider].available)
        .map((provider) => PROVIDER_METADATA[provider].apiKeyEnv);

      return [
        group,
        {
          group,
          available: missingEnvKeys.length === 0,
          providers,
          missingEnvKeys,
        } satisfies ScoringGroupAvailability,
      ];
    }),
  ) as Record<ScoringGroup, ScoringGroupAvailability>;
}

export function getScoringComboAvailability(): Record<ScoringCombo, ScoringComboAvailability> {
  const groups = getScoringGroupAvailability();

  return Object.fromEntries(
    SCORING_COMBOS.map((combo) => {
      const requiredGroups = SCORING_COMBO_GROUPS[combo];

      return [
        combo,
        {
          combo,
          groups: requiredGroups,
          available: requiredGroups.every((group) => groups[group].available),
        } satisfies ScoringComboAvailability,
      ];
    }),
  ) as Record<ScoringCombo, ScoringComboAvailability>;
}

export function getAvailableScoringGroups(): ScoringGroup[] {
  const groups = getScoringGroupAvailability();
  return SCORING_GROUPS.filter((group) => groups[group].available);
}

export function getAvailableScoringCombos(): ScoringCombo[] {
  const combos = getScoringComboAvailability();
  const available = SCORING_COMBOS.filter((combo) => combos[combo].available);

  // Operational override: disable selected combos without a code deploy.
  // Clear the env var to restore full routing.
  const disabled = (process.env.KOLK_DISABLE_COMBOS ?? '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  if (disabled.length === 0) return available;
  return available.filter((combo) => !disabled.includes(combo));
}

export function getPreferredScoringCombo(): ScoringCombo | null {
  return getAvailableScoringCombos()[0] ?? null;
}

export function getScoringMissingEnvKeys(): string[] {
  if (getAvailableScoringCombos().length > 0) {
    return [];
  }

  return getMissingAiEnvKeys();
}

export function getAiReadinessSummary(): AiReadinessSummary {
  const stack = getAiStackStatus();
  const activeJudgeProviders = getConfiguredJudgeProviders().map((provider) => provider.provider);
  const activeJudgeMissingEnvKeys = JUDGE_PROVIDER_ORDER
    .filter((provider) => !stack.providers[provider].available)
    .map((provider) => PROVIDER_METADATA[provider].apiKeyEnv);
  const availableScoringGroups = getAvailableScoringGroups();
  const availableScoringCombos = getAvailableScoringCombos();

  return {
    fullyConfigured: stack.fullyConfigured,
    operatorStackReady: stack.fullyConfigured,
    activeJudgeProvider: activeJudgeProviders[0] ?? null,
    activeJudgeReady: activeJudgeProviders.length > 0,
    activeJudgeProviders,
    activeJudgeMissingEnvKeys,
    missingEnvKeys: getMissingAiEnvKeys(),
    scoringReady: availableScoringCombos.length > 0,
    availableScoringGroups,
    availableScoringCombos,
    preferredScoringCombo: availableScoringCombos[0] ?? null,
    scoringMissingEnvKeys: getScoringMissingEnvKeys(),
  };
}
