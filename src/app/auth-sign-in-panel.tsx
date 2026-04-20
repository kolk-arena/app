'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { copy } from '@/i18n';
import { APP_CONFIG } from '@/lib/frontend/app-config';

type AuthSignInPanelProps = {
  nextPath?: string;
  title?: string;
  description?: string;
};

export function AuthSignInPanel({
  nextPath = '/',
  title = copy.auth.defaultTitle,
  description = copy.auth.defaultDescription,
}: AuthSignInPanelProps) {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [emailState, setEmailState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [emailMessage, setEmailMessage] = useState('');
  const [sessionState, setSessionState] = useState<'checking' | 'authenticated' | 'anonymous'>('checking');
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [authParams, setAuthParams] = useState<{ auth: string | null; authError: string | null }>({
    auth: null,
    authError: null,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setAuthParams({
      auth: params.get('auth'),
      authError: params.get('auth_error'),
    });
  }, []);

  const authError = authParams.authError;
  const authSuccess = authParams.auth;

  const authStatusMessage = useMemo(() => {
    if (authSuccess === 'success') {
      return {
        tone: 'success' as const,
        title: copy.auth.statusMessages.success.title,
        body: copy.auth.statusMessages.success.body,
      };
    }

    if (!authError) return null;

    const messages: Record<string, { title: string; body: string }> = {
      missing_code: copy.auth.statusMessages.missing_code,
      exchange_failed: copy.auth.statusMessages.exchange_failed,
      provider_disabled: copy.auth.statusMessages.provider_disabled,
      github_email_required: copy.auth.statusMessages.github_email_required,
      unexpected: copy.auth.statusMessages.unexpected,
    };

    return {
      tone: 'error' as const,
      ...(messages[authError] ?? copy.auth.statusMessages.fallback),
    };
  }, [authError, authSuccess]);

  const hasPublicOAuth = APP_CONFIG.publicGithubAuthEnabled || APP_CONFIG.publicGoogleAuthEnabled;
  const resolvedDescription = hasPublicOAuth
    ? description
    : description.replace(/GitHub, Google, or email(?: OTP)?/g, 'email');

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setSessionState('checking');
    setSessionError(null);

    void fetch('/api/profile', {
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!active) return;

        if (response.ok) {
          setSessionState('authenticated');
          return;
        }

        if (response.status === 401) {
          setSessionState('anonymous');
          return;
        }

        setSessionState('anonymous');
        setSessionError(
          typeof payload?.error === 'string' ? payload.error : copy.auth.sessionCheckUnknown,
        );
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted) return;
        setSessionState('anonymous');
        setSessionError(error instanceof Error ? error.message : copy.auth.sessionCheckUnknown);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  async function handleEmailSignIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedEmail = email.trim();
    const trimmedDisplayName = displayName.trim();

    if (!trimmedEmail) {
      setEmailState('error');
      setEmailMessage(copy.auth.emailRequired);
      return;
    }

    setEmailState('submitting');
    setEmailMessage('');

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        cache: 'no-store',
        body: JSON.stringify({
          email: trimmedEmail,
          displayName: trimmedDisplayName || undefined,
          nextPath,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? copy.auth.startEmailSignInFailed);
      }

      setEmailState('success');
      setEmailMessage(payload.message ?? copy.auth.checkEmail);
    } catch (error) {
      setEmailState('error');
      setEmailMessage(error instanceof Error ? error.message : copy.auth.startEmailSignInFailed);
    }
  }

  const encodedNext = encodeURIComponent(nextPath);

  return (
    <div className="rounded-md border border-slate-200 bg-amber-50 p-4 sm:p-6 lg:p-8">
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-800">
            {copy.auth.signInRequiredEyebrow}
          </p>
          <h2 className="text-2xl font-black tracking-tight text-slate-950">
            {title}
          </h2>
          <p className="max-w-2xl text-sm leading-7 text-slate-800">
            {resolvedDescription}
          </p>
        </div>

        {authStatusMessage ? (
          <div
            className={`rounded-md border-2 px-4 py-3 text-sm ${
              authStatusMessage.tone === 'success'
                ? 'border-emerald-700 bg-emerald-50 text-emerald-900'
                : 'border-rose-700 bg-rose-50 text-rose-900'
            }`}
          >
            <p className="font-semibold">{authStatusMessage.title}</p>
            <p className="mt-1">{authStatusMessage.body}</p>
          </div>
        ) : null}

        {sessionState === 'checking' ? (
          <div className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
            {copy.auth.checkingSession}
          </div>
        ) : null}

        {sessionState === 'authenticated' ? (
          <div className="rounded-md border-2 border-emerald-700 bg-white px-5 py-4 text-sm text-slate-800">
            <p className="font-semibold text-slate-950">{copy.auth.alreadySignedInTitle}</p>
            <p className="mt-1">
              {copy.auth.alreadySignedInBody}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href={nextPath}
                className="inline-flex items-center rounded-md border border-slate-200 bg-slate-950 px-5 py-3 font-mono text-sm font-semibold text-white transition-colors duration-150 hover:bg-white hover:text-slate-950"
              >
                {copy.auth.continue}
              </Link>
              <Link
                href="/profile"
                className="inline-flex items-center rounded-md border border-slate-200 bg-white px-5 py-3 font-mono text-sm font-semibold text-slate-950 transition-colors duration-150 hover:bg-slate-950 hover:text-white"
              >
                {copy.auth.openProfile}
              </Link>
            </div>
          </div>
        ) : null}

        {sessionError && sessionState !== 'authenticated' ? (
          <div className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
            {copy.auth.sessionCheckFailed(sessionError)}
          </div>
        ) : null}

        {sessionState === 'anonymous' ? (
          <>
        {hasPublicOAuth ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {APP_CONFIG.publicGithubAuthEnabled ? (
              <a
                href={`/api/auth/oauth/github?next=${encodedNext}`}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-slate-200 bg-slate-950 px-5 py-3 text-center font-mono text-sm font-semibold text-white transition-colors duration-150 hover:bg-white hover:text-slate-950"
              >
                <GitHubIcon className="h-4 w-4" />
                <span>{copy.auth.oauthGitHub}</span>
              </a>
            ) : null}
            {APP_CONFIG.publicGoogleAuthEnabled ? (
              <a
                href={`/api/auth/oauth/google?next=${encodedNext}`}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-5 py-3 text-center font-mono text-sm font-semibold text-slate-950 transition-colors duration-150 hover:bg-slate-950 hover:text-white"
              >
                <GoogleIcon className="h-4 w-4" />
                <span>{copy.auth.oauthGoogle}</span>
              </a>
            ) : null}
          </div>
        ) : null}

        <div className="rounded-md border border-slate-200 bg-white p-4 sm:p-5">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">
                {copy.auth.emailSignInEyebrow}
              </p>
              <p className="mt-2 text-sm leading-7 text-slate-700">
                {copy.auth.emailSignInBody}
              </p>
            </div>

            <form onSubmit={handleEmailSignIn} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <label className="space-y-2 text-sm text-slate-800">
                <span className="font-semibold uppercase tracking-[0.14em] text-slate-700">{copy.auth.emailLabel}</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  inputMode="email"
                  spellCheck={false}
                  className="min-h-12 w-full rounded-md border border-slate-200 bg-white px-4 py-3 text-base text-slate-950 outline-none transition focus:ring-2 focus:ring-slate-950 sm:text-sm"
                  placeholder={copy.auth.emailPlaceholder}
                />
              </label>
              <label className="space-y-2 text-sm text-slate-800">
                <span className="font-semibold uppercase tracking-[0.14em] text-slate-700">{copy.auth.displayNameLabel}</span>
                <input
                  type="text"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  autoComplete="nickname"
                  maxLength={60}
                  className="min-h-12 w-full rounded-md border border-slate-200 bg-white px-4 py-3 text-base text-slate-950 outline-none transition focus:ring-2 focus:ring-slate-950 sm:text-sm"
                  placeholder={copy.auth.displayNamePlaceholder}
                />
              </label>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={emailState === 'submitting' || email.trim().length === 0}
                  className="inline-flex min-h-12 w-full items-center justify-center rounded-md border border-slate-200 bg-slate-950 px-5 py-3 font-mono text-sm font-semibold text-white transition-colors duration-150 hover:bg-white hover:text-slate-950 disabled:opacity-60 disabled:hover:bg-slate-950 disabled:hover:text-white lg:w-auto"
                >
                  {emailState === 'submitting' ? copy.auth.sending : copy.auth.sendSignInLink}
                </button>
              </div>
            </form>

            {emailState === 'success' ? (
              <div className="rounded-md border-2 border-emerald-700 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" aria-live="polite">
                {emailMessage}
              </div>
            ) : null}

            {emailState === 'error' ? (
              <div className="rounded-md border-2 border-rose-700 bg-rose-50 px-4 py-3 text-sm text-rose-900" aria-live="polite">
                {emailMessage}
              </div>
            ) : null}
          </div>
        </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M8 0C3.58 0 0 3.73 0 8.33c0 3.68 2.29 6.8 5.47 7.9.4.08.55-.18.55-.4 0-.2-.01-.87-.01-1.58-2.01.45-2.53-.51-2.69-.98-.09-.24-.48-.98-.82-1.18-.28-.16-.68-.56-.01-.57.63-.01 1.08.6 1.23.85.72 1.26 1.87.91 2.33.69.07-.54.28-.91.5-1.12-1.78-.21-3.64-.92-3.64-4.1 0-.91.31-1.66.82-2.24-.08-.21-.36-1.05.08-2.18 0 0 .67-.22 2.2.86A7.3 7.3 0 0 1 8 3.73c.68 0 1.37.09 2.01.28 1.53-1.08 2.2-.86 2.2-.86.44 1.13.16 1.97.08 2.18.51.58.82 1.32.82 2.24 0 3.19-1.87 3.89-3.65 4.1.29.25.54.73.54 1.47 0 1.06-.01 1.92-.01 2.19 0 .22.15.49.55.4A8.38 8.38 0 0 0 16 8.33C16 3.73 12.42 0 8 0Z" />
    </svg>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true" className={className}>
      <path d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.15 4.15 0 0 1-1.8 2.72v2.26h2.9c1.7-1.6 2.7-3.96 2.7-6.62Z" fill="currentColor" />
      <path d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.56-1.83.9-3.06.9-2.35 0-4.34-1.62-5.05-3.8H.96v2.32A9 9 0 0 0 9 18Z" fill="currentColor" />
      <path d="M3.95 10.66A5.47 5.47 0 0 1 3.67 9c0-.58.1-1.14.28-1.66V5.02H.96A9.2 9.2 0 0 0 0 9c0 1.45.35 2.82.96 3.98l2.99-2.32Z" fill="currentColor" />
      <path d="M9 3.58c1.32 0 2.5.47 3.43 1.38l2.57-2.6C13.46.9 11.42 0 9 0A9 9 0 0 0 .96 5.02l2.99 2.32c.71-2.18 2.7-3.76 5.05-3.76Z" fill="currentColor" />
    </svg>
  );
}
