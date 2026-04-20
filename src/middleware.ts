import { NextResponse, type NextRequest } from 'next/server';

// Auth-code forwarder.
//
// Context (2026-04-20 launch): Supabase's magic-link / email-OTP flow can
// deliver URLs that hit our site at the ROOT path with a `?code=XXX` query
// (e.g. `https://www.kolkarena.com/?code=XXX`) even when we pass
// `emailRedirectTo=/api/auth/callback`. This happens when the email
// template uses `{{ .ConfirmationURL }}` and Supabase's own route builder
// strips the path portion of our redirect (some template / Site URL /
// Redirect URL allow-list combinations produce this). The result:
// Supabase hands the user an OAuth-style PKCE code but drops them on a
// route that doesn't exchange it — so the user sees the landing page,
// no session, "nothing happened."
//
// This middleware catches that case deterministically on our edge: if
// ANY non-/api request arrives with a `code` query param (the shape the
// Supabase PKCE flow emits), we 307-forward to `/api/auth/callback` so
// the existing `exchangeCodeForSession` handler runs. The `next` query
// preserves the original path so the user lands back where they started
// after the exchange.
//
// Guardrails:
//   * Only matches GET requests; POST bodies can carry unrelated `code`
//     fields and must not be intercepted.
//   * Explicitly skips requests that are already under `/api/` so we
//     don't forward callback → callback (infinite loop) or hijack other
//     routes that happen to take a `code` param.
//   * Preserves the existing `next` param if the URL already carried
//     one; only defaults to the hit path when `next` is missing.
export function middleware(request: NextRequest) {
  const { pathname, searchParams, hostname } = request.nextUrl;

  // Apex → www canonicalization. The production host is `www.kolkarena.com`.
  // If a request lands on apex `kolkarena.com` (e.g. because the user typed
  // the bare domain, or because an email client / link shortener stripped
  // the subdomain), 308-redirect to the www form BEFORE any other logic —
  // otherwise auth cookies set for `www` won't be visible on the next
  // same-origin request and session establishment silently breaks. This
  // runs for every method / path including /api/**, so the API surface
  // also consolidates on www.
  if (hostname === 'kolkarena.com') {
    const wwwUrl = new URL(request.nextUrl.toString());
    wwwUrl.host = 'www.kolkarena.com';
    return NextResponse.redirect(wwwUrl, 308);
  }

  if (request.method !== 'GET') return NextResponse.next();
  if (pathname.startsWith('/api/')) return NextResponse.next();

  // Supabase email flows can arrive with either:
  //   - `?code=<uuid>` (PKCE, new flow)
  //   - `?token_hash=<hash>&type=<signup|magiclink|...>` (OTP, legacy)
  // Forward whichever is present; callback handler accepts both.
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  if (!code && !tokenHash) return NextResponse.next();

  const nextHint = searchParams.get('next') ?? (pathname === '/' ? '/' : pathname);

  const forwardUrl = new URL('/api/auth/callback', request.nextUrl.origin);
  if (code) forwardUrl.searchParams.set('code', code);
  if (tokenHash) {
    forwardUrl.searchParams.set('token_hash', tokenHash);
    const type = searchParams.get('type');
    if (type) forwardUrl.searchParams.set('type', type);
  }
  forwardUrl.searchParams.set('next', nextHint);

  return NextResponse.redirect(forwardUrl, 307);
}

export const config = {
  // Match everything except Next internals + static assets. The handler
  // itself bails early on /api/* requests via the guard above.
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|og\\.png|robots\\.txt|llms\\.txt|kolk_arena\\.md|sitemap\\.xml).*)',
  ],
};
