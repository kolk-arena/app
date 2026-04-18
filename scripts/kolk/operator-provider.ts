import OpenAI from 'openai';

const DEFAULT_XAI_BASE_URL = 'https://api.x.ai/v1';
const DEFAULT_XAI_MODEL = 'grok-4-1-fast-non-reasoning';

const EXECUTION_PROVIDER = 'xai' as const;
const DECLARED_BASELINE_PROVIDERS = ['xai', 'openai', 'gemini'] as const;

export type OperatorProvider = (typeof DECLARED_BASELINE_PROVIDERS)[number];

export interface OperatorProviderBaseline {
  ready: boolean;
  missing: Array<'XAI_API_KEY' | 'OPENAI_API_KEY' | 'GEMINI_API_KEY'>;
}

export interface OperatorProviderConfig {
  requestedProvider: OperatorProvider;
  executionProvider: typeof EXECUTION_PROVIDER;
  model: string;
  apiKey: string;
  apiKeyEnv: 'XAI_API_KEY';
  baseURL?: string;
  baseline: OperatorProviderBaseline;
}

function normalizeProvider(raw: string | undefined): OperatorProvider {
  const value = raw?.trim().toLowerCase();
  if (!value) return EXECUTION_PROVIDER;

  if (value === 'xai' || value === 'openai' || value === 'gemini') {
    return value;
  }

  throw new Error(
    `Unsupported KOLK_OPERATOR_PROVIDER="${raw}". Supported values: ${DECLARED_BASELINE_PROVIDERS.join(', ')}.`,
  );
}

function getBaseline(): OperatorProviderBaseline {
  const missing = [
    'XAI_API_KEY',
    'OPENAI_API_KEY',
    'GEMINI_API_KEY',
  ].filter((name) => !process.env[name]?.trim()) as Array<'XAI_API_KEY' | 'OPENAI_API_KEY' | 'GEMINI_API_KEY'>;

  return {
    ready: missing.length === 0,
    missing,
  };
}

function requireEnv(name: 'XAI_API_KEY', provider: typeof EXECUTION_PROVIDER): string {
  const value = process.env[name]?.trim();
  if (value) return value;

  throw new Error(
    `Missing operator-side provider credential: ${name}. ` +
    `Set KOLK_OPERATOR_PROVIDER=${provider} and export ${name}.`,
  );
}

function getBaselineErrorMessage(missing: string[]): string {
  return (
    'Incomplete operator credential baseline: missing ' +
    `${missing.join(', ')}. Current scripts/kolk execution still runs through xAI, ` +
    'but the operator baseline frozen in the docs also expects OPENAI_API_KEY and GEMINI_API_KEY.'
  );
}

export function resolveOperatorProviderConfig(options?: {
  enforceBaseline?: boolean;
}): OperatorProviderConfig {
  const requestedProvider = normalizeProvider(process.env.KOLK_OPERATOR_PROVIDER);
  if (requestedProvider !== EXECUTION_PROVIDER) {
    throw new Error(
      `KOLK_OPERATOR_PROVIDER=${requestedProvider} is not executable in scripts/kolk yet. ` +
      'Current script execution remains xAI-backed. Use KOLK_OPERATOR_PROVIDER=xai (or leave it unset).',
    );
  }

  const baseline = getBaseline();
  if (options?.enforceBaseline && !baseline.ready) {
    throw new Error(getBaselineErrorMessage(baseline.missing));
  }

  return {
    requestedProvider,
    executionProvider: EXECUTION_PROVIDER,
    model: process.env.KOLK_OPERATOR_MODEL ?? process.env.XAI_MODEL ?? DEFAULT_XAI_MODEL,
    apiKey: requireEnv('XAI_API_KEY', EXECUTION_PROVIDER),
    apiKeyEnv: 'XAI_API_KEY',
    baseURL: process.env.KOLK_OPERATOR_BASE_URL ?? process.env.XAI_BASE_URL ?? DEFAULT_XAI_BASE_URL,
    baseline,
  };
}

export function createOperatorProviderClient(config: OperatorProviderConfig): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey,
    ...(config.baseURL ? { baseURL: config.baseURL } : {}),
  });
}

export function formatOperatorBaselineStatus(config: OperatorProviderConfig): string {
  if (config.baseline.ready) {
    return 'ready (XAI_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY present)';
  }

  return `incomplete (missing: ${config.baseline.missing.join(', ')})`;
}
