import { MetadataRoute } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://eddy.guide';

// AI crawlers that are allowed on content pages but blocked from API/admin
const AI_CRAWLERS = [
  'GPTBot',
  'ChatGPT-User',
  'ClaudeBot',
  'CCBot',
  'Google-Extended',
  'Bytespider',
  'Amazonbot',
  'PerplexityBot',
  'Applebot-Extended',
  'FacebookBot',
  'Diffbot',
  'Cohere-ai',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Regular search engines.
      // NOTE: the trailing slash in '/embed/' is load-bearing — it blocks the
      // widget iframes (/embed/widget/..., /embed/card/..., etc.) while the
      // /embed marketing/configurator page itself stays crawlable and is
      // listed in the sitemap.
      {
        userAgent: '*',
        allow: ['/', '/api/og/', '/api/openapi.json'],
        disallow: ['/admin', '/api/', '/embed/', '/simple'],
      },
      // AI crawlers - allowed on content pages for discoverability,
      // blocked from API endpoints (x402 payment required for programmatic access)
      ...AI_CRAWLERS.map((agent) => ({
        userAgent: agent,
        allow: ['/', '/rivers/', '/blog/', '/river-map', '/about', '/llms.txt', '/api/openapi.json'],
        disallow: ['/admin', '/api/', '/embed/', '/simple'],
      })),
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
