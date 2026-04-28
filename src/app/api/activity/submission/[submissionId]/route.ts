/**
 * GET /api/activity/submission/:submissionId
 *
 * Public-safe submission detail used by the live-activity detail view on
 * /leaderboard. Returns ONLY the columns already rendered on other public
 * surfaces (level, scores, color band, timings, judge summary). Identity-
 * bearing columns (anon_token, auth user id, IP) are never returned.
 *
 * Registered rows link straight to /leaderboard/:playerId and skip this
 * endpoint. Anonymous rows open the submission-summary panel first so the
 * live feed stays scoped to the specific run that just landed; when a public
 * player page exists, the panel can still surface that route as a follow-up.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  fetchPublicSubmissionReceipt,
  SUBMISSION_ID_RE,
} from '@/lib/kolk/share-submission';

// Same cache hint as the activity feed itself.
export const revalidate = 10;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> },
) {
  const { submissionId } = await params;

  if (!SUBMISSION_ID_RE.test(submissionId)) {
    return NextResponse.json(
      { error: 'Invalid submission id', code: 'INVALID_SUBMISSION_ID' },
      { status: 400 },
    );
  }

  try {
    const submission = await fetchPublicSubmissionReceipt(submissionId);
    if (!submission) {
      return NextResponse.json(
        { error: 'Submission not found', code: 'SUBMISSION_NOT_FOUND' },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { submission },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30',
        },
      },
    );
  } catch (err) {
    console.error('Activity submission detail fetch error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch submission', code: 'ACTIVITY_SUBMISSION_ERROR' },
      { status: 500 },
    );
  }
}
