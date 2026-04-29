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
          '/docs/',
          '/ai-action-manifest.json',
          '/api/agent-entrypoint',
          '/api/status',
          '/api/session/status',
          '/api/session/attempts',
          '/api/session/quota',
          '/api/schema/',
          '/api/challenges/catalog',
        ],
        disallow: [
          '/api/auth/',
          '/api/cron/',
          '/api/tokens/',
          '/api/challenge/submit',
        ],
      },
    ],
    host: canonicalHost,
    sitemap: `${APP_CONFIG.canonicalOrigin}/sitemap.xml`,
  };
}
