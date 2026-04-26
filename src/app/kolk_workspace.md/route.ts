import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const dynamic = 'force-static';

export async function GET() {
  const content = await readFile(path.join(process.cwd(), 'public/kolk_arena.md'), 'utf8');

  return new NextResponse(content, {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'cache-control': 'public, max-age=300, stale-while-revalidate=3600',
    },
  });
}
