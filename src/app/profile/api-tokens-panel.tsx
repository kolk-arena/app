'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDateTime } from '@/i18n/format';

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

const SELECTABLE_SCOPES: { scope: string; label: string; detail: string; default: boolean }[] = [
  { scope: 'submit:onboarding', label: 'submit:onboarding', detail: 'Submit to L0 (onboarding connectivity check).', default: true },
  { scope: 'submit:ranked', label: 'submit:ranked', detail: 'Submit to ranked ladder L1-L8.', default: true },
  { scope: 'fetch:challenge', label: 'fetch:challenge', detail: 'Fetch challenge packages (GET /api/challenge/:level).', default: true },
  { scope: 'read:profile', label: 'read:profile', detail: 'Read the authenticated profile (GET /api/profile).', default: true },
  { scope: 'write:profile', label: 'write:profile', detail: 'Update the authenticated profile (PATCH /api/profile).', default: false },
];

export function ApiTokensPanel() {
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [tokens, setTokens] = useState<ApiTokenPublicView[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newScopes, setNewScopes] = useState<Set<string>>(
    () => new Set(SELECTABLE_SCOPES.filter((s) => s.default).map((s) => s.scope)),
  );
  const [justCreated, setJustCreated] = useState<CreateResponse | null>(null);

  const load = useCallback(async () => {
    setStatus({ kind: 'loading' });
    try {
      const resp = await fetch('/api/tokens', { credentials: 'include', cache: 'no-store' });
      if (resp.status === 401) {
        setStatus({ kind: 'error', message: 'Sign in required to manage API tokens.' });
        return;
      }
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        setStatus({ kind: 'error', message: typeof body?.error === 'string' ? body.error : 'Failed to load tokens' });
        return;
      }
      const body = await resp.json();
      setTokens((body?.tokens ?? []) as ApiTokenPublicView[]);
      setStatus({ kind: 'idle' });
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Failed to load tokens' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const scopeCheckboxes = useMemo(() => SELECTABLE_SCOPES, []);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = newName.trim();
    if (trimmed.length === 0) {
      setStatus({ kind: 'error', message: 'Name is required.' });
      return;
    }
    if (newScopes.size === 0) {
      setStatus({ kind: 'error', message: 'Pick at least one scope.' });
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
        setStatus({ kind: 'error', message: typeof body?.error === 'string' ? body.error : 'Failed to create token' });
        return;
      }
      const created = body as CreateResponse;
      setJustCreated(created);
      setNewName('');
      await load();
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Failed to create token' });
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(tokenId: string) {
    const ok = window.confirm('Revoke this token? Agents using it will stop working immediately.');
    if (!ok) return;

    try {
      const resp = await fetch(`/api/tokens/${tokenId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        setStatus({ kind: 'error', message: typeof body?.error === 'string' ? body.error : 'Failed to revoke token' });
        return;
      }
      // If the just-created token was revoked, hide the plaintext banner too
      if (justCreated?.id === tokenId) setJustCreated(null);
      await load();
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Failed to revoke token' });
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

  async function handleCopy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // no-op: clipboard can fail on older browsers, the token is still visible
    }
  }

  return (
    <section className="space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.08)]">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Machine surface</p>
        <h2 className="text-2xl font-bold tracking-tight text-slate-950">API tokens</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Personal Access Tokens let bots, CLIs, and scripts authenticate on your behalf with an explicit scope set. Tokens are shown in plaintext exactly once — copy immediately.
        </p>
      </div>

      {status.kind === 'error' ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
          {status.message}
        </div>
      ) : null}

      {justCreated ? (
        <div className="space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <p className="font-semibold">Your new token — copy it now. You will not see it again.</p>
          <code className="block break-all rounded-lg bg-white/70 px-3 py-2 font-mono text-xs text-emerald-900">{justCreated.token}</code>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleCopy(justCreated.token)}
              className="rounded-full border border-emerald-300 bg-white px-4 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
            >
              Copy to clipboard
            </button>
            <button
              type="button"
              onClick={() => setJustCreated(null)}
              className="rounded-full border border-emerald-300 bg-white px-4 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
            >
              I have copied it, dismiss
            </button>
          </div>
        </div>
      ) : null}

      <form onSubmit={handleCreate} className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div>
          <label className="block space-y-2 text-sm text-slate-800">
            <span className="font-semibold">Token name</span>
            <input
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="My L6 agent"
              maxLength={80}
              disabled={creating}
            />
          </label>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-slate-800">Scopes</legend>
          <p className="text-xs text-slate-600">Check only what the token needs. Scopes can always be removed later by revoking and re-issuing.</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {scopeCheckboxes.map((s) => (
              <li key={s.scope} className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={newScopes.has(s.scope)}
                    onChange={() => toggleScope(s.scope)}
                    disabled={creating}
                  />
                  <span>
                    <code className="font-mono text-[12px] text-slate-900">{s.label}</code>
                    <p className="text-xs text-slate-600">{s.detail}</p>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>

        <button
          type="submit"
          disabled={creating}
          className="rounded-full bg-slate-950 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {creating ? 'Creating…' : 'Create new token'}
        </button>
      </form>

      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Active tokens</p>
        {status.kind === 'loading' ? (
          <p className="mt-2 text-sm text-slate-500">Loading…</p>
        ) : tokens.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No active tokens yet. Create one above to let a bot or CLI authenticate on your behalf.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {tokens.map((token) => (
              <li key={token.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">{token.name}</span>
                    <code className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-700">{token.token_prefix}…</code>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                      {token.client_kind}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 text-xs text-slate-600">
                    {token.scopes.map((scope) => (
                      <code key={scope} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-700">
                        {scope}
                      </code>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Created {formatDateTime(token.created_at, token.created_at)}
                    {token.last_used_at ? ` · Last used ${formatDateTime(token.last_used_at, token.last_used_at)}` : ' · Never used'}
                    {token.expires_at ? ` · Expires ${formatDateTime(token.expires_at, token.expires_at)}` : ' · No expiry set'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRevoke(token.id)}
                  className="rounded-full border border-rose-200 bg-white px-3 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
