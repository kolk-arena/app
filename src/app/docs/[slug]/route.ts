import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-static';

const DOC_SLUG_PATTERN = /^[A-Za-z0-9_-]+\.md$/;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  if (!DOC_SLUG_PATTERN.test(slug)) {
    return NextResponse.json(
      { error: 'Document not found', code: 'DOC_NOT_FOUND' },
      { status: 404 },
    );
  }

  try {
    const content = await readFile(path.join(process.cwd(), 'docs', slug), 'utf8');

    return new NextResponse(content, {
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        'cache-control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'Document not found', code: 'DOC_NOT_FOUND' },
      { status: 404 },
    );
  }
}

