import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/seo/site';

/**
 * Private surfaces. These routes are authenticated inside the single-page app
 * (or are API endpoints), so crawlers never receive useful HTML from them.
 * Public catalog, category, seller, promotion and policy pages stay allowed.
 */
const privatePaths = [
  '/api/',
  '/auth',
  '/admin',
  '/dashboard',
  '/account',
  '/checkout',
  '/cart',
  '/orders',
  '/messages',
  '/wallet',
  '/settings',
  '/support',
  '/verification',
  '/dispatch',
  '/revenue',
];

const searchEngines = ['Googlebot', 'Googlebot-Image', 'Bingbot', 'Bingbot-Image'];
const aiCrawlers = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-Web',
  'PerplexityBot',
  'Google-Extended',
  'Applebot-Extended',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: privatePaths,
      },
      {
        userAgent: searchEngines,
        allow: '/',
        disallow: privatePaths,
      },
      {
        // AI answer engines may read the public marketplace; private account
        // and checkout surfaces stay excluded.
        userAgent: aiCrawlers,
        allow: '/',
        disallow: privatePaths,
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: absoluteUrl('/'),
  };
}
