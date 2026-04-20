/**
 * Simple in-memory IP-bucket rate limiter.
 *
 * Per-lambda-instance accuracy is acceptable for the routes that use
 * this helper — it exists to stop a single attacker from sending
 * thousands of requests/minute from one IP, not to enforce a perfect
 * global ceiling. (A perfect global limit needs a Supabase rpc or a
 * Redis-backed counter; queued as a post-launch follow-up in
 * INTERNAL.md § 1.2.)
 *
 * Each endpoint creates its own limiter instance via `createIpRateLimiter`,
 * so rate budgets don't bleed across endpoints — e.g. `/api/auth/verify`
 * can be tighter than `/api/auth/device/code` without one starving the
 * other.
 *
 * NOTE: `src/app/api/activity-feed/route.ts` inlines the same pattern
 * for historical reasons. When it's next touched it should be
 * consolidated onto this helper (tracked in INTERNAL.md § 1.2 tech debt).
 */

export type IpRateLimiter = {
  /** Returns `true` if the request is allowed, `false` if over the budget. */
  check(ip: string): boolean;
};

export function createIpRateLimiter(opts: {
  windowMs: number;
  maxPerWindow: number;
}): IpRateLimiter {
  const buckets = new Map<string, { count: number; windowStart: number }>();

  return {
    check(ip: string): boolean {
      const now = Date.now();
      const bucket = buckets.get(ip);
      if (!bucket || now - bucket.windowStart > opts.windowMs) {
        buckets.set(ip, { count: 1, windowStart: now });
        return true;
      }
      bucket.count += 1;
      return bucket.count <= opts.maxPerWindow;
    },
  };
}

/**
 * Best-effort client IP resolution. Matches the logic already inlined
 * in `src/app/api/activity-feed/route.ts:51-57`. Falls back to the
 * string `'unknown'` so a single Map bucket collects all unresolved
 * callers instead of throwing.
 */
export function getClientIp(request: { headers: Headers }): string {
  const h = request.headers;
  return (
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    h.get('x-real-ip') ??
    'unknown'
  );
}
