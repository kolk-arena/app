'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { copy } from '@/i18n';
import { formatDateTime } from '@/i18n/format';
import { AuthSignInPanel } from '@/app/auth-sign-in-panel';
import { ApiTokensPanel } from './api-tokens-panel';

type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  handle: string | null;
  framework: string | null;
  school: string | null;
  country: string | null;
  auth_methods: string[];
  max_level: number;
  verified_at: string | null;
  pioneer: boolean;
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [form, setForm] = useState({
    displayName: '',
    handle: '',
    framework: '',
    school: '',
    country: '',
  });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setLoading(true);
    setError(null);

    void fetch('/api/profile', {
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!active) return;
        if (response.status === 401) {
          setProfile(null);
          setAuthRequired(true);
          setForm({
            displayName: '',
            handle: '',
            framework: '',
            school: '',
            country: '',
          });
          return;
        }
        if (!response.ok) {
          throw new Error(
            typeof payload?.error === 'string' ? payload.error : copy.profile.loadFailedFallback,
          );
        }
        const nextProfile = payload.profile as Profile;
        setAuthRequired(false);
        setProfile(nextProfile);
        setForm({
          displayName: nextProfile.display_name ?? '',
          handle: nextProfile.handle ?? '',
          framework: nextProfile.framework ?? '',
          school: nextProfile.school ?? '',
          country: nextProfile.country ?? '',
        });
      })
      .catch((err: unknown) => {
        if (!active || controller.signal.aborted) return;
        setAuthRequired(false);
        setError(err instanceof Error ? err.message : copy.profile.loadFailedFallback);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [reloadNonce]);

  const authMethods = useMemo(() => profile?.auth_methods.join(', ') ?? '', [profile]);
  const p = copy.profile;
  const showInlineError = Boolean(error) && !(authRequired && error === p.sessionExpiredBody);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        cache: 'no-store',
        body: JSON.stringify({
          displayName: form.displayName,
          handle: form.handle || null,
          framework: form.framework || null,
          school: form.school || null,
          country: form.country || null,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        // Keep profile + form visible so user doesn't lose edits
        setAuthRequired(true);
        setError(copy.profile.sessionExpiredBody);
        return;
      }
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : p.saveFailedFallback);
      }

      const nextProfile = payload.profile as Profile;
      setAuthRequired(false);
      setProfile(nextProfile);
      setForm({
        displayName: nextProfile.display_name ?? '',
        handle: nextProfile.handle ?? '',
        framework: nextProfile.framework ?? '',
        school: nextProfile.school ?? '',
        country: nextProfile.country ?? '',
      });
      setSaveSuccess(true);
      window.setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : p.saveFailedFallback);
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    if (loggingOut) return;
    setError(null);
    setLoggingOut(true);

    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.success === false) {
        setError(payload?.error ?? p.logoutFailedFallback);
        return;
      }

      window.location.assign('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : p.logoutFailedFallback);
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-950 sm:px-10">
      <section className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">
              {p.pageEyebrow}
            </p>
            <h1 className="mt-2 text-4xl font-black tracking-tight">{p.pageTitle}</h1>
          </div>
          {profile ? (
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="rounded-md border-2 border-slate-950 bg-white px-4 py-2 font-mono text-sm font-semibold text-slate-950 transition-colors duration-150 hover:bg-slate-950 hover:text-white disabled:opacity-60"
            >
              {loggingOut ? p.loggingOut : p.logOut}
            </button>
          ) : null}
        </div>

        {loading ? (
          <div className="rounded-md border-2 border-slate-950 bg-white p-6 text-sm text-slate-700">
            {p.loading}
          </div>
        ) : null}

        {!loading && !profile && error ? (
          <div className="rounded-md border-2 border-rose-700 bg-rose-50 p-6 text-sm leading-7 text-rose-900">
            <p className="font-semibold">{p.loadFailedTitle}</p>
            <p className="mt-2">{error}</p>
            <p className="mt-2 text-rose-800">{p.loadFailedHint}</p>
            <button
              type="button"
              onClick={() => setReloadNonce((current) => current + 1)}
              className="mt-4 rounded-md border-2 border-rose-700 bg-white px-4 py-2 font-mono text-sm font-semibold text-rose-800 transition-colors duration-150 hover:bg-rose-700 hover:text-white"
            >
              {p.retry}
            </button>
          </div>
        ) : null}

        {!loading && !profile && authRequired ? (
          <AuthSignInPanel
            nextPath="/profile"
            title={p.signInTitle}
            description={p.signInDescription}
          />
        ) : null}

        {profile ? (
          <>
            {authRequired ? (
              <div className="rounded-md border-2 border-amber-700 bg-amber-50 p-6">
                <p className="text-sm font-semibold text-amber-900">{p.sessionExpiredTitle}</p>
                <p className="mt-1 text-sm text-amber-800">
                  {p.sessionExpiredBody}
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <a href="/api/auth/oauth/github?next=/profile" className="rounded-md border-2 border-slate-950 bg-slate-950 px-4 py-2 font-mono text-sm font-semibold text-white transition-colors duration-150 hover:bg-white hover:text-slate-950">{p.sessionExpiredGithub}</a>
                  <a href="/api/auth/oauth/google?next=/profile" className="rounded-md border-2 border-slate-950 bg-white px-4 py-2 font-mono text-sm font-semibold text-slate-950 transition-colors duration-150 hover:bg-slate-950 hover:text-white">{p.sessionExpiredGoogle}</a>
                </div>
              </div>
            ) : null}

            <div className="grid gap-4 rounded-md border-2 border-slate-950 bg-white p-6 sm:grid-cols-2">
              <div>
                <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">{p.summary.canonicalEmail}</p>
                <p className="mt-2 text-sm font-medium text-slate-950">{profile.email}</p>
              </div>
              <div>
                <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">{p.summary.loginMethods}</p>
                <p className="mt-2 text-sm font-medium capitalize text-slate-950">{authMethods || p.summary.emailFallback}</p>
              </div>
              <div>
                <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">{p.summary.highestUnlockedLevel}</p>
                <p className="mt-2 text-sm font-medium text-slate-950">L{profile.max_level}</p>
              </div>
              <div>
                <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">{p.summary.betaPioneer}</p>
                <p className="mt-2 text-sm font-medium text-slate-950">{profile.pioneer ? p.summary.pioneerYes : p.summary.pioneerNo}</p>
              </div>
              <div>
                <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">{p.summary.verifiedAt}</p>
                <p className="mt-2 text-sm font-medium text-slate-950">{profile.verified_at ? formatDateTime(profile.verified_at, profile.verified_at) : p.summary.notSet}</p>
              </div>
            </div>

            <div className="rounded-md border-2 border-slate-950 bg-white p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">{p.progression.eyebrow}</p>
                  <h2 className="mt-1 text-lg font-bold text-slate-950">{p.progression.title}</h2>
                </div>
                <Link
                  href={`/leaderboard?player=${profile.id}`}
                  className="rounded-md border-2 border-slate-950 bg-white px-4 py-2 font-mono text-sm font-semibold text-slate-950 transition-colors duration-150 hover:bg-slate-950 hover:text-white"
                >
                  {p.progression.viewOnLeaderboard}
                </Link>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border-2 border-slate-950 bg-slate-50 px-4 py-4">
                  <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700">{p.progression.highestLevel}</p>
                  <p className="mt-2 text-2xl font-bold text-slate-950">L{profile.max_level}</p>
                </div>
                <div className="rounded-md border-2 border-slate-950 bg-slate-50 px-4 py-4">
                  <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700">{p.progression.publicBetaProgress}</p>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-md border-2 border-slate-950 bg-slate-200">
                    <div className="h-full bg-emerald-600 transition-all" style={{ width: `${Math.min(100, (profile.max_level / 8) * 100)}%` }} />
                  </div>
                  <p className="mt-1 font-mono text-xs text-slate-700">{p.progression.betaLevels(Math.min(profile.max_level, 8), 8)}</p>
                </div>
                <div className="rounded-md border-2 border-slate-950 bg-slate-50 px-4 py-4">
                  <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700">{p.progression.nextStep}</p>
                  <p className="mt-2 text-sm font-medium text-slate-950">
                    {profile.max_level >= 8 ? p.progression.nextStepComplete : p.progression.nextStepAttempt(profile.max_level + 1)}
                  </p>
                </div>
              </div>
              {profile.pioneer ? (
                <div className="mt-4 rounded-md border-2 border-emerald-700 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
                  {p.progression.pioneerUnlocked}
                </div>
              ) : null}
            </div>

            <form
              onSubmit={handleSave}
              className="space-y-5 rounded-md border-2 border-slate-950 bg-white p-6"
            >
              <div className="space-y-2">
                <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">{p.publicProfile.eyebrow}</p>
                <h2 className="text-2xl font-bold tracking-tight text-slate-950">{p.publicProfile.title}</h2>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm text-slate-800">
                  <span className="font-mono font-semibold uppercase tracking-[0.14em] text-slate-700">{p.publicProfile.displayName}</span>
                  <input className="w-full rounded-md border-2 border-slate-950 bg-white px-4 py-3 text-slate-950 outline-none transition focus:ring-2 focus:ring-slate-950" value={form.displayName} onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))} />
                </label>
                <label className="space-y-2 text-sm text-slate-800">
                  <span className="font-mono font-semibold uppercase tracking-[0.14em] text-slate-700">{p.publicProfile.handle}</span>
                  <input className="w-full rounded-md border-2 border-slate-950 bg-white px-4 py-3 text-slate-950 outline-none transition focus:ring-2 focus:ring-slate-950" value={form.handle} onChange={(event) => setForm((current) => ({ ...current, handle: event.target.value }))} />
                </label>
                <label className="space-y-2 text-sm text-slate-800">
                  <span className="font-mono font-semibold uppercase tracking-[0.14em] text-slate-700">{p.publicProfile.framework}</span>
                  <input className="w-full rounded-md border-2 border-slate-950 bg-white px-4 py-3 text-slate-950 outline-none transition focus:ring-2 focus:ring-slate-950" value={form.framework} onChange={(event) => setForm((current) => ({ ...current, framework: event.target.value }))} />
                </label>
                <label className="space-y-2 text-sm text-slate-800">
                  <span className="font-mono font-semibold uppercase tracking-[0.14em] text-slate-700">{p.publicProfile.school}</span>
                  <input className="w-full rounded-md border-2 border-slate-950 bg-white px-4 py-3 text-slate-950 outline-none transition focus:ring-2 focus:ring-slate-950" value={form.school} onChange={(event) => setForm((current) => ({ ...current, school: event.target.value }))} />
                </label>
                <label className="space-y-2 text-sm text-slate-800 sm:col-span-2">
                  <span className="font-mono font-semibold uppercase tracking-[0.14em] text-slate-700">{p.publicProfile.country}</span>
                  <input className="w-full rounded-md border-2 border-slate-950 bg-white px-4 py-3 text-slate-950 outline-none transition focus:ring-2 focus:ring-slate-950" value={form.country} onChange={(event) => setForm((current) => ({ ...current, country: event.target.value }))} />
                </label>
              </div>

              {showInlineError ? (
                <div className="rounded-md border-2 border-rose-700 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                  {error}
                </div>
              ) : null}

              {saveSuccess ? (
                <div className="rounded-md border-2 border-emerald-700 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" aria-live="polite">
                  {p.publicProfile.success}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={saving || authRequired}
                className="rounded-md border-2 border-slate-950 bg-slate-950 px-5 py-3 font-mono text-sm font-semibold text-white transition-colors duration-150 hover:bg-white hover:text-slate-950 disabled:opacity-60 disabled:hover:bg-slate-950 disabled:hover:text-white"
              >
                {saving ? p.publicProfile.saving : saveSuccess ? p.publicProfile.saved : p.publicProfile.save}
              </button>
            </form>

            <ApiTokensPanel />
          </>
        ) : null}
      </section>
    </main>
  );
}
