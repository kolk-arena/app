import { NextResponse } from 'next/server';
import {
  automationManifestHeaders,
  buildAutomationManifest,
} from '@/lib/kolk/agentic-url/automation-manifest';

export const dynamic = 'force-static';
export const revalidate = 3600;

export function GET() {
  return NextResponse.json(buildAutomationManifest(), {
    headers: automationManifestHeaders(),
  });
}
