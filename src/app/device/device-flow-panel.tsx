'use client';

import { useMemo, useState } from 'react';
import {
  useLocalizedDateTimeFormatter,
  useLocalizedTimeFormatter,
  useServerNow,
} from '@/components/time/localized-time';
import { copy } from '@/i18n';

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
  serverNowUtc: string;
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
  const now = useServerNow(deviceRequest?.serverNowUtc);
  const formatLocalDateTime = useLocalizedDateTimeFormatter();
  const formatLocalTime = useLocalizedTimeFormatter();

  const normalizedCode = useMemo(() => codeInput.trim().toUpperCase(), [codeInput]);

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
      setStatus({ kind: 'error', message: copy.device.missingCode });
      return;
    }

    window.location.assign(`/device?code=${encodeURIComponent(normalizedCode)}`);
  }

  async function authorize() {
    if (!deviceRequest) return;
    if (!deviceRequest.deviceCode) {
      setStatus({ kind: 'error', message: copy.device.missingProofToken });
      return;
    }
    if (selectedScopes.size === 0) {
      setStatus({ kind: 'error', message: copy.device.pickOneScope });
      return;
    }

    setStatus({ kind: 'submitting', message: copy.device.authorizing });

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
        message: typeof body?.error === 'string' ? body.error : copy.device.authorizeFailed,
      });
      return;
    }

    setStatus({
      kind: 'success',
      message: copy.device.authorizeSuccess,
    });
  }

  async function deny() {
    if (!deviceRequest) return;
    if (!deviceRequest.deviceCode) {
      setStatus({ kind: 'error', message: copy.device.missingProofToken });
      return;
    }

    setStatus({ kind: 'submitting', message: copy.device.cancelling });

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
        message: typeof body?.error === 'string' ? body.error : copy.device.cancelFailed,
      });
      return;
    }

    setStatus({
      kind: 'success',
      message: copy.device.cancelSuccess,
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
      ? 'status-error'
      : status.kind === 'success'
      ? 'status-success'
      : 'status-neutral';

  return (
    <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="space-y-2">
        <p className="text-xs font-medium tracking-[0.14em] text-slate-500">{copy.device.panelEyebrow}</p>
        <h1 className="text-3xl font-black tracking-tight text-slate-950">{copy.device.panelTitle}</h1>
        <p className="max-w-3xl text-sm leading-7 text-slate-700">
          {copy.device.panelBodyPrefix}
          <code className="rounded-lg border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-950">{copy.device.cliCommand}</code>
          {copy.device.panelBodySuffix}
        </p>
      </div>

      {status.kind !== 'idle' ? (
        <div className={`status-message ${statusMessage}`}>
          {status.message}
        </div>
      ) : null}

      {!deviceRequest ? (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <div>
            <p className="text-sm font-semibold text-slate-950">{copy.device.enterCodeTitle}</p>
            <p className="mt-1 text-sm text-slate-700">
              {copy.device.enterCodeBodyPrefix}
              <code className="rounded-lg border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-950">{copy.device.cliCommand}</code>
              {copy.device.enterCodeBodySuffix}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={codeInput}
              onChange={(event) => setCodeInput(event.target.value)}
              placeholder={copy.device.codePlaceholder}
              className="form-control focus-gentle flex-1 text-base uppercase tracking-[0.18em]"
            />
            <button
              type="button"
              onClick={openCode}
              className="action-button action-button-slate action-button-lg focus-visible:outline-none"
            >
              {copy.device.continue}
            </button>
          </div>
        </div>
      ) : null}

      {effectiveRequestStatus === 'invalid' ? (
        <div className="status-message status-error">
          {copy.device.invalidCodePrefix}
          <code className="rounded-lg border border-rose-200 bg-white px-1.5 py-0.5 font-mono text-xs">{copy.device.cliCommand}</code>
          {copy.device.invalidCodeSuffix}
        </div>
      ) : null}

      {effectiveRequestStatus === 'expired' ? (
        <div className="status-message status-warning">
          {copy.device.expiredCodePrefix}
          <code className="rounded-lg border border-amber-200 bg-white px-1.5 py-0.5 font-mono text-xs">{copy.device.cliCommand}</code>
          {copy.device.expiredCodeSuffix}
        </div>
      ) : null}

      {effectiveRequestStatus === 'denied' ? (
        <div className="status-message status-neutral">
          {copy.device.deniedRequest}
        </div>
      ) : null}

      {effectiveRequestStatus === 'verified' ? (
        <div className="status-message status-success">
          {copy.device.verifiedRequest}
        </div>
      ) : null}

      {effectiveRequestStatus === 'pending' && deviceRequest ? (
        <div className="space-y-5 rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs font-medium tracking-[0.14em] text-slate-500">{copy.device.userCode}</p>
              <p className="mt-2 font-mono text-lg font-semibold tracking-[0.18em] text-slate-950">{deviceRequest.userCode}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs font-medium tracking-[0.14em] text-slate-500">{copy.device.client}</p>
              <p className="mt-2 text-sm font-semibold text-slate-950">{deviceRequest.clientKind}</p>
              <p className="mt-1 font-mono text-xs text-slate-700">
                {copy.device.requestedAt(
                  formatLocalDateTime(deviceRequest.createdAt, deviceRequest.createdAt),
                )}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">{copy.device.requestedScopesTitle}</p>
                <p className="mt-1 text-sm text-slate-700">{copy.device.requestedScopesBody}</p>
              </div>
              <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium tracking-[0.12em] text-slate-600">
                {copy.device.expiresAt(
                  formatLocalTime(deviceRequest.expiresAt, deviceRequest.expiresAt),
                )}
              </span>
            </div>

            <ul className="mt-4 grid gap-2">
              {deviceRequest.requestedScopes.map((scope) => (
                <li key={scope.scope} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <label className="flex items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-950 focus:ring-slate-950"
                      checked={selectedScopes.has(scope.scope)}
                      onChange={() => toggleScope(scope.scope)}
                    />
                    <span>
                      <code className="rounded-lg border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-950">{scope.label}</code>
                      <p className="mt-1 text-sm text-slate-700">{scope.detail}</p>
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
              className="action-button action-button-slate action-button-lg focus-visible:outline-none"
            >
              {copy.device.authorize}
            </button>
            <button
              type="button"
              onClick={deny}
              disabled={status.kind === 'submitting'}
              className="action-button action-button-secondary action-button-lg focus-visible:outline-none"
            >
              {copy.device.cancel}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
