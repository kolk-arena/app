import { NextRequest, NextResponse } from 'next/server';
import { applyAnonTokenCookie, resolveAnonToken } from '@/lib/kolk/auth';
import { resolveArenaUserFromRequest } from '@/lib/kolk/auth/server';
import { getAnonymousMaxUnlockedLevel } from '@/lib/kolk/progression';

export async function GET(request: NextRequest) {
  const user = await resolveArenaUserFromRequest(request);

  if (user?.is_verified) {
    return NextResponse.json({
      status: 'signed_in',
      display_name: user.display_name,
      max_level: user.max_level,
    });
  }

  const anonState = resolveAnonToken(request);
  const anonToken = anonState.token;
  const maxLevel = await getAnonymousMaxUnlockedLevel(anonToken);

  const response = NextResponse.json({
    status: 'anonymous',
    max_level: maxLevel,
  });

  if (anonState.shouldSetCookie) {
    applyAnonTokenCookie(response, anonToken);
  }

  return response;
}
