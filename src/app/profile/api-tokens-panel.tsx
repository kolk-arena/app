'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CopyButton } from '@/components/ui/copy-button';
import { useLocalizedDateTimeFormatter } from '@/components/time/localized-time';
import { copy } from '@/i18n';

type ApiTokenPublicView = {
  id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  client_kind: 'cli' | 'web' | 'device' | 'other';
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
};

type CreateResponse = ApiTokenPublicView & { token: string };

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string };

export function ApiTokensPanel() {
  const t = copy.profile.apiTokens;
  const formatLocalDateTime = useLocalizedDateTimeFormatter();
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [tokens, setTokens] = useState<ApiTokenPublicView[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const scopeCheckboxes = useMemo(
    () => [
      { scope: 'submit:onboarding', default: true, ...t.scopeOptions.submitOnboarding },
      { scope: 'submit:ranked', default: true, ...t.scopeOptions.submitRanked },
      { scope: 'fetch:challenge', default: true, ...t.scopeOptions.fetchChallenge },
      { scope: 'read:profile', default: true, ...t.scopeOptions.readProfile },
      { scope: 'write:profile', default: false, ...t.scopeOptions.writeProfile },
    ],
    [t],
  );
  const [newScopes, setNewScopes] = useState<Set<string>>(() => new Set(scopeCheckboxes.filter((s) => s.default).map((s) => s.scope)));
  const [justCreated, setJustCreated] = useState<CreateResponse | null>(null);

  const load = useCallback(async () => {
    setStatus({ kind: 'loading' });
    try {
      const resp = await fetch('/api/tokens', { credentials: 'include', cache: 'no-store' });
      if (resp.status === 401) {
        setStatus({ kind: 'error', message: t.signInRequired });
        return;
      }
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        setStatus({ kind: 'error', message: typeof body?.error === 'string' ? body.error : t.failedToLoad });
        return;
      }
      const body = await resp.json();
      setTokens((body?.tokens ?? []) as ApiTokenPublicView[]);
      setStatus({ kind: 'idle' });
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : t.failedToLoad });
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = newName.trim();
    if (trimmed.length === 0) {
      setStatus({ kind: 'error', message: t.nameRequired });
      return;
    }
    if (newScopes.size === 0) {
      setStatus({ kind: 'error', message: t.pickScopeRequired });
      return;
    }

    setCreating(true);
    setStatus({ kind: 'idle' });

    try {
      const resp = await fetch('/api/tokens', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmed,
          scopes: Array.from(newScopes),
          client_kind: 'web',
        }),
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setStatus({ kind: 'error', message: typeof body?.error === 'string' ? body.error : t.failedToCreate });
        return;
      }
      const created = body as CreateResponse;
      setJustCreated(created);
      setNewName('');
      await load();
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : t.failedToCreate });
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(tokenId: string) {
    const ok = window.confirm(t.revokeConfirm);
    if (!ok) return;

    try {
      const resp = await fetch(`/api/tokens/${tokenId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        setStatus({ kind: 'error', message: typeof body?.error === 'string' ? body.error : t.failedToRevoke });
        return;
      }
      // If the just-created token was revoked, hide the plaintext banner too
      if (justCreated?.id === tokenId) setJustCreated(null);
      await load();
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : t.failedToRevoke });
    }
  }

  function toggleScope(scope: string) {
    setNewScopes((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });
  }

  return (
    <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm card-hover">
      <div>
        <p className="text-xs font-medium text-slate-500">{t.sectionEyebrow}</p>
        <h2 className="text-2xl font-bold tracking-tight text-slate-950">{t.sectionTitle}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-700">
          {t.sectionBody}
        </p>
      </div>

      {status.kind === 'error' ? (
        <div className="status-message status-error" role="alert">
          {status.message}
        </div>
      ) : null}

      {justCreated ? (
        <div className="status-message status-success space-y-2">
          <p className="font-semibold">{t.newTokenTitle}</p>
          <code className="block break-all rounded-xl border border-emerald-200 bg-white px-3 py-2 font-mono text-xs text-emerald-900">{justCreated.token}</code>
          <div className="flex gap-2">
            <CopyButton
              value={justCreated.token}
              idleLabel={t.copyToken}
              copiedLabel={t.copiedToken}
              className="action-button action-button-secondary action-button-sm border-emerald-200 text-emerald-800 hover:bg-emerald-100"
            />
            <button
              type="button"
              onClick={() => setJustCreated(null)}
              className="action-button action-button-secondary action-button-sm border-emerald-200 text-emerald-800 hover:bg-emerald-100"
            >
              {t.dismissToken}
            </button>
          </div>
        </div>
      ) : null}

      <form onSubmit={handleCreate} className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div>
          <label className="block space-y-2 text-sm text-slate-800">
            <span className="text-xs font-medium text-slate-600">{t.tokenName}</span>
            <input
              className="form-control focus-gentle"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder={t.tokenNamePlaceholder}
              maxLength={80}
              disabled={creating}
            />
          </label>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-slate-600">{t.scopes}</legend>
          <p className="text-xs text-slate-700">{t.scopesHelp}</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {scopeCheckboxes.map((s) => (
              <li key={s.scope} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={newScopes.has(s.scope)}
                    onChange={() => toggleScope(s.scope)}
                    disabled={creating}
                  />
                  <span>
                    <code className="font-mono text-[12px] text-slate-950">{s.label}</code>
                    <p className="text-xs text-slate-700">{s.detail}</p>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>

        <button
          type="submit"
          disabled={creating}
          className="action-button action-button-slate action-button-md focus-visible:outline-none"
        >
          {creating ? t.creating : t.create}
        </button>
      </form>

      <div>
        <p className="text-xs font-medium text-slate-500">{t.activeTokens}</p>
        {status.kind === 'loading' ? (
          <p className="mt-2 text-sm text-slate-700">{t.loading}</p>
        ) : tokens.length === 0 ? (
          <p className="mt-2 text-sm text-slate-700">{t.empty}</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {tokens.map((token) => (
              <li key={token.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-950">{token.name}</span>
                    <code className="rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-950">{token.token_prefix}…</code>
                    <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-700">
                      {token.client_kind}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 text-xs text-slate-700">
                    {token.scopes.map((scope) => (
                      <code key={scope} className="rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-950">
                        {scope}
                      </code>
                    ))}
                  </div>
                  <p className="font-mono text-[11px] text-slate-700">
                    {t.createdAt(formatLocalDateTime(token.created_at, token.created_at))}
                    {token.last_used_at
                      ? ` · ${t.lastUsedAt(formatLocalDateTime(token.last_used_at, token.last_used_at))}`
                      : ` · ${t.neverUsed}`}
                    {token.expires_at
                      ? ` · ${t.expiresAt(formatLocalDateTime(token.expires_at, token.expires_at))}`
                      : ` · ${t.noExpiry}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRevoke(token.id)}
                  className="action-button action-button-danger action-button-sm focus-visible:outline-none"
                >
                  {t.revoke}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
