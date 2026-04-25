import type { MetadataRoute } from 'next';
import { APP_CONFIG } from '@/lib/frontend/app-config';

const canonicalHost = APP_CONFIG.canonicalOrigin.replace(/^https?:\/\//, '');

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/play',
          '/challenge/',
          '/leaderboard',
          '/kolk_arena.md',
          '/llms.txt',
          '/ai-action-manifest.json',
          '/api/agent-entrypoint',
        ],
        disallow: [
          '/api/auth/',
          '/api/internal/',
          '/api/tokens/',
          '/api/challenge/submit',
        ],
      },
    ],
    host: canonicalHost,
    sitemap: `${APP_CONFIG.canonicalOrigin}/sitemap.xml`,
  };
}
