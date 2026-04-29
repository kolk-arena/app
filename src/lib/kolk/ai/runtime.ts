export const AI_PROVIDERS = ['p1', 'p2', 'p3'] as const;
export type AiProvider = typeof AI_PROVIDERS[number];
export type ChatProvider = Extract<AiProvider, 'p1' | 'p2'>;
export type ContentProvider = Extract<AiProvider, 'p3'>;
export const SCORING_GROUPS = ['G1', 'G2', 'G3'] as const;
export type ScoringGroup = typeof SCORING_GROUPS[number];
export const SCORING_COMBOS = ['A', 'B', 'C'] as const;
export type ScoringCombo = typeof SCORING_COMBOS[number];

export const SCORING_MODEL_ENV = {
  G1_PRIMARY: 'KOLK_SCORING_G1_MODEL',
  G2_PRIMARY: 'KOLK_SCORING_G2_MODEL',
  G2_FALLBACK: 'KOLK_SCORING_G2_FALLBACK_MODEL',
  G2_SECONDARY: 'KOLK_SCORING_G2_SECONDARY_MODEL',
  G3_PRIMARY: 'KOLK_SCORING_G3_MODEL',
} as const;

type ChatTokenMode = 'classic' | 'completion';
type ProviderKind = 'chat' | 'content';

type ProviderMetadata = {
  kind: ProviderKind;
  apiKeyEnv: string;
  baseURLEnv: string;
  modelEnv: string;
  judgeCompatible: boolean;
  tokenMode?: ChatTokenMode;
  temperatureAllowed?: boolean;
};

const PROVIDER_METADATA: Record<AiProvider, ProviderMetadata> = {
  p1: {
    kind: 'chat',
    apiKeyEnv: 'KOLK_SCORING_P1_API_KEY',
    baseURLEnv: 'KOLK_SCORING_P1_BASE_URL',
    modelEnv: SCORING_MODEL_ENV.G1_PRIMARY,
    judgeCompatible: true,
    tokenMode: 'classic',
    temperatureAllowed: true,
  },
  p2: {
    kind: 'chat',
    apiKeyEnv: 'KOLK_SCORING_P2_API_KEY',
    baseURLEnv: 'KOLK_SCORING_P2_BASE_URL',
    modelEnv: SCORING_MODEL_ENV.G2_PRIMARY,
    judgeCompatible: true,
    tokenMode: 'completion',
    temperatureAllowed: false,
  },
  p3: {
    kind: 'content',
    apiKeyEnv: 'KOLK_SCORING_P3_API_KEY',
    baseURLEnv: 'KOLK_SCORING_P3_BASE_URL',
    modelEnv: SCORING_MODEL_ENV.G3_PRIMARY,
    judgeCompatible: true,
  },
};

export interface ProviderRuntimeConfig {
  provider: AiProvider;
  kind: ProviderKind;
  apiKeyEnv: string;
  apiKey?: string;
  baseURLEnv: string;
  baseURL?: string;
  modelEnv: string;
  model?: string;
  available: boolean;
  missingEnvKeys: string[];
  judgeCompatible: boolean;
}

export interface ConfiguredProviderRuntimeConfig extends ProviderRuntimeConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  available: true;
}

export interface ConfiguredJudgeProviderRuntimeConfig extends ConfiguredProviderRuntimeConfig {
  provider: ChatProvider;
  kind: 'chat';
  judgeCompatible: true;
}

export interface ProviderReadiness {
  provider: AiProvider;
  available: boolean;
  judgeCompatible: boolean;
  activeJudgeCandidate: boolean;
  requiredForOperatorStack: boolean;
  missingEnvKeys: string[];
}

export interface AiStackStatus {
  providers: Record<AiProvider, ProviderReadiness>;
  configuredProviders: AiProvider[];
  missingProviders: AiProvider[];
  fullyConfigured: boolean;
}

export interface ChatRuntime {
  provider: ChatProvider;
  apiKey: string;
  baseURL: string;
  model: string;
  tokenMode: ChatTokenMode;
  temperatureAllowed: boolean;
}

export interface ContentRuntime {
  provider: ContentProvider;
  apiKey: string;
  baseURL: string;
  model: string;
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
  activeJudgeProvider: ChatProvider | null;
  activeJudgeReady: boolean;
  activeJudgeProviders: ChatProvider[];
  activeJudgeMissingEnvKeys: string[];
  missingEnvKeys: string[];
  scoringReady: boolean;
  availableScoringGroups: ScoringGroup[];
  availableScoringCombos: ScoringCombo[];
  preferredScoringCombo: ScoringCombo | null;
  scoringMissingEnvKeys: string[];
}

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type ChatCompletionResponse = {
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: string | null;
    };
  }>;
  usage?: unknown;
};

const JUDGE_PROVIDER_ORDER = ['p1', 'p2'] as const satisfies readonly ChatProvider[];
const SCORING_GROUP_PROVIDER_REQUIREMENTS: Record<ScoringGroup, readonly AiProvider[]> = {
  G1: ['p1'],
  G2: ['p2', 'p3'],
  G3: ['p3'],
};
const SCORING_GROUP_ENV_REQUIREMENTS: Record<ScoringGroup, readonly string[]> = {
  G1: [
    PROVIDER_METADATA.p1.apiKeyEnv,
    PROVIDER_METADATA.p1.baseURLEnv,
    SCORING_MODEL_ENV.G1_PRIMARY,
  ],
  G2: [
    PROVIDER_METADATA.p2.apiKeyEnv,
    PROVIDER_METADATA.p2.baseURLEnv,
    SCORING_MODEL_ENV.G2_PRIMARY,
    SCORING_MODEL_ENV.G2_FALLBACK,
    PROVIDER_METADATA.p3.apiKeyEnv,
    PROVIDER_METADATA.p3.baseURLEnv,
    SCORING_MODEL_ENV.G2_SECONDARY,
  ],
  G3: [
    PROVIDER_METADATA.p3.apiKeyEnv,
    PROVIDER_METADATA.p3.baseURLEnv,
    SCORING_MODEL_ENV.G3_PRIMARY,
  ],
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

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function missingEnvKeys(keys: readonly string[]): string[] {
  return unique(keys.filter((key) => !readOptionalEnv(key)));
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function providerEnvKeys(provider: AiProvider): string[] {
  const metadata = PROVIDER_METADATA[provider];
  return [metadata.apiKeyEnv, metadata.baseURLEnv, metadata.modelEnv];
}

export function readScoringModel(key: keyof typeof SCORING_MODEL_ENV): string | undefined {
  return readOptionalEnv(SCORING_MODEL_ENV[key]);
}

export function getProviderRuntimeConfig(provider: AiProvider): ProviderRuntimeConfig {
  const metadata = PROVIDER_METADATA[provider];
  const apiKey = readOptionalEnv(metadata.apiKeyEnv);
  const baseURL = readOptionalEnv(metadata.baseURLEnv);
  const model = readOptionalEnv(metadata.modelEnv);
  const missing = missingEnvKeys(providerEnvKeys(provider));

  return {
    provider,
    kind: metadata.kind,
    apiKeyEnv: metadata.apiKeyEnv,
    apiKey,
    baseURLEnv: metadata.baseURLEnv,
    baseURL,
    modelEnv: metadata.modelEnv,
    model,
    available: missing.length === 0,
    missingEnvKeys: missing,
    judgeCompatible: metadata.judgeCompatible,
  };
}

export function getProviderRuntimeConfigs(): Record<AiProvider, ProviderRuntimeConfig> {
  return {
    p1: getProviderRuntimeConfig('p1'),
    p2: getProviderRuntimeConfig('p2'),
    p3: getProviderRuntimeConfig('p3'),
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
    p1: {
      provider: 'p1',
      available: configs.p1.available,
      judgeCompatible: configs.p1.judgeCompatible,
      activeJudgeCandidate: configs.p1.available && configs.p1.judgeCompatible,
      requiredForOperatorStack: true,
      missingEnvKeys: configs.p1.missingEnvKeys,
    },
    p2: {
      provider: 'p2',
      available: configs.p2.available,
      judgeCompatible: configs.p2.judgeCompatible,
      activeJudgeCandidate: configs.p2.available && configs.p2.judgeCompatible,
      requiredForOperatorStack: true,
      missingEnvKeys: configs.p2.missingEnvKeys,
    },
    p3: {
      provider: 'p3',
      available: configs.p3.available,
      judgeCompatible: configs.p3.judgeCompatible,
      activeJudgeCandidate: false,
      requiredForOperatorStack: true,
      missingEnvKeys: configs.p3.missingEnvKeys,
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
    fullyConfigured: getMissingAiEnvKeys().length === 0,
  };
}

export function getMissingAiEnvKeys(): string[] {
  return unique(SCORING_GROUPS.flatMap((group) => SCORING_GROUP_ENV_REQUIREMENTS[group]))
    .filter((key) => !readOptionalEnv(key));
}

export function isAiStackReady(): boolean {
  return getAiStackStatus().fullyConfigured;
}

function getConfiguredJudgeProviders(): ConfiguredJudgeProviderRuntimeConfig[] {
  return JUDGE_PROVIDER_ORDER.flatMap((provider) => {
    const config = getProviderRuntimeConfig(provider);
    const metadata = PROVIDER_METADATA[provider];

    if (
      config.kind !== 'chat'
      || !config.available
      || !config.judgeCompatible
      || !config.model
      || !config.apiKey
      || !config.baseURL
    ) {
      return [];
    }

    return [{
      ...config,
      provider,
      kind: 'chat',
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      model: config.model,
      available: true,
      judgeCompatible: true,
      tokenMode: metadata.tokenMode ?? 'classic',
      temperatureAllowed: metadata.temperatureAllowed ?? false,
    }];
  });
}

export function getChatRuntime(
  provider: ChatProvider,
  modelOverride?: string,
): ChatRuntime | null {
  const config = getProviderRuntimeConfig(provider);
  const metadata = PROVIDER_METADATA[provider];
  const apiKey = config.apiKey;
  const baseURL = config.baseURL;
  const model = modelOverride ?? config.model;

  if (config.kind !== 'chat' || !config.available || !apiKey || !baseURL || !model) {
    return null;
  }

  return {
    provider,
    apiKey,
    baseURL,
    model,
    tokenMode: metadata.tokenMode ?? 'classic',
    temperatureAllowed: metadata.temperatureAllowed ?? false,
  };
}

export function getContentRuntime(modelOverride?: string): ContentRuntime | null {
  const config = getProviderRuntimeConfig('p3');
  const apiKey = config.apiKey;
  const baseURL = config.baseURL;
  const model = modelOverride ?? config.model;

  if (config.kind !== 'content' || !config.available || !apiKey || !baseURL || !model) {
    return null;
  }

  return {
    provider: 'p3',
    apiKey,
    baseURL,
    model,
  };
}

export function getActiveJudgeProvider(): ChatProvider | null {
  return getConfiguredJudgeProviders()[0]?.provider ?? null;
}

export function getActiveJudgeRuntime(): ChatRuntime | null {
  const config = getConfiguredJudgeProviders()[0];
  return config ? getChatRuntime(config.provider, config.model) : null;
}

export function getScoringGroupAvailability(): Record<ScoringGroup, ScoringGroupAvailability> {
  return Object.fromEntries(
    SCORING_GROUPS.map((group) => {
      const missing = missingEnvKeys(SCORING_GROUP_ENV_REQUIREMENTS[group]);

      return [
        group,
        {
          group,
          available: missing.length === 0,
          providers: [...SCORING_GROUP_PROVIDER_REQUIREMENTS[group]],
          missingEnvKeys: missing,
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

  return unique(
    getAvailableScoringGroups().length === 0
      ? getMissingAiEnvKeys()
      : SCORING_GROUPS.flatMap((group) => getScoringGroupAvailability()[group].missingEnvKeys),
  );
}

export function getAiReadinessSummary(): AiReadinessSummary {
  const stack = getAiStackStatus();
  const activeJudgeProviders = getConfiguredJudgeProviders().map((provider) => provider.provider);
  const activeJudgeMissingEnvKeys = unique(
    JUDGE_PROVIDER_ORDER.flatMap((provider) => stack.providers[provider].missingEnvKeys),
  );
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

export async function createChatCompletion(
  runtime: ChatRuntime,
  input: {
    messages: ChatMessage[];
    responseFormat?: unknown;
    maxTokens: number;
    temperature?: number;
  },
): Promise<ChatCompletionResponse> {
  const body: Record<string, unknown> = {
    model: runtime.model,
    messages: input.messages,
  };

  if (input.responseFormat) {
    body.response_format = input.responseFormat;
  }

  if (runtime.tokenMode === 'completion') {
    body.max_completion_tokens = input.maxTokens;
  } else {
    body.max_tokens = input.maxTokens;
    if (runtime.temperatureAllowed && input.temperature !== undefined) {
      body.temperature = input.temperature;
    }
  }

  const response = await fetch(`${trimTrailingSlash(runtime.baseURL)}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${runtime.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Chat scoring request failed (${response.status}): ${text}`);
  }

  return response.json() as Promise<ChatCompletionResponse>;
}

export async function createContentGeneration(
  runtime: ContentRuntime,
  input: {
    systemPrompt: string;
    userContent: string;
    maxTokens: number;
    temperature?: number;
    responseMimeType?: string;
  },
): Promise<string> {
  const response = await fetch(
    `${trimTrailingSlash(runtime.baseURL)}/models/${encodeURIComponent(runtime.model)}:generateContent?key=${encodeURIComponent(runtime.apiKey)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: input.systemPrompt }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: input.userContent }],
          },
        ],
        generationConfig: {
          temperature: input.temperature,
          maxOutputTokens: input.maxTokens,
          ...(input.responseMimeType ? { responseMimeType: input.responseMimeType } : {}),
        },
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Content scoring request failed (${response.status}): ${text}`);
  }

  const payload = await response.json() as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  return payload.candidates?.[0]?.content?.parts
    ?.map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('')
    .trim() ?? '';
}
