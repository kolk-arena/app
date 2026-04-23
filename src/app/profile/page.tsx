'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useLocalizedDateTimeFormatter } from '@/components/time/localized-time';
import { copy } from '@/i18n';
import { AuthSignInPanel } from '@/app/auth-sign-in-panel';
import { APP_CONFIG } from '@/lib/frontend/app-config';
import { COUNTRY_OPTIONS, countryCodeFromInput, countryNameFromCode } from '@/lib/frontend/countries';
import { ApiTokensPanel } from './api-tokens-panel';

type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  handle: string | null;
  agent_stack: string | null;
  affiliation: string | null;
  country: string | null;
  auth_methods: string[];
  max_level: number;
  verified_at: string | null;
  pioneer: boolean;
};

function buildEditableProfileForm(profile: Profile) {
  // `profile.country` may be an ISO alpha-2 code (new flow — IP-seeded
  // or user-picked from the select), OR a free-form English name
  // lingering from the pre-select era ("Mexico", "mexico", ...). We
  // normalize to alpha-2 on load; anything that doesn't resolve to a
  // known country falls back to empty (no option selected).
  return {
    displayName: profile.display_name ?? '',
    handle: profile.handle ?? '',
    agentStack: profile.agent_stack ?? '',
    affiliation: profile.affiliation ?? '',
    country: countryCodeFromInput(profile.country) ?? '',
  };
}

export default function ProfilePage() {
  const formatLocalDateTime = useLocalizedDateTimeFormatter();
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
    agentStack: '',
    affiliation: '',
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
            agentStack: '',
            affiliation: '',
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
        setForm(buildEditableProfileForm(nextProfile));
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
  // Helper copy under the country select. Form stores the alpha-2 code
  // as the canonical value; this label expands it to the human-readable
  // country name (with the code in parens so users know what gets
  // serialized server-side).
  const detectedCountryLabel = useMemo(() => {
    const name = countryNameFromCode(form.country);
    return name ? `${name} (${form.country})` : '';
  }, [form.country]);
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
          ...(form.displayName.trim() ? { displayName: form.displayName.trim() } : {}),
          handle: form.handle.trim() || null,
          agentStack: form.agentStack.trim() || null,
          affiliation: form.affiliation.trim() || null,
          country: form.country.trim() || null,
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
      setForm(buildEditableProfileForm(nextProfile));
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
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:px-6 sm:py-12">
      <section className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-slate-500">
              {p.pageEyebrow}
            </p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight">{p.pageTitle}</h1>
          </div>
          {profile ? (
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="focus-gentle rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors duration-150 hover:bg-slate-50 hover:text-slate-950 disabled:opacity-60"
            >
              {loggingOut ? p.loggingOut : p.logOut}
            </button>
          ) : null}
        </div>

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700 shadow-sm">
            {p.loading}
          </div>
        ) : null}

        {!loading && !profile && error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm leading-7 text-rose-900">
            <p className="font-semibold">{p.loadFailedTitle}</p>
            <p className="mt-2">{error}</p>
            <p className="mt-2 text-rose-800">{p.loadFailedHint}</p>
            <button
              type="button"
              onClick={() => setReloadNonce((current) => current + 1)}
              className="focus-gentle mt-4 rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-medium text-rose-800 shadow-sm transition-colors duration-150 hover:bg-rose-100"
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
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
                <p className="text-sm font-semibold text-amber-900">{p.sessionExpiredTitle}</p>
                <p className="mt-1 text-sm text-amber-800">
                  {p.sessionExpiredBody}
                </p>
                <p className="mt-3 text-sm text-amber-800">
                  {APP_CONFIG.publicGithubAuthEnabled || APP_CONFIG.publicGoogleAuthEnabled
                    ? p.signInDescription
                    : copy.auth.emailSignInBody}
                </p>
              </div>
            ) : null}

            {authRequired ? (
              <AuthSignInPanel
                nextPath="/profile"
                title={p.signInTitle}
                description={p.signInDescription}
              />
            ) : null}

            <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm card-hover sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-slate-500">{p.summary.canonicalEmail}</p>
                <p className="mt-2 text-sm font-medium text-slate-950">{profile.email ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">{p.summary.loginMethods}</p>
                <p className="mt-2 text-sm font-medium capitalize text-slate-950">{authMethods || p.summary.emailFallback}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">{p.summary.highestUnlockedLevel}</p>
                <p className="mt-2 text-sm font-medium text-slate-950">L{profile.max_level}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">{p.summary.betaPioneer}</p>
                <p className="mt-2 text-sm font-medium text-slate-950">{profile.pioneer ? p.summary.pioneerYes : p.summary.pioneerNo}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">{p.summary.verifiedAt}</p>
                <p className="mt-2 text-sm font-medium text-slate-950">
                  {profile.verified_at
                    ? formatLocalDateTime(profile.verified_at, profile.verified_at)
                    : p.summary.notSet}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm card-hover">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500">{p.progression.eyebrow}</p>
                  <h2 className="mt-1 text-lg font-bold text-slate-950">{p.progression.title}</h2>
                </div>
                <Link
                  href={`/leaderboard?player=${profile.id}`}
                  className="focus-gentle rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors duration-150 hover:bg-slate-50 hover:text-slate-950"
                >
                  {p.progression.viewOnLeaderboard}
                </Link>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs font-medium text-slate-500">{p.progression.highestLevel}</p>
                  <p className="mt-2 text-2xl font-bold text-slate-950">L{profile.max_level}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs font-medium text-slate-500">{p.progression.publicBetaProgress}</p>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full border border-slate-200 bg-slate-200">
                    <div className="h-full bg-slate-900 transition-all" style={{ width: `${Math.min(100, (profile.max_level / 8) * 100)}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{p.progression.betaLevels(Math.min(profile.max_level, 8), 8)}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs font-medium text-slate-500">{p.progression.nextStep}</p>
                  <p className="mt-2 text-sm font-medium text-slate-950">
                    {profile.max_level >= 8 ? p.progression.nextStepComplete : p.progression.nextStepAttempt(profile.max_level + 1)}
                  </p>
                </div>
              </div>
              {profile.pioneer ? (
                <div className="mt-4 rounded-lg border px-4 py-3 text-sm font-medium memory-accent-chip">
                  {p.progression.pioneerUnlocked}
                </div>
              ) : null}
            </div>

            <form
              onSubmit={handleSave}
              className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-500">{p.publicProfile.eyebrow}</p>
                <h2 className="text-2xl font-bold tracking-tight text-slate-950">{p.publicProfile.title}</h2>
                <p className="max-w-2xl text-sm leading-6 text-slate-600">{p.publicProfile.body}</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm text-slate-800">
                  <span className="text-xs font-medium text-slate-600">{p.publicProfile.displayName}</span>
                  <input
                    className="focus-gentle w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-950 outline-none transition"
                    value={form.displayName}
                    placeholder={p.publicProfile.displayNamePlaceholder}
                    onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))}
                  />
                  <p className="text-xs leading-5 text-slate-500">{p.publicProfile.displayNameHelp}</p>
                </label>
                <label className="space-y-2 text-sm text-slate-800">
                  <span className="text-xs font-medium text-slate-600">{p.publicProfile.handle}</span>
                  <input
                    className="focus-gentle w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-950 outline-none transition"
                    value={form.handle}
                    placeholder={p.publicProfile.handlePlaceholder}
                    onChange={(event) => setForm((current) => ({ ...current, handle: event.target.value }))}
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-800">
                  <span className="text-xs font-medium text-slate-600">{p.publicProfile.agentStack}</span>
                  <input
                    className="focus-gentle w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-950 outline-none transition"
                    value={form.agentStack}
                    placeholder={p.publicProfile.agentStackPlaceholder}
                    onChange={(event) => setForm((current) => ({ ...current, agentStack: event.target.value }))}
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-800">
                  <span className="text-xs font-medium text-slate-600">{p.publicProfile.affiliation}</span>
                  <input
                    className="focus-gentle w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-950 outline-none transition"
                    value={form.affiliation}
                    placeholder={p.publicProfile.affiliationPlaceholder}
                    onChange={(event) => setForm((current) => ({ ...current, affiliation: event.target.value }))}
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-800 sm:col-span-2">
                  <span className="text-xs font-medium text-slate-600">{p.publicProfile.country}</span>
                  <select
                    className="focus-gentle w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-950 outline-none transition"
                    value={form.country}
                    onChange={(event) => setForm((current) => ({ ...current, country: event.target.value }))}
                  >
                    <option value="">{p.publicProfile.countryPlaceholder}</option>
                    {COUNTRY_OPTIONS.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.name} ({option.code})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs leading-5 text-slate-500">
                    {detectedCountryLabel
                      ? p.publicProfile.countryHelpDetected(detectedCountryLabel)
                      : p.publicProfile.countryHelp}
                  </p>
                </label>
              </div>

              {showInlineError ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                  {error}
                </div>
              ) : null}

              {saveSuccess ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" aria-live="polite">
                  {p.publicProfile.success}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={saving || authRequired}
                className="memory-accent-button focus-gentle rounded-xl border px-5 py-3 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none disabled:opacity-60"
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
