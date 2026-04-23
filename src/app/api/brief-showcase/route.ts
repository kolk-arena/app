import { NextResponse } from 'next/server';
import { isBriefShowcaseEnabled, normalizeLocale } from '@/lib/kolk/brief-showcase/config';
import {
  getLatestPromotedBatch,
  toClientRequests,
} from '@/lib/kolk/brief-showcase/store';
import { createIpRateLimiter, getClientIp } from '@/lib/kolk/rate-limit';

// Per-IP bucket: the homepage hits this on mount and when an expired batch
// is refreshed. 30 reqs/minute/IP comfortably covers normal browsing plus
// one rapid carousel reload, while capping a single attacker at a level
// where they can't meaningfully amplify the paid AI-generation path behind
// the scenes.
const publicReadLimiter = createIpRateLimiter({
  windowMs: 60_000,
  maxPerWindow: 30,
});

export async function GET(request: Request) {
  if (!isBriefShowcaseEnabled()) {
    return new NextResponse(null, { status: 204 });
  }

  const ip = getClientIp(request);
  if (!publicReadLimiter.check(ip)) {
    return NextResponse.json(
      { error: 'Too many requests', code: 'RATE_LIMITED' },
      {
        status: 429,
        headers: {
          'Retry-After': '60',
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  const { searchParams } = new URL(request.url);
  const lang = normalizeLocale(searchParams.get('lang'));

  try {
    const rows = await getLatestPromotedBatch();
    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { error: 'Failed to load showcase', code: 'SHOWCASE_UNAVAILABLE' },
        { status: 503 },
      );
    }

    const requests = toClientRequests(rows, lang);
    const fallback = lang !== 'en' && rows.some((row) => !row.translations?.[lang]);

    return NextResponse.json(
      {
        kind: 'challenge_brief_preview',
        synthetic: true,
        disclaimer: 'Synthetic examples, not customer work. Official play starts from /play or the L0-L8 API.',
        officialPlayPath: '/play',
        batchId: rows[0].batch_id,
        generatedAt: rows[0].generated_at,
        expiresAt: rows[0].expires_at,
        locale: lang,
        fallback,
        requests,
      },
      {
        headers: {
          'Cache-Control': 's-maxage=1200, stale-while-revalidate=300',
        },
      },
    );
  } catch (error) {
    console.error('[api/brief-showcase] Error:', error);
    return NextResponse.json(
      {
        error: 'Unable to load brief showcase',
        code: 'SHOWCASE_UNAVAILABLE',
      },
      { status: 503 },
    );
  }
}
