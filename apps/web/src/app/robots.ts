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
      // Regular search engines
      {
        userAgent: '*',
        allow: ['/', '/api/og/'],
        disallow: ['/admin', '/api/', '/embed/', '/simple'],
      },
      // AI crawlers - allowed on content pages for discoverability,
      // blocked from API endpoints (x402 payment required for programmatic access)
      ...AI_CRAWLERS.map((agent) => ({
        userAgent: agent,
        allow: ['/', '/rivers/', '/blog/', '/gauges/', '/about', '/llms.txt'],
        disallow: ['/admin', '/api/', '/embed/', '/simple'],
      })),
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
