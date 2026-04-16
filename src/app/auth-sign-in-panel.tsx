'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type AuthSignInPanelProps = {
  nextPath?: string;
  title?: string;
  description?: string;
};

export function AuthSignInPanel({
  nextPath = '/',
  title = 'Sign in to continue',
  description = 'Use GitHub, Google, or email to access competitive play and your saved profile.',
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
        title: 'Sign-in complete',
        body: 'Your session cookie is set. If this page still looks anonymous, wait a moment and refresh once.',
      };
    }

    if (!authError) return null;

    const messages: Record<string, { title: string; body: string }> = {
      missing_code: {
        title: 'Sign-in could not be completed',
        body: 'The callback URL was missing its verification code. Start the sign-in flow again.',
      },
      exchange_failed: {
        title: 'Session exchange failed',
        body: 'The provider login completed, but Kolk Arena could not finish establishing the session.',
      },
      unexpected: {
        title: 'Unexpected auth error',
        body: 'A server-side auth error interrupted sign-in. Try again in a new tab if this keeps happening.',
      },
    };

    const fallback = {
      title: 'Sign-in failed',
      body: 'The auth flow did not complete successfully. Try again.',
    };

    return {
      tone: 'error' as const,
      ...(messages[authError] ?? fallback),
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
          typeof payload?.error === 'string' ? payload.error : 'Unable to confirm current session state.',
        );
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted) return;
        setSessionState('anonymous');
        setSessionError(error instanceof Error ? error.message : 'Unable to confirm current session state.');
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
      setEmailMessage('Email is required.');
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
        throw new Error(payload.error ?? 'Failed to start email sign-in');
      }

      setEmailState('success');
      setEmailMessage(payload.message ?? 'Check your email for the verification link or code.');
    } catch (error) {
      setEmailState('error');
      setEmailMessage(error instanceof Error ? error.message : 'Failed to start email sign-in');
    }
  }

  const encodedNext = encodeURIComponent(nextPath);

  return (
    <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 shadow-[0_20px_80px_rgba(15,23,42,0.08)] sm:p-6 lg:p-8">
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
            Sign in required
          </p>
          <h2 className="text-2xl font-black tracking-tight text-slate-950">
            {title}
          </h2>
          <p className="max-w-2xl text-sm leading-7 text-amber-900">
            {description}
          </p>
        </div>

        {authStatusMessage ? (
          <div
            className={`rounded-2xl px-4 py-3 text-sm ${
              authStatusMessage.tone === 'success'
                ? 'border border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border border-rose-200 bg-rose-50 text-rose-900'
            }`}
          >
            <p className="font-semibold">{authStatusMessage.title}</p>
            <p className="mt-1">{authStatusMessage.body}</p>
          </div>
        ) : null}

        {sessionState === 'checking' ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            Checking existing session...
          </div>
        ) : null}

        {sessionState === 'authenticated' ? (
          <div className="rounded-2xl border border-emerald-200 bg-white px-5 py-4 text-sm text-slate-700">
            <p className="font-semibold text-slate-950">You are already signed in.</p>
            <p className="mt-1">
              Your browser still has a valid session cookie. Continue where you left off.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href={nextPath}
                className="inline-flex items-center rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Continue
              </Link>
              <Link
                href="/profile"
                className="inline-flex items-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              >
                Open profile
              </Link>
            </div>
          </div>
        ) : null}

        {sessionError && sessionState !== 'authenticated' ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            Could not confirm existing session state: {sessionError}
          </div>
        ) : null}

        {sessionState === 'anonymous' ? (
          <>
        <div className="grid gap-3 sm:grid-cols-2">
          <a
            href={`/api/auth/oauth/github?next=${encodedNext}`}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Sign in with GitHub
          </a>
          <a
            href={`/api/auth/oauth/google?next=${encodedNext}`}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-full border border-slate-300 bg-white px-5 py-3 text-center text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Sign in with Google
          </a>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Email sign-in
              </p>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                Enter your email to receive the verification link or code.
              </p>
            </div>

            <form onSubmit={handleEmailSignIn} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <label className="space-y-2 text-sm text-slate-700">
                <span>Email</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  inputMode="email"
                  spellCheck={false}
                  className="min-h-12 w-full rounded-2xl border border-slate-300 px-4 py-3 text-base sm:text-sm"
                  placeholder="you@example.com"
                />
              </label>
              <label className="space-y-2 text-sm text-slate-700">
                <span>Display name</span>
                <input
                  type="text"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  autoComplete="nickname"
                  maxLength={60}
                  className="min-h-12 w-full rounded-2xl border border-slate-300 px-4 py-3 text-base sm:text-sm"
                  placeholder="Optional"
                />
              </label>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={emailState === 'submitting' || email.trim().length === 0}
                  className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60 lg:w-auto"
                >
                  {emailState === 'submitting' ? 'Sending...' : 'Send sign-in link'}
                </button>
              </div>
            </form>

            {emailState === 'success' ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" aria-live="polite">
                {emailMessage}
              </div>
            ) : null}

            {emailState === 'error' ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" aria-live="polite">
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
