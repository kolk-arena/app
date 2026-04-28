import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { LocalizedDateTimeText } from '@/components/time/localized-time';
import { copy } from '@/i18n';
import { formatClockSeconds, formatNumber } from '@/i18n/format';
import { APP_CONFIG } from '@/lib/frontend/app-config';
import {
  fetchPublicSubmissionReceipt,
  SUBMISSION_ID_RE,
} from '@/lib/kolk/share-submission';
import type { ActivitySubmissionDetail } from '@/lib/kolk/types';

type ShareSubmissionPageProps = {
  params: Promise<{ submissionId: string }>;
};

export const revalidate = 10;

function formatScore(value: number | null, pendingLabel = copy.shareReceipt.pendingValue) {
  if (value == null || !Number.isFinite(value)) return pendingLabel;
  return formatNumber(value, {
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  });
}

function bandPillClasses(band: ActivitySubmissionDetail['color_band']) {
  switch (band) {
    case 'RED':
      return 'border-rose-200 bg-rose-50 text-rose-800';
    case 'ORANGE':
      return 'border-orange-200 bg-orange-50 text-orange-800';
    case 'YELLOW':
      return 'border-amber-200 bg-amber-50 text-amber-800';
    case 'GREEN':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    case 'BLUE':
      return 'border-sky-200 bg-sky-50 text-sky-800';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-800';
  }
}

async function getReceipt(submissionId: string) {
  if (!SUBMISSION_ID_RE.test(submissionId)) return null;
  return fetchPublicSubmissionReceipt(submissionId);
}

export async function generateMetadata({ params }: ShareSubmissionPageProps): Promise<Metadata> {
  const { submissionId } = await params;
  const submission = await getReceipt(submissionId);

  if (!submission) {
    return {
      title: copy.shareReceipt.metadataNotFoundTitle,
      description: copy.shareReceipt.metadataNotFoundDescription,
      openGraph: {
        title: copy.shareReceipt.metadataNotFoundTitle,
        description: copy.shareReceipt.metadataNotFoundDescription,
        type: 'website',
      },
      twitter: {
        card: 'summary_large_image',
        title: copy.shareReceipt.metadataNotFoundTitle,
        description: copy.shareReceipt.metadataNotFoundDescription,
      },
    };
  }

  const title = copy.shareReceipt.receiptTitle(submission.level);
  const socialTitle = `${title} | ${APP_CONFIG.name}`;
  const description = copy.shareReceipt.metadataDescription(
    submission.display_name,
    formatScore(submission.total_score),
    submission.level,
  );
  const url = `${APP_CONFIG.canonicalOrigin}/share/submission/${submission.id}`;

  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: socialTitle,
      description,
      url,
      type: 'website',
      images: [{ url: `${APP_CONFIG.canonicalOrigin}/og.png`, width: 1200, height: 630, alt: APP_CONFIG.name }],
    },
    twitter: {
      card: 'summary_large_image',
      title: socialTitle,
      description,
      images: [`${APP_CONFIG.canonicalOrigin}/og.png`],
    },
  };
}

function ReceiptStat({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-2 text-lg font-semibold text-slate-950 tabular-nums">{value}</dd>
    </div>
  );
}

export default async function ShareSubmissionPage({ params }: ShareSubmissionPageProps) {
  const { submissionId } = await params;
  const submission = await getReceipt(submissionId);

  if (!submission) {
    notFound();
  }

  const receiptCopy = copy.shareReceipt;
  const bandLabel = submission.color_band ?? receiptCopy.unbanded;
  const qualityLabel = submission.quality_label ?? receiptCopy.qualityPending;
  const solveTime =
    submission.solve_time_seconds == null
      ? receiptCopy.pendingValue
      : formatClockSeconds(submission.solve_time_seconds);
  const tryNextHref =
    submission.unlocked && submission.level < 8
      ? `/challenge/${submission.level + 1}`
      : submission.level >= 8
      ? '/play'
      : `/challenge/${submission.level}`;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium tracking-[0.14em] text-slate-500">
              {receiptCopy.eyebrow}
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
              {receiptCopy.receiptTitle(submission.level)}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-700">
              {receiptCopy.subtitle}
            </p>
          </div>
          <span
            className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-semibold shadow-sm ${bandPillClasses(submission.color_band)}`}
          >
            {bandLabel} · {qualityLabel}
          </span>
        </header>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-5 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-500">{receiptCopy.playerLabel}</p>
                <p className="mt-1 max-w-xl break-words text-2xl font-semibold text-slate-950">
                  {submission.display_name}
                </p>
                {submission.agent_stack ? (
                  <p className="mt-1 max-w-xl break-words text-sm text-slate-600">
                    {submission.agent_stack}
                  </p>
                ) : null}
              </div>
              <div className="text-left sm:text-right">
                <p className="text-sm font-medium text-slate-500">{receiptCopy.scoreLabel}</p>
                <p className="mt-1 text-5xl font-bold tracking-tight text-slate-950">
                  {formatScore(submission.total_score)}
                  <span className="font-mono text-lg font-semibold text-slate-600"> {receiptCopy.scoreOutOf}</span>
                </p>
              </div>
            </div>
          </div>

          <dl className="grid gap-3 px-5 py-5 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
            <ReceiptStat label={receiptCopy.levelLabel} value={`L${submission.level}`} />
            <ReceiptStat
              label={receiptCopy.solveTimeLabel}
              value={(
                <>
                  {solveTime}
                  {submission.efficiency_badge ? (
                    <span className="ml-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 align-middle text-xs font-semibold text-emerald-800">
                      {receiptCopy.efficientBadge}
                    </span>
                  ) : null}
                </>
              )}
            />
            <ReceiptStat
              label={receiptCopy.submittedLabel}
              value={(
                <LocalizedDateTimeText
                  value={submission.submitted_at}
                  fallback={receiptCopy.submittedFallback}
                />
              )}
            />
            <ReceiptStat
              label={receiptCopy.resultLabel}
              value={submission.unlocked ? receiptCopy.resultUnlocked : receiptCopy.resultLocked}
            />
          </dl>

          <dl className="grid gap-3 border-t border-slate-200 px-5 py-5 sm:grid-cols-3 sm:px-6">
            <ReceiptStat label={receiptCopy.structureLabel} value={formatScore(submission.structure_score)} />
            <ReceiptStat label={receiptCopy.coverageLabel} value={formatScore(submission.coverage_score)} />
            <ReceiptStat label={receiptCopy.qualityLabel} value={formatScore(submission.quality_score)} />
          </dl>
        </section>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/leaderboard"
            className="memory-accent-button inline-flex items-center rounded-md border px-5 py-3 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-memory)] focus-visible:ring-offset-2"
          >
            {receiptCopy.viewLeaderboard}
          </Link>
          <Link
            href={tryNextHref}
            className="inline-flex items-center rounded-md border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 shadow-sm transition-colors duration-150 hover:bg-slate-50 hover:text-slate-950"
          >
            {receiptCopy.tryNextGig}
          </Link>
        </div>
      </section>
    </main>
  );
}
