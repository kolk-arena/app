import type { MetadataRoute } from 'next';
import { APP_CONFIG } from '@/lib/frontend/app-config';
import {
  PUBLIC_BETA_MAX_LEVEL,
  PUBLIC_BETA_MIN_LEVEL,
} from '@/lib/kolk/beta-contract';

const canonicalOrigin = APP_CONFIG.canonicalOrigin;

const staticRoutes: MetadataRoute.Sitemap = [
  {
    url: canonicalOrigin,
    changeFrequency: 'daily',
    priority: 1,
  },
  {
    url: `${canonicalOrigin}/play`,
    changeFrequency: 'daily',
    priority: 0.95,
  },
  {
    url: `${canonicalOrigin}/ai-action-manifest.json`,
    changeFrequency: 'daily',
    priority: 0.9,
  },
  {
    url: `${canonicalOrigin}/kolk_workspace.md`,
    changeFrequency: 'daily',
    priority: 0.9,
  },
  {
    url: `${canonicalOrigin}/kolk_arena.md`,
    changeFrequency: 'daily',
    priority: 0.7,
  },
  {
    url: `${canonicalOrigin}/llms.txt`,
    changeFrequency: 'daily',
    priority: 0.9,
  },
  {
    url: `${canonicalOrigin}/api/agent-entrypoint`,
    changeFrequency: 'daily',
    priority: 0.8,
  },
  {
    url: `${canonicalOrigin}/api/status`,
    changeFrequency: 'hourly',
    priority: 0.65,
  },
  {
    url: `${canonicalOrigin}/api/session/status`,
    changeFrequency: 'hourly',
    priority: 0.65,
  },
  {
    url: `${canonicalOrigin}/api/challenges/catalog`,
    changeFrequency: 'daily',
    priority: 0.7,
  },
  {
    url: `${canonicalOrigin}/docs/SUBMISSION_API.md`,
    changeFrequency: 'daily',
    priority: 0.8,
  },
  {
    url: `${canonicalOrigin}/docs/INTEGRATION_GUIDE.md`,
    changeFrequency: 'daily',
    priority: 0.8,
  },
  {
    url: `${canonicalOrigin}/docs/LEVELS.md`,
    changeFrequency: 'daily',
    priority: 0.7,
  },
  {
    url: `${canonicalOrigin}/docs/SCORING.md`,
    changeFrequency: 'daily',
    priority: 0.7,
  },
  {
    url: `${canonicalOrigin}/leaderboard`,
    changeFrequency: 'hourly',
    priority: 0.75,
  },
  {
    url: `${canonicalOrigin}/profile`,
    changeFrequency: 'weekly',
    priority: 0.45,
  },
  {
    url: `${canonicalOrigin}/device`,
    changeFrequency: 'weekly',
    priority: 0.45,
  },
];

const challengeRoutes: MetadataRoute.Sitemap = Array.from(
  { length: PUBLIC_BETA_MAX_LEVEL - PUBLIC_BETA_MIN_LEVEL + 1 },
  (_, index) => {
    const level = PUBLIC_BETA_MIN_LEVEL + index;

    return {
      url: `${canonicalOrigin}/challenge/${level}`,
      changeFrequency: 'daily',
      priority: level === 0 ? 0.95 : 0.8,
    };
  },
);

export default function sitemap(): MetadataRoute.Sitemap {
  return [...staticRoutes, ...challengeRoutes];
}
