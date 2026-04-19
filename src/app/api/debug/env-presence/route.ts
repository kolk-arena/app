/**
 * GET /api/debug/env-presence
 *
 * Temporary launch-day diagnostic: returns which env keys are visible to the
 * running serverless function. Values are NEVER returned — only boolean
 * presence flags. Safe to leave public for a minute; remove before launch.
 */

import { NextResponse } from 'next/server';

const TRACKED_KEYS = [
  'KOLK_SUPABASE_URL',
  'KOLK_SUPABASE_ANON_KEY',
  'KOLK_SUPABASE_SERVICE_ROLE_KEY',
  'KOLK_ADMIN_SECRET',
  'XAI_API_KEY',
  'XAI_BASE_URL',
  'XAI_MODEL',
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'NEXT_PUBLIC_APP_URL',
] as const;

export async function GET() {
  const presence: Record<string, { set: boolean; length: number }> = {};

  for (const key of TRACKED_KEYS) {
    const raw = process.env[key];
    const trimmed = raw?.trim();
    presence[key] = {
      set: Boolean(trimmed),
      length: trimmed?.length ?? 0,
    };
  }

  return NextResponse.json({
    presence,
    meta: {
      node_env: process.env.NODE_ENV ?? null,
      vercel_env: process.env.VERCEL_ENV ?? null,
      vercel_region: process.env.VERCEL_REGION ?? null,
      deployment_id: process.env.VERCEL_DEPLOYMENT_ID ?? null,
      git_commit_sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    },
  });
}
