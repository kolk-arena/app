import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/kolk/db';
import { colorBandToQualityLabel } from '@/lib/kolk/beta-contract';
import type { ActivityFeedEntry } from '@/lib/kolk/types';

// Route-level revalidation hint for the Next.js / Vercel edge cache.
// NOTE: vercel.json sets `Cache-Control: no-store, no-cache, must-revalidate`
// for all /api/* routes, which overrides any Cache-Control header we emit
// here. We keep the explicit `s-maxage` header below for clarity and so that
// if the global no-store rule is ever narrowed in vercel.json (recommended
// post-launch for this specific path), this route automatically benefits
// from 10-second edge caching + 30-second stale-while-revalidate. Until
// then, the client-side 30s polling + visibility gate (see
// `leaderboard-client.tsx`) is what actually protects Supabase quota.
export const revalidate = 10;

// Simple in-memory IP rate limit. Per-lambda-instance accuracy is acceptable
// for this low-stakes, read-only surface; it exists to stop a single
// attacker from sending thousands of requests/minute from one IP.
const IP_BUCKET = new Map<string, { count: number; windowStart: number }>();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_WINDOW = 30;

function asFiniteNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asOptionalString(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asIsoDateString(value: unknown) {
  const candidate = asOptionalString(value);
  if (!candidate) return null;
  return Number.isNaN(new Date(candidate).getTime()) ? null : candidate;
}

function asColorBand(value: unknown): ActivityFeedEntry['color_band'] {
  return value === 'RED'
    || value === 'ORANGE'
    || value === 'YELLOW'
    || value === 'GREEN'
    || value === 'BLUE'
    ? value
    : null;
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  );
}

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const bucket = IP_BUCKET.get(ip);
  if (!bucket || now - bucket.windowStart > RATE_WINDOW_MS) {
    IP_BUCKET.set(ip, { count: 1, windowStart: now });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= RATE_MAX_PER_WINDOW;
}

export async function GET(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (!rateLimit(ip)) {
      return NextResponse.json(
        { error: 'Too many activity feed requests', code: 'RATE_LIMITED' },
        { status: 429 },
      );
    }

    // Show recent level attempts and passes at L1+.
    // L0 is intentionally excluded because it is a high-volume connectivity
    // check and would drown out real activity.
    const { data: rows, error } = await supabaseAdmin
      .from('ka_submissions')
      .select('id, participant_id, level, total_score, color_band, solve_time_seconds, submitted_at, unlocked')
      .gte('level', 1)
      .order('submitted_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(12);

    if (error) {
      throw error;
    }

    const participantIds = [
      ...new Set(
        (rows ?? [])
          .map((r) => r.participant_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    type FeedUser = { id: string; display_name: string | null; framework: string | null };
    const userMap = new Map<string, FeedUser>();
    if (participantIds.length > 0) {
      const { data: users } = await supabaseAdmin
        .from('ka_users')
        .select('id, display_name, framework')
        .in('id', participantIds);

      for (const u of (users ?? []) as FeedUser[]) {
        userMap.set(u.id, u);
      }
    }

    const feed: ActivityFeedEntry[] = (rows ?? []).map((row) => {
      const user = row.participant_id ? userMap.get(row.participant_id) : null;
      const colorBand = asColorBand(row.color_band);
      const solveTimeRaw = asFiniteNumber(row.solve_time_seconds, NaN);
      return {
        id: String(row.id),
        player_id: asOptionalString(row.participant_id),
        level: Math.max(1, Math.trunc(asFiniteNumber(row.level, 1))),
        display_name: user?.display_name || 'Anonymous',
        framework: user?.framework || null,
        total_score: asFiniteNumber(row.total_score, 0),
        color_band: colorBand,
        quality_label: colorBand ? colorBandToQualityLabel(colorBand) : null,
        solve_time_seconds: Number.isFinite(solveTimeRaw) ? Math.max(0, Math.trunc(solveTimeRaw)) : null,
        submitted_at: asIsoDateString(row.submitted_at),
        unlocked: row.unlocked === true,
      };
    });

    return NextResponse.json(
      { feed },
      {
        headers: {
          // The global `/api/*` rule in vercel.json still forces no-store on
          // Vercel, but when that rule is narrowed post-launch this header
          // enables short-lived edge caching with SWR semantics.
          'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30',
        },
      },
    );
  } catch (error) {
    console.error('Activity feed fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch activity feed', code: 'ACTIVITY_FEED_ERROR' },
      { status: 500 },
    );
  }
}
