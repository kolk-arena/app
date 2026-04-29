/**
 * GET /api/schema/[slug] — JSON Schema for the public agent contract
 *
 * Serves Draft 2020-12 JSON Schema for each public-surface payload so
 * agents can validate their wire-level expectations programmatically:
 *
 *   /api/schema/automation-manifest.v1
 *   /api/schema/agent-context.v2
 *   /api/schema/submit-result.v2
 *   /api/schema/catalog.v1
 *   /api/schema/quota.v1
 *
 * The schemas are derived at build time from the Zod definitions in
 * src/lib/kolk/schemas; the same Zod schemas are used by unit tests to
 * validate the live built payloads, so the JSON Schema agents read here
 * cannot drift from what the routes actually emit.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getContractSchema,
  listContractSchemaSlugs,
  type ContractSchemaSlug,
} from '@/lib/kolk/schemas';

export const dynamic = 'force-static';
export const revalidate = 3600;

export function generateStaticParams() {
  return listContractSchemaSlugs().map((slug) => ({ slug }));
}

function isKnownSlug(value: string): value is ContractSchemaSlug {
  return (listContractSchemaSlugs() as string[]).includes(value);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  if (!isKnownSlug(slug)) {
    return NextResponse.json(
      {
        error: `Unknown schema slug "${slug}". Known slugs: ${listContractSchemaSlugs().join(', ')}.`,
        code: 'SCHEMA_NOT_FOUND',
      },
      { status: 404 },
    );
  }

  const zodSchema = getContractSchema(slug);
  const jsonSchema = z.toJSONSchema(zodSchema, {
    target: 'draft-2020-12',
  });

  // Annotate the served schema with its identity so consumers do not need
  // to infer the slug from the URL.
  const annotated = {
    ...jsonSchema,
    $id: slug,
    title: slug,
  };

  return NextResponse.json(annotated, {
    headers: {
      'Content-Type': 'application/schema+json; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
