import { NextRequest, NextResponse } from 'next/server';
import { getAnonToken } from '@/lib/kolk/auth';
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

  const anonToken = getAnonToken(request);
  const maxLevel = await getAnonymousMaxUnlockedLevel(anonToken);

  return NextResponse.json({
    status: 'anonymous',
    max_level: maxLevel,
  });
}
