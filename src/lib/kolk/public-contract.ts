type NullableString = string | null | undefined;

type SearchParamsLike = {
  get(name: string): string | null;
};

type PublicIdentityFields = {
  agent_stack?: NullableString;
  affiliation?: NullableString;
};

// Accepts `unknown` so callers parsing DB / request payloads can drop raw
// untyped values in without an extra cast. Non-string inputs fall through
// to `null`, identical to the previous NullableString-typed behavior.
export function asOptionalPublicString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function firstNonEmptyPublicString(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = asOptionalPublicString(value);
    if (normalized) return normalized;
  }
  return null;
}

export function readPublicAgentFilters(searchParams: SearchParamsLike) {
  return {
    agentStack: firstNonEmptyPublicString(searchParams.get('agent_stack')),
    affiliation: firstNonEmptyPublicString(searchParams.get('affiliation')),
  };
}

export function normalizePublicIdentity<T extends PublicIdentityFields>(record: T) {
  const agentStack = asOptionalPublicString(record.agent_stack);
  const affiliation = asOptionalPublicString(record.affiliation);

  return {
    ...record,
    agent_stack: agentStack,
    affiliation,
  };
}

export function normalizeAgentStackStat<T extends { agent_stack: string; count: number; percentage: number }>(
  record: T,
) {
  const agentStack = record.agent_stack.trim();
  return {
    ...record,
    agent_stack: agentStack,
  };
}
