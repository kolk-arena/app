import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { isBriefShowcaseEnabled, BRIEF_SHOWCASE_CONFIG } from '@/lib/kolk/brief-showcase/config';
import { generateShowcaseBatch, type GeneratedBrief } from '@/lib/kolk/brief-showcase/generator';
import {
  insertBatch,
  deleteExpiredBefore,
  getMostRecentPromotedBatchTimestamp,
} from '@/lib/kolk/brief-showcase/store';

// Guardrail: if a promoted batch was generated within this cutoff of
// "now", the cron call becomes a no-op. Prevents duplicate batches from
// Vercel Cron retries, manual `curl` re-triggers, or an operator
// accidentally firing the endpoint twice. We still run the expiry
// cleanup so stale rows continue to age out. The cutoff is half the
// configured refresh interval so genuine hourly ticks (60-min interval
// → 30-min cutoff) always proceed while same-minute duplicates are
// suppressed.
function computeDedupCutoffMs(): number {
  return Math.max(60_000, Math.floor(BRIEF_SHOWCASE_CONFIG.refreshMinutes * 60_000 / 2));
}

function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

const BLOCKED_TERMS = [
  'fiverr',
  'marketplace',
  'paid job',
  'real customer',
  'real client',
  'client order',
  'order queue',
  'hire an agent',
  'attempttoken',
  'idempotency-key',
  'rubric',
];

function validateGeneratedBriefs(briefs: GeneratedBrief[]): string[] {
  const reasons: string[] = [];
  const levels = new Set<number>();

  if (briefs.length !== 8) {
    reasons.push(`expected 8 previews, got ${briefs.length}`);
  }

  briefs.forEach((brief, index) => {
    if (!Number.isInteger(brief.level) || brief.level < 2 || brief.level > 8) {
      reasons.push(`slot ${index}: invalid level ${brief.level}`);
    }
    levels.add(brief.level);

    if (!brief.scenarioTitle || brief.scenarioTitle.length > 90) {
      reasons.push(`slot ${index}: scenarioTitle missing or too long`);
    }
    if (!brief.requestContext || brief.requestContext.length < 80 || brief.requestContext.length > 700) {
      reasons.push(`slot ${index}: requestContext outside length bounds`);
    }
    if (!Array.isArray(brief.scoringFocus) || brief.scoringFocus.length < 2 || brief.scoringFocus.length > 3) {
      reasons.push(`slot ${index}: scoringFocus must have 2-3 items`);
    }
    if (!Array.isArray(brief.outputShape) || brief.outputShape.length < 2 || brief.outputShape.length > 4) {
      reasons.push(`slot ${index}: outputShape must have 2-4 items`);
    }

    const text = JSON.stringify(brief).toLowerCase();
    for (const term of BLOCKED_TERMS) {
      if (text.includes(term)) {
        reasons.push(`slot ${index}: blocked term "${term}"`);
      }
    }
  });

  for (const level of [2, 3, 4, 5, 6, 7, 8]) {
    if (!levels.has(level)) {
      reasons.push(`missing L${level} preview`);
    }
  }

  return reasons;
}

async function handleRefresh(request: Request) {
  if (!isBriefShowcaseEnabled()) {
    return NextResponse.json(
      { error: 'Brief showcase is disabled', code: 'SHOWCASE_DISABLED' },
      { status: 503 },
    );
  }

  const secret = BRIEF_SHOWCASE_CONFIG.cronSecret;
  if (!secret) {
    return NextResponse.json(
      { error: 'Cron secret is not configured', code: 'SHOWCASE_CRON_MISCONFIGURED' },
      { status: 503 },
    );
  }

  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : '';
  if (!token || !safeEquals(token, secret)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // Dedup guard: honour a recent promoted batch rather than spend more AI
  // budget re-generating. `force=1` lets an operator override intentionally.
  const forceHeader = request.headers.get('x-kolk-force-refresh') === '1';
  const url = new URL(request.url);
  const forceParam = url.searchParams.get('force') === '1';
  const force = forceHeader || forceParam;

  if (!force) {
    const lastGenerated = await getMostRecentPromotedBatchTimestamp();
    if (lastGenerated) {
      const ageMs = Date.now() - lastGenerated.getTime();
      const cutoffMs = computeDedupCutoffMs();
      if (ageMs < cutoffMs) {
        return NextResponse.json(
          {
            success: true,
            skipped: true,
            reason: 'recent_batch_within_dedup_window',
            lastGeneratedAt: lastGenerated.toISOString(),
            ageMs,
            dedupWindowMs: cutoffMs,
          },
          { status: 200 },
        );
      }
    }
  }

  try {
    const result = await generateShowcaseBatch();
    const qcReasons = validateGeneratedBriefs(result.briefs);
    if (qcReasons.length > 0) {
      return NextResponse.json(
        {
          error: 'Generated showcase failed deterministic QC',
          code: 'SHOWCASE_QC_FAILED',
          reasons: qcReasons,
        },
        { status: 422 },
      );
    }

    const now = new Date();
    const refreshMs = BRIEF_SHOWCASE_CONFIG.refreshMinutes * 60 * 1000;
    const batchId = now.toISOString();
    const generatedAt = now;
    const expiresAt = new Date(now.getTime() + refreshMs);

    const dbRows = result.briefs.map((b, i) => ({
      batch_id: batchId,
      slot_index: i,
      level: b.level,
      title: b.scenarioTitle,
      industry: b.industry,
      ceo_name: b.fictionalRequesterName,
      ceo_title: b.requesterRole,
      quote: b.requestContext,
      core_needs: b.scoringFocus,
      deliverables: b.outputShape,
      translations: Object.fromEntries(
        Object.entries(result.translations).map(([locale, items]) => [locale, items[i]]).filter(([, item]) => Boolean(item)),
      ),
      generated_at: generatedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      qc_status: 'passed' as const,
      qc_reasons: [],
      promoted_at: generatedAt.toISOString(),
    }));

    await insertBatch(dbRows);
    await deleteExpiredBefore(new Date(now.getTime() - refreshMs * 4));

    return NextResponse.json({
      success: true,
      batchId,
      generatedAt: generatedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      count: dbRows.length,
      locales: Object.keys(result.translations),
      qcStatus: 'passed',
    });
  } catch (error) {
    // Full error (message + stack + provider context) is logged server-side
    // only. The response body is intentionally opaque so that an operator
    // or monitoring tool surfacing the endpoint response to a wider audience
    // cannot leak provider names, internal file paths, or model identifiers.
    // If an operator needs the detail they read the server log; the HTTP
    // response carries just a stable code the client / Vercel Cron can
    // branch on.
    console.error('[cron/brief-showcase] Error:', error);
    return NextResponse.json(
      {
        error: 'Refresh failed',
        code: 'SHOWCASE_REFRESH_FAILED',
      },
      { status: 503 },
    );
  }
}

export async function GET(request: Request) {
  return handleRefresh(request);
}

export async function POST(request: Request) {
  return handleRefresh(request);
}
