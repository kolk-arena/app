'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { copy } from '@/i18n';

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
      github_email_required: copy.auth.statusMessages.github_email_required,
      unexpected: copy.auth.statusMessages.unexpected,
    };

    return {
      tone: 'error' as const,
      ...(messages[authError] ?? copy.auth.statusMessages.fallback),
    };
  }, [authError, authSuccess]);

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
            {description}
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
        <div className="grid gap-3 sm:grid-cols-2">
          <a
            href={`/api/auth/oauth/github?next=${encodedNext}`}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-md border border-slate-200 bg-slate-950 px-5 py-3 text-center font-mono text-sm font-semibold text-white transition-colors duration-150 hover:bg-white hover:text-slate-950"
          >
            {copy.auth.oauthGitHub}
          </a>
          <a
            href={`/api/auth/oauth/google?next=${encodedNext}`}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-md border border-slate-200 bg-white px-5 py-3 text-center font-mono text-sm font-semibold text-slate-950 transition-colors duration-150 hover:bg-slate-950 hover:text-white"
          >
            {copy.auth.oauthGoogle}
          </a>
        </div>

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
