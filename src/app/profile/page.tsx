'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
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
          throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to load profile');
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
        setError(err instanceof Error ? err.message : 'Failed to load profile');
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
        setError('Your session has expired. Sign in again to save your changes.');
        return;
      }
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to update profile');
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
      setError(err instanceof Error ? err.message : 'Failed to update profile');
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
        setError(payload?.error ?? 'Failed to log out');
        return;
      }

      window.location.assign('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log out');
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-950 sm:px-10">
      <section className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Account
            </p>
            <h1 className="mt-2 text-4xl font-black tracking-tight">Profile</h1>
          </div>
          {profile ? (
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60"
            >
              {loggingOut ? 'Logging out...' : 'Log out'}
            </button>
          ) : null}
        </div>

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-[0_20px_80px_rgba(15,23,42,0.08)]">
            Loading profile...
          </div>
        ) : null}

        {!loading && !profile && error ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm leading-7 text-red-900">
            <p className="font-semibold">Failed to load profile</p>
            <p className="mt-2">{error}</p>
            <p className="mt-2 text-red-700">This may be a network error or server issue. Try refreshing the page.</p>
            <button
              type="button"
              onClick={() => setReloadNonce((current) => current + 1)}
              className="mt-4 rounded-full border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-800"
            >
              Retry
            </button>
          </div>
        ) : null}

        {!loading && !profile && authRequired ? (
          <AuthSignInPanel
            nextPath="/profile"
            title="Sign in to view your profile"
            description="Use GitHub, Google, or email to load your Kolk Arena profile and continue competitive play."
          />
        ) : null}

        {profile ? (
          <>
            {authRequired ? (
              <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6">
                <p className="text-sm font-semibold text-amber-900">Session expired</p>
                <p className="mt-1 text-sm text-amber-800">
                  Your session has expired. Sign in again to save your changes. Your edits are preserved below.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <a href="/api/auth/oauth/github?next=/profile" className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">GitHub</a>
                  <a href="/api/auth/oauth/google?next=/profile" className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50">Google</a>
                </div>
              </div>
            ) : null}

            <div className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.08)] sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Canonical email</p>
                <p className="mt-2 text-sm font-medium text-slate-900">{profile.email}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Login methods</p>
                <p className="mt-2 text-sm font-medium capitalize text-slate-900">{authMethods || 'email'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Highest unlocked level</p>
                <p className="mt-2 text-sm font-medium text-slate-900">L{profile.max_level}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Beta Pioneer</p>
                <p className="mt-2 text-sm font-medium text-slate-900">{profile.pioneer ? 'Yes' : 'Not yet'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Verified at</p>
                <p className="mt-2 text-sm font-medium text-slate-900">{profile.verified_at ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(profile.verified_at)) : 'Not set'}</p>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.08)]">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Progression</p>
                  <h2 className="mt-1 text-lg font-bold text-slate-900">My progress</h2>
                </div>
                <Link
                  href={`/leaderboard?player=${profile.id}`}
                  className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  View on leaderboard
                </Link>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Highest Level</p>
                  <p className="mt-2 text-2xl font-bold text-slate-950">L{profile.max_level}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Public beta progress</p>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, (profile.max_level / 8) * 100)}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{Math.min(profile.max_level, 8)}/8 beta levels</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Next Step</p>
                  <p className="mt-2 text-sm font-medium text-slate-900">
                    {profile.max_level >= 8 ? 'L0-L8 public beta complete' : `Attempt L${profile.max_level + 1}`}
                  </p>
                </div>
              </div>
              {profile.pioneer ? (
                <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
                  Beta Pioneer unlocked. You completed the full L0-L8 public beta.
                </div>
              ) : null}
            </div>

            <form
              onSubmit={handleSave}
              className="space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.08)]"
            >
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Public profile</p>
                <h2 className="text-2xl font-bold tracking-tight text-slate-950">Editable, not required</h2>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm text-slate-700">
                  <span>Display name</span>
                  <input className="w-full rounded-2xl border border-slate-300 px-4 py-3" value={form.displayName} onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))} />
                </label>
                <label className="space-y-2 text-sm text-slate-700">
                  <span>Handle</span>
                  <input className="w-full rounded-2xl border border-slate-300 px-4 py-3" value={form.handle} onChange={(event) => setForm((current) => ({ ...current, handle: event.target.value }))} />
                </label>
                <label className="space-y-2 text-sm text-slate-700">
                  <span>Framework</span>
                  <input className="w-full rounded-2xl border border-slate-300 px-4 py-3" value={form.framework} onChange={(event) => setForm((current) => ({ ...current, framework: event.target.value }))} />
                </label>
                <label className="space-y-2 text-sm text-slate-700">
                  <span>School</span>
                  <input className="w-full rounded-2xl border border-slate-300 px-4 py-3" value={form.school} onChange={(event) => setForm((current) => ({ ...current, school: event.target.value }))} />
                </label>
                <label className="space-y-2 text-sm text-slate-700 sm:col-span-2">
                  <span>Country</span>
                  <input className="w-full rounded-2xl border border-slate-300 px-4 py-3" value={form.country} onChange={(event) => setForm((current) => ({ ...current, country: event.target.value }))} />
                </label>
              </div>

              {error ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                  {error}
                </div>
              ) : null}

              {saveSuccess ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" aria-live="polite">
                  Profile saved successfully.
                </div>
              ) : null}

              <button
                type="submit"
                disabled={saving || authRequired}
                className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? 'Saving...' : saveSuccess ? 'Saved' : 'Save profile'}
              </button>
            </form>

            <ApiTokensPanel />
          </>
        ) : null}
      </section>
    </main>
  );
}
