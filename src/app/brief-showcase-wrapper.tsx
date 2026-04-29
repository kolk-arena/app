'use client';

import { useEffect, useState, useCallback } from 'react';
import { BriefShowcaseSlider, type ChallengeBriefPreview } from '@/components/home/brief-showcase-slider';
import { copy } from '@/i18n';

type FetchResponse = {
  kind: 'challenge_brief_preview';
  synthetic: true;
  batchId: string;
  generatedAt: string;
  expiresAt: string;
  locale: string;
  fallback: boolean;
  requests: ChallengeBriefPreview[];
};

export function BriefShowcaseWrapper() {
  const [data, setData] = useState<FetchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState(false);
  const locale = copy.locale;

  const fetchRequests = useCallback(async (signal?: AbortSignal) => {
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
  }, [locale]);

  useEffect(() => {
    const controller = new AbortController();
    fetchRequests(controller.signal);
    return () => controller.abort();
  }, [fetchRequests]);

  useEffect(() => {
    if (!data?.expiresAt) return undefined;
    const delay = new Date(data.expiresAt).getTime() - Date.now();
    if (delay <= 0) return undefined;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      fetchRequests(controller.signal);
    }, delay);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [data?.expiresAt, fetchRequests]);

  if (disabled) {
    return (
      <section id="task-board-preview" className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-medium text-slate-500">{copy.briefShowcase.eyebrow}</p>
        <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
          {copy.briefShowcase.title}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          {copy.briefShowcase.errorState}
        </p>
      </section>
    );
  }

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
          onClick={() => fetchRequests()}
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
      />
    </div>
  );
}
