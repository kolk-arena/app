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

  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      setError(false);
      const res = await fetch(`/api/brief-showcase?lang=${locale}`, { cache: 'no-store' });
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
      console.error('Failed to fetch ChallengeBrief previews', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  useEffect(() => {
    if (!data?.expiresAt) return undefined;
    const delay = new Date(data.expiresAt).getTime() - Date.now();
    if (delay <= 0) return undefined;
    const timeout = window.setTimeout(fetchRequests, delay);
    return () => window.clearTimeout(timeout);
  }, [data?.expiresAt, fetchRequests]);

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
          onClick={fetchRequests}
          className="mt-4 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2"
        >
          {copy.briefShowcase.retry}
        </button>
      </div>
    );
  }

  return (
    <div className="w-full">
      <BriefShowcaseSlider requests={data.requests} expiresAt={data.expiresAt} />
    </div>
  );
}
