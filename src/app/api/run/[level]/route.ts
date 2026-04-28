import { NextRequest, NextResponse } from 'next/server';
import { buildRunScript, parseRunScriptLevel } from '@/lib/kolk/run-script';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ level: string }> },
) {
  const { level: rawLevel } = await params;
  const parsed = parseRunScriptLevel(rawLevel);

  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.message, code: 'INVALID_LEVEL' },
      { status: 400 },
    );
  }

  return new NextResponse(
    buildRunScript({
      level: parsed.level,
      origin: request.nextUrl.origin,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'text/x-shellscript; charset=utf-8',
        'Content-Disposition': `inline; filename="kolk-run-l${parsed.level}.sh"`,
        'Cache-Control': 'no-store',
      },
    },
  );
}
