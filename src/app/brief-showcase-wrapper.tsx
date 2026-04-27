'use client';

import { useEffect, useState, useCallback } from 'react';
import { BriefShowcaseSlider, type ChallengeBriefPreview } from '@/components/home/brief-showcase-slider';
import { copy } from '@/i18n';
import type { FrontendLocale } from '@/i18n/types';

type FetchResponse = {
  kind: 'challenge_brief_preview';
  synthetic: true;
  batchId: string;
  generatedAt: string;
  expiresAt: string;
  locale: FrontendLocale;
  fallback: boolean;
  requests: ChallengeBriefPreview[];
};

export function BriefShowcaseWrapper() {
  const [data, setData] = useState<FetchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState(false);
  const [selectedLocale, setSelectedLocale] = useState<FrontendLocale>(copy.locale);

  const fetchRequests = useCallback(async (locale: FrontendLocale, signal?: AbortSignal) => {
    try {
      setLoading(true);
      setError(false);
      const res = await fetch(`/api/brief-showcase?lang=${locale}`, {
        cache: 'no-store',
        signal,
      });
      if (signal?.aborted) return;
      if (res.status === 204) {
        setDisabled(true);
        setData(null);
        return;
      }
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const json = await res.json() as FetchResponse;
      setDisabled(false);
      setData(json);
    } catch (err) {
      if (signal?.aborted) return;
      console.error('Failed to fetch live gig previews', err);
      setError(true);
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchRequests(selectedLocale, controller.signal);
    return () => controller.abort();
  }, [fetchRequests, selectedLocale]);

  useEffect(() => {
    if (!data?.expiresAt) return undefined;
    const delay = new Date(data.expiresAt).getTime() - Date.now();
    if (delay <= 0) return undefined;
    const timeout = window.setTimeout(() => {
      fetchRequests(selectedLocale);
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [data?.expiresAt, fetchRequests, selectedLocale]);

  if (disabled) return null;

  if (loading && !data) {
    return (
      <div className="h-64 flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
        <p className="text-sm text-slate-500">{copy.briefShowcase.emptyState}</p>
      </div>
    );
  }

  if (error || !data || !data.requests || data.requests.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">{copy.briefShowcase.errorState}</p>
        <button
          type="button"
          onClick={() => fetchRequests(selectedLocale)}
          className="action-button action-button-secondary action-button-sm mt-4 focus-visible:outline-none"
        >
          {copy.briefShowcase.retry}
        </button>
      </div>
    );
  }

  return (
    <div className="w-full">
      <BriefShowcaseSlider
        requests={data.requests}
        expiresAt={data.expiresAt}
        locale={selectedLocale}
        contentLocale={data.locale}
        onLocaleChange={setSelectedLocale}
        isLocaleLoading={loading}
      />
    </div>
  );
}
