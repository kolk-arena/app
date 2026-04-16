/**
 * GET /api/admin/budget — Judge budget monitoring
 *
 * Returns current judge call count and reset time.
 * Protected by KOLK_ADMIN_SECRET header.
 */

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getBudgetStatus } from '@/lib/kolk/evaluator/judge';

export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-kolk-admin-secret');
  const expected = process.env.KOLK_ADMIN_SECRET;
  const providedBuffer = secret ? Buffer.from(secret) : null;
  const expectedBuffer = expected ? Buffer.from(expected) : null;

  if (
    !providedBuffer
    || !expectedBuffer
    || providedBuffer.length !== expectedBuffer.length
    || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'ADMIN_AUTH_REQUIRED' },
      { status: 401 },
    );
  }

  const status = getBudgetStatus();

  return NextResponse.json({
    judge: {
      callsThisHour: status.callsThisHour,
      maxPerHour: 1000,
      resetsAt: status.resetsAt,
      utilizationPct: Math.round((status.callsThisHour / 1000) * 100),
    },
    note: 'In-memory counter. Resets on server restart.',
  });
}
