import { NextRequest, NextResponse } from 'next/server';

/**
 * Same-origin guard for state-changing routes on the human surface.
 *
 * The Kolk Arena session cookie is set `SameSite=lax`, which permits
 * top-level navigation POSTs from cross-site pages. For routes where
 * that trust assumption is unsafe (device-flow verify / deny, profile
 * writes, admin mutations), we additionally require the browser-supplied
 * `Origin` or `Referer` header to be same-origin with the request URL.
 *
 * Returns `null` when the origin is acceptable; otherwise a 403 NextResponse
 * the caller should early-return. Non-browser callers that do not send
 * either header are rejected — browsers always send one for POST / PUT /
 * DELETE, so this does not break legitimate CLI traffic (the CLI uses
 * bearer-token PAT auth, not the browser session, and should not be
 * hitting these endpoints anyway).
 */
export function assertSameOrigin(request: NextRequest): NextResponse | null {
  const requestOrigin = request.nextUrl.origin;

  const originHeader = request.headers.get('origin');
  const refererHeader = request.headers.get('referer');

  // Origin header, when present, is authoritative.
  if (originHeader) {
    if (originHeader === requestOrigin) return null;
    return csrfDenied(requestOrigin);
  }

  // Fall back to Referer (older browsers and some cross-site navigation POSTs).
  if (refererHeader) {
    try {
      const refererOrigin = new URL(refererHeader).origin;
      if (refererOrigin === requestOrigin) return null;
    } catch {
      // Malformed Referer — treat as mismatch.
    }
    return csrfDenied(requestOrigin);
  }

  // Neither header present on a state-changing request: reject.
  return csrfDenied(requestOrigin);
}

function csrfDenied(expected: string): NextResponse {
  return NextResponse.json(
    {
      error: `This endpoint accepts same-origin browser POSTs only (expected Origin ${expected}).`,
      code: 'ORIGIN_MISMATCH',
    },
    { status: 403 },
  );
}
