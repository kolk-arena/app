'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatDateTime, formatTimeOnly } from '@/i18n/format';

type ScopeView = {
  scope: string;
  label: string;
  detail: string;
};

type DeviceRequestView = {
  userCode: string;
  /** Proof-of-knowledge token forwarded to verify/deny; null for non-pending rows. */
  deviceCode: string | null;
  clientKind: string;
  requestedScopes: ScopeView[];
  grantedScopes: string[];
  createdAt: string;
  expiresAt: string;
  status: 'pending' | 'verified' | 'denied' | 'expired' | 'invalid';
};

export function DeviceFlowPanel({
  initialCode,
  deviceRequest,
}: {
  initialCode: string;
  deviceRequest: DeviceRequestView | null;
}) {
  const [codeInput, setCodeInput] = useState(initialCode);
  const [status, setStatus] = useState<
    | { kind: 'idle' }
    | { kind: 'submitting'; message: string }
    | { kind: 'error'; message: string }
    | { kind: 'success'; message: string }
  >({ kind: 'idle' });
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(
    () => new Set(deviceRequest?.requestedScopes.map((scope) => scope.scope) ?? []),
  );
  const [now, setNow] = useState(0);

  const normalizedCode = useMemo(() => codeInput.trim().toUpperCase(), [codeInput]);

  useEffect(() => {
    if (deviceRequest?.status !== 'pending') {
      return;
    }

    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [deviceRequest?.status, deviceRequest?.expiresAt]);

  const effectiveRequestStatus = useMemo<DeviceRequestView['status'] | null>(() => {
    if (!deviceRequest) {
      return null;
    }

    if (deviceRequest.status !== 'pending') {
      return deviceRequest.status;
    }

    if (now > 0 && new Date(deviceRequest.expiresAt).getTime() <= now) {
      return 'expired';
    }

    return 'pending';
  }, [deviceRequest, now]);

  function openCode() {
    if (!normalizedCode) {
      setStatus({ kind: 'error', message: 'Enter the code shown in your CLI first.' });
      return;
    }

    window.location.assign(`/device?code=${encodeURIComponent(normalizedCode)}`);
  }

  async function authorize() {
    if (!deviceRequest) return;
    if (!deviceRequest.deviceCode) {
      setStatus({ kind: 'error', message: 'This device request is missing its proof-of-knowledge token. Reload the page with a fresh ?code=… query.' });
      return;
    }
    if (selectedScopes.size === 0) {
      setStatus({ kind: 'error', message: 'Pick at least one scope before authorizing.' });
      return;
    }

    setStatus({ kind: 'submitting', message: 'Authorizing CLI…' });

    const response = await fetch('/api/auth/device/verify', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_code: deviceRequest.userCode,
        device_code: deviceRequest.deviceCode,
        granted_scopes: Array.from(selectedScopes),
      }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus({
        kind: 'error',
        message: typeof body?.error === 'string' ? body.error : 'Failed to authorize this CLI request.',
      });
      return;
    }

    setStatus({
      kind: 'success',
      message: 'Authorization complete. You can close this window; your CLI is now signed in.',
    });
  }

  async function deny() {
    if (!deviceRequest) return;
    if (!deviceRequest.deviceCode) {
      setStatus({ kind: 'error', message: 'This device request is missing its proof-of-knowledge token. Reload the page with a fresh ?code=… query.' });
      return;
    }

    setStatus({ kind: 'submitting', message: 'Cancelling request…' });

    const response = await fetch('/api/auth/device/deny', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_code: deviceRequest.userCode,
        device_code: deviceRequest.deviceCode,
      }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus({
        kind: 'error',
        message: typeof body?.error === 'string' ? body.error : 'Failed to cancel this CLI request.',
      });
      return;
    }

    setStatus({
      kind: 'success',
      message: 'Request cancelled. Return to your CLI and run `kolk-arena login` again if you want to restart.',
    });
  }

  function toggleScope(scope: string) {
    setSelectedScopes((current) => {
      const next = new Set(current);
      if (next.has(scope)) {
        next.delete(scope);
      } else {
        next.add(scope);
      }
      return next;
    });
  }

  const statusMessage =
    status.kind === 'error'
      ? 'border-rose-200 bg-rose-50 text-rose-900'
      : status.kind === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : 'border-slate-200 bg-slate-50 text-slate-700';

  return (
    <section className="space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.08)] sm:p-8">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">CLI sign-in</p>
        <h1 className="text-3xl font-black tracking-tight text-slate-950">Device authorization</h1>
        <p className="max-w-3xl text-sm leading-7 text-slate-600">
          Approve a pending <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">kolk-arena login</code> request without copying any bearer token into the terminal.
        </p>
      </div>

      {status.kind !== 'idle' ? (
        <div className={`rounded-2xl border px-4 py-3 text-sm ${statusMessage}`}>
          {status.message}
        </div>
      ) : null}

      {!deviceRequest ? (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div>
            <p className="text-sm font-semibold text-slate-950">Enter your CLI code</p>
            <p className="mt-1 text-sm text-slate-600">
              Run <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">kolk-arena login</code>, then paste the 8-character code shown in the terminal.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={codeInput}
              onChange={(event) => setCodeInput(event.target.value)}
              placeholder="ABCD-1234"
              className="min-h-12 flex-1 rounded-2xl border border-slate-300 bg-white px-4 py-3 font-mono text-base uppercase tracking-[0.18em] text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
            <button
              type="button"
              onClick={openCode}
              className="min-h-12 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Continue
            </button>
          </div>
        </div>
      ) : null}

      {effectiveRequestStatus === 'invalid' ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-900">
          This code is not recognized. Return to your CLI and run <code className="rounded bg-white px-1.5 py-0.5 text-xs">kolk-arena login</code> again.
        </div>
      ) : null}

      {effectiveRequestStatus === 'expired' ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
          This code has expired. Return to your CLI and run <code className="rounded bg-white px-1.5 py-0.5 text-xs">kolk-arena login</code> again.
        </div>
      ) : null}

      {effectiveRequestStatus === 'denied' ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
          This request was already cancelled. Return to your CLI and start a fresh device flow if needed.
        </div>
      ) : null}

      {effectiveRequestStatus === 'verified' ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
          This CLI request is already authorized. You can close this window.
        </div>
      ) : null}

      {effectiveRequestStatus === 'pending' && deviceRequest ? (
        <div className="space-y-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">User code</p>
              <p className="mt-2 font-mono text-lg font-semibold tracking-[0.18em] text-slate-950">{deviceRequest.userCode}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Client</p>
              <p className="mt-2 text-sm font-semibold text-slate-950">{deviceRequest.clientKind}</p>
              <p className="mt-1 text-xs text-slate-500">Requested at {formatDateTime(deviceRequest.createdAt, deviceRequest.createdAt)}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">Requested scopes</p>
                <p className="mt-1 text-sm text-slate-600">You may uncheck scopes to issue a narrower token than the CLI requested.</p>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
                Expires {formatTimeOnly(deviceRequest.expiresAt, deviceRequest.expiresAt)}
              </span>
            </div>

            <ul className="mt-4 grid gap-2">
              {deviceRequest.requestedScopes.map((scope) => (
                <li key={scope.scope} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <label className="flex items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selectedScopes.has(scope.scope)}
                      onChange={() => toggleScope(scope.scope)}
                    />
                    <span>
                      <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-900">{scope.label}</code>
                      <p className="mt-1 text-sm text-slate-600">{scope.detail}</p>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={authorize}
              disabled={status.kind === 'submitting'}
              className="min-h-12 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              Authorize CLI
            </button>
            <button
              type="button"
              onClick={deny}
              disabled={status.kind === 'submitting'}
              className="min-h-12 rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              Cancel request
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
